from __future__ import annotations

import json
import os
import platform
import subprocess
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    AdminOpsRun,
    Comment,
    EmailSubscriber,
    Entry,
    EntryPage,
    MediaItem,
    Post,
    Series,
    User,
)
from ..settings import settings
from .admin_ops import OPS_COMMANDS, run_ops_command
from .admin_utils import iso_z, require_admin


router = APIRouter()
APP_STARTED_AT = datetime.now(timezone.utc)


def _safe_env_snapshot() -> dict:
    def _redact(value: str | None) -> str:
        if not value:
            return ""
        return "***"

    return {
        "registrationMode": settings.registration_mode,
        "inviteCodeSet": bool(settings.invite_code),
        "cookieSecure": bool(settings.cookie_secure),
        "databaseConfigured": bool(settings.database_url),
        "umami": {
            "websiteId": settings.umami_website_id or "",
            "proxyPath": settings.umami_proxy_path or "",
            "baseUrl": settings.umami_base_url or "",
            "upstream": settings.umami_upstream or "",
            "apiToken": _redact(settings.umami_api_token),
            "apiUsername": settings.umami_api_username or "",
            "apiPasswordSet": bool(settings.umami_api_password),
        },
        "appSecretSet": bool(settings.app_secret and settings.app_secret != "change-me"),
        "baseDir": str(settings.base_dir),
    }


