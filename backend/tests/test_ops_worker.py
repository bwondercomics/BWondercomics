from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "bwondercomics_ops_worker", PROJECT_ROOT / "deploy" / "ops" / "ops_worker.py"
)
assert SPEC and SPEC.loader
ops_worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ops_worker)


class OpsWorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_dir = Path(self.temp_dir.name)
        self.queue_dir = self.base_dir / "var" / "ops" / "queue"
        self.log_dir = self.base_dir / "var" / "ops" / "logs"
        self.queue_dir.mkdir(parents=True)
        self.log_dir.mkdir(parents=True)
        self.catalog = {"tests": {"id": "tests", "argv": ["example-command"]}}
        self.patches = [
            patch.object(ops_worker, "BASE_DIR", self.base_dir),
            patch.object(ops_worker, "QUEUE_DIR", self.queue_dir),
            patch.object(ops_worker, "LOG_DIR", self.log_dir),
        ]
        for active_patch in self.patches:
            active_patch.start()
        ops_worker.ACTIVE_PROCESS = None
        ops_worker.SHUTDOWN_REQUESTED = False

    def tearDown(self):
        ops_worker.ACTIVE_PROCESS = None
        ops_worker.SHUTDOWN_REQUESTED = False
        for active_patch in reversed(self.patches):
            active_patch.stop()
        self.temp_dir.cleanup()

    def marker(self, suffix: str = ".working") -> Path:
        path = self.queue_dir / f"run-1{suffix}"
        path.write_text(json.dumps({"runId": "run-1", "commandId": "tests"}), encoding="utf-8")
        return path

    def test_startup_recovers_stale_marker_only_after_api_acknowledgement(self):
        marker = self.marker()
        with (
            patch.object(ops_worker, "finish_run") as finish,
            patch.object(ops_worker.subprocess, "Popen") as popen,
        ):
            ops_worker.recover_stale_markers(self.catalog)
        finish.assert_called_once_with("run-1", "failed", None, "worker_interrupted", False)
        popen.assert_not_called()
        self.assertFalse(marker.exists())

    def test_startup_retains_stale_marker_when_api_is_unavailable(self):
        marker = self.marker()
        with patch.object(ops_worker, "finish_run", side_effect=OSError("api unavailable")):
            ops_worker.recover_stale_markers(self.catalog)
        self.assertTrue(marker.exists())

    def test_invalid_stale_marker_is_retained_without_execution(self):
        marker = self.queue_dir / "invalid.working"
        marker.write_text("not-json", encoding="utf-8")
        with patch.object(ops_worker.subprocess, "Popen") as popen:
            ops_worker.recover_stale_markers(self.catalog)
        popen.assert_not_called()
        self.assertTrue(marker.exists())

    def test_sigterm_terminates_child_and_reports_failure(self):
        queue_path = self.marker(".json")

        class Output:
            def __iter__(self):
                ops_worker.request_shutdown()
                return iter(())

        process = Mock()
        process.stdout = Output()
        process.poll.return_value = None
        process.wait.return_value = -15

        with (
            patch.object(ops_worker, "api_call"),
            patch.object(ops_worker, "finish_run") as finish,
            patch.object(ops_worker.subprocess, "Popen", return_value=process),
        ):
            ops_worker.process_queue_file(queue_path, self.catalog)

        process.terminate.assert_called_once_with()
        finish.assert_called_once_with("run-1", "failed", -15, "worker_terminated", False)
        self.assertFalse(queue_path.with_suffix(".working").exists())

    def test_unacknowledged_finish_leaves_marker_for_startup_recovery(self):
        queue_path = self.marker(".json")
        process = Mock()
        process.stdout = []
        process.wait.return_value = 1
        with (
            patch.object(ops_worker, "api_call"),
            patch.object(ops_worker, "finish_run", side_effect=OSError("api unavailable")),
            patch.object(ops_worker.subprocess, "Popen", return_value=process),
        ):
            ops_worker.process_queue_file(queue_path, self.catalog)
        self.assertTrue(queue_path.with_suffix(".working").exists())

    def test_catalog_drift_reports_command_unavailable_without_execution(self):
        queue_path = self.marker(".json")
        with (
            patch.object(ops_worker, "finish_run") as finish,
            patch.object(ops_worker.subprocess, "Popen") as popen,
        ):
            ops_worker.process_queue_file(queue_path, {})
        finish.assert_called_once_with("run-1", "failed", None, "command_unavailable", False)
        popen.assert_not_called()
        self.assertFalse(queue_path.with_suffix(".working").exists())

    def test_catalog_drift_retains_marker_when_callback_fails(self):
        queue_path = self.marker(".json")
        with patch.object(ops_worker, "finish_run", side_effect=OSError("api unavailable")):
            ops_worker.process_queue_file(queue_path, {})
        self.assertTrue(queue_path.with_suffix(".working").exists())

    def test_missing_token_returns_configuration_exit_status(self):
        with patch.object(ops_worker, "TOKEN", ""):
            self.assertEqual(ops_worker.main(), 78)


if __name__ == "__main__":
    unittest.main()
