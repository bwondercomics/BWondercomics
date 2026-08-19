from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "bwondercomics_admin_ops_check", PROJECT_ROOT / "scripts" / "admin_ops_check.py"
)
assert SPEC and SPEC.loader
admin_ops_check = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(admin_ops_check)


class AdminOpsCheckTests(unittest.TestCase):
    def test_load_env_does_not_expand_or_expose_values(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "app.env"
            path.write_text(
                "# comment\nHOST_AUTOMATION_TOKEN='secret'\nADMIN_COMMANDS_ENABLED=true\n",
                encoding="utf-8",
            )
            values = admin_ops_check.load_env(path)
        self.assertEqual(values["HOST_AUTOMATION_TOKEN"], "secret")
        self.assertEqual(values["ADMIN_COMMANDS_ENABLED"], "true")

    def test_network_normalization_accepts_both_env_formats(self):
        backend = admin_ops_check.normalized_networks("127.0.0.1/32,::1/128,10.0.0.0/24")
        caddy = admin_ops_check.normalized_networks("127.0.0.1/32 ::1/128 10.0.0.0/24")
        self.assertEqual(backend, caddy)

    def test_configuration_requires_token_commands_and_matching_allowlists(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            env_file = Path(temp_dir) / "production.env"
            env_file.write_text("placeholder=true\n", encoding="utf-8")
            env_file.chmod(0o600)
            original_env_file = admin_ops_check.ENV_FILE
            admin_ops_check.ENV_FILE = env_file
            try:
                results = admin_ops_check.check_configuration(
                    {
                        "HOST_AUTOMATION_TOKEN": "configured",
                        "ADMIN_COMMANDS_ENABLED": "true",
                        "OPS_ALLOWED_IPS": "127.0.0.1/32,10.0.0.0/24",
                        "CADDY_OPS_ALLOWED_IPS": "127.0.0.1/32 10.0.0.0/24",
                    }
                )
            finally:
                admin_ops_check.ENV_FILE = original_env_file
        self.assertTrue(all(passed for passed, _description in results))

    def test_configuration_rejects_invalid_allowlist_without_raising(self):
        results = admin_ops_check.check_configuration(
            {
                "HOST_AUTOMATION_TOKEN": "configured",
                "ADMIN_COMMANDS_ENABLED": "true",
                "OPS_ALLOWED_IPS": "not-a-network",
                "CADDY_OPS_ALLOWED_IPS": "127.0.0.1/32",
            }
        )
        self.assertFalse(
            dict((description, passed) for passed, description in results)[
                "backend Ops allowlist is configured"
            ]
        )

    def test_recent_timer_snapshot_can_come_from_history_after_manual_refresh(self):
        now = datetime.now(timezone.utc)
        latest = {
            "generatedAt": now.isoformat().replace("+00:00", "Z"),
            "source": "manual",
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            history = Path(temp_dir)
            timer_payload = {
                "generatedAt": (now - timedelta(minutes=30)).isoformat().replace("+00:00", "Z"),
                "source": "timer",
            }
            (history / "timer.json").write_text(json.dumps(timer_payload), encoding="utf-8")
            self.assertTrue(admin_ops_check._has_recent_timer_snapshot(latest, history, now))

            timer_payload["generatedAt"] = (
                (now - timedelta(hours=3)).isoformat().replace("+00:00", "Z")
            )
            (history / "timer.json").write_text(json.dumps(timer_payload), encoding="utf-8")
            self.assertFalse(admin_ops_check._has_recent_timer_snapshot(latest, history, now))


if __name__ == "__main__":
    unittest.main()
