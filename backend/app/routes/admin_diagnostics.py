"""
Admin Diagnostics API routes.

Read-only health and status endpoints for admin dashboard:
- System health (API, DB, disk space)
- Database stats and table counts
- Backup file listings
- Service status (Docker containers, systemd)
- fail2ban snapshot data

All endpoints require admin auth. No mutations.
"""

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
    PremiumCode,
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

    commit = _run(["git", "rev-parse", "HEAD"])
    ref = _run(["git", "symbolic-ref", "HEAD"])
    status = "dirty" if _run(["git", "status", "--porcelain"]) else "clean"

    return {
        "commit": commit,
        "ref": ref if ref else f"refs/heads/{_run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])}",
        "status": status,
    }


def _fail2ban_status() -> dict:
    snapshot_path = settings.base_dir / "var" / "diagnostics" / "fail2ban.json"
    if not snapshot_path.exists():
        return {
            "status": "warning",
            "message": "Fail2ban snapshot missing (enable host status timer).",
        }
    try:
        payload = json.loads(snapshot_path.read_text())
    except Exception as exc:
        return {
            "status": "warning",
            "message": f"Fail2ban snapshot unreadable: {exc}",
        }
    if not isinstance(payload, dict):
        return {
            "status": "warning",
            "message": "Fail2ban snapshot invalid.",
        }

    status = str(payload.get("status") or "warning").lower()
    updated_at = payload.get("updatedAt")
    if isinstance(updated_at, str):
        try:
            parsed = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
            age_seconds = (datetime.now(timezone.utc) - parsed).total_seconds()
            if age_seconds > 900:
                age_minutes = int(age_seconds // 60)
                status = "warning"
                payload["message"] = f"Fail2ban snapshot stale ({age_minutes} min old)."
        except Exception:
            status = "warning"
            payload["message"] = "Fail2ban snapshot has invalid timestamp."

    payload["status"] = status
    payload.setdefault("message", "Fail2ban snapshot loaded.")
    return payload


def _dist_info() -> dict:
    dist_dir = settings.base_dir / "dist"
    if not dist_dir.exists():
        return {"exists": False, "last_modified": None, "manifest": None}

    latest = None
    manifest_file = None

    for path in dist_dir.rglob("*"):
        if path.is_file():
            mtime = path.stat().st_mtime
            if latest is None or mtime > latest:
                latest = mtime
            # Look for manifest file
            if path.name.endswith(".manifest") or "manifest" in path.name.lower():
                manifest_file = path.name

    return {
        "exists": True,
        "last_modified": iso_z(datetime.fromtimestamp(latest, tz=timezone.utc)) if latest else None,
        "manifest": manifest_file,
    }


def _snapshot_info() -> dict:
    releases_dir = settings.base_dir / "var" / "releases"
    if not releases_dir.exists():
        return {"count": 0, "latest": None}

    snapshots = []
    for path in releases_dir.glob("dist-*.tar.gz"):
        if path.is_file():
            snapshots.append(
                {
                    "name": path.name,
                    "mtime": path.stat().st_mtime,
                }
            )

    if not snapshots:
        return {"count": 0, "latest": None}

    snapshots.sort(key=lambda x: x["mtime"], reverse=True)
    latest = snapshots[0]

    return {
        "count": len(snapshots),
        "latest": latest["name"],
    }


def _test_suites() -> dict:
    tests_dir = settings.base_dir / "tests"
    if not tests_dir.exists():
        return {
            "available": False,
            "count": 0,
            "suites": [],
            "message": "Tests folder not found.",
        }

    files = sorted(
        [p for p in tests_dir.rglob("*.test.js") if p.is_file()],
        key=lambda p: str(p),
    )
    if not files:
        return {
            "available": False,
            "count": 0,
            "suites": [],
            "message": "No tests found.",
        }

    runner_available = settings.admin_commands_enabled and "tests" in OPS_COMMANDS
    runner_message = "Runner enabled" if runner_available else "Command runner disabled."
    suite = {
        "id": "frontend",
        "label": "Frontend",
        "description": "Vitest suite",
        "available": True,
        "runner_available": runner_available,
        "runner_message": runner_message,
        "count": len(files),
        "test_files": [str(p.relative_to(settings.base_dir)) for p in files],
    }
    return {
        "available": True,
        "count": len(files),
        "suites": [suite],
        "message": "",
    }


@router.get("/api/admin/diagnostics/health")
def diagnostics_health(request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    db_ok = True
    db_message = "Database connection successful"
    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        db_ok = False
        db_message = f"Database connection failed: {str(e)}"

    checks = {
        "database": {
            "status": "ok" if db_ok else "error",
            "message": db_message,
        },
        "fail2ban": _fail2ban_status(),
    }

    return {
        "status": "healthy" if db_ok else "degraded",
        "timestamp": iso_z(datetime.now(timezone.utc)),
        "checks": checks,
    }


@router.get("/api/admin/diagnostics/db-stats")
@router.get("/api/admin/diagnostics/database-stats")
def diagnostics_db_stats(request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    try:
        # User counts by role
        total_users = db.scalar(select(func.count()).select_from(User)) or 0
        users_by_role_user = (
            db.scalar(select(func.count()).select_from(User).where(User.role == "user")) or 0
        )
        users_by_role_premium = (
            db.scalar(select(func.count()).select_from(User).where(User.role == "premium")) or 0
        )
        users_by_role_admin = (
            db.scalar(select(func.count()).select_from(User).where(User.role == "admin")) or 0
        )

        # Series counts
        total_series = db.scalar(select(func.count()).select_from(Series)) or 0
        series_published = (
            db.scalar(select(func.count()).select_from(Series).where(Series.active.is_(True))) or 0
        )
        series_premium = (
            db.scalar(select(func.count()).select_from(Series).where(Series.premium_only.is_(True)))
            or 0
        )

        # Comment counts
        total_comments = db.scalar(select(func.count()).select_from(Comment)) or 0
        comments_approved = (
            db.scalar(select(func.count()).select_from(Comment).where(Comment.hidden.is_(False)))
            or 0
        )

        # Premium code counts
        total_codes = db.scalar(select(func.count()).select_from(PremiumCode)) or 0
        active_codes = (
            db.scalar(
                select(func.count()).select_from(PremiumCode).where(PremiumCode.active.is_(True))
            )
            or 0
        )

        # Other counts
        total_posts = db.scalar(select(func.count()).select_from(Post)) or 0
        total_entries = db.scalar(select(func.count()).select_from(Entry)) or 0
        total_entry_pages = db.scalar(select(func.count()).select_from(EntryPage)) or 0
        total_media_items = db.scalar(select(func.count()).select_from(MediaItem)) or 0
        total_email_subscribers = db.scalar(select(func.count()).select_from(EmailSubscriber)) or 0

        return {
            "generatedAt": iso_z(datetime.now(timezone.utc)),
            "users": {
                "total": int(total_users),
                "by_role": {
                    "user": int(users_by_role_user),
                    "premium": int(users_by_role_premium),
                    "admin": int(users_by_role_admin),
                },
            },
            "series": {
                "total": int(total_series),
                "published": int(series_published),
                "premium_only": int(series_premium),
            },
            "comments": {
                "total": int(total_comments),
                "approved": int(comments_approved),
            },
            "premium_codes": {
                "total": int(total_codes),
                "active": int(active_codes),
            },
            "posts": int(total_posts),
            "entries": int(total_entries),
            "entry_pages": int(total_entry_pages),
            "media_items": int(total_media_items),
            "email_subscribers": int(total_email_subscribers),
        }
    except Exception as e:
        # Return safe defaults on error
        return {
            "generatedAt": iso_z(datetime.now(timezone.utc)),
            "users": {"total": 0, "by_role": {"user": 0, "premium": 0, "admin": 0}},
            "series": {"total": 0, "published": 0, "premium_only": 0},
            "comments": {"total": 0, "approved": 0},
            "premium_codes": {"total": 0, "active": 0},
            "posts": 0,
            "entries": 0,
            "entry_pages": 0,
            "media_items": 0,
            "email_subscribers": 0,
            "error": str(e),
        }


@router.get("/api/admin/diagnostics/db-overview")
@router.get("/api/admin/diagnostics/db-insights")
def diagnostics_db_overview(request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    # Database info
    database_info = {"name": "", "version": "", "size_pretty": ""}
    try:
        db_info_row = db.execute(
            text("SELECT current_database(), version(), pg_database_size(current_database())")
        ).first()
        if db_info_row:
            database_info = {
                "name": db_info_row[0] or "",
                "version": (db_info_row[1] or "").split(" ")[0] if db_info_row[1] else "",
                "size_pretty": f"{(db_info_row[2] or 0) / (1024 ** 3):.2f} GB"
                if db_info_row[2]
                else "0 GB",
            }
    except Exception:
        pass

    # Connection stats
    connections = {"active": 0, "idle": 0, "total": 0, "max": 100}
    try:
        active_count = (
            db.execute(
                text("SELECT count(*) FROM pg_stat_activity WHERE state = 'active'")
            ).scalar()
            or 0
        )
        idle_count = (
            db.execute(text("SELECT count(*) FROM pg_stat_activity WHERE state = 'idle'")).scalar()
            or 0
        )
        total_count = db.execute(text("SELECT count(*) FROM pg_stat_activity")).scalar() or 0
        max_conn = db.execute(text("SHOW max_connections")).scalar()
        connections = {
            "active": int(active_count),
            "idle": int(idle_count),
            "total": int(total_count),
            "max": int(max_conn) if max_conn else 100,
        }
    except Exception:
        pass

    # Alembic version
    alembic_info = {"version": "unknown"}
    try:
        alembic_version = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
        if alembic_version:
            alembic_info = {"version": str(alembic_version)}
    except Exception:
        pass

    # Table stats with size
    tables = []
    try:
        rows = db.execute(
            text(
                """
                SELECT
                    relname,
                    n_live_tup,
                    n_dead_tup,
                    last_vacuum,
                    last_autovacuum,
                    pg_total_relation_size(schemaname||'.'||relname)
                FROM pg_stat_user_tables
                ORDER BY n_live_tup DESC
                LIMIT 50
                """
            )
        ).all()
        for row in rows:
            size_bytes = row[5] or 0
            size_mb = size_bytes / (1024**2)
            size_pretty = f"{size_mb:.2f} MB" if size_mb < 1024 else f"{size_mb / 1024:.2f} GB"
            tables.append(
                {
                    "name": row[0],
                    "liveRows": int(row[1] or 0),
                    "deadRows": int(row[2] or 0),
                    "lastVacuum": iso_z(row[3]) if row[3] else None,
                    "lastAutovacuum": iso_z(row[4]) if row[4] else None,
                    "rows_estimate": int(row[1] or 0),
                    "size_pretty": size_pretty,
                }
            )
    except Exception:
        tables = []

    return {
        "generatedAt": iso_z(datetime.now(timezone.utc)),
        "database": database_info,
        "connections": connections,
        "alembic": alembic_info,
        "tables": tables,
    }


@router.get("/api/admin/diagnostics/deploy-status")
def diagnostics_deploy_status(request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    uptime_seconds = int((datetime.now(timezone.utc) - APP_STARTED_AT).total_seconds())

    return {
        "generatedAt": iso_z(datetime.now(timezone.utc)),
        "server": {
            "started_at": iso_z(APP_STARTED_AT),
            "uptime_seconds": uptime_seconds,
        },
        "git": _git_info(),
        "dist": _dist_info(),
        "snapshots": _snapshot_info(),
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

    suite_info = _test_suites()

    run = db.scalar(
        select(AdminOpsRun)
        .where(AdminOpsRun.command_id.in_(["tests"]))
        .order_by(AdminOpsRun.started_at.desc())
        .limit(1)
    )
    status = "idle" if not run else run.status

    return {
        "status": status,
        "available": suite_info["available"],
        "message": suite_info["message"],
        "count": suite_info["count"],
        "suites": suite_info["suites"],
        "startedAt": iso_z(run.started_at) if run else None,
        "finishedAt": iso_z(run.finished_at) if run else None,
        "exitCode": run.exit_code if run else None,
        "output": run.output or "" if run else "",
        "outputTruncated": bool(run.output_truncated) if run else False,
        "errorMessage": run.error_message or "" if run else "",
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
    host = (
        (request.headers.get("X-Forwarded-Host") or request.headers.get("Host") or "")
        .split(",")[0]
        .strip()
    )
    base = f"{proto}://{host}" if host else ""

    return {"target": base, "generatedAt": iso_z(datetime.now(timezone.utc))}
