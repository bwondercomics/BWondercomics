from __future__ import annotations

import json
import os
import shutil
import subprocess
import tarfile
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from scripts import backup_artifacts as backup

NOW = datetime(2026, 8, 2, 3, 0, tzinfo=timezone.utc)
PROJECT_ROOT = Path(__file__).resolve().parents[2]


class FakeCursor:
    def __init__(self):
        self.query = ""
        self.parameters = None

    def execute(self, query, parameters=None):
        self.query = str(query)
        self.parameters = parameters

    def fetchone(self):
        if "pg_export_snapshot" in self.query:
            return ("00000003-1",)
        if "current_database" in self.query:
            return ("bwondercomics", "16.10")
        if "alembic_version" in self.query:
            return ("0018",)
        if "to_regclass" in self.query:
            return (self.parameters[0],)
        if "count(*)" in self.query:
            return (7,)
        raise AssertionError(self.query)


class FakeConnection:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def transaction(self):
        return self

    def cursor(self):
        return FakeCursor()


class BackupArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo = Path(self.temp_dir.name) / "repo"
        self.repo.mkdir()
        (self.repo / "deploy").mkdir()
        (self.repo / "deploy" / "bwondercomics.env").write_text(
            "BWC_DB_PASSWORD=test\n", encoding="utf-8"
        )
        (self.repo / "deploy" / "bwondercomics-compose.yml").write_text(
            "services: {}\n", encoding="utf-8"
        )
        self.backup_root = self.repo / "var" / "backups"

    def tearDown(self):
        self.temp_dir.cleanup()

    def engine(self, *, status=False):
        return backup.BackupEngine(
            repo_root=self.repo,
            backup_root=self.backup_root,
            status_dir=self.repo / "var" / "diagnostics" / "backups" if status else None,
            require_archive_mount=False,
            env_file=self.repo / "deploy" / "bwondercomics.env",
            compose_file=self.repo / "deploy" / "bwondercomics-compose.yml",
            now=lambda: NOW,
        )

    def add_durable_files(self):
        values = {
            "comics/series/entries/one.json": "comic",
            "protected/comics/series/entries/two.json": "protected comic",
            "media/original.png": "media",
            "protected/media/original.png": "protected media",
            "assets/uploads/upload.png": "upload",
            "media/previews/derived.png": "preview",
            "media/post-assets/copy.png": "copy",
            "media/.env": "secret",
            "media/private.key": "secret key",
            "assets/uploads/credentials.json": "credentials",
            "deploy/bwondercomics.env": "BWC_DB_PASSWORD=test\n",
            "dist/app.js": "derived",
        }
        for relative, content in values.items():
            path = self.repo / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")

    def add_empty_source_roots(self):
        for root_name in backup.INCLUDED_ROOTS:
            (self.repo / root_name).mkdir(parents=True, exist_ok=True)

    def write_artifact_set(
        self,
        kind: str,
        index: int,
        completed: datetime,
        *,
        corrupt: bool = False,
    ) -> str:
        config = backup.KIND_CONFIG[kind]
        artifact_id = f"{kind}-{completed:%Y%m%dT%H%M%SZ}-{index:012d}"
        artifact = self.backup_root / config["directory"] / f"{artifact_id}{config['suffix']}"
        content = f"artifact-{kind}-{index}".encode()
        artifact.write_bytes(content)
        digest = backup._sha256_file(artifact)
        checksum_relative = f"manifests/{artifact_id}.sha256"
        (self.backup_root / checksum_relative).write_text(
            f"{digest}  {config['directory']}/{artifact_id}{config['suffix']}\n",
            encoding="utf-8",
        )
        (self.backup_root / "manifests" / f"{artifact_id}.json").write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "artifactKind": kind,
                    "artifactId": artifact_id,
                    "completedAt": backup.iso_z(completed),
                    "relativePath": f"{config['directory']}/{artifact_id}{config['suffix']}",
                    "checksumPath": checksum_relative,
                    "sizeBytes": artifact.stat().st_size,
                    "sha256": digest,
                    "validation": {"result": "ok"},
                }
            ),
            encoding="utf-8",
        )
        if corrupt:
            artifact.write_bytes(b"x" * len(content))
        return artifact_id

    def test_file_backup_publishes_manifest_last_contract_and_exact_allowlist(self):
        self.add_durable_files()
        result = self.engine(status=True).run(("files",))[0]

        manifest_path = self.backup_root / "manifests" / f"{result.artifact_id}.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        artifact = self.backup_root / manifest["relativePath"]
        checksum = self.backup_root / manifest["checksumPath"]
        with tarfile.open(artifact, "r:gz") as archive:
            members = {member.name for member in archive.getmembers()}

        self.assertEqual(
            members,
            {
                "comics/series/entries/one.json",
                "protected/comics/series/entries/two.json",
                "media/original.png",
                "protected/media/original.png",
                "assets/uploads/upload.png",
            },
        )
        self.assertNotIn("deploy/bwondercomics.env", members)
        self.assertNotIn("media/private.key", members)
        self.assertNotIn("assets/uploads/credentials.json", members)
        self.assertEqual(manifest["schemaVersion"], 1)
        self.assertEqual(manifest["files"]["fileCount"], 5)
        self.assertEqual(
            manifest["files"]["rootFileCounts"],
            {
                "comics": 1,
                "protected/comics": 1,
                "media": 1,
                "protected/media": 1,
                "assets/uploads": 1,
            },
        )
        self.assertIn("**/*.key", manifest["files"]["excludedPatterns"])
        self.assertEqual(manifest["validation"]["result"], "ok")
        self.assertEqual(artifact.stat().st_mode & 0o777, 0o640)
        self.assertEqual(checksum.stat().st_mode & 0o777, 0o640)
        self.assertEqual(manifest_path.stat().st_mode & 0o777, 0o640)
        self.assertEqual(self.backup_root.stat().st_mode & 0o777, 0o750)

        status = json.loads(
            (self.repo / "var" / "diagnostics" / "backups" / "files.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(status["lastAttempt"]["status"], "ok")
        self.assertEqual(status["lastSuccess"]["artifactId"], result.artifact_id)
        catalog = json.loads(
            (self.repo / "var" / "diagnostics" / "backups" / "catalog.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(catalog["validatedCounts"], {"database": 0, "files": 1, "total": 1})
        self.assertEqual(catalog["integrity"]["files"]["verifiedSets"], 1)
        self.assertEqual(catalog["integrity"]["files"]["corruptSets"], 0)

    def test_file_backup_rejects_symlinks(self):
        target = self.repo / "outside.txt"
        target.write_text("outside", encoding="utf-8")
        path = self.repo / "media" / "linked.txt"
        path.parent.mkdir(parents=True)
        path.symlink_to(target)
        with self.assertRaisesRegex(backup.BackupError, "Symlink"):
            self.engine().run(("files",))
        self.assertEqual(list((self.backup_root / "manifests").glob("*.json")), [])

    def test_production_file_roots_are_required_real_readable_directories(self):
        engine = self.engine()
        engine.require_archive_mount = True
        with self.assertRaises(backup.BackupError) as raised:
            engine._file_members()
        self.assertEqual(raised.exception.code, "file_root_missing")

        self.add_empty_source_roots()
        unsafe = self.repo / "media"
        unsafe.rmdir()
        unsafe.write_text("not a directory", encoding="utf-8")
        with self.assertRaises(backup.BackupError) as raised:
            engine._file_members()
        self.assertEqual(raised.exception.code, "file_root_unsafe")

        unsafe.unlink()
        unsafe.symlink_to(self.repo / "comics", target_is_directory=True)
        with self.assertRaises(backup.BackupError) as raised:
            engine._file_members()
        self.assertEqual(raised.exception.code, "file_root_unsafe")

    def test_production_file_roots_reject_unreadable_and_failed_traversal(self):
        self.add_empty_source_roots()
        engine = self.engine()
        engine.require_archive_mount = True
        real_access = os.access

        def inaccessible(path, mode):
            return False if Path(path) == self.repo / "media" else real_access(path, mode)

        with patch.object(backup.os, "access", side_effect=inaccessible):
            with self.assertRaises(backup.BackupError) as raised:
                engine._file_members()
        self.assertEqual(raised.exception.code, "file_root_unsafe")

        real_walk = os.walk

        def failed_walk(top, *args, **kwargs):
            if Path(top) == self.repo / "media":
                kwargs["onerror"](PermissionError("denied"))
            return real_walk(top, *args, **kwargs)

        with patch.object(backup.os, "walk", side_effect=failed_walk):
            with self.assertRaises(backup.BackupError) as raised:
                engine._file_members()
        self.assertEqual(raised.exception.code, "file_walk_failed")

    def test_empty_production_file_roots_are_valid(self):
        self.add_empty_source_roots()
        engine = self.engine()
        engine.require_archive_mount = True
        members, counts = engine._file_members()
        self.assertEqual(members, [])
        self.assertEqual(counts, {root_name: 0 for root_name in backup.INCLUDED_ROOTS})

    def test_archive_member_validation_failure_does_not_publish(self):
        self.add_durable_files()
        original_open = tarfile.open

        def broken_open(*args, **kwargs):
            mode = kwargs.get("mode") or (args[1] if len(args) > 1 else "r")
            if str(mode).startswith("r"):
                raise tarfile.ReadError("bad archive")
            return original_open(*args, **kwargs)

        with patch.object(backup.tarfile, "open", side_effect=broken_open):
            with self.assertRaises(backup.BackupError) as raised:
                self.engine().run(("files",))
        self.assertEqual(raised.exception.code, "file_validation_failed")
        self.assertEqual(list((self.backup_root / "manifests").glob("*.json")), [])

    def test_database_backup_uses_exported_snapshot_and_publishes_metadata(self):
        calls = []

        def fake_run(argv, **kwargs):
            calls.append(argv)
            if "pg_dump" in " ".join(argv) and "--version" not in argv:
                kwargs["stdout"].write(b"PGDMP custom archive")
                return subprocess.CompletedProcess(argv, 0, b"", b"")
            if "pg_restore" in argv:
                return subprocess.CompletedProcess(argv, 0, b"; archive toc\n", b"")
            return subprocess.CompletedProcess(argv, 0, b"pg_dump (PostgreSQL) 16.10\n", b"")

        engine = self.engine()
        with (
            patch.object(engine, "_database_connection", return_value=FakeConnection()),
            patch.object(backup, "_run_checked", side_effect=fake_run),
        ):
            result = engine.run(("database",))[0]

        manifest = result.manifest
        dump_call = next(call for call in calls if '--snapshot="$1"' in " ".join(call))
        self.assertIn("00000003-1", dump_call)
        self.assertEqual(manifest["database"]["alembicVersion"], "0018")
        self.assertEqual(manifest["database"]["criticalTableRowCounts"]["users"], 7)
        self.assertEqual(manifest["database"]["missingCriticalTables"], [])
        self.assertEqual(manifest["validation"]["method"], "pg_restore --list")

    def test_dump_and_restore_validation_failures_publish_no_commit_marker(self):
        for failure_code, fail_on in (
            ("dump_failed", "pg_dump"),
            ("database_validation_failed", "pg_restore"),
        ):
            with self.subTest(failure_code=failure_code):
                shutil_root = self.backup_root
                if shutil_root.exists():
                    shutil.rmtree(shutil_root)
                engine = self.engine()

                def fake_run(argv, **kwargs):
                    joined = " ".join(argv)
                    if fail_on in joined and not (fail_on == "pg_dump" and "--version" in argv):
                        if fail_on == "pg_restore":
                            kwargs.get("stdin")
                        raise backup.BackupError(failure_code, "simulated failure")
                    if "pg_dump" in joined:
                        kwargs["stdout"].write(b"PGDMP")
                    return subprocess.CompletedProcess(argv, 0, b"ok", b"")

                with (
                    patch.object(engine, "_database_connection", return_value=FakeConnection()),
                    patch.object(backup, "_run_checked", side_effect=fake_run),
                ):
                    with self.assertRaises(backup.BackupError) as raised:
                        engine.run(("database",))
                self.assertEqual(raised.exception.code, failure_code)
                self.assertEqual(list((self.backup_root / "manifests").glob("*.json")), [])

    def test_publication_rename_failure_rolls_back_final_components(self):
        self.add_durable_files()
        real_replace = os.replace
        call_count = 0

        def fail_second(source, destination):
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                raise OSError("rename failed")
            return real_replace(source, destination)

        with patch.object(backup.os, "replace", side_effect=fail_second):
            with self.assertRaises(backup.BackupError) as raised:
                self.engine().run(("files",))
        self.assertEqual(raised.exception.code, "publication_failed")
        self.assertEqual(list((self.backup_root / "files").iterdir()), [])
        self.assertEqual(list((self.backup_root / "manifests").iterdir()), [])

    def test_checksum_fsync_and_manifest_failures_leave_no_committed_set(self):
        self.add_durable_files()
        for target, side_effect in (
            ("_sha256_file", OSError("checksum failed")),
            ("_fsync_file", OSError("fsync failed")),
            ("_write_json", OSError("manifest failed")),
        ):
            with self.subTest(target=target):
                shutil.rmtree(self.backup_root, ignore_errors=True)
                with patch.object(backup, target, side_effect=side_effect):
                    with self.assertRaises(backup.BackupError):
                        self.engine().run(("files",))
                self.assertEqual(list((self.backup_root / "manifests").glob("*.json")), [])

    def test_failed_attempt_preserves_last_success_status(self):
        self.add_durable_files()
        engine = self.engine(status=True)
        successful = engine.run(("files",))[0]
        with patch.object(
            engine,
            "_file_members",
            side_effect=backup.BackupError("permissions_failed", "simulated permission failure"),
        ):
            with self.assertRaises(backup.BackupError):
                engine.run(("files",))
        status = json.loads(
            (self.repo / "var" / "diagnostics" / "backups" / "files.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(status["lastAttempt"]["status"], "error")
        self.assertEqual(status["lastAttempt"]["errorCode"], "permissions_failed")
        self.assertEqual(status["lastSuccess"]["artifactId"], successful.artifact_id)

    def test_production_preflight_failure_records_each_requested_job(self):
        engine = backup.BackupEngine(
            repo_root=self.repo,
            backup_root=Path("/mnt/archive/backups/bwondercomics"),
            status_dir=self.repo / "var" / "diagnostics" / "backups",
            require_archive_mount=True,
            env_file=self.repo / "deploy" / "bwondercomics.env",
            compose_file=self.repo / "deploy" / "bwondercomics-compose.yml",
            now=lambda: NOW,
        )
        failure = backup.BackupError("archive_not_writable", "read-only archive")
        with patch.object(backup, "_production_destination_check", side_effect=failure):
            with self.assertRaises(backup.BackupError):
                engine.run(("database", "files"))
        for kind in ("database", "files"):
            status = json.loads(
                (self.repo / "var" / "diagnostics" / "backups" / f"{kind}.json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(status["lastAttempt"]["errorCode"], "archive_not_writable")

    def test_database_retention_keeps_last_30_and_all_sets_from_last_30_days(self):
        backup._prepare_root(self.backup_root)
        engine = self.engine()
        artifact_ids = []
        for index in range(32):
            completed = NOW - timedelta(days=index if index <= 30 else 100)
            artifact_id = f"database-{completed:%Y%m%dT%H%M%SZ}-{index:012d}"
            artifact_ids.append(artifact_id)
            artifact = self.backup_root / "database" / f"{artifact_id}.dump"
            artifact.write_bytes(f"dump-{index}".encode())
            digest = backup._sha256_file(artifact)
            checksum_relative = f"manifests/{artifact_id}.sha256"
            (self.backup_root / checksum_relative).write_text(
                f"{digest}  database/{artifact_id}.dump\n", encoding="utf-8"
            )
            (self.backup_root / "manifests" / f"{artifact_id}.json").write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "artifactKind": "database",
                        "artifactId": artifact_id,
                        "completedAt": backup.iso_z(completed),
                        "relativePath": f"database/{artifact_id}.dump",
                        "checksumPath": checksum_relative,
                        "sizeBytes": artifact.stat().st_size,
                        "sha256": digest,
                        "validation": {"result": "ok"},
                    }
                ),
                encoding="utf-8",
            )

        engine._prune("database", NOW)
        self.assertTrue((self.backup_root / "manifests" / f"{artifact_ids[29]}.json").exists())
        self.assertTrue((self.backup_root / "manifests" / f"{artifact_ids[30]}.json").exists())
        self.assertFalse((self.backup_root / "manifests" / f"{artifact_ids[31]}.json").exists())

    def test_file_retention_keeps_eight_verified_sets(self):
        backup._prepare_root(self.backup_root)
        engine = self.engine()
        artifact_ids = [
            self.write_artifact_set("files", index, NOW - timedelta(days=index * 8))
            for index in range(10)
        ]
        integrity = engine._prune("files", NOW)
        self.assertTrue((self.backup_root / "manifests" / f"{artifact_ids[7]}.json").exists())
        self.assertFalse((self.backup_root / "manifests" / f"{artifact_ids[8]}.json").exists())
        self.assertEqual(integrity["deletedSets"], 2)

    def test_exact_checksum_and_same_size_corruption_fail_integrity(self):
        backup._prepare_root(self.backup_root)
        engine = self.engine()
        artifact_id = self.write_artifact_set("database", 0, NOW)
        payload = engine._validated_manifests("database")[0]
        checksum = self.backup_root / payload["checksumPath"]
        checksum.write_text(checksum.read_text(encoding="utf-8") + "extra\n", encoding="utf-8")
        self.assertFalse(engine._manifest_bytes_are_valid(payload))

        checksum.write_text(f"{payload['sha256']}  {payload['relativePath']}\n", encoding="utf-8")
        artifact = self.backup_root / payload["relativePath"]
        artifact.write_bytes(b"x" * artifact.stat().st_size)
        self.assertFalse(engine._manifest_bytes_are_valid(payload))
        self.assertTrue((self.backup_root / "manifests" / f"{artifact_id}.json").exists())

    def test_retention_integrity_failure_suppresses_all_deletions(self):
        backup._prepare_root(self.backup_root)
        engine = self.engine()
        artifact_ids = [
            self.write_artifact_set(
                "database", index, NOW - timedelta(days=100 + index), corrupt=True
            )
            for index in range(61)
        ]
        with self.assertRaises(backup.BackupError) as raised:
            engine._prune("database", NOW)
        self.assertEqual(raised.exception.code, "retention_integrity_failed")
        self.assertTrue(
            all(
                (self.backup_root / "manifests" / f"{artifact_id}.json").exists()
                for artifact_id in artifact_ids
            )
        )

    def test_retention_failure_records_new_artifact_as_last_success(self):
        self.add_durable_files()
        engine = self.engine(status=True)
        failure = backup.BackupError("retention_integrity_failed", "floor not proven")
        with patch.object(engine, "_prune", side_effect=failure):
            with self.assertRaises(backup.BackupError):
                engine.run(("files",))
        status = json.loads(
            (self.repo / "var" / "diagnostics" / "backups" / "files.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(status["lastAttempt"]["errorCode"], "retention_integrity_failed")
        self.assertEqual(status["lastAttempt"]["artifactId"], status["lastSuccess"]["artifactId"])

    def test_lock_contention_fails_with_bounded_timeout(self):
        backup._prepare_root(self.backup_root)
        with backup._archive_lock(self.backup_root):
            with self.assertRaises(backup.BackupError) as raised:
                with backup._archive_lock(self.backup_root, timeout=0):
                    pass
        self.assertEqual(raised.exception.code, "lock_timeout")

    def test_cli_reserves_exit_75_for_lock_contention(self):
        backup._prepare_root(self.backup_root)
        with backup._archive_lock(self.backup_root):
            with patch.dict(
                os.environ,
                {
                    "BWC_REPO_ROOT": str(self.repo),
                    "BACKUP_DIR": str(self.backup_root),
                    "BACKUP_LOCK_TIMEOUT_SECONDS": "0",
                    "REQUIRE_ARCHIVE_MOUNT": "0",
                },
            ):
                self.assertEqual(backup.main(["files"]), 75)

    def test_stale_partial_cleanup_leaves_recent_staging(self):
        backup._prepare_root(self.backup_root)
        stale = self.backup_root / ".staging-old.partial"
        recent = self.backup_root / ".staging-new.partial"
        stale.mkdir()
        recent.mkdir()
        old = (NOW - timedelta(hours=25)).timestamp()
        os.utime(stale, (old, old))
        backup._cleanup_stale_partials(self.backup_root, NOW)
        self.assertFalse(stale.exists())
        self.assertTrue(recent.exists())

    def test_stale_crash_orphans_without_valid_manifest_are_cleaned(self):
        backup._prepare_root(self.backup_root)
        engine = self.engine()
        old_id = "database-20260101T030000Z-oldorphan"
        recent_id = "files-20260802T020000Z-neworphan"
        corrupt_committed_id = "database-20260101T030000Z-corrupt"
        old_artifact = self.backup_root / "database" / f"{old_id}.dump"
        old_checksum = self.backup_root / "manifests" / f"{old_id}.sha256"
        recent_artifact = self.backup_root / "files" / f"{recent_id}.tar.gz"
        corrupt_artifact = self.backup_root / "database" / f"{corrupt_committed_id}.dump"
        corrupt_manifest = self.backup_root / "manifests" / f"{corrupt_committed_id}.json"
        old_artifact.write_bytes(b"old")
        old_checksum.write_text("incomplete", encoding="utf-8")
        recent_artifact.write_bytes(b"recent")
        corrupt_artifact.write_bytes(b"corrupt but committed")
        corrupt_manifest.write_text("not-json", encoding="utf-8")
        old = (NOW - timedelta(hours=25)).timestamp()
        os.utime(old_artifact, (old, old))
        os.utime(old_checksum, (old, old))
        os.utime(corrupt_artifact, (old, old))
        os.utime(corrupt_manifest, (old, old))

        engine._cleanup_orphaned_sets(NOW)

        self.assertFalse(old_artifact.exists())
        self.assertFalse(old_checksum.exists())
        self.assertTrue(recent_artifact.exists())
        self.assertTrue(corrupt_artifact.exists())
        self.assertTrue(corrupt_manifest.exists())

    def test_production_checks_fail_for_missing_same_device_and_read_only_mount(self):
        archive = Path(self.temp_dir.name) / "archive"
        archive.mkdir()
        root = archive / "backups" / "bwondercomics"
        with patch.object(backup, "ARCHIVE_MOUNT", archive):
            with patch.object(backup.os.path, "ismount", return_value=False):
                with self.assertRaises(backup.BackupError) as raised:
                    backup._production_destination_check(root, self.repo)
                self.assertEqual(raised.exception.code, "archive_mount_missing")

            with patch.object(backup.os.path, "ismount", return_value=True):
                with self.assertRaises(backup.BackupError) as raised:
                    backup._production_destination_check(root, self.repo)
                self.assertEqual(raised.exception.code, "archive_same_device")

            real_stat = os.stat
            archive_resolved = archive.resolve()
            root.mkdir(parents=True)
            for child in backup.ARCHIVE_CHILDREN:
                (root / child).mkdir()

            def different_devices(path, *args, **kwargs):
                result = real_stat(path, *args, **kwargs)
                candidate = Path(path)
                device = (
                    2
                    if candidate == archive_resolved or archive_resolved in candidate.parents
                    else 1
                )
                values = list(result)
                values[2] = device
                return os.stat_result(values)

            with (
                patch.object(backup.os.path, "ismount", return_value=True),
                patch.object(backup.os, "stat", side_effect=different_devices),
                patch.object(backup.os, "open", side_effect=OSError("read-only")),
            ):
                with self.assertRaises(backup.BackupError) as raised:
                    backup._production_destination_check(root, self.repo)
                self.assertEqual(raised.exception.code, "archive_not_writable")

    def test_production_layout_rejects_symlink_and_device_mismatch_children(self):
        archive = Path(self.temp_dir.name) / "archive-layout"
        archive.mkdir()
        root = archive / "backups" / "bwondercomics"
        root.mkdir(parents=True)
        for child in backup.ARCHIVE_CHILDREN:
            (root / child).mkdir()
        real_stat = os.stat

        def archive_devices(path, *args, **kwargs):
            result = real_stat(path, *args, **kwargs)
            candidate = Path(path)
            device = 2 if candidate == archive or archive in candidate.parents else 1
            values = list(result)
            values[2] = device
            return os.stat_result(values)

        with (
            patch.object(backup, "ARCHIVE_MOUNT", archive),
            patch.object(backup.os.path, "ismount", return_value=True),
            patch.object(backup.os, "stat", side_effect=archive_devices),
        ):
            backup._production_destination_check(root, self.repo)
            (root / "files").rmdir()
            (root / "files").symlink_to(root / "database", target_is_directory=True)
            with self.assertRaises(backup.BackupError) as raised:
                backup._production_destination_check(root, self.repo)
            self.assertEqual(raised.exception.code, "archive_layout_unsafe")

        (root / "files").unlink()
        (root / "files").mkdir()
        files_resolved = (root / "files").resolve()

        def child_on_primary(path, *args, **kwargs):
            result = archive_devices(path, *args, **kwargs)
            values = list(result)
            if Path(path) == files_resolved:
                values[2] = 1
            return os.stat_result(values)

        with (
            patch.object(backup, "ARCHIVE_MOUNT", archive),
            patch.object(backup.os.path, "ismount", return_value=True),
            patch.object(backup.os, "stat", side_effect=child_on_primary),
        ):
            with self.assertRaises(backup.BackupError) as raised:
                backup._production_destination_check(root, self.repo)
            self.assertEqual(raised.exception.code, "archive_layout_unsafe")

    def test_publication_rechecks_production_layout_before_rename(self):
        backup._prepare_root(self.backup_root)
        engine = self.engine()
        engine.require_archive_mount = True
        stage = engine._staging_dir("files-test")
        partial = stage / "files-test.tar.gz.partial"
        partial.write_bytes(b"archive")
        with patch.object(
            backup,
            "_production_destination_check",
            side_effect=backup.BackupError("archive_layout_unsafe", "changed"),
        ):
            with self.assertRaises(backup.BackupError):
                engine._publish("files", "files-test", partial, NOW)
        self.assertFalse((self.backup_root / "files" / "files-test.tar.gz").exists())

    def test_cli_rejects_invalid_command(self):
        with self.assertRaises(SystemExit):
            backup.build_parser().parse_args(["invalid"])

    def test_repository_entry_points_delegate_and_production_targets_are_fixed(self):
        makefile = (PROJECT_ROOT / "Makefile").read_text(encoding="utf-8")
        self.assertIn('BACKUP_DIR="$(PRODUCTION_BACKUP_DIR)" REQUIRE_ARCHIVE_MOUNT=1', makefile)
        self.assertIn("scripts/backup_artifacts.py", makefile)
        for script_name in ("backup-db.sh", "backup-full.sh"):
            content = (PROJECT_ROOT / "scripts" / script_name).read_text(encoding="utf-8")
            self.assertIn("backup_artifacts.py", content)
            self.assertNotIn("bwondercomics.env.${TIMESTAMP}", content)
            self.assertNotIn("frontend-dist", content)

        catalog = json.loads(
            (PROJECT_ROOT / "deploy" / "ops" / "command-catalog.json").read_text(encoding="utf-8")
        )
        backup_commands = {
            item["id"]: item["argv"] for item in catalog if item["id"].startswith("backup")
        }
        self.assertEqual(backup_commands["backup"], ["make", "backup-production"])
        self.assertEqual(backup_commands["backup-db"], ["make", "backup-db-production"])
        self.assertEqual(backup_commands["backup-files"], ["make", "backup-files-production"])

        dry_run = subprocess.run(
            [
                "make",
                "-n",
                "backup-files-production",
                "PRODUCTION_BACKUP_DIR=var/backups",
                "PRODUCTION_BACKUP_STATUS_DIR=/tmp/status",
            ],
            cwd=PROJECT_ROOT,
            check=True,
            capture_output=True,
            text=True,
        ).stdout
        self.assertIn('BACKUP_DIR="/mnt/archive/backups/bwondercomics"', dry_run)
        self.assertIn('BACKUP_STATUS_DIR="/srv/bw-quality/var/diagnostics/backups"', dry_run)
        self.assertIn("/srv/bw-quality/.backup-venv/bin/python", dry_run)
        self.assertNotIn('BACKUP_DIR="var/backups"', dry_run)

        restore_dry_run = subprocess.run(
            [
                "make",
                "-n",
                "restore-drill",
                "DATABASE_ARTIFACT_ID=database-test",
                "FILE_ARTIFACT_ID=files-test",
            ],
            cwd=PROJECT_ROOT,
            check=True,
            capture_output=True,
            text=True,
        ).stdout
        self.assertIn("scripts/restore_drill.py all", restore_dry_run)
        self.assertIn('/mnt/archive/backups/bwondercomics"', restore_dry_run)
        self.assertNotIn("BWC_DB_NAME", restore_dry_run)

        worker_unit = (
            PROJECT_ROOT / "deploy" / "ops" / "bwondercomics-ops-worker.service"
        ).read_text(encoding="utf-8")
        self.assertIn("User=dbmelville", worker_unit)
        self.assertIn("Group=dbmelville", worker_unit)
        self.assertIn("UMask=0027", worker_unit)

        requirements = (PROJECT_ROOT / "scripts" / "backup-requirements.txt").read_text(
            encoding="utf-8"
        )
        self.assertEqual(requirements.strip(), "psycopg[binary]==3.2.3")
        for unit_name, timeout in (
            ("bwondercomics-backup-db.service", "15300"),
            ("bwondercomics-backup-files.service", "8100"),
        ):
            unit = (PROJECT_ROOT / "deploy" / unit_name).read_text(encoding="utf-8")
            self.assertIn("User=dbmelville", unit)
            self.assertIn("Group=dbmelville", unit)
            self.assertIn(".backup-venv/bin/python", unit)
            self.assertIn("BACKUP_DIR=/mnt/archive/backups/bwondercomics", unit)
            self.assertIn("DOCKER_CONFIG=/tmp/bwondercomics-docker", unit)
            self.assertIn(f"BACKUP_LOCK_TIMEOUT_SECONDS={timeout}", unit)
            self.assertIn("TimeoutStartSec=6h30min", unit)
            self.assertIn("Restart=no", unit)
            self.assertIn("RestartSec=15min", unit)
            self.assertIn("RestartForceExitStatus=75", unit)
            self.assertIn("ProtectSystem=strict", unit)

    def test_systemd_units_and_calendars_validate(self):
        analyzer = shutil.which("systemd-analyze")
        if not analyzer:
            self.skipTest("systemd-analyze is not installed")
        units = [
            PROJECT_ROOT / "deploy" / "bwondercomics-backup-db.service",
            PROJECT_ROOT / "deploy" / "bwondercomics-backup-db.timer",
            PROJECT_ROOT / "deploy" / "bwondercomics-backup-files.service",
            PROJECT_ROOT / "deploy" / "bwondercomics-backup-files.timer",
            PROJECT_ROOT / "deploy" / "ops" / "bwondercomics-ops-worker.service",
        ]
        subprocess.run([analyzer, "verify", *(str(path) for path in units)], check=True)
        for expression in ("*-*-* 03:00:00 UTC", "Sun *-*-* 04:00:00 UTC"):
            subprocess.run(
                [analyzer, "calendar", expression],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
            )


if __name__ == "__main__":
    unittest.main()