def _git_info() -> dict:
    def _run(args: list[str]) -> str:
        try:
            result = subprocess.run(
                args,
                cwd=str(settings.base_dir),
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode != 0:
                return ""
            return (result.stdout or "").strip()
        except Exception:
            return ""

    return {
        "commit": _run(["git", "rev-parse", "HEAD"]),
        "branch": _run(["git", "rev-parse", "--abbrev-ref", "HEAD"]),
        "status": "dirty" if _run(["git", "status", "--porcelain"]) else "clean",
    }


def _dist_info() -> dict:
    dist_dir = settings.base_dir / "dist"
    if not dist_dir.exists():
        return {"exists": False}
    latest = None
    for path in dist_dir.rglob("*"):
        if path.is_file():
            mtime = path.stat().st_mtime
            if latest is None or mtime > latest:
                latest = mtime
    return {
        "exists": True,
        "lastModifiedAt": iso_z(datetime.fromtimestamp(latest, tz=timezone.utc)) if latest else None,
    }


@router.get("/api/admin/diagnostics/health")
def diagnostics_health(request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    db_ok = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    return {
        "status": "ok" if db_ok else "degraded",
        "time": iso_z(datetime.now(timezone.utc)),
        "db": {"ok": db_ok},
    }


@router.get("/api/admin/diagnostics/db-stats")
def diagnostics_db_stats(request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    counts = {
        "users": db.scalar(select(func.count()).select_from(User)) or 0,
        "comments": db.scalar(select(func.count()).select_from(Comment)) or 0,
        "posts": db.scalar(select(func.count()).select_from(Post)) or 0,
        "series": db.scalar(select(func.count()).select_from(Series)) or 0,
        "entries": db.scalar(select(func.count()).select_from(Entry)) or 0,
        "entryPages": db.scalar(select(func.count()).select_from(EntryPage)) or 0,
        "mediaItems": db.scalar(select(func.count()).select_from(MediaItem)) or 0,
        "emailSubscribers": db.scalar(select(func.count()).select_from(EmailSubscriber)) or 0,
    }

    version = ""
    try:
        version = db.execute(text("SELECT version()")).scalar() or ""
    except Exception:
        version = ""

    return {
        "generatedAt": iso_z(datetime.now(timezone.utc)),
        "counts": {k: int(v) for k, v in counts.items()},
        "dbVersion": version,
    }


@router.get("/api/admin/diagnostics/db-overview")
@router.get("/api/admin/diagnostics/db-insights")
def diagnostics_db_overview(request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    tables = []
    try:
        rows = db.execute(
            text(
                """
                SELECT relname, n_live_tup, n_dead_tup, last_vacuum, last_autovacuum
                FROM pg_stat_user_tables
                ORDER BY n_live_tup DESC
                LIMIT 50
                """
            )
        ).all()
        for row in rows:
            tables.append(
                {
                    "name": row[0],
                    "liveRows": int(row[1] or 0),
                    "deadRows": int(row[2] or 0),
                    "lastVacuum": iso_z(row[3]) if row[3] else None,
                    "lastAutovacuum": iso_z(row[4]) if row[4] else None,
                }
            )
    except Exception:
        tables = []

    return {"generatedAt": iso_z(datetime.now(timezone.utc)), "tables": tables}


@router.get("/api/admin/diagnostics/deploy-status")
def diagnostics_deploy_status(request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    return {
        "generatedAt": iso_z(datetime.now(timezone.utc)),
        "git": _git_info(),
        "dist": _dist_info(),
    }


@router.get("/api/admin/diagnostics/config")
def diagnostics_config(request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    env_file = settings.base_dir / "deploy" / "bwondercomics.env"
    return {
        "generatedAt": iso_z(datetime.now(timezone.utc)),
        "config": _safe_env_snapshot(),
        "envFile": {
            "path": str(env_file),
            "exists": env_file.exists(),
        },
    }


@router.get("/api/admin/diagnostics/backups")
def diagnostics_backups(request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    backup_dir = settings.base_dir / "var" / "backups"
    items = []
    if backup_dir.exists():
        for path in sorted(backup_dir.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
            if not path.is_file():
                continue
            stat = path.stat()
            items.append(
                {
                    "name": path.name,
                    "path": str(path),
                    "size": int(stat.st_size),
                    "modifiedAt": iso_z(datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)),
                }
            )

    return {
        "generatedAt": iso_z(datetime.now(timezone.utc)),
        "backupDir": str(backup_dir),
        "items": items,
    }


@router.get("/api/admin/diagnostics/service-status")
def diagnostics_service_status(request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    load_avg = None
    try:
        load_avg = os.getloadavg()
    except Exception:
        load_avg = None

    disk = None
    try:
        usage = os.statvfs(str(settings.base_dir))
        total = usage.f_frsize * usage.f_blocks
        free = usage.f_frsize * usage.f_bavail
        disk = {"totalBytes": total, "freeBytes": free}
    except Exception:
        disk = None

    uptime_seconds = int((datetime.now(timezone.utc) - APP_STARTED_AT).total_seconds())

    return {
        "generatedAt": iso_z(datetime.now(timezone.utc)),
        "process": {"pid": os.getpid(), "uptimeSeconds": uptime_seconds},
        "system": {
            "platform": platform.platform(),
            "python": platform.python_version(),
            "loadAvg": list(load_avg) if load_avg else [],
            "disk": disk or {},
        },
    }


@router.get("/api/admin/diagnostics/logs-stream")
def diagnostics_logs_stream(request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    def stream():
        message = json.dumps({"line": "Log streaming is not configured for this deployment."})
        yield f"data: {message}\n\n"
        yield "event: complete\ndata: {}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.get("/api/admin/diagnostics/test-status")
def diagnostics_test_status(request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    run = db.scalar(
        select(AdminOpsRun)
        .where(AdminOpsRun.command_id.in_(["tests"]))
        .order_by(AdminOpsRun.started_at.desc())
        .limit(1)
    )
    if not run:
        return {"status": "idle"}

    return {
        "status": run.status,
        "startedAt": iso_z(run.started_at),
        "finishedAt": iso_z(run.finished_at),
        "exitCode": run.exit_code,
        "output": run.output or "",
        "outputTruncated": bool(run.output_truncated),
        "errorMessage": run.error_message or "",
    }


@router.post("/api/admin/diagnostics/run-tests")
def diagnostics_run_tests(request: Request, db: Session = Depends(get_db)):
    if "tests" not in OPS_COMMANDS:
        return JSONResponse(status_code=500, content={"error": "Tests command not configured"})
    payload, status = run_ops_command("tests", request, db, confirm=True)
    if status != 200:
        return JSONResponse(status_code=status, content=payload)
    return payload


@router.get("/api/admin/inner-net/target")
def diagnostics_inner_net_target(request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    forwarded_proto = (request.headers.get("X-Forwarded-Proto") or "").split(",")[0].strip().lower()
    proto = forwarded_proto if forwarded_proto in {"http", "https"} else "http"
    host = (request.headers.get("X-Forwarded-Host") or request.headers.get("Host") or "").split(",")[0].strip()
    base = f"{proto}://{host}" if host else ""

    return {"target": base, "generatedAt": iso_z(datetime.now(timezone.utc))}
