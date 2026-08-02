#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from urllib import request

BASE_DIR = Path(os.environ.get("BWC_BASE_DIR", "/srv/bw-quality"))
QUEUE_DIR = BASE_DIR / "var" / "ops" / "queue"
LOG_DIR = BASE_DIR / "var" / "ops" / "logs"
CATALOG_PATH = BASE_DIR / "deploy" / "ops" / "command-catalog.json"
API_BASE = os.environ.get("BWC_INTERNAL_API_BASE") or (
    f"http://127.0.0.1:{os.environ.get('BWC_API_PORT', '8000')}"
)
TOKEN = os.environ.get("HOST_AUTOMATION_TOKEN", "").strip()
POLL_SECONDS = float(os.environ.get("OPS_WORKER_POLL_SECONDS", "2"))
MAX_LOG_BYTES = int(os.environ.get("OPS_WORKER_MAX_LOG_BYTES", "200000"))
ACTIVE_PROCESS: subprocess.Popen | None = None
SHUTDOWN_REQUESTED = False


def load_catalog() -> dict[str, dict]:
    payload = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    items = {}
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        command_id = str(entry.get("id") or "").strip()
        argv = entry.get("argv")
        if command_id and isinstance(argv, list) and argv:
            items[command_id] = entry
    return items


def api_call(path: str, payload: dict | None = None) -> dict:
    headers = {"Authorization": f"Bearer {TOKEN}"}
    body = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    req = request.Request(f"{API_BASE}{path}", data=body, headers=headers, method="POST")
    with request.urlopen(req, timeout=30) as response:
        raw = response.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def write_line(handle, text: str, written: int) -> int:
    data = text.encode("utf-8", errors="replace")
    if written < MAX_LOG_BYTES:
        remaining = MAX_LOG_BYTES - written
        chunk = data[:remaining]
        handle.buffer.write(chunk)
        handle.flush()
        written += len(chunk)
    return written


def finish_run(
    run_id: str, status: str, exit_code: int | None, error_message: str, truncated: bool
) -> None:
    api_call(
        f"/api/internal/ops/runs/{run_id}/finish",
        {
            "status": status,
            "exitCode": exit_code,
            "errorMessage": error_message,
            "outputTruncated": truncated,
        },
    )


def _load_marker(path: Path, catalog: dict[str, dict]) -> tuple[str, str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    run_id = str(payload.get("runId") or "").strip()
    command_id = str(payload.get("commandId") or "").strip()
    if not run_id or command_id not in catalog:
        raise ValueError("Invalid queue payload")
    return run_id, command_id


def recover_stale_markers(catalog: dict[str, dict]) -> None:
    for working_path in sorted(QUEUE_DIR.glob("*.working")):
        try:
            run_id, _command_id = _load_marker(working_path, catalog)
        except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
            print(
                f"ops_worker: retained invalid stale marker {working_path.name}: {exc}",
                file=sys.stderr,
            )
            continue
        try:
            finish_run(run_id, "failed", None, "worker_interrupted", False)
        except Exception as exc:
            print(
                f"ops_worker: retained stale marker for {run_id}; API acknowledgement failed: {exc}",
                file=sys.stderr,
            )
            continue
        working_path.unlink(missing_ok=True)


def request_shutdown(_signum=None, _frame=None) -> None:
    global SHUTDOWN_REQUESTED
    SHUTDOWN_REQUESTED = True
    process = ACTIVE_PROCESS
    if process is not None and process.poll() is None:
        process.terminate()


def process_queue_file(path: Path, catalog: dict[str, dict]) -> None:
    global ACTIVE_PROCESS
    working_path = path.with_suffix(".working")
    try:
        path.rename(working_path)
    except FileNotFoundError:
        return

    truncated = False
    exit_code = None
    error_message = ""
    run_id = ""
    remove_marker = False
    try:
        run_id, command_id = _load_marker(working_path, catalog)

        LOG_DIR.mkdir(parents=True, exist_ok=True)
        log_path = LOG_DIR / f"{run_id}.log"
        if log_path.exists():
            log_path.unlink()

        api_call(f"/api/internal/ops/runs/{run_id}/start")
        if SHUTDOWN_REQUESTED:
            raise RuntimeError("worker_terminated")
        command = [str(part) for part in catalog[command_id]["argv"]]

        written = 0
        with log_path.open("w", encoding="utf-8", errors="replace") as log_file:
            ACTIVE_PROCESS = subprocess.Popen(
                command,
                cwd=str(BASE_DIR),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            if ACTIVE_PROCESS.stdout:
                for line in ACTIVE_PROCESS.stdout:
                    before = written
                    written = write_line(log_file, line, written)
                    if written == before and line:
                        truncated = True
            exit_code = ACTIVE_PROCESS.wait()

        if SHUTDOWN_REQUESTED:
            error_message = "worker_terminated"
        elif exit_code != 0:
            error_message = f"Command exited with code {exit_code}"
        status = "completed" if exit_code == 0 and not SHUTDOWN_REQUESTED else "failed"
        finish_run(run_id, status, exit_code, error_message, truncated)
        remove_marker = True
    except Exception as exc:
        error_message = str(exc)
        if run_id:
            try:
                finish_run(run_id, "failed", exit_code, error_message, truncated)
                remove_marker = True
            except Exception as api_exc:
                print(
                    f"ops_worker: failed to report error for {run_id}: {api_exc}", file=sys.stderr
                )
        else:
            print(
                f"ops_worker: discarded invalid queue item {working_path.name}: {error_message}",
                file=sys.stderr,
            )
            remove_marker = True
    finally:
        ACTIVE_PROCESS = None
        if remove_marker:
            working_path.unlink(missing_ok=True)


def main() -> int:
    if not TOKEN:
        print("ops_worker: HOST_AUTOMATION_TOKEN is required", file=sys.stderr)
        return 1

    QUEUE_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    signal.signal(signal.SIGTERM, request_shutdown)
    signal.signal(signal.SIGINT, request_shutdown)

    recover_stale_markers(load_catalog())

    while not SHUTDOWN_REQUESTED:
        try:
            catalog = load_catalog()
            for path in sorted(QUEUE_DIR.glob("*.json"), key=lambda item: item.stat().st_mtime):
                if SHUTDOWN_REQUESTED:
                    break
                process_queue_file(path, catalog)
        except Exception as exc:
            print(f"ops_worker: {exc}", file=sys.stderr)
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    raise SystemExit(main())
