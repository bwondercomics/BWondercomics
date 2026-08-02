from __future__ import annotations

import hashlib
import json
import os
import tempfile
import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

os.environ.setdefault(
    "DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-backup-diagnostics-tests.db"
)

from backend.app import diagnostics_snapshot
from backend.app.settings import load_settings
from backend.app.settings import settings as app_settings

NOW = datetime(2026, 8, 2, 12, 0, tzinfo=timezone.utc)


def iso_z(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


class BackupDiagnosticsTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_dir = Path(self.temp_dir.name)
        self.settings_patch = None
        self.set_mode("production")

    def tearDown(self):
        if self.settings_patch:
            self.settings_patch.stop()
        self.temp_dir.cleanup()

    def set_mode(self, mode: str):
        if self.settings_patch:
            self.settings_patch.stop()
        self.settings_patch = patch.object(
            diagnostics_snapshot,
            "settings",
            replace(app_settings, base_dir=self.base_dir, backup_diagnostics_mode=mode),
        )
        self.settings_patch.start()

    def write_json(self, path: Path, payload: dict):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload), encoding="utf-8")

    def catalog_item(self, kind: str, created_at: datetime) -> dict:
        suffix = ".dump" if kind == "database" else ".tar.gz"
        artifact_id = f"{kind}-{created_at:%Y%m%dT%H%M%SZ}-abc123"
        return {
            "artifactId": artifact_id,
            "name": f"{artifact_id}{suffix}",
            "relativePath": f"{kind}/{artifact_id}{suffix}"
            if kind == "database"
            else f"files/{artifact_id}{suffix}",
            "createdAt": iso_z(created_at),
            "sizeBytes": 1024,
            "sha256": "a" * 64,
            "validation": {"method": "test", "result": "ok", "validatedAt": iso_z(created_at)},
        }

    def write_production_records(
        self,
        *,
        db_age_hours: int = 1,
        file_age_hours: int = 24,
        database_attempt: str = "ok",
    ):
        status_dir = self.base_dir / "var" / "diagnostics" / "backups"
        db_item = self.catalog_item("database", NOW - timedelta(hours=db_age_hours))
        file_item = self.catalog_item("files", NOW - timedelta(hours=file_age_hours))
        self.write_json(
            status_dir / "catalog.json",
            {
                "schemaVersion": 1,
                "root": "/mnt/archive/backups/bwondercomics",
                "updatedAt": iso_z(NOW),
                "database": [db_item],
                "files": [file_item],
                "validatedCounts": {"database": 1, "files": 1, "total": 2},
            },
        )
        for kind, item, attempt_status in (
            ("database", db_item, database_attempt),
            ("files", file_item, "ok"),
        ):
            attempt = {
                "startedAt": item["createdAt"],
                "finishedAt": item["createdAt"],
                "status": attempt_status,
                "errorCode": "dump_failed" if attempt_status == "error" else None,
            }
            self.write_json(
                status_dir / f"{kind}.json",
                {
                    "schemaVersion": 1,
                    "kind": kind,
                    "updatedAt": iso_z(NOW),
                    "lastAttempt": attempt,
                    "lastSuccess": item,
                    "history": [attempt],
                },
            )

    def write_local_manifest(self, kind: str = "files"):
        root = self.base_dir / "var" / "backups"
        artifact_id = f"{kind}-20260802T110000Z-local"
        suffix = ".dump" if kind == "database" else ".tar.gz"
        relative = (
            f"database/{artifact_id}{suffix}"
            if kind == "database"
            else f"files/{artifact_id}{suffix}"
        )
        artifact = root / relative
        artifact.parent.mkdir(parents=True, exist_ok=True)
        artifact.write_bytes(b"validated local artifact")
        digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
        checksum_relative = f"manifests/{artifact_id}.sha256"
        checksum = root / checksum_relative
        checksum.parent.mkdir(parents=True, exist_ok=True)
        checksum.write_text(f"{digest}  {relative}\n", encoding="utf-8")
        self.write_json(
            root / "manifests" / f"{artifact_id}.json",
            {
                "schemaVersion": 1,
                "artifactKind": kind,
                "artifactId": artifact_id,
                "completedAt": iso_z(NOW - timedelta(hours=1)),
                "relativePath": relative,
                "checksumPath": checksum_relative,
                "sizeBytes": artifact.stat().st_size,
                "sha256": digest,
                "validation": {"method": "test", "result": "ok", "validatedAt": iso_z(NOW)},
            },
        )

    def test_legacy_filename_shaped_files_are_not_healthy(self):
        self.set_mode("local")
        root = self.base_dir / "var" / "backups"
        root.mkdir(parents=True)
        (root / "db-20260101.sql").write_text("db", encoding="utf-8")
        (root / "files-20260101.tar.gz").write_text("files", encoding="utf-8")
        summary = diagnostics_snapshot.collect_backup_summary(now=NOW)
        self.assertEqual(summary["status"], "error")
        self.assertEqual(summary["validatedCounts"]["total"], 0)
        self.assertEqual(summary["source"], "local-manifests")

    def test_local_fallback_accepts_only_checksum_valid_manifest_sets(self):
        self.set_mode("local")
        self.write_local_manifest("files")
        summary = diagnostics_snapshot.collect_backup_summary(now=NOW)
        self.assertEqual(summary["validatedCounts"], {"db": 0, "files": 1, "total": 1})
        self.assertEqual(summary["latest"]["files"]["validation"]["result"], "ok")
        self.assertEqual(summary["source"], "local-manifests")

    def test_local_checksum_line_must_match_exactly(self):
        self.set_mode("local")
        self.write_local_manifest("files")
        checksum = next((self.base_dir / "var" / "backups" / "manifests").glob("*.sha256"))
        checksum.write_text(checksum.read_text(encoding="utf-8") + "unexpected\n", encoding="utf-8")
        summary = diagnostics_snapshot.collect_backup_summary(now=NOW)
        self.assertEqual(summary["validatedCounts"]["total"], 0)

    def test_valid_production_catalog_reports_fresh_validated_sets(self):
        self.write_production_records()
        summary = diagnostics_snapshot.collect_backup_summary(now=NOW)
        self.assertEqual(summary["status"], "ok")
        self.assertEqual(summary["source"], "production-status")
        self.assertEqual(summary["validatedCounts"], {"db": 1, "files": 1, "total": 2})
        self.assertEqual(summary["freshness"]["database"]["status"], "ok")
        self.assertEqual(summary["jobs"]["database"]["lastAttempt"]["status"], "ok")

    def test_bounded_production_catalog_preserves_total_validated_counts(self):
        self.write_production_records()
        catalog_path = self.base_dir / "var" / "diagnostics" / "backups" / "catalog.json"
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        catalog["validatedCounts"] = {"database": 75, "files": 9, "total": 84}
        self.write_json(catalog_path, catalog)
        summary = diagnostics_snapshot.collect_backup_summary(now=NOW)
        self.assertEqual(summary["status"], "ok")
        self.assertEqual(summary["validatedCounts"], {"db": 75, "files": 9, "total": 84})
        self.assertIn("Validated DB backups: 75", summary["message"])

    def test_failed_latest_attempt_is_error_while_last_success_remains_visible(self):
        self.write_production_records(database_attempt="error")
        summary = diagnostics_snapshot.collect_backup_summary(now=NOW)
        self.assertEqual(summary["status"], "error")
        self.assertIn("dump_failed", summary["message"])
        self.assertIsNotNone(summary["latest"]["db"])

    def test_freshness_thresholds_warn_then_error(self):
        self.write_production_records(db_age_hours=40, file_age_hours=9 * 24)
        warning = diagnostics_snapshot.collect_backup_summary(now=NOW)
        self.assertEqual(warning["status"], "warning")
        self.assertEqual(warning["freshness"]["database"]["status"], "warning")
        self.assertEqual(warning["freshness"]["files"]["status"], "warning")

        self.write_production_records(db_age_hours=49, file_age_hours=15 * 24)
        error = diagnostics_snapshot.collect_backup_summary(now=NOW)
        self.assertEqual(error["status"], "error")
        self.assertEqual(error["freshness"]["database"]["status"], "error")
        self.assertEqual(error["freshness"]["files"]["status"], "error")

    def test_malformed_production_status_does_not_fall_back_to_local_artifacts(self):
        self.write_local_manifest("files")
        status_dir = self.base_dir / "var" / "diagnostics" / "backups"
        status_dir.mkdir(parents=True)
        (status_dir / "catalog.json").write_text("not-json", encoding="utf-8")
        summary = diagnostics_snapshot.collect_backup_summary(now=NOW)
        self.assertEqual(summary["status"], "error")
        self.assertEqual(summary["source"], "production-status")
        self.assertEqual(summary["validatedCounts"]["total"], 0)

    def test_production_mode_with_no_records_is_an_error(self):
        summary = diagnostics_snapshot.collect_backup_summary(now=NOW)
        self.assertEqual(summary["status"], "error")
        self.assertEqual(summary["source"], "production-status")
        self.assertIn("records are missing", summary["message"])

    def test_production_mode_ignores_fresh_local_artifacts(self):
        self.write_local_manifest("files")
        summary = diagnostics_snapshot.collect_backup_summary(now=NOW)
        self.assertEqual(summary["validatedCounts"]["total"], 0)
        self.assertEqual(summary["root"], "/mnt/archive/backups/bwondercomics")

    def test_status_only_failure_preserves_error_code_without_catalog(self):
        status_dir = self.base_dir / "var" / "diagnostics" / "backups"
        for kind, code in (("database", "dump_failed"), ("files", "file_walk_failed")):
            attempt = {
                "startedAt": iso_z(NOW),
                "finishedAt": iso_z(NOW),
                "status": "error",
                "errorCode": code,
            }
            self.write_json(
                status_dir / f"{kind}.json",
                {
                    "schemaVersion": 1,
                    "kind": kind,
                    "updatedAt": iso_z(NOW),
                    "lastAttempt": attempt,
                    "lastSuccess": None,
                    "history": [attempt],
                },
            )
        summary = diagnostics_snapshot.collect_backup_summary(now=NOW)
        self.assertEqual(summary["jobs"]["database"]["lastAttempt"]["errorCode"], "dump_failed")
        self.assertIn("file_walk_failed", summary["message"])

    def test_malformed_file_status_does_not_hide_valid_database_failure(self):
        self.test_status_only_failure_preserves_error_code_without_catalog()
        status_dir = self.base_dir / "var" / "diagnostics" / "backups"
        (status_dir / "files.json").write_text("not-json", encoding="utf-8")
        summary = diagnostics_snapshot.collect_backup_summary(now=NOW)
        self.assertEqual(summary["jobs"]["database"]["lastAttempt"]["errorCode"], "dump_failed")
        self.assertNotIn("files", summary["jobs"])
        self.assertIn("files backup status is malformed", summary["message"])

    def test_build_snapshot_collects_backup_state_once(self):
        backup_summary = diagnostics_snapshot._summary_payload(
            source="production-status",
            root=Path("/mnt/archive/backups/bwondercomics"),
            grouped={"db": [], "files": []},
            jobs={},
            now=NOW,
            forced_error="No records",
        )
        with (
            patch.object(
                diagnostics_snapshot, "collect_backup_summary", return_value=backup_summary
            ) as collect,
            patch.object(
                diagnostics_snapshot,
                "collect_database_stats",
                return_value={"users": {"total": 0}, "posts": 0},
            ),
            patch.object(diagnostics_snapshot, "collect_database_overview", return_value={}),
            patch.object(diagnostics_snapshot, "collect_test_status", return_value={}),
        ):
            snapshot = diagnostics_snapshot.build_snapshot(MagicMock())
        self.assertEqual(collect.call_count, 1)
        self.assertEqual(snapshot["backups"], backup_summary)

    def test_invalid_diagnostics_mode_fails_settings_loading(self):
        with patch.dict(os.environ, {"BWC_BACKUP_DIAGNOSTICS_MODE": "invalid"}):
            with self.assertRaisesRegex(ValueError, "BWC_BACKUP_DIAGNOSTICS_MODE"):
                load_settings()

    def test_explicit_production_diagnostics_mode_loads(self):
        with patch.dict(os.environ, {"BWC_BACKUP_DIAGNOSTICS_MODE": "production"}):
            self.assertEqual(load_settings().backup_diagnostics_mode, "production")


if __name__ == "__main__":
    unittest.main()
