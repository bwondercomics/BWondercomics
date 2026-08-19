"""
Admin Ops API routes.

Ops commands are queued by the API and executed by a separate host worker.
This keeps admin diagnostics read-only while still allowing a protected ops
surface to run approved maintenance jobs.
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..db import SessionLocal, get_db
from ..diagnostics_snapshot import collect_backup_summary
from ..models import AdminOpsRun
from ..ops_catalog import get_ops_command, load_ops_catalog
from ..settings import settings
from .admin_utils import client_ip, iso_z, require_host_automation, require_ops_access

router = APIRouter()

MAX_OUTPUT_CHARS = 20_000
STREAM_POLL_SECONDS = 0.5


class RunCommandRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    command_id: str | None = Field(default=None, alias="commandId")
    command: str | None = None
    id: str | None = None
    confirm: bool = False


class FinishRunRequest(BaseModel):
    status: str
    exit_code: int | None = Field(default=None, alias="exitCode")
    error_message: str | None = Field(default=None, alias="errorMessage")
    output_truncated: bool = Field(default=False, alias="outputTruncated")


class QueuePublishError(RuntimeError):
    """Raised when a run record exists but its queue marker could not be published."""


class RunCreateError(RuntimeError):
    """Raised when the durable run record could not be created."""


def _ops_root() -> Path:
    return settings.base_dir / "var" / "ops"


def _queue_dir() -> Path:
    return _ops_root() / "queue"


def _logs_dir() -> Path:
    return _ops_root() / "logs"


def _ensure_ops_dirs() -> None:
    _queue_dir().mkdir(parents=True, exist_ok=True)
    _logs_dir().mkdir(parents=True, exist_ok=True)


def queue_file_path(run_id: str) -> Path:
    return _queue_dir() / f"{run_id}.json"


def log_file_path(run_id: str) -> Path:
    return _logs_dir() / f"{run_id}.log"


def _publish_queue_payload(run_id: str, payload: dict) -> None:
    queue_dir = _queue_dir()
    queue_path = queue_file_path(run_id)
    temporary_path = queue_dir / f".{run_id}.{uuid4().hex}.tmp"
    encoded = json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True).encode("utf-8")
    descriptor: int | None = None
    try:
        descriptor = os.open(temporary_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o640)
        with os.fdopen(descriptor, "wb") as handle:
            descriptor = None
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, queue_path)
        directory_fd = os.open(queue_dir, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        temporary_path.unlink(missing_ok=True)


def _describe_command(command_id: str) -> dict | None:
    command = get_ops_command(command_id)
    if not command:
        return None
    return {
        "id": command["id"],
        "label": command["label"],
        "group": command["group"],
        "description": command["description"],
        "command": command["terminal"],
        "disruptsApi": bool(command["disruptsApi"]),
        "requiresConfirm": bool(command["requiresConfirm"]),
    }


def _read_run_output(run_id: str) -> tuple[str, bool]:
    path = log_file_path(run_id)
    if not path.exists():
        return "", False
    content = path.read_text(encoding="utf-8", errors="replace")
    truncated = len(content) > MAX_OUTPUT_CHARS
    if truncated:
        content = content[-MAX_OUTPUT_CHARS:]
    return content, truncated


def _serialize_run(run: AdminOpsRun) -> dict:
    output, truncated_from_file = _read_run_output(str(run.id))
    output_truncated = bool(run.output_truncated or truncated_from_file)
    return {
        "id": str(run.id),
        "commandId": run.command_id,
        "label": run.label or "",
        "status": run.status,
        "startedAt": iso_z(run.started_at),
        "finishedAt": iso_z(run.finished_at),
        "durationSeconds": run.duration_seconds,
        "exitCode": run.exit_code,
        "output": output or (run.output or ""),
        "outputTruncated": output_truncated,
        "errorMessage": run.error_message or "",
        "userEmail": run.user_email or "",
        "disruptsApi": bool(run.disrupts_api),
    }


def _load_run(run_id: str) -> AdminOpsRun | None:
    db = SessionLocal()
    try:
        return db.get(AdminOpsRun, UUID(str(run_id)))
    finally:
        db.close()


def enqueue_ops_command(command_id: str, user_email: str | None, db: Session) -> AdminOpsRun:
    _ensure_ops_dirs()
    command = get_ops_command(command_id)
    if not command:
        raise ValueError("Unknown command")

    now = datetime.now(timezone.utc)
    run = AdminOpsRun(
        id=uuid4(),
        command_id=command_id,
        label=command["label"],
        status="queued",
        started_at=now,
        user_email=user_email,
        disrupts_api=bool(command["disruptsApi"]),
    )
    db.add(run)
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise RunCreateError("Unable to create the Ops run") from exc
    db.refresh(run)

    payload = {
        "runId": str(run.id),
        "commandId": command_id,
        "argv": command["argv"],
        "queuedAt": iso_z(now),
        "userEmail": user_email or "",
    }
    try:
        _publish_queue_payload(str(run.id), payload)
    except OSError as exc:
        finished_at = datetime.now(timezone.utc)
        run.status = "failed"
        run.finished_at = finished_at
        run.duration_seconds = max(0, int((finished_at - now).total_seconds()))
        run.error_message = "queue_publish_failed"
        db.add(run)
        db.commit()
        db.refresh(run)
        raise QueuePublishError("Unable to publish the Ops queue item") from exc
    return run


def mark_ops_run_started(run_id: str, db: Session) -> AdminOpsRun | None:
    run = db.get(AdminOpsRun, UUID(str(run_id)))
    if not run:
        return None
    run.status = "running"
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def mark_ops_run_finished(
    run_id: str,
    status: str,
    exit_code: int | None,
    error_message: str | None,
    output_truncated: bool,
    db: Session,
) -> AdminOpsRun | None:
    run = db.get(AdminOpsRun, UUID(str(run_id)))
    if not run:
        return None

    normalized = str(status or "failed").lower()
    if normalized not in {"completed", "failed"}:
        normalized = "failed"

    output, truncated_from_file = _read_run_output(run_id)
    now = datetime.now(timezone.utc)
    started_at = run.started_at or now
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    run.status = normalized
    run.finished_at = now
    run.duration_seconds = int((now - started_at).total_seconds())
    run.exit_code = exit_code
    run.output = output or None
    run.output_truncated = bool(output_truncated or truncated_from_file)
    run.error_message = error_message or None
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def _queue_requested_command(
    command_id: str,
    request: Request,
    db: Session,
    confirm: bool,
) -> tuple[dict, int]:
    admin, error = require_ops_access(request, db)
    if not admin:
        return {"error": error or "Ops access denied"}, 403
    if not settings.admin_commands_enabled:
        return {"error": "Command runner disabled"}, 403

    command = get_ops_command(command_id)
    if not command:
        return {"error": "Unknown command"}, 404
    if command["requiresConfirm"] and not confirm:
        return {
            "error": "Confirmation required",
            "requiresConfirm": True,
            "command": _describe_command(command_id),
        }, 409

    try:
        run = enqueue_ops_command(command_id, admin.email, db)
    except RunCreateError:
        return {
            "error": "Unable to create Ops run",
            "errorCode": "run_create_failed",
        }, 503
    except QueuePublishError:
        return {
            "error": "Unable to publish Ops queue item",
            "errorCode": "queue_publish_failed",
        }, 503
    return {"run": _serialize_run(run)}, 200


@router.get("/api/admin/ops")
@router.get("/api/admin/diagnostics/ops")
def list_ops(request: Request, db: Session = Depends(get_db)):
    admin, error = require_ops_access(request, db)
    if not admin:
        return JSONResponse(status_code=403, content={"error": error or "Ops access denied"})

    return {
        "commands": [_describe_command(item["id"]) for item in load_ops_catalog()],
        "enabled": settings.admin_commands_enabled,
        "message": "" if settings.admin_commands_enabled else "Command runner disabled.",
        "callerIp": client_ip(request),
    }


@router.get("/api/admin/ops/backups")
def ops_backups(request: Request, db: Session = Depends(get_db)):
    admin, error = require_ops_access(request, db)
    if not admin:
        return JSONResponse(status_code=403, content={"error": error or "Ops access denied"})
    return collect_backup_summary()


@router.post("/api/admin/ops/run")
def run_ops(payload: RunCommandRequest, request: Request, db: Session = Depends(get_db)):
    command_id = (payload.command_id or payload.command or payload.id or "").strip()
    if not command_id:
        return JSONResponse(status_code=400, content={"error": "commandId is required"})

    body, status = _queue_requested_command(command_id, request, db, payload.confirm)
    if status != 200:
        return JSONResponse(status_code=status, content=body)
    return body


@router.post("/api/admin/run-command")
def run_command_alias(payload: RunCommandRequest, request: Request, db: Session = Depends(get_db)):
    return run_ops(payload, request, db)


@router.post("/api/admin/run-command-stream")
def run_command_stream(payload: RunCommandRequest, request: Request, db: Session = Depends(get_db)):
    command_id = (payload.command_id or payload.command or payload.id or "").strip()
    if not command_id:
        return JSONResponse(status_code=400, content={"error": "commandId is required"})

    body, status = _queue_requested_command(command_id, request, db, payload.confirm)
    if status != 200:
        return JSONResponse(status_code=status, content=body)
    run_id = body["run"]["id"]
    return ops_run_stream(run_id, request, db)


@router.get("/api/admin/ops-history")
@router.get("/api/admin/ops/history")
@router.get("/api/admin/diagnostics/ops-history")
def ops_history(
    request: Request,
    db: Session = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=100),
):
    admin, error = require_ops_access(request, db)
    if not admin:
        return JSONResponse(status_code=403, content={"error": error or "Ops access denied"})

    runs = db.scalars(
        select(AdminOpsRun).order_by(AdminOpsRun.started_at.desc()).limit(limit)
    ).all()
    return {"runs": [_serialize_run(run) for run in runs]}


@router.get("/api/admin/ops/runs/{run_id}")
def ops_run_detail(run_id: str, request: Request, db: Session = Depends(get_db)):
    admin, error = require_ops_access(request, db)
    if not admin:
        return JSONResponse(status_code=403, content={"error": error or "Ops access denied"})

    try:
        run_uuid = UUID(str(run_id))
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid run id"})

    run = db.get(AdminOpsRun, run_uuid)
    if not run:
        return JSONResponse(status_code=404, content={"error": "Run not found"})
    return {"run": _serialize_run(run)}


@router.get("/api/admin/ops/runs/{run_id}/stream")
def ops_run_stream(run_id: str, request: Request, db: Session = Depends(get_db)):
    admin, error = require_ops_access(request, db)
    if not admin:
        return JSONResponse(status_code=403, content={"error": error or "Ops access denied"})

    try:
        run_uuid = UUID(str(run_id))
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid run id"})

    run = db.get(AdminOpsRun, run_uuid)
    if not run:
        return JSONResponse(status_code=404, content={"error": "Run not found"})

    def stream():
        yield f"event: meta\ndata: {json.dumps({'runId': run_id, 'label': run.label or run.command_id})}\n\n"
        offset = 0
        while True:
            path = log_file_path(run_id)
            if path.exists():
                with path.open("r", encoding="utf-8", errors="replace") as handle:
                    handle.seek(offset)
                    while True:
                        line = handle.readline()
                        if not line:
                            break
                        offset = handle.tell()
                        payload = json.dumps({"line": line.rstrip("\n")})
                        yield f"data: {payload}\n\n"

            current = _load_run(run_id)
            if not current:
                yield 'event: complete\ndata: {"error":"Run not found"}\n\n'
                break
            if current.status not in {"queued", "running"}:
                final_payload = json.dumps({"run": _serialize_run(current)})
                yield f"event: complete\ndata: {final_payload}\n\n"
                break
            time.sleep(STREAM_POLL_SECONDS)

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.post("/api/internal/ops/runs/{run_id}/start")
def internal_ops_run_start(run_id: str, request: Request, db: Session = Depends(get_db)):
    if not require_host_automation(request):
        return JSONResponse(status_code=403, content={"error": "Host automation token required"})

    try:
        run = mark_ops_run_started(run_id, db)
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid run id"})
    if not run:
        return JSONResponse(status_code=404, content={"error": "Run not found"})
    return {"run": _serialize_run(run)}


@router.post("/api/internal/ops/runs/{run_id}/finish")
def internal_ops_run_finish(
    run_id: str,
    payload: FinishRunRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    if not require_host_automation(request):
        return JSONResponse(status_code=403, content={"error": "Host automation token required"})

    try:
        run = mark_ops_run_finished(
            run_id=run_id,
            status=payload.status,
            exit_code=payload.exit_code,
            error_message=payload.error_message,
            output_truncated=payload.output_truncated,
            db=db,
        )
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid run id"})
    if not run:
        return JSONResponse(status_code=404, content={"error": "Run not found"})
    return {"run": _serialize_run(run)}
