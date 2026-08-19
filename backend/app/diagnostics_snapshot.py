from __future__ import annotations

import hashlib
import json
import os
import platform
import subprocess
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

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
HOST_STATUS_WARNING_SECONDS = 90 * 60
HOST_STATUS_ERROR_SECONDS = 2 * 60 * 60
BACKUP_SCHEMA_VERSION = 1
BACKUP_CATALOG_LIMIT = 60
BACKUP_FRESHNESS_HOURS = {
    "database": {"warning": 36, "error": 48},
    "files": {"warning": 8 * 24, "error": 14 * 24},
}


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


def _host_status(now: datetime | None = None) -> dict:
    current = now or datetime.now(timezone.utc)
    path = settings.base_dir / "var" / "diagnostics" / "host.json"
    if not path.exists():
        return {
            "schemaVersion": 1,
            "generatedAt": None,
            "ageSeconds": None,
            "status": "error",
            "message": "Host status snapshot is missing.",
            "disks": {"status": "error", "message": "Disk status unavailable.", "items": []},
            "containers": {
                "status": "error",
                "message": "Container status unavailable.",
                "items": [],
            },
            "units": {"status": "error", "message": "Automation status unavailable.", "items": []},
            "certificates": {
                "status": "error",
                "message": "Certificate status unavailable.",
                "items": [],
            },
        }
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict) or payload.get("schemaVersion") != 1:
            raise ValueError("unsupported host status schema")
        generated_at = datetime.fromisoformat(str(payload["generatedAt"]).replace("Z", "+00:00"))
        if generated_at.tzinfo is None:
            generated_at = generated_at.replace(tzinfo=timezone.utc)
        age_seconds = max(0, int((current - generated_at.astimezone(timezone.utc)).total_seconds()))
        sections = [
            payload.get("disks") or {},
            payload.get("containers") or {},
            payload.get("units") or {},
            payload.get("certificates") or {},
        ]
        status = _merge_statuses(*(str(section.get("status") or "error") for section in sections))
        if age_seconds > HOST_STATUS_ERROR_SECONDS:
            status = "error"
            age_message = f"Host status snapshot is stale ({age_seconds // 60} minutes old)."
        elif age_seconds > HOST_STATUS_WARNING_SECONDS:
            status = _merge_statuses(status, "warning")
            age_message = f"Host status snapshot is aging ({age_seconds // 60} minutes old)."
        else:
            age_message = f"Host status snapshot is current ({age_seconds // 60} minutes old)."
        return {**payload, "ageSeconds": age_seconds, "status": status, "message": age_message}
    except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError):
        return {
            "schemaVersion": 1,
            "generatedAt": None,
            "ageSeconds": None,
            "status": "error",
            "message": "Host status snapshot is invalid.",
            "disks": {"status": "error", "message": "Disk status unavailable.", "items": []},
            "containers": {
                "status": "error",
                "message": "Container status unavailable.",
                "items": [],
            },
            "units": {"status": "error", "message": "Automation status unavailable.", "items": []},
            "certificates": {
                "status": "error",
                "message": "Certificate status unavailable.",
                "items": [],
            },
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


def _read_json_object(path: Path) -> dict:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path.name} is not a JSON object")
    return payload


