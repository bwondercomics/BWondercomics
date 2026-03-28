from __future__ import annotations

import json
import os
import tempfile
import unittest
from contextlib import ExitStack
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-diagnostics-tests.db")

from backend.app.db import Base
from backend.app.diagnostics_snapshot import load_latest_snapshot, refresh_snapshot
from backend.app.models import AdminOpsRun, User
from backend.app.routes.admin_diagnostics import internal_diagnostics_refresh
from backend.app.routes.admin_ops import (
    FinishRunRequest,
    enqueue_ops_command,
    internal_ops_run_finish,
    internal_ops_run_start,
    log_file_path,
    queue_file_path,
)
from backend.app.routes.admin_utils import require_ops_access
from backend.app.security import hash_password, issue_session_token
from backend.app.settings import settings as app_settings


def build_request(
    path: str = "/",
    method: str = "GET",
    headers: list[tuple[bytes, bytes]] | None = None,
    cookie: str | None = None,
) -> Request:
    header_list = list(headers or [])
    if cookie:
        header_list.append((b"cookie", cookie.encode("utf-8")))
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": header_list,
        "client": ("127.0.0.1", 1234),
        "server": ("127.0.0.1", 8000),
    }
    return Request(scope)


class DiagnosticsOpsTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_dir = Path(self.temp_dir.name)
        (self.base_dir / "dist" / "assets").mkdir(parents=True, exist_ok=True)
        (self.base_dir / "dist" / "assets" / "app.manifest").write_text("manifest", encoding="utf-8")
        (self.base_dir / "deploy" / "ops").mkdir(parents=True, exist_ok=True)
        (self.base_dir / "deploy" / "ops" / "command-catalog.json").write_text(
            json.dumps(
                [
                    {
                        "id": "tests",
                        "label": "Run Frontend Tests",
                        "group": "Verification",
                        "description": "Run the Vitest suite.",
                        "argv": ["npm", "test"],
                        "terminal": "npm test",
                    }
                ]
            ),
            encoding="utf-8",
        )
        (self.base_dir / "tests").mkdir(parents=True, exist_ok=True)
        (self.base_dir / "tests" / "ops.test.js").write_text("test", encoding="utf-8")
        (self.base_dir / "var" / "backups").mkdir(parents=True, exist_ok=True)
        (self.base_dir / "var" / "backups" / "db-20260101-010101.sql").write_text("db", encoding="utf-8")
        (self.base_dir / "var" / "backups" / "files-20260101-010101.tar.gz").write_text("files", encoding="utf-8")
        (self.base_dir / "var" / "diagnostics").mkdir(parents=True, exist_ok=True)
        (self.base_dir / "var" / "diagnostics" / "fail2ban.json").write_text(
            json.dumps(
                {
                    "status": "ok",
                    "message": "fail2ban running",
                    "currentlyBanned": 0,
                    "totalBanned": 0,
                    "jails": "sshd",
                    "jailBreakdown": "sshd 0/0",
                    "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                }
            ),
            encoding="utf-8",
        )

        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

        self.admin = User(
            email="admin@example.com",
            display_name="Admin",
            password_hash=hash_password("password123"),
            role="admin",
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(self.admin)
        self.db.commit()
        self.db.refresh(self.admin)

        self.patches = ExitStack()
        test_settings = replace(
            app_settings,
            base_dir=self.base_dir,
            admin_commands_enabled=True,
            ops_allowed_ips=("127.0.0.1/32",),
            host_automation_token="test-token",
        )
        self.patches.enter_context(patch("backend.app.diagnostics_snapshot.settings", test_settings))
        self.patches.enter_context(patch("backend.app.ops_catalog.settings", test_settings))
        self.patches.enter_context(patch("backend.app.routes.admin_utils.settings", test_settings))
        self.patches.enter_context(patch("backend.app.routes.admin_ops.settings", test_settings))
        self.patches.enter_context(patch("backend.app.routes.admin_diagnostics.settings", test_settings))
        self.patches.enter_context(patch("backend.app.security.settings", test_settings))

    def tearDown(self):
        self.patches.close()
        self.db.close()
        self.engine.dispose()
        self.temp_dir.cleanup()

    def admin_cookie(self) -> str:
        token = issue_session_token(self.admin.id)
        return f"{app_settings.session_cookie_name}={token}"

    def test_refresh_snapshot_writes_latest_and_prunes_history(self):
        history_dir = self.base_dir / "var" / "diagnostics" / "admin" / "history"
        history_dir.mkdir(parents=True, exist_ok=True)
        stale_file = history_dir / "old.json"
        stale_file.write_text("{}", encoding="utf-8")
        old_mtime = (datetime.now(timezone.utc) - timedelta(hours=80)).timestamp()
        stale_file.touch()
        stale_file.chmod(0o644)
        import os

        os.utime(stale_file, (old_mtime, old_mtime))

        snapshot = refresh_snapshot(self.db, source="manual")
        latest_path = self.base_dir / "var" / "diagnostics" / "admin" / "latest.json"

        self.assertTrue(latest_path.exists())
        self.assertEqual(snapshot["schemaVersion"], 1)
        self.assertIn("database", snapshot["health"]["checks"])
        self.assertIn("dist", snapshot["health"]["checks"])
        self.assertIn("backups", snapshot["health"]["checks"])
        self.assertIn("fail2ban", snapshot["health"]["checks"])
        self.assertEqual(snapshot["source"], "manual")
        self.assertFalse(stale_file.exists())
        self.assertIsNotNone(load_latest_snapshot())

    def test_require_ops_access_enforces_allowlist(self):
        allowed_request = build_request(
            path="/api/admin/ops",
            headers=[(b"x-forwarded-for", b"127.0.0.1")],
            cookie=self.admin_cookie(),
        )
        admin, error = require_ops_access(allowed_request, self.db)
        self.assertIsNotNone(admin)
        self.assertIsNone(error)

        denied_request = build_request(
            path="/api/admin/ops",
            headers=[(b"x-forwarded-for", b"192.168.50.10")],
            cookie=self.admin_cookie(),
        )
        admin, error = require_ops_access(denied_request, self.db)
        self.assertIsNone(admin)
        self.assertIn("denied", error.lower())

    def test_internal_diagnostics_refresh_requires_token(self):
        denied = internal_diagnostics_refresh(build_request("/api/internal/diagnostics/refresh", method="POST"), self.db)
        self.assertEqual(denied.status_code, 403)

        allowed_request = build_request(
            "/api/internal/diagnostics/refresh",
            method="POST",
            headers=[(b"authorization", b"Bearer test-token")],
        )
        payload = internal_diagnostics_refresh(allowed_request, self.db)
        self.assertEqual(payload["source"], "timer")
        self.assertTrue((self.base_dir / "var" / "diagnostics" / "admin" / "latest.json").exists())

    def test_queue_run_can_transition_to_completed_via_internal_callbacks(self):
        run = enqueue_ops_command("tests", self.admin.email, self.db)
        self.assertEqual(run.status, "queued")
        self.assertTrue(queue_file_path(str(run.id)).exists())

        token_request = build_request(
            path=f"/api/internal/ops/runs/{run.id}/start",
            method="POST",
            headers=[(b"authorization", b"Bearer test-token")],
        )
        started = internal_ops_run_start(str(run.id), token_request, self.db)
        self.assertEqual(started["run"]["status"], "running")

        log_file_path(str(run.id)).write_text("line one\nline two\n", encoding="utf-8")
        finished = internal_ops_run_finish(
            str(run.id),
            FinishRunRequest(status="completed", exitCode=0, errorMessage="", outputTruncated=False),
            token_request,
            self.db,
        )
        self.assertEqual(finished["run"]["status"], "completed")
        self.assertIn("line one", finished["run"]["output"])

        run_row = self.db.get(AdminOpsRun, run.id)
        self.assertEqual(run_row.status, "completed")


if __name__ == "__main__":
    unittest.main()
