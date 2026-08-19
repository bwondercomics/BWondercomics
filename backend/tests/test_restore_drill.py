from __future__ import annotations

import io
import json
import subprocess
import tarfile
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from scripts import backup_artifacts as backup
from scripts import restore_drill as drill

NOW = datetime(2026, 8, 12, 1, 0, tzinfo=timezone.utc)


class RestoreDrillTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name) / "archive"
        for child in ("database", "files", "manifests", "drill-logs"):
            (self.root / child).mkdir(parents=True, exist_ok=True)

    def tearDown(self):
        self.temp_dir.cleanup()

    def _publish(self, kind: str, artifact_id: str, content: bytes, extra: dict) -> Path:
        config = backup.KIND_CONFIG[kind]
        relative = f"{config['directory']}/{artifact_id}{config['suffix']}"
        artifact = self.root / relative
        artifact.write_bytes(content)
        digest = backup._sha256_file(artifact)
        checksum_relative = f"manifests/{artifact_id}.sha256"
        (self.root / checksum_relative).write_text(f"{digest}  {relative}\n", encoding="utf-8")
        manifest = {
            "schemaVersion": 1,
            "artifactKind": kind,
            "artifactId": artifact_id,
            "startedAt": backup.iso_z(NOW),
            "completedAt": backup.iso_z(NOW),
            "relativePath": relative,
            "checksumPath": checksum_relative,
            "sizeBytes": artifact.stat().st_size,
            "sha256": digest,
            "validation": {"method": "test", "result": "ok"},
            **extra,
        }
        (self.root / "manifests" / f"{artifact_id}.json").write_text(
            json.dumps(manifest), encoding="utf-8"
        )
        return artifact

    def _database_artifact(self) -> drill.ArtifactSet:
        artifact_id = "database-20260812T010000Z-123456789abc"
        counts = {table: index for index, table in enumerate(backup.CRITICAL_TABLES)}
        self._publish(
            "database",
            artifact_id,
            b"custom archive",
            {
                "database": {
                    "alembicVersion": "0018_builder_page_snapshots",
                    "criticalTableRowCounts": counts,
                    "missingCriticalTables": [],
                }
            },
        )
        return drill.load_artifact(self.root, "database", artifact_id)

    def _file_tar(self, members: dict[str, bytes]) -> bytes:
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode="w:gz") as archive:
            for name, content in members.items():
                info = tarfile.TarInfo(name)
                info.size = len(content)
                archive.addfile(info, io.BytesIO(content))
        return output.getvalue()

    def _file_artifact(self, members: dict[str, bytes] | None = None) -> drill.ArtifactSet:
        artifact_id = "files-20260812T010100Z-abcdef123456"
        values = members or {
            "comics/series/entries/one.json": b"public",
            "protected/comics/series/entries/two.json": b"protected",
            "media/original.png": b"media",
            "protected/media/original.png": b"private-media",
            "assets/uploads/upload.png": b"upload",
        }
        root_counts = {root: 0 for root in backup.INCLUDED_ROOTS}
        for name in values:
            path = Path(name)
            for root in backup.INCLUDED_ROOTS:
                root_path = Path(root)
                if path == root_path or root_path in path.parents:
                    root_counts[root] += 1
                    break
        self._publish(
            "files",
            artifact_id,
            self._file_tar(values),
            {
                "files": {
                    "allowlistVersion": backup.ALLOWLIST_VERSION,
                    "allowlistSha256": backup._allowlist_hash(),
                    "includedRoots": list(backup.INCLUDED_ROOTS),
                    "excludedRoots": list(backup.EXCLUDED_ROOTS),
                    "excludedPatterns": list(backup.EXCLUDED_PATTERNS),
                    "archiveMemberCount": len(values),
                    "fileCount": len(values),
                    "rootFileCounts": root_counts,
                    "uncompressedBytes": sum(len(value) for value in values.values()),
                }
            },
        )
        return drill.load_artifact(self.root, "files", artifact_id)

    def _database_verification(self, artifact: drill.ArtifactSet) -> dict:
        counts = artifact.manifest["database"]["criticalTableRowCounts"]
        return {
            "serverVersion": "16.10",
            "alembicVersion": artifact.manifest["database"]["alembicVersion"],
            "criticalTableRowCounts": dict(counts),
            "snapshotPayloads": {
                "total": counts["builder_page_snapshots"],
                "readable": counts["builder_page_snapshots"],
            },
            "builderGraph": {
                "pages": counts["builder_pages"],
                "sections": counts["builder_sections"],
                "modules": counts["builder_modules"],
                "orderedProbePages": min(counts["builder_pages"], 5),
            },
            "snapshotConstraints": sorted(drill.SNAPSHOT_CONSTRAINTS),
            "snapshotIndexes": sorted(drill.SNAPSHOT_INDEXES),
        }

    def test_load_artifact_rejects_checksum_tampering(self):
        artifact = self._file_artifact()
        artifact.artifact_path.write_bytes(b"x" * artifact.artifact_path.stat().st_size)
        with self.assertRaisesRegex(drill.DrillError, "SHA-256"):
            drill.load_artifact(self.root, "files", artifact.artifact_id)

    def test_database_manifest_requires_every_critical_table(self):
        artifact = self._database_artifact()
        manifest = json.loads(artifact.manifest_path.read_text(encoding="utf-8"))
        manifest["database"]["criticalTableRowCounts"].pop("builder_page_snapshots")
        artifact.manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(drill.DrillError, "every critical table"):
            drill.load_artifact(self.root, "database", artifact.artifact_id)

    def test_file_drill_extracts_validated_tree_and_removes_it(self):
        artifact = self._file_artifact()
        scratch = Path(self.temp_dir.name) / "scratch"

        def make_scratch(*_args, **_kwargs):
            scratch.mkdir()
            return str(scratch)

        with patch.object(drill.tempfile, "mkdtemp", side_effect=make_scratch):
            result = drill.run_file_drill(artifact)

        self.assertEqual(result["verification"]["fileCount"], 5)
        self.assertTrue(result["scratch"]["temporaryTreeRemoved"])
        self.assertFalse(scratch.exists())

    def test_file_drill_rejects_traversal_member_and_cleans_up(self):
        members = {"../escape.txt": b"escape"}
        artifact_id = "files-20260812T010100Z-abcdef123456"
        root_counts = {root: 0 for root in backup.INCLUDED_ROOTS}
        root_counts["comics"] = 1
        self._publish(
            "files",
            artifact_id,
            self._file_tar(members),
            {
                "files": {
                    "allowlistVersion": backup.ALLOWLIST_VERSION,
                    "allowlistSha256": backup._allowlist_hash(),
                    "includedRoots": list(backup.INCLUDED_ROOTS),
                    "excludedRoots": list(backup.EXCLUDED_ROOTS),
                    "excludedPatterns": list(backup.EXCLUDED_PATTERNS),
                    "archiveMemberCount": 1,
                    "fileCount": 1,
                    "rootFileCounts": root_counts,
                    "uncompressedBytes": 6,
                }
            },
        )
        artifact = drill.load_artifact(self.root, "files", artifact_id)
        scratch = Path(self.temp_dir.name) / "unsafe-scratch"

        def make_scratch(*_args, **_kwargs):
            scratch.mkdir()
            return str(scratch)

        with patch.object(drill.tempfile, "mkdtemp", side_effect=make_scratch):
            with self.assertRaisesRegex(drill.DrillError, "Unsafe archive member"):
                drill.run_file_drill(artifact)
        self.assertFalse(scratch.exists())
        self.assertFalse((Path(self.temp_dir.name) / "escape.txt").exists())

    def test_database_drill_isolated_restore_verifies_and_cleans_up(self):
        artifact = self._database_artifact()
        verification = self._database_verification(artifact)
        calls: list[list[str]] = []

        def fake_run(argv, **kwargs):
            command = list(argv)
            calls.append(command)
            if "pg_restore" in command:
                self.assertIsNotNone(kwargs.get("stdin"))
            if any(value.startswith("--command=SELECT json_build_object") for value in command):
                return subprocess.CompletedProcess(
                    command, 0, json.dumps(verification).encode(), b""
                )
            return subprocess.CompletedProcess(command, 0, b"ok", b"")

        with patch.object(drill, "_run_process", side_effect=fake_run):
            result = drill.run_database_drill(artifact)

        run_command = next(command for command in calls if command[:2] == ["docker", "run"])
        self.assertIn("--network", run_command)
        self.assertEqual(run_command[run_command.index("--network") + 1], "none")
        self.assertIn("--pull=never", run_command)
        create_command = next(command for command in calls if "createdb" in command)
        self.assertIn("template0", create_command)
        restore_command = next(command for command in calls if "pg_restore" in command)
        for option in (
            "--exit-on-error",
            "--single-transaction",
            "--no-owner",
            "--no-privileges",
            "--no-tablespaces",
        ):
            self.assertIn(option, restore_command)
        self.assertNotIn("bwondercomics", restore_command)
        self.assertTrue(any(command[1:4] == ["rm", "--force", "--volumes"] for command in calls))
        self.assertTrue(result["scratch"]["containerAndVolumeRemoved"])
        self.assertTrue(result["verification"]["criticalRowCountsMatched"])

    def test_database_verification_sql_has_balanced_parentheses(self):
        depth = 0
        for character in drill._verification_sql():
            if character == "(":
                depth += 1
            elif character == ")":
                depth -= 1
                self.assertGreaterEqual(depth, 0)
        self.assertEqual(depth, 0)

    def test_database_restore_failure_still_removes_container_and_volume(self):
        artifact = self._database_artifact()
        calls: list[list[str]] = []

        def fake_run(argv, **_kwargs):
            command = list(argv)
            calls.append(command)
            if "pg_restore" in command:
                raise drill.DrillError("database_restore_failed", "restore failed")
            return subprocess.CompletedProcess(command, 0, b"ok", b"")

        with patch.object(drill, "_run_process", side_effect=fake_run):
            with self.assertRaisesRegex(drill.DrillError, "restore failed"):
                drill.run_database_drill(artifact)
        self.assertTrue(any(command[1:4] == ["rm", "--force", "--volumes"] for command in calls))

    def test_database_verification_mismatch_fails_after_cleanup(self):
        artifact = self._database_artifact()
        verification = self._database_verification(artifact)
        verification["criticalTableRowCounts"]["users"] += 1
        calls: list[list[str]] = []

        def fake_run(argv, **_kwargs):
            command = list(argv)
            calls.append(command)
            if any(value.startswith("--command=SELECT json_build_object") for value in command):
                return subprocess.CompletedProcess(
                    command, 0, json.dumps(verification).encode(), b""
                )
            return subprocess.CompletedProcess(command, 0, b"ok", b"")

        with patch.object(drill, "_run_process", side_effect=fake_run):
            with self.assertRaisesRegex(drill.DrillError, "row counts"):
                drill.run_database_drill(artifact)
        self.assertTrue(any(command[1:4] == ["rm", "--force", "--volumes"] for command in calls))

    def test_selected_file_drill_writes_non_secret_success_log(self):
        artifact = self._file_artifact()
        payload, log_path = drill.run_selected(
            command="files",
            archive_root=self.root,
            database_artifact_id=None,
            file_artifact_id=artifact.artifact_id,
            operator="dbmelville",
        )
        stored = json.loads(log_path.read_text(encoding="utf-8"))
        self.assertEqual(payload, stored)
        self.assertEqual(stored["status"], "ok")
        self.assertEqual(stored["operator"], "dbmelville")
        self.assertNotIn("password", log_path.read_text(encoding="utf-8").lower())
        self.assertEqual(log_path.stat().st_mode & 0o777, 0o640)

    def test_selected_failure_writes_bounded_error_log(self):
        artifact = self._file_artifact()
        artifact.artifact_path.write_bytes(b"x" * artifact.artifact_path.stat().st_size)
        with self.assertRaises(drill.DrillError):
            drill.run_selected(
                command="files",
                archive_root=self.root,
                database_artifact_id=None,
                file_artifact_id=artifact.artifact_id,
                operator="dbmelville",
            )
        logs = list((self.root / "drill-logs").glob("restore-drill-*.json"))
        self.assertEqual(len(logs), 1)
        stored = json.loads(logs[0].read_text(encoding="utf-8"))
        self.assertEqual(stored["status"], "error")
        self.assertEqual(stored["error"]["code"], "checksum_mismatch")

    def test_cli_has_no_production_database_target_argument(self):
        with patch("sys.stderr", io.StringIO()):
            with self.assertRaises(SystemExit):
                drill.build_parser().parse_args(["database", "--database-name", "bwondercomics"])


if __name__ == "__main__":
    unittest.main()
