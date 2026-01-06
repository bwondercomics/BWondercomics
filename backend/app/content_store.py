from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import MediaItem, PageConfig
from .series_store import DEFAULT_SERIES_ID, sanitize_series_id


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_tags(raw: Any) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        tags: list[str] = []
        for item in raw:
            value = str(item or "").strip()
            if value:
                tags.append(value)
        return tags[:50]
    if isinstance(raw, str):
        return [t for t in (x.strip() for x in raw.split(",")) if t][:50]
    return []


def _media_id_from_path(path: str) -> str:
    filename = path.split("/")[-1]
    base = re.sub(r"\.[^.]+$", "", filename)
    base = re.sub(r"[^a-zA-Z0-9]+", "-", base).strip("-").lower() or "media"
    h = 2166136261
    for ch in path:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return f"media-{base}-{h:08x}"


def _normalize_media_items(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, list):
        raise ValueError("Invalid media payload")
    items: list[dict[str, Any]] = []
    seen_paths: set[str] = set()
    for raw in payload:
        if not isinstance(raw, dict):
            continue
        path = str(raw.get("path") or "").strip()
        if not path or path in seen_paths:
            continue
        mid = str(raw.get("id") or "").strip() or _media_id_from_path(path)
        tags = _normalize_tags(raw.get("tags"))
        items.append({"id": mid, "path": path, "tags": tags})
        seen_paths.add(path)
    return items


def list_media_items(db: Session) -> list[dict[str, Any]]:
    items = db.scalars(select(MediaItem).order_by(MediaItem.path.asc())).all()
    return [{"id": item.id, "path": item.path, "tags": list(item.tags or [])} for item in items]


def apply_media_items_save(db: Session, payload: Any) -> None:
    items = _normalize_media_items(payload)
    existing = db.scalars(select(MediaItem)).all()
    existing_by_id = {item.id: item for item in existing}
    existing_by_path = {item.path: item for item in existing}
    keep_ids: set[str] = set()
    now = _now()

    for item in items:
        mid = item["id"]
        path = item["path"]
        tags = item["tags"]

        if mid in existing_by_id:
            record = existing_by_id[mid]
            record.path = path
            record.tags = tags
            record.updated_at = now
            keep_ids.add(record.id)
            continue

        by_path = existing_by_path.get(path)
        if by_path:
            by_path.tags = tags
            by_path.updated_at = now
            keep_ids.add(by_path.id)
            continue

        record = MediaItem(id=mid, path=path, tags=tags, created_at=now, updated_at=now)
        db.add(record)
        keep_ids.add(record.id)

    for record in existing:
        if record.id not in keep_ids:
            db.delete(record)

    db.commit()


def get_page_config(db: Session, series_id: str | None) -> dict[str, Any] | None:
    sid = sanitize_series_id(series_id) if series_id else DEFAULT_SERIES_ID
    record = db.get(PageConfig, sid)
    return record.content if record else None


def save_page_config(db: Session, series_id: str | None, content: Any) -> None:
    if not isinstance(content, dict):
        raise ValueError("Invalid page config payload")
    sid = sanitize_series_id(series_id) if series_id else DEFAULT_SERIES_ID
    now = _now()
    record = db.get(PageConfig, sid)
    if record:
        record.content = content
        record.updated_at = now
    else:
        record = PageConfig(series_id=sid, content=content, created_at=now, updated_at=now)
        db.add(record)
    db.commit()
