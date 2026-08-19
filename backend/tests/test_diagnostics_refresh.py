from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "bwondercomics_diagnostics_refresh",
    PROJECT_ROOT / "deploy" / "host-status" / "diagnostics_refresh.py",
)
assert SPEC and SPEC.loader
diagnostics_refresh = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(diagnostics_refresh)


class DiagnosticsRefreshTests(unittest.TestCase):
    def test_missing_token_is_a_permanent_configuration_error(self):
        with patch.object(diagnostics_refresh, "TOKEN", ""):
            self.assertEqual(diagnostics_refresh.main(), 78)

    def test_disk_thresholds(self):
        self.assertEqual(diagnostics_refresh._space_status(25), "ok")
        self.assertEqual(diagnostics_refresh._space_status(15), "warning")
        self.assertEqual(diagnostics_refresh._space_status(5), "error")

    def test_compose_parser_accepts_array_and_newline_json(self):
        rows = [{"Service": "caddy", "State": "running"}, {"Service": "api", "State": "running"}]
        self.assertEqual(diagnostics_refresh._parse_compose_rows(json.dumps(rows)), rows)
        newline_payload = "\n".join(json.dumps(row) for row in rows)
        self.assertEqual(diagnostics_refresh._parse_compose_rows(newline_payload), rows)

    def test_host_status_merges_section_severity(self):
        ok = {"status": "ok", "message": "ok", "items": []}
        warning = {"status": "warning", "message": "warning", "items": []}
        with (
            patch.object(diagnostics_refresh, "collect_disks", return_value=ok),
            patch.object(diagnostics_refresh, "collect_containers", return_value=warning),
            patch.object(diagnostics_refresh, "collect_units", return_value=ok),
            patch.object(diagnostics_refresh, "collect_certificates", return_value=ok),
        ):
            payload = diagnostics_refresh.collect_host_status(
                datetime(2026, 8, 19, tzinfo=timezone.utc)
            )
        self.assertEqual(payload["status"], "warning")
        self.assertEqual(payload["schemaVersion"], 1)

    def test_host_status_is_atomically_written_with_restricted_mode(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "var" / "diagnostics" / "host.json"
            with patch.object(diagnostics_refresh, "OUTPUT_PATH", output):
                diagnostics_refresh.write_host_status({"schemaVersion": 1, "status": "ok"})
            self.assertEqual(json.loads(output.read_text(encoding="utf-8"))["status"], "ok")
            self.assertEqual(output.stat().st_mode & 0o777, 0o640)
            self.assertEqual(list(output.parent.glob(".*.tmp")), [])


if __name__ == "__main__":
    unittest.main()
