"""
Admin Ops API routes.

Execute predefined shell commands from the admin UI:
- frontend-build, db-backup, restart, etc.
- Commands run in background with output streaming
- Execution history stored in admin_ops_runs table

Security: Only runs commands from ADMIN_COMMANDS allowlist.
Enable with ADMIN_COMMANDS_ENABLED=true in env.
"""

from __future__ import annotations

import json
import subprocess
import threading
import time
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import SessionLocal, get_db
from ..models import AdminOpsRun
from ..settings import settings
from .admin_utils import iso_z, require_admin

router = APIRouter()

MAX_OUTPUT_CHARS = 20000
COMMAND_TIMEOUT_SECONDS = 1200

OPS_COMMANDS = {
    "frontend-build": {
        "label": "Build frontend (snapshot dist first)",
        "command": ["bash", "scripts/frontend-build.sh"],
        "disruptsApi": False,
    },
    "frontend-rollback": {
        "label": "Rollback frontend to last snapshot",
        "command": ["bash", "scripts/frontend-rollback.sh"],
        "disruptsApi": True,
    },
    "frontend-restore-rollback": {
        "label": "Restore last rollback snapshot",
        "command": ["bash", "scripts/frontend-restore-rollback.sh"],
        "disruptsApi": True,
    },
    "backup": {
        "label": "Backup DB + files",
        "command": ["make", "backup"],
        "disruptsApi": False,
    },
    "migrate": {
        "label": "Run DB migrations",
        "command": ["make", "migrate"],
        "disruptsApi": False,
    },
    "restart": {
        "label": "Restart stack",
        "command": ["make", "restart"],
        "disruptsApi": True,
    },
    "up": {
        "label": "Rebuild/restart stack",
        "command": ["make", "up"],
        "disruptsApi": True,
    },
    "analytics-up": {
        "label": "Start analytics services",
        "command": ["make", "analytics-up"],
        "disruptsApi": False,
    },
    "analytics-stop": {
        "label": "Stop analytics services",
        "command": ["make", "analytics-stop"],
        "disruptsApi": False,
    },
    "tests": {
        "label": "Run frontend tests",
        "command": ["npm", "test"],
        "disruptsApi": False,
    },
}


class RunCommandRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    command_id: str | None = Field(default=None, alias="commandId")
    command: str | None = None
    id: str | None = None
    confirm: bool = False


def _describe_command(command_id: str) -> dict | None:
    info = OPS_COMMANDS.get(command_id)
    if not info:
        return None
    return {
        "id": command_id,
        "label": info["label"],
        "command": " ".join(info["command"]),
        "disruptsApi": bool(info.get("disruptsApi")),
    }