def _parse_backup_time(value: object) -> datetime:
    parsed = datetime.fromisoformat(str(value or "").replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Backup timestamp is not timezone-aware")
    return parsed.astimezone(timezone.utc)


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _safe_child(root: Path, relative: object) -> Path:
    value = Path(str(relative or ""))
    if value.is_absolute() or ".." in value.parts:
        raise ValueError("Backup path is not relative")
    resolved = (root / value).resolve(strict=False)
    resolved.relative_to(root.resolve())
    return resolved


def _normalize_backup_item(item: dict, kind: str, root: Path) -> dict:
    artifact_id = str(item.get("artifactId") or "")
    relative_path = str(item.get("relativePath") or "")
    suffix = ".dump" if kind == "database" else ".tar.gz"
    expected_relative = f"{kind}/{artifact_id}{suffix}"
    digest = str(item.get("sha256") or "")
    if (
        not artifact_id.startswith(f"{kind}-")
        or relative_path != expected_relative
        or len(digest) != 64
        or any(character not in "0123456789abcdef" for character in digest)
    ):
        raise ValueError("Backup artifact identity does not match its kind")
    created_at = iso_z(_parse_backup_time(item.get("createdAt") or item.get("completedAt")))
    size_bytes = int(item.get("sizeBytes"))
    validation = item.get("validation")
    if size_bytes < 0 or not isinstance(validation, dict) or validation.get("result") != "ok":
        raise ValueError("Backup validation metadata is invalid")
    return {
        "artifactId": artifact_id,
        "name": Path(relative_path).name,
        "path": str(root / relative_path),
        "relativePath": relative_path,
        "createdAt": created_at,
        "sizeBytes": size_bytes,
        "sizePretty": _format_size(size_bytes),
        "sha256": digest,
        "validation": validation,
    }


def _freshness(kind: str, latest: dict | None, now: datetime) -> dict:
    thresholds = BACKUP_FRESHNESS_HOURS[kind]
    if latest is None:
        return {
            "status": "error",
            "ageHours": None,
            "warningAfterHours": thresholds["warning"],
            "errorAfterHours": thresholds["error"],
        }
    age_hours = max(0.0, (now - _parse_backup_time(latest["createdAt"])).total_seconds() / 3600)
    status = (
        "error"
        if age_hours > thresholds["error"]
        else "warning"
        if age_hours > thresholds["warning"]
        else "ok"
    )
    return {
        "status": status,
        "ageHours": round(age_hours, 2),
        "warningAfterHours": thresholds["warning"],
        "errorAfterHours": thresholds["error"],
    }


def _summary_payload(
    *,
    source: str,
    root: Path,
    grouped: dict[str, list[dict]],
    jobs: dict,
    now: datetime,
    forced_error: str = "",
    validated_counts: dict | None = None,
    integrity: dict | None = None,
) -> dict:
    latest_db = grouped["db"][0] if grouped["db"] else None
    latest_files = grouped["files"][0] if grouped["files"] else None
    freshness = {
        "database": _freshness("database", latest_db, now),
        "files": _freshness("files", latest_files, now),
    }
    statuses = [freshness["database"]["status"], freshness["files"]["status"]]
    failed_jobs = []
    for kind in ("database", "files"):
        attempt = (jobs.get(kind) or {}).get("lastAttempt") or {}
        if attempt.get("status") == "error":
            statuses.append("error")
            failed_jobs.append(f"{kind}: {attempt.get('errorCode') or 'backup_failed'}")
    if forced_error:
        statuses.append("error")
    status = _merge_statuses(*statuses)
    counts = validated_counts or {
        "db": len(grouped["db"]),
        "files": len(grouped["files"]),
        "total": len(grouped["db"]) + len(grouped["files"]),
    }
    message = f"Validated DB backups: {counts['db']}, file backups: {counts['files']}."
    if forced_error:
        message = forced_error
        if failed_jobs:
            message += f" Latest backup attempt failed ({', '.join(failed_jobs)})."
    elif failed_jobs:
        message = f"Latest backup attempt failed ({', '.join(failed_jobs)})."
    return {
        "status": status,
        "message": message,
        "source": source,
        "root": str(root),
        "db": grouped["db"],
        "files": grouped["files"],
        "latest": {"db": latest_db, "files": latest_files},
        "jobs": jobs,
        "freshness": freshness,
        "validatedCounts": counts,
        "integrity": integrity or {},
    }


def _validate_backup_attempt(attempt: object, kind: str) -> dict:
    if not isinstance(attempt, dict) or attempt.get("status") not in {"ok", "error"}:
        raise ValueError(f"Missing or invalid {kind} backup attempt")
    _parse_backup_time(attempt.get("startedAt"))
    _parse_backup_time(attempt.get("finishedAt"))
    if attempt.get("status") == "error" and not str(attempt.get("errorCode") or "").strip():
        raise ValueError(f"Missing {kind} backup failure code")
    artifact_id = str(attempt.get("artifactId") or "")
    if artifact_id and not artifact_id.startswith(f"{kind}-"):
        raise ValueError(f"Invalid {kind} attempt artifact identity")
    return attempt


def _normalize_backup_job(path: Path, kind: str, root: Path) -> dict:
    job = _read_json_object(path)
    if job.get("schemaVersion") != BACKUP_SCHEMA_VERSION or job.get("kind") != kind:
        raise ValueError(f"Invalid {kind} backup status")
    attempt = _validate_backup_attempt(job.get("lastAttempt"), kind)
    history = job.get("history")
    if not isinstance(history, list) or len(history) > 30:
        raise ValueError(f"Invalid {kind} backup status history")
    for history_attempt in history:
        _validate_backup_attempt(history_attempt, kind)
    last_success = job.get("lastSuccess")
    if last_success is not None:
        if not isinstance(last_success, dict):
            raise ValueError(f"Invalid {kind} last-success status")
        _normalize_backup_item(last_success, kind, root)
    return {
        "updatedAt": job.get("updatedAt"),
        "lastAttempt": attempt,
        "lastSuccess": last_success,
    }


def _production_backup_summary(status_dir: Path, now: datetime) -> dict:
    paths = {
        "catalog": status_dir / "catalog.json",
        "database": status_dir / "database.json",
        "files": status_dir / "files.json",
    }
    root = Path("/mnt/archive/backups/bwondercomics")
    grouped = {"db": [], "files": []}
    jobs: dict = {}
    errors = []
    validated_counts = {"db": 0, "files": 0, "total": 0}
    integrity = {}

    if paths["catalog"].exists():
        try:
            catalog = _read_json_object(paths["catalog"])
            if catalog.get("schemaVersion") != BACKUP_SCHEMA_VERSION:
                raise ValueError("Unsupported production backup catalog schema")
            catalog_root = Path(str(catalog.get("root") or root))
            if catalog_root != root:
                raise ValueError("Production backup catalog root is not canonical")
            catalog_counts = catalog.get("validatedCounts")
            if not isinstance(catalog_counts, dict):
                raise ValueError("Production backup catalog counts are missing")
            for kind, bucket in (("database", "db"), ("files", "files")):
                values = catalog.get(kind)
                if not isinstance(values, list) or len(values) > BACKUP_CATALOG_LIMIT:
                    raise ValueError(f"Invalid {kind} backup catalog")
                grouped[bucket] = [_normalize_backup_item(item, kind, root) for item in values]
                grouped[bucket].sort(key=lambda item: item["createdAt"], reverse=True)
            validated_counts = {
                "db": int(catalog_counts.get("database")),
                "files": int(catalog_counts.get("files")),
                "total": int(catalog_counts.get("total")),
            }
            if (
                validated_counts["db"] < len(grouped["db"])
                or validated_counts["files"] < len(grouped["files"])
                or validated_counts["total"] != validated_counts["db"] + validated_counts["files"]
            ):
                raise ValueError("Production backup catalog counts are invalid")
            catalog_integrity = catalog.get("integrity")
            integrity = catalog_integrity if isinstance(catalog_integrity, dict) else {}
        except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
            grouped = {"db": [], "files": []}
            validated_counts = {"db": 0, "files": 0, "total": 0}
            errors.append(f"Production backup catalog is malformed: {exc}")

    for kind in ("database", "files"):
        try:
            jobs[kind] = _normalize_backup_job(paths[kind], kind, root)
        except FileNotFoundError:
            errors.append(f"Production {kind} backup status is missing")
        except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
            errors.append(f"Production {kind} backup status is malformed: {exc}")

    if not any(path.exists() for path in paths.values()):
        errors = ["Production backup records are missing"]

    return _summary_payload(
        source="production-status",
        root=root,
        grouped=grouped,
        jobs=jobs,
        now=now,
        forced_error="; ".join(errors),
        validated_counts=validated_counts,
        integrity=integrity,
    )


def _local_backup_summary(backup_dir: Path, now: datetime) -> dict:
    grouped = {"db": [], "files": []}
    manifests_dir = backup_dir / "manifests"
    for manifest_path in sorted(manifests_dir.glob("*.json")) if manifests_dir.is_dir() else []:
        try:
            manifest = _read_json_object(manifest_path)
            kind = str(manifest.get("artifactKind") or "")
            if manifest.get("schemaVersion") != BACKUP_SCHEMA_VERSION or kind not in {
                "database",
                "files",
            }:
                continue
            artifact_id = str(manifest.get("artifactId") or "")
            if manifest_path.name != f"{artifact_id}.json":
                continue
            artifact = _safe_child(backup_dir, manifest.get("relativePath"))
            checksum = _safe_child(backup_dir, manifest.get("checksumPath"))
            digest = _sha256_file(artifact)
            if digest != manifest.get("sha256"):
                continue
            if checksum.read_text(encoding="utf-8") != (f"{digest}  {manifest['relativePath']}\n"):
                continue
            item = _normalize_backup_item(manifest, kind, backup_dir)
            grouped["db" if kind == "database" else "files"].append(item)
        except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError):
            continue
    for values in grouped.values():
        values.sort(key=lambda item: item["createdAt"], reverse=True)
    return _summary_payload(
        source="local-manifests", root=backup_dir, grouped=grouped, jobs={}, now=now
    )


