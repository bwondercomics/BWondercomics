#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib import error, request


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


def finish_run(run_id: str, status: str, exit_code: int | None, error_message: str, truncated: bool) -> None:
    api_call(
        f"/api/internal/ops/runs/{run_id}/finish",
        {
            "status": status,
            "exitCode": exit_code,
            "errorMessage": error_message,
            "outputTruncated": truncated,
        },
    )


def process_queue_file(path: Path, catalog: dict[str, dict]) -> None:
    working_path = path.with_suffix(".working")
    try:
        path.rename(working_path)
    except FileNotFoundError:
        return

    truncated = False
    exit_code = None
    error_message = ""
    run_id = ""
    try:
        payload = json.loads(working_path.read_text(encoding="utf-8"))
        run_id = str(payload.get("runId") or "").strip()
        command_id = str(payload.get("commandId") or "").strip()
        if not run_id or command_id not in catalog:
            raise ValueError("Invalid queue payload")

        LOG_DIR.mkdir(parents=True, exist_ok=True)
        log_path = LOG_DIR / f"{run_id}.log"
        if log_path.exists():
            log_path.unlink()

        api_call(f"/api/internal/ops/runs/{run_id}/start")
        command = [str(part) for part in catalog[command_id]["argv"]]

        written = 0
        with log_path.open("w", encoding="utf-8", errors="replace") as log_file:
            proc = subprocess.Popen(
                command,
                cwd=str(BASE_DIR),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            if proc.stdout:
                for line in proc.stdout:
                    before = written
                    written = write_line(log_file, line, written)
                    if written == before and line:
                        truncated = True
            exit_code = proc.wait()

        if exit_code != 0:
            error_message = f"Command exited with code {exit_code}"
        finish_run(run_id, "completed" if exit_code == 0 else "failed", exit_code, error_message, truncated)
    except Exception as exc:
        error_message = str(exc)
        if run_id:
            try:
                finish_run(run_id, "failed", exit_code, error_message, truncated)
            except error.URLError as api_exc:
                print(f"ops_worker: failed to report error for {run_id}: {api_exc}", file=sys.stderr)
        else:
            print(f"ops_worker: discarded invalid queue item {working_path.name}: {error_message}", file=sys.stderr)
    finally:
        try:
            working_path.unlink()
        except FileNotFoundError:
            pass


def main() -> int:
    if not TOKEN:
        print("ops_worker: HOST_AUTOMATION_TOKEN is required", file=sys.stderr)
        return 1

    QUEUE_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    while True:
        try:
            catalog = load_catalog()
            for path in sorted(QUEUE_DIR.glob("*.json"), key=lambda item: item.stat().st_mtime):
                process_queue_file(path, catalog)
        except Exception as exc:
            print(f"ops_worker: {exc}", file=sys.stderr)
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    raise SystemExit(main())