def _record_run(db: Session, command_id: str, user_email: str | None) -> AdminOpsRun:
    info = OPS_COMMANDS[command_id]
    run = AdminOpsRun(
        id=uuid4(),
        command_id=command_id,
        label=info.get("label"),
        status="running",
        started_at=datetime.now(timezone.utc),
        user_email=user_email,
        disrupts_api=bool(info.get("disruptsApi")),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def _finalize_run(
    run_id: str, result: subprocess.CompletedProcess | None, error_message: str | None
) -> None:
    db = SessionLocal()
    try:
        run = db.get(AdminOpsRun, run_id)
        if not run:
            return

        output = ""
        exit_code = None
        if result is not None:
            exit_code = result.returncode
            output = (result.stdout or "").strip()

        output_truncated = False
        if len(output) > MAX_OUTPUT_CHARS:
            output = output[:MAX_OUTPUT_CHARS]
            output_truncated = True

        now = datetime.now(timezone.utc)
        run.status = "completed" if exit_code == 0 else "failed"
        run.finished_at = now
        run.duration_seconds = int((now - (run.started_at or now)).total_seconds())
        run.exit_code = exit_code
        run.output = output or None
        run.output_truncated = output_truncated
        run.error_message = error_message
        db.add(run)
        db.commit()
    finally:
        db.close()


def _run_command_background(command_id: str, run_id: str) -> None:
    info = OPS_COMMANDS.get(command_id)
    if not info:
        _finalize_run(run_id, None, "Unknown command")
        return

    result = None
    error_message = None
    try:
        result = subprocess.run(
            info["command"],
            cwd=str(settings.base_dir),
            capture_output=True,
            text=True,
            timeout=COMMAND_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        error_message = str(exc)

    _finalize_run(run_id, result, error_message)


def run_ops_command(
    command_id: str, request: Request, db: Session, confirm: bool
) -> tuple[dict, int]:
    admin = require_admin(request, db)
    if not admin:
        return {"error": "Admin access required"}, 403
    if not settings.admin_commands_enabled:
        return {"error": "Command runner disabled"}, 403

    info = OPS_COMMANDS.get(command_id)
    if not info:
        return {"error": "Unknown command"}, 404

    if info.get("disruptsApi") and not confirm:
        return {
            "error": "Confirmation required",
            "requiresConfirm": True,
            "command": _describe_command(command_id),
        }, 409

    run = _record_run(db, command_id, admin.email)
    thread = threading.Thread(
        target=_run_command_background, args=(command_id, str(run.id)), daemon=True
    )
    thread.start()

    return {
        "run": {
            "id": str(run.id),
            "commandId": run.command_id,
            "label": run.label or "",
            "status": run.status,
            "startedAt": iso_z(run.started_at),
            "disruptsApi": bool(run.disrupts_api),
        }
    }, 200


@router.get("/api/admin/ops")
@router.get("/api/admin/diagnostics/ops")
def list_ops(request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    message = "" if settings.admin_commands_enabled else "Command runner disabled."
    return {
        "commands": [_describe_command(cmd_id) for cmd_id in OPS_COMMANDS.keys()],
        "enabled": settings.admin_commands_enabled,
        "message": message,
    }


@router.post("/api/admin/ops/run")
def run_ops(payload: RunCommandRequest, request: Request, db: Session = Depends(get_db)):
    command_id = (payload.command_id or payload.command or payload.id or "").strip()
    if not command_id:
        return JSONResponse(status_code=400, content={"error": "commandId is required"})

    body, status = run_ops_command(command_id, request, db, payload.confirm)
    if status != 200:
        return JSONResponse(status_code=status, content=body)
    return body


@router.post("/api/admin/run-command")
def run_command_alias(payload: RunCommandRequest, request: Request, db: Session = Depends(get_db)):
    return run_ops(payload, request, db)


@router.get("/api/admin/ops-history")
@router.get("/api/admin/ops/history")
@router.get("/api/admin/diagnostics/ops-history")
def ops_history(request: Request, db: Session = Depends(get_db), limit: int = 50):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    runs = db.scalars(
        select(AdminOpsRun).order_by(AdminOpsRun.started_at.desc()).limit(limit)
    ).all()

    return {
        "runs": [
            {
                "id": str(run.id),
                "commandId": run.command_id,
                "label": run.label or "",
                "status": run.status,
                "startedAt": iso_z(run.started_at),
                "finishedAt": iso_z(run.finished_at),
                "durationSeconds": run.duration_seconds,
                "exitCode": run.exit_code,
                "output": run.output or "",
                "outputTruncated": bool(run.output_truncated),
                "errorMessage": run.error_message or "",
                "userEmail": run.user_email or "",
                "disruptsApi": bool(run.disrupts_api),
            }
            for run in runs
        ]
    }


@router.post("/api/admin/run-command-stream")
def run_command_stream(payload: RunCommandRequest, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    if not admin:
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    command_id = (payload.command_id or payload.command or payload.id or "").strip()
    if not command_id:
        return JSONResponse(status_code=400, content={"error": "commandId is required"})

    info = OPS_COMMANDS.get(command_id)
    if not info:
        return JSONResponse(status_code=404, content={"error": "Unknown command"})

    if info.get("disruptsApi") and not payload.confirm:
        return JSONResponse(
            status_code=409,
            content={
                "error": "Confirmation required",
                "requiresConfirm": True,
                "command": _describe_command(command_id),
            },
        )

    run = _record_run(db, command_id, admin.email)
    command = info["command"]

    def stream():
        output_chunks: list[str] = []
        output_len = 0
        truncated = False
        start = time.monotonic()
        exit_code = None
        error_message = None

        try:
            proc = subprocess.Popen(
                command,
                cwd=str(settings.base_dir),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            if proc.stdout:
                for line in proc.stdout:
                    data = {"line": line.rstrip("\n")}
                    payload_line = json.dumps(data)
                    yield f"data: {payload_line}\n\n"
                    if output_len < MAX_OUTPUT_CHARS:
                        output_chunks.append(line)
                        output_len += len(line)
                    else:
                        truncated = True
            exit_code = proc.wait()
        except Exception as exc:
            error_message = str(exc)
        finally:
            duration = int(time.monotonic() - start)
            db_local = SessionLocal()
            try:
                run_local = db_local.get(AdminOpsRun, run.id)
                if run_local:
                    output = "".join(output_chunks).strip()
                    if len(output) > MAX_OUTPUT_CHARS:
                        output = output[:MAX_OUTPUT_CHARS]
                        truncated = True
                    run_local.status = "completed" if exit_code == 0 else "failed"
                    run_local.finished_at = datetime.now(timezone.utc)
                    run_local.duration_seconds = duration
                    run_local.exit_code = exit_code
                    run_local.output = output or None
                    run_local.output_truncated = truncated
                    run_local.error_message = error_message
                    db_local.add(run_local)
                    db_local.commit()
            finally:
                db_local.close()

        final_payload = json.dumps({"exitCode": exit_code, "error": error_message})
        yield f"event: complete\ndata: {final_payload}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
