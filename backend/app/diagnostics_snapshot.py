from __future__ import annotations

import json
import os
import platform
import subprocess
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import fcntl
except ImportError:  # pragma: no cover - non-POSIX fallback
    fcntl = None

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from .models import (
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
from .routes.admin_utils import iso_z
from .settings import settings

APP_STARTED_AT = datetime.now(timezone.utc)
SNAPSHOT_RETENTION_HOURS = 72


def _status_rank(value: str) -> int:
    normalized = str(value or "ok").lower()
    if normalized == "error":
        return 3
    if normalized == "warning":
        return 2
    return 1


def _merge_statuses(*values: str) -> str:
    winner = "ok"
    for value in values:
        if _status_rank(value) > _status_rank(winner):
            winner = str(value or "ok").lower()
    return winner


def _format_size(size_bytes: int | float | None) -> str:
    size = float(size_bytes or 0)
    units = ["B", "KB", "MB", "GB", "TB"]
    idx = 0
    while size >= 1024 and idx < len(units) - 1:
        size /= 1024
        idx += 1
    return f"{size:.1f} {units[idx]}" if idx else f"{int(size)} {units[idx]}"


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
    branch = _run(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    status = "dirty" if _run(["git", "status", "--porcelain"]) else "clean"
    return {
        "commit": commit,
        "ref": branch or "",
        "status": status,
    }


def _fail2ban_status() -> dict:
    snapshot_path = settings.base_dir / "var" / "diagnostics" / "fail2ban.json"
    if not snapshot_path.exists():
        return {
            "status": "warning",
            "message": "Fail2ban snapshot missing.",
            "updatedAt": None,
        }
    try:
        payload = json.loads(snapshot_path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {
            "status": "warning",
            "message": f"Fail2ban snapshot unreadable: {exc}",
            "updatedAt": None,
        }

    if not isinstance(payload, dict):
        return {
            "status": "warning",
            "message": "Fail2ban snapshot invalid.",
            "updatedAt": None,
        }

    status = str(payload.get("status") or "warning").lower()
    updated_at = payload.get("updatedAt")
    if isinstance(updated_at, str):
        try:
            parsed = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
            age_seconds = (datetime.now(timezone.utc) - parsed).total_seconds()
            if age_seconds > 900:
                status = "warning"
                payload["message"] = f"Fail2ban snapshot stale ({int(age_seconds // 60)} min old)."
        except Exception:
            status = "warning"
            payload["message"] = "Fail2ban snapshot has invalid timestamp."

    return {
        "status": status,
        "message": payload.get("message") or "Fail2ban snapshot loaded.",
        "updatedAt": updated_at if isinstance(updated_at, str) else None,
        "jails": payload.get("jails") or "",
        "currentlyBanned": int(payload.get("currentlyBanned") or 0),
        "totalBanned": int(payload.get("totalBanned") or 0),
        "jailBreakdown": payload.get("jailBreakdown") or "",
    }


def _dist_info() -> dict:
    dist_dir = settings.base_dir / "dist"
    if not dist_dir.exists():
        return {"exists": False, "lastModified": None, "manifest": None}

    latest = None
    manifest_file = None
    for path in dist_dir.rglob("*"):
        if not path.is_file():
            continue
        stat = path.stat()
        if latest is None or stat.st_mtime > latest:
            latest = stat.st_mtime
        if path.name.endswith(".manifest") or "manifest" in path.name.lower():
            manifest_file = path.name

    return {
        "exists": True,
        "lastModified": iso_z(datetime.fromtimestamp(latest, tz=timezone.utc)) if latest else None,
        "manifest": manifest_file,
    }


def _release_snapshot_info() -> dict:
    releases_dir = settings.base_dir / "var" / "releases"
    if not releases_dir.exists():
        return {"count": 0, "latest": None}

    snapshots = []
    for path in releases_dir.glob("dist-*.tar.gz"):
        if not path.is_file():
            continue
        stat = path.stat()
        snapshots.append(
            {
                "name": path.name,
                "createdAt": iso_z(datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)),
                "sizeBytes": int(stat.st_size),
                "sizePretty": _format_size(stat.st_size),
                "mtime": stat.st_mtime,
            }
        )

    if not snapshots:
        return {"count": 0, "latest": None}

    snapshots.sort(key=lambda item: item["mtime"], reverse=True)
    latest = dict(snapshots[0])
    latest.pop("mtime", None)
    return {
        "count": len(snapshots),
        "latest": latest,
    }


def _classify_backup(path: Path) -> str | None:
    name = path.name
    if name.startswith("db-"):
        return "db"
    if name.startswith("files-"):
        return "files"
    return None


def collect_backup_summary() -> dict:
    backup_dir = settings.base_dir / "var" / "backups"
    grouped = {"db": [], "files": []}
    if backup_dir.exists():
        for path in sorted(
            backup_dir.iterdir(), key=lambda item: item.stat().st_mtime, reverse=True
        ):
            if not path.is_file():
                continue
            bucket = _classify_backup(path)
            if bucket is None:
                continue
            stat = path.stat()
            grouped[bucket].append(
                {
                    "name": path.name,
                    "path": str(path),
                    "createdAt": iso_z(datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)),
                    "sizeBytes": int(stat.st_size),
                    "sizePretty": _format_size(stat.st_size),
                }
            )

    latest_db = grouped["db"][0] if grouped["db"] else None
    latest_files = grouped["files"][0] if grouped["files"] else None
    status = (
        "ok" if latest_db and latest_files else "warning" if latest_db or latest_files else "error"
    )
    message = (
        f"DB backups: {len(grouped['db'])}, file backups: {len(grouped['files'])}"
        if status != "error"
        else "No DB or file backups found."
    )
    return {
        "status": status,
        "message": message,
        "root": str(backup_dir),
        "db": grouped["db"],
        "files": grouped["files"],
        "latest": {
            "db": latest_db,
            "files": latest_files,
        },
    }


def collect_database_stats(db: Session) -> dict:
    try:
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
        total_series = db.scalar(select(func.count()).select_from(Series)) or 0
        series_published = (
            db.scalar(select(func.count()).select_from(Series).where(Series.active.is_(True))) or 0
        )
        series_premium = (
            db.scalar(select(func.count()).select_from(Series).where(Series.premium_only.is_(True)))
            or 0
        )
        total_comments = db.scalar(select(func.count()).select_from(Comment)) or 0
        comments_approved = (
            db.scalar(select(func.count()).select_from(Comment).where(Comment.hidden.is_(False)))
            or 0
        )
        total_codes = db.scalar(select(func.count()).select_from(PremiumCode)) or 0
        active_codes = (
            db.scalar(
                select(func.count()).select_from(PremiumCode).where(PremiumCode.active.is_(True))
            )
            or 0
        )
        total_posts = db.scalar(select(func.count()).select_from(Post)) or 0
        total_entries = db.scalar(select(func.count()).select_from(Entry)) or 0
        total_entry_pages = db.scalar(select(func.count()).select_from(EntryPage)) or 0
        total_media_items = db.scalar(select(func.count()).select_from(MediaItem)) or 0
        total_email_subscribers = db.scalar(select(func.count()).select_from(EmailSubscriber)) or 0
        return {
            "users": {
                "total": int(total_users),
                "byRole": {
                    "user": int(users_by_role_user),
                    "premium": int(users_by_role_premium),
                    "admin": int(users_by_role_admin),
                },
            },
            "series": {
                "total": int(total_series),
                "published": int(series_published),
                "premiumOnly": int(series_premium),
            },
            "comments": {
                "total": int(total_comments),
                "approved": int(comments_approved),
            },
            "premiumCodes": {
                "total": int(total_codes),
                "active": int(active_codes),
            },
            "posts": int(total_posts),
            "entries": int(total_entries),
            "entryPages": int(total_entry_pages),
            "mediaItems": int(total_media_items),
            "emailSubscribers": int(total_email_subscribers),
        }
    except Exception as exc:
        return {
            "users": {"total": 0, "byRole": {"user": 0, "premium": 0, "admin": 0}},
            "series": {"total": 0, "published": 0, "premiumOnly": 0},
            "comments": {"total": 0, "approved": 0},
            "premiumCodes": {"total": 0, "active": 0},
            "posts": 0,
            "entries": 0,
            "entryPages": 0,
            "mediaItems": 0,
            "emailSubscribers": 0,
            "error": str(exc),
        }


def collect_database_overview(db: Session) -> dict:
    database = {"name": "", "version": "", "sizePretty": ""}
    connections = {"active": 0, "idle": 0, "total": 0, "max": 100}
    alembic = {"version": "unknown"}
    tables = []

    try:
        row = db.execute(
            text("SELECT current_database(), version(), pg_database_size(current_database())")
        ).first()
        if row:
            database = {
                "name": row[0] or "",
                "version": (row[1] or "").split(" ")[0] if row[1] else "",
                "sizePretty": _format_size(row[2]),
            }
    except Exception:
        pass

    try:
        active = (
            db.execute(
                text("SELECT count(*) FROM pg_stat_activity WHERE state = 'active'")
            ).scalar()
            or 0
        )
        idle = (
            db.execute(text("SELECT count(*) FROM pg_stat_activity WHERE state = 'idle'")).scalar()
            or 0
        )
        total = db.execute(text("SELECT count(*) FROM pg_stat_activity")).scalar() or 0
        max_conn = db.execute(text("SHOW max_connections")).scalar()
        connections = {
            "active": int(active),
            "idle": int(idle),
            "total": int(total),
            "max": int(max_conn) if max_conn else 100,
        }
    except Exception:
        pass

    try:
        version = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
        if version:
            alembic = {"version": str(version)}
    except Exception:
        pass

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
            tables.append(
                {
                    "name": row[0],
                    "rowsEstimate": int(row[1] or 0),
                    "deadRows": int(row[2] or 0),
                    "lastVacuum": iso_z(row[3]) if row[3] else None,
                    "lastAutovacuum": iso_z(row[4]) if row[4] else None,
                    "sizePretty": _format_size(row[5]),
                }
            )
    except Exception:
        tables = []

    return {
        "database": database,
        "connections": connections,
        "alembic": alembic,
        "tables": tables,
    }


def collect_test_status(db: Session) -> dict:
    tests_dir = settings.base_dir / "tests"
    files = (
        sorted(
            [path for path in tests_dir.rglob("*.test.js") if path.is_file()],
            key=lambda path: str(path),
        )
        if tests_dir.exists()
        else []
    )

    latest_run = db.scalar(
        select(AdminOpsRun)
        .where(AdminOpsRun.command_id == "tests")
        .order_by(AdminOpsRun.started_at.desc())
        .limit(1)
    )

    return {
        "available": bool(files),
        "discoveredCount": len(files),
        "files": [str(path.relative_to(settings.base_dir)) for path in files],
        "runnerEnabled": bool(settings.admin_commands_enabled),
        "latestRun": (
            {
                "id": str(latest_run.id),
                "status": latest_run.status,
                "startedAt": iso_z(latest_run.started_at),
                "finishedAt": iso_z(latest_run.finished_at),
                "durationSeconds": latest_run.duration_seconds,
                "exitCode": latest_run.exit_code,
                "errorMessage": latest_run.error_message or "",
            }
            if latest_run
            else None
        ),
    }


def _health_checks(db: Session) -> dict:
    database_status = {"status": "ok", "message": "Database connection successful."}
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        database_status = {"status": "error", "message": f"Database connection failed: {exc}"}

    dist = _dist_info()
    dist_status = {
        "status": "ok" if dist.get("exists") else "error",
        "message": (
            f"dist/ present; last build {dist.get('lastModified') or 'unknown'}."
            if dist.get("exists")
            else "dist/ is missing."
        ),
    }

    backups = collect_backup_summary()
    backup_status = {
        "status": backups["status"],
        "message": backups["message"],
    }

    fail2ban = _fail2ban_status()

    return {
        "database": database_status,
        "dist": dist_status,
        "backups": backup_status,
        "fail2ban": fail2ban,
    }


def build_snapshot(db: Session, source: str = "manual") -> dict:
    now = datetime.now(timezone.utc)
    health_checks = _health_checks(db)
    overall_status = _merge_statuses(*(check["status"] for check in health_checks.values()))
    deploy_status = {
        "server": {
            "startedAt": iso_z(APP_STARTED_AT),
            "uptimeSeconds": int((now - APP_STARTED_AT).total_seconds()),
            "python": platform.python_version(),
            "platform": platform.platform(),
            "pid": os.getpid(),
        },
        "git": _git_info(),
        "dist": _dist_info(),
        "releaseSnapshots": _release_snapshot_info(),
    }
    backups = collect_backup_summary()
    database_stats = collect_database_stats(db)
    database_overview = collect_database_overview(db)
    test_status = collect_test_status(db)
    service_status = {
        "items": [
            {
                "id": "api",
                "label": "API",
                "status": "ok",
                "summary": "API process answered the snapshot request.",
                "details": f"Uptime {deploy_status['server']['uptimeSeconds']}s",
            },
            {
                "id": "database",
                "label": "Database",
                "status": health_checks["database"]["status"],
                "summary": health_checks["database"]["message"],
                "details": f"Users {database_stats['users']['total']}, posts {database_stats['posts']}",
            },
            {
                "id": "dist",
                "label": "Frontend Dist",
                "status": health_checks["dist"]["status"],
                "summary": health_checks["dist"]["message"],
                "details": deploy_status["dist"].get("manifest") or "No manifest found",
            },
            {
                "id": "backups",
                "label": "Backups",
                "status": backups["status"],
                "summary": backups["message"],
                "details": backups["root"],
            },
            {
                "id": "fail2ban",
                "label": "fail2ban",
                "status": health_checks["fail2ban"]["status"],
                "summary": health_checks["fail2ban"]["message"],
                "details": health_checks["fail2ban"].get("jailBreakdown") or "No jail details",
            },
        ]
    }
    return {
        "schemaVersion": 1,
        "source": source,
        "generatedAt": iso_z(now),
        "overallStatus": overall_status,
        "health": {
            "status": overall_status,
            "checks": health_checks,
        },
        "databaseStats": database_stats,
        "databaseOverview": database_overview,
        "deployStatus": deploy_status,
        "backups": backups,
        "serviceStatus": service_status,
        "testStatus": test_status,
    }


def _snapshot_root() -> Path:
    return settings.base_dir / "var" / "diagnostics" / "admin"


def latest_snapshot_path() -> Path:
    return _snapshot_root() / "latest.json"


def snapshot_history_dir() -> Path:
    return _snapshot_root() / "history"


def snapshot_lock_path() -> Path:
    return _snapshot_root() / ".lock"


@contextmanager
def _snapshot_lock():
    root = _snapshot_root()
    history = snapshot_history_dir()
    root.mkdir(parents=True, exist_ok=True)
    history.mkdir(parents=True, exist_ok=True)
    lock_file = snapshot_lock_path()
    handle = lock_file.open("a+", encoding="utf-8")
    try:
        if fcntl is not None:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        if fcntl is not None:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        handle.close()


def prune_snapshot_history() -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=SNAPSHOT_RETENTION_HOURS)
    history_dir = snapshot_history_dir()
    if not history_dir.exists():
        return
    for path in history_dir.glob("*.json"):
        try:
            if datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc) < cutoff:
                path.unlink()
        except FileNotFoundError:
            continue


def write_snapshot(snapshot: dict) -> dict:
    with _snapshot_lock():
        root = _snapshot_root()
        history = snapshot_history_dir()
        root.mkdir(parents=True, exist_ok=True)
        history.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(snapshot, ensure_ascii=True, indent=2, sort_keys=True)
        latest = latest_snapshot_path()
        latest.write_text(payload, encoding="utf-8")
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        (history / f"{timestamp}.json").write_text(payload, encoding="utf-8")
        prune_snapshot_history()
    return snapshot


def refresh_snapshot(db: Session, source: str = "manual") -> dict:
    return write_snapshot(build_snapshot(db, source=source))


def load_latest_snapshot() -> dict | None:
    path = latest_snapshot_path()
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None
