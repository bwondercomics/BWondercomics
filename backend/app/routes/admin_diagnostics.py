"""
Admin Diagnostics API routes.

The primary admin diagnostics experience is now snapshot-backed and read-only.
Legacy granular routes remain available as compatibility wrappers, but the
frontend should use the snapshot endpoints.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from ..db import get_db
from ..diagnostics_snapshot import build_snapshot, load_latest_snapshot, refresh_snapshot
from ..settings import settings
from .admin_ops import _queue_requested_command
from .admin_utils import iso_z, require_admin, require_host_automation

router = APIRouter()


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
        "opsAllowedIps": list(settings.ops_allowed_ips),
        "hostAutomationTokenSet": bool(settings.host_automation_token),
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


def _require_admin_response(request: Request, db: Session) -> JSONResponse | None:
    if require_admin(request, db):
        return None
    return JSONResponse(status_code=403, content={"error": "Admin access required"})


def _snapshot_or_live(db: Session) -> dict:
    latest = load_latest_snapshot()
    if latest:
        return latest
    return build_snapshot(db, source="live")


@router.get("/api/admin/diagnostics/snapshot")
def diagnostics_snapshot(request: Request, db: Session = Depends(get_db)):
    error = _require_admin_response(request, db)
    if error:
        return error
    snapshot = load_latest_snapshot()
    if not snapshot:
        return JSONResponse(status_code=404, content={"error": "No diagnostics snapshot available"})
    return snapshot


@router.post("/api/admin/diagnostics/refresh")
def diagnostics_refresh(request: Request, db: Session = Depends(get_db)):
    error = _require_admin_response(request, db)
    if error:
        return error
    return refresh_snapshot(db, source="manual")


@router.post("/api/internal/diagnostics/refresh")
def internal_diagnostics_refresh(request: Request, db: Session = Depends(get_db)):
    if not require_host_automation(request):
        return JSONResponse(status_code=403, content={"error": "Host automation token required"})
    return refresh_snapshot(db, source="timer")


@router.get("/api/admin/diagnostics/health")
def diagnostics_health(request: Request, db: Session = Depends(get_db)):
    error = _require_admin_response(request, db)
    if error:
        return error
    snapshot = _snapshot_or_live(db)
    health = snapshot.get("health") or {}
    return {
        "status": "healthy" if health.get("status") == "ok" else health.get("status") or "warning",
        "timestamp": snapshot.get("generatedAt"),
        "checks": health.get("checks") or {},
    }


@router.get("/api/admin/diagnostics/db-stats")
@router.get("/api/admin/diagnostics/database-stats")
def diagnostics_db_stats(request: Request, db: Session = Depends(get_db)):
    error = _require_admin_response(request, db)
    if error:
        return error
    snapshot = _snapshot_or_live(db)
    data = (snapshot.get("databaseStats") or {}).copy()
    users = data.get("users") or {}
    by_role = users.get("byRole") or {}
    series = data.get("series") or {}
    premium_codes = data.get("premiumCodes") or {}
    return {
        "generatedAt": snapshot.get("generatedAt"),
        "users": {"total": users.get("total", 0), "by_role": by_role},
        "series": {
            "total": series.get("total", 0),
            "published": series.get("published", 0),
            "premium_only": series.get("premiumOnly", 0),
        },
        "comments": data.get("comments") or {"total": 0, "approved": 0},
        "premium_codes": {
            "total": premium_codes.get("total", 0),
            "active": premium_codes.get("active", 0),
        },
        "posts": data.get("posts", 0),
        "entries": data.get("entries", 0),
        "entry_pages": data.get("entryPages", 0),
        "media_items": data.get("mediaItems", 0),
        "email_subscribers": data.get("emailSubscribers", 0),
    }


@router.get("/api/admin/diagnostics/db-overview")
@router.get("/api/admin/diagnostics/db-insights")
def diagnostics_db_overview(request: Request, db: Session = Depends(get_db)):
    error = _require_admin_response(request, db)
    if error:
        return error
    snapshot = _snapshot_or_live(db)
    overview = snapshot.get("databaseOverview") or {}
    database = overview.get("database") or {}
    return {
        "generatedAt": snapshot.get("generatedAt"),
        "database": {
            "name": database.get("name", ""),
            "version": database.get("version", ""),
            "size_pretty": database.get("sizePretty", ""),
        },
        "connections": overview.get("connections") or {},
        "alembic": overview.get("alembic") or {},
        "tables": [
            {
                "name": row.get("name", ""),
                "rows_estimate": row.get("rowsEstimate", 0),
                "deadRows": row.get("deadRows", 0),
                "lastVacuum": row.get("lastVacuum"),
                "lastAutovacuum": row.get("lastAutovacuum"),
                "size_pretty": row.get("sizePretty", ""),
            }
            for row in (overview.get("tables") or [])
        ],
    }


@router.get("/api/admin/diagnostics/deploy-status")
def diagnostics_deploy_status(request: Request, db: Session = Depends(get_db)):
    error = _require_admin_response(request, db)
    if error:
        return error
    snapshot = _snapshot_or_live(db)
    deploy = snapshot.get("deployStatus") or {}
    server = deploy.get("server") or {}
    dist = deploy.get("dist") or {}
    release_snapshots = deploy.get("releaseSnapshots") or {}
    latest = release_snapshots.get("latest")
    return {
        "generatedAt": snapshot.get("generatedAt"),
        "server": {
            "started_at": server.get("startedAt"),
            "uptime_seconds": server.get("uptimeSeconds"),
        },
        "git": deploy.get("git") or {},
        "dist": {
            "exists": dist.get("exists"),
            "last_modified": dist.get("lastModified"),
            "manifest": dist.get("manifest"),
        },
        "snapshots": {
            "count": release_snapshots.get("count", 0),
            "latest": latest,
        },
    }


@router.get("/api/admin/diagnostics/config")
def diagnostics_config(request: Request, db: Session = Depends(get_db)):
    error = _require_admin_response(request, db)
    if error:
        return error

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
    error = _require_admin_response(request, db)
    if error:
        return error
    snapshot = _snapshot_or_live(db)
    backups = snapshot.get("backups") or {}
    items = []
    items.extend(backups.get("db") or [])
    items.extend(backups.get("files") or [])
    return {
        "generatedAt": snapshot.get("generatedAt"),
        "backupDir": backups.get("root"),
        "root": backups.get("root"),
        "items": items,
        "db": backups.get("db") or [],
        "files": backups.get("files") or [],
    }


@router.get("/api/admin/diagnostics/service-status")
def diagnostics_service_status(request: Request, db: Session = Depends(get_db)):
    error = _require_admin_response(request, db)
    if error:
        return error
    snapshot = _snapshot_or_live(db)
    services = [
        {
            "service": item.get("id"),
            "name": item.get("label"),
            "status": item.get("summary"),
            "state": item.get("status"),
        }
        for item in ((snapshot.get("serviceStatus") or {}).get("items") or [])
    ]
    return {
        "generatedAt": snapshot.get("generatedAt"),
        "services": services,
        "items": (snapshot.get("serviceStatus") or {}).get("items") or [],
    }


@router.get("/api/admin/diagnostics/logs-stream")
def diagnostics_logs_stream(request: Request, db: Session = Depends(get_db)):
    error = _require_admin_response(request, db)
    if error:
        return error

    def stream():
        message = json.dumps({"line": "Live diagnostics logs moved to /ops/."})
        yield f"data: {message}\n\n"
        yield "event: complete\ndata: {}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.get("/api/admin/diagnostics/test-status")
def diagnostics_test_status(request: Request, db: Session = Depends(get_db)):
    error = _require_admin_response(request, db)
    if error:
        return error
    snapshot = _snapshot_or_live(db)
    test_status = snapshot.get("testStatus") or {}
    latest_run = test_status.get("latestRun") or {}
    return {
        "status": latest_run.get("status") or "idle",
        "available": bool(test_status.get("available")),
        "message": "",
        "count": int(test_status.get("discoveredCount") or 0),
        "suites": [
            {
                "id": "frontend",
                "label": "Frontend",
                "description": "Vitest suite",
                "available": bool(test_status.get("available")),
                "runner_available": bool(test_status.get("runnerEnabled")),
                "runner_message": (
                    "Runner enabled"
                    if test_status.get("runnerEnabled")
                    else "Command runner disabled."
                ),
                "count": int(test_status.get("discoveredCount") or 0),
                "test_files": test_status.get("files") or [],
            }
        ],
        "startedAt": latest_run.get("startedAt"),
        "finishedAt": latest_run.get("finishedAt"),
        "exitCode": latest_run.get("exitCode"),
        "output": "",
        "outputTruncated": False,
        "errorMessage": latest_run.get("errorMessage") or "",
    }


@router.post("/api/admin/diagnostics/run-tests")
def diagnostics_run_tests(request: Request, db: Session = Depends(get_db)):
    body, status = _queue_requested_command("tests", request, db, confirm=True)
    if status != 200:
        return JSONResponse(status_code=status, content=body)
    return body


@router.get("/api/admin/inner-net/target")
def diagnostics_inner_net_target(request: Request, db: Session = Depends(get_db)):
    error = _require_admin_response(request, db)
    if error:
        return error

    forwarded_proto = (request.headers.get("X-Forwarded-Proto") or "").split(",")[0].strip().lower()
    proto = forwarded_proto if forwarded_proto in {"http", "https"} else "http"
    host = (
        (request.headers.get("X-Forwarded-Host") or request.headers.get("Host") or "")
        .split(",")[0]
        .strip()
    )
    base = f"{proto}://{host}" if host else ""
    return {"target": base, "generatedAt": iso_z(datetime.now(timezone.utc))}