def collect_backup_summary(now: datetime | None = None) -> dict:
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    if settings.backup_diagnostics_mode == "production":
        return _production_backup_summary(
            settings.base_dir / "var" / "diagnostics" / "backups", current
        )
    return _local_backup_summary(settings.base_dir / "var" / "backups", current)


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


def _health_checks(
    db: Session, backups: dict | None = None, host_status: dict | None = None
) -> dict:
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

    backup_summary = backups if backups is not None else collect_backup_summary()
    backup_status = {
        "status": backup_summary["status"],
        "message": backup_summary["message"],
    }

    fail2ban = _fail2ban_status()
    host = host_status if host_status is not None else _host_status()

    return {
        "database": database_status,
        "dist": dist_status,
        "backups": backup_status,
        "fail2ban": fail2ban,
        "hostSnapshot": {"status": host["status"], "message": host["message"]},
        "disk": {
            "status": (host.get("disks") or {}).get("status") or "error",
            "message": (host.get("disks") or {}).get("message") or "Disk status unavailable.",
        },
        "containers": {
            "status": (host.get("containers") or {}).get("status") or "error",
            "message": (host.get("containers") or {}).get("message")
            or "Container status unavailable.",
        },
        "automation": {
            "status": (host.get("units") or {}).get("status") or "error",
            "message": (host.get("units") or {}).get("message") or "Automation status unavailable.",
        },
        "certificates": {
            "status": (host.get("certificates") or {}).get("status") or "error",
            "message": (host.get("certificates") or {}).get("message")
            or "Certificate status unavailable.",
        },
    }


def build_snapshot(db: Session, source: str = "manual") -> dict:
    now = datetime.now(timezone.utc)
    backups = collect_backup_summary(now=now)
    host_status = _host_status(now=now)
    health_checks = _health_checks(db, backups=backups, host_status=host_status)
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
            {
                "id": "host-disks",
                "label": "Host Disks",
                "status": health_checks["disk"]["status"],
                "summary": health_checks["disk"]["message"],
                "details": "/ and /mnt/archive",
            },
            {
                "id": "containers",
                "label": "Containers",
                "status": health_checks["containers"]["status"],
                "summary": health_checks["containers"]["message"],
                "details": "Docker Compose project state",
            },
            {
                "id": "automation",
                "label": "Automation",
                "status": health_checks["automation"]["status"],
                "summary": health_checks["automation"]["message"],
                "details": "Diagnostics, Ops, and backup units",
            },
            {
                "id": "certificates",
                "label": "TLS Certificates",
                "status": health_checks["certificates"]["status"],
                "summary": health_checks["certificates"]["message"],
                "details": "Main and chat HTTPS endpoints",
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
        "hostStatus": host_status,
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


def _write_snapshot_file(path: Path, payload: str) -> None:
    temporary = path.parent / f".{path.name}.{uuid4().hex}.tmp"
    descriptor: int | None = None
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o640)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            descriptor = None
            handle.write(payload)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        directory_fd = os.open(path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        temporary.unlink(missing_ok=True)


def write_snapshot(snapshot: dict) -> dict:
    with _snapshot_lock():
        root = _snapshot_root()
        history = snapshot_history_dir()
        root.mkdir(parents=True, exist_ok=True)
        history.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(snapshot, ensure_ascii=True, indent=2, sort_keys=True)
        latest = latest_snapshot_path()
        _write_snapshot_file(latest, payload)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        _write_snapshot_file(history / f"{timestamp}.json", payload)
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
