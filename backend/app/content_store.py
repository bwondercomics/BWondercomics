from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .file_ops import safe_path
from .models import MediaItem, PageConfig
from .preview_pipeline import (
    PREVIEW_ROOT,
    delete_preview_file,
    generate_blurred_preview,
    generate_thumbnail,
    media_blur_rel_path,
    media_thumb_rel_path,
    resolve_source_path,
)
from .series_store import DEFAULT_SERIES_ID, sanitize_series_id

logger = logging.getLogger(__name__)

POST_ASSET_PREFIX = "media/post-assets/"


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


def _normalize_access(raw: Any, fallback_public: bool) -> str:
    value = str(raw or "").strip().lower()
    if value in {"public", "premium", "private"}:
        return value
    return "public" if fallback_public else "private"


def _normalize_premium_visibility(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    return value if value in {"blur", "hidden"} else "blur"


def _delete_post_assets_for_media_id(media_id: str) -> None:
    if not media_id:
        return
    root = POST_ASSET_PREFIX.rstrip("/")
    try:
        assets_dir = safe_path(root)
    except ValueError:
        return
    if not assets_dir.exists():
        return
    for candidate in assets_dir.glob(f"{media_id}.*"):
        if candidate.is_file():
            try:
                candidate.unlink()
            except Exception:
                continue


def _media_id_from_path(path: str) -> str:
    filename = path.split("/")[-1]
    base = re.sub(r"\.[^.]+$", "", filename)
    base = re.sub(r"[^a-zA-Z0-9]+", "-", base).strip("-").lower() or "media"
    h = 2166136261
    for ch in path:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return f"media-{base}-{h:08x}"


def media_id_from_path(path: str) -> str:
    return _media_id_from_path(path)


def _sync_media_previews(db: Session, items: list[dict[str, Any]], removed_ids: set[str]) -> None:
    for media_id in removed_ids:
        delete_preview_file(media_thumb_rel_path(media_id))
        delete_preview_file(media_blur_rel_path(media_id))
        _delete_post_assets_for_media_id(media_id)

    for item in items:
        media_id = item.get("id") or ""
        if not media_id:
            continue
        access = item.get("access") or "public"
        premium_visibility = item.get("premium_visibility") or "blur"
        should_blur = access == "premium" and premium_visibility == "blur"
        thumb_rel = media_thumb_rel_path(media_id)
        blur_rel = media_blur_rel_path(media_id) if should_blur else ""

        record = db.get(MediaItem, media_id)
        if not record:
            path = item.get("path") or ""
            if path:
                record = db.scalar(select(MediaItem).where(MediaItem.path == path))
        try:
            abs_thumb = safe_path(thumb_rel)
        except ValueError:
            abs_thumb = None
        try:
            abs_blur = safe_path(blur_rel) if blur_rel else None
        except ValueError:
            abs_blur = None

        source = resolve_source_path(item.get("path") or "")
        thumb_ok = False
        blur_ok = False

        if source and abs_thumb:
            try:
                generate_thumbnail(source, abs_thumb)
            except Exception as exc:
                logger.warning("Failed to generate media thumbnail for %s: %s", item.get("path"), exc)
            thumb_ok = abs_thumb.exists()
        elif abs_thumb:
            thumb_ok = abs_thumb.exists()
            if not thumb_ok:
                logger.warning("Media source missing for %s", item.get("path"))

        if should_blur and abs_blur:
            if source:
                try:
                    generate_blurred_preview(source, abs_blur)
                except Exception as exc:
                    logger.warning("Failed to generate media preview for %s: %s", item.get("path"), exc)
            blur_ok = abs_blur.exists()
        else:
            if abs_blur and abs_blur.exists():
                delete_preview_file(blur_rel)

        if record:
            record.thumb_path = thumb_rel if thumb_ok else None
            record.preview_path = blur_rel if blur_ok else None
            record.updated_at = _now()
            db.add(record)

        if not thumb_ok and thumb_rel:
            delete_preview_file(thumb_rel)
        if not blur_ok and blur_rel:
            delete_preview_file(blur_rel)


def ensure_media_previews(db: Session, item: MediaItem | None) -> None:
    if not item or not item.id or not item.path:
        return
    db.flush()
    access = _normalize_access(item.access, item.public)
    premium_visibility = _normalize_premium_visibility(item.premium_visibility)
    _sync_media_previews(
        db,
        [
            {
                "id": item.id,
                "path": item.path,
                "access": access,
                "premium_visibility": premium_visibility,
            }
        ],
        set(),
    )


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
        if path.startswith(PREVIEW_ROOT + "/") or path.startswith(POST_ASSET_PREFIX):
            continue
        mid = str(raw.get("id") or "").strip() or _media_id_from_path(path)
        tags = _normalize_tags(raw.get("tags"))
        thumb_path = str(raw.get("thumbPath") or raw.get("thumb_path") or "").strip() or None
        preview_path = str(raw.get("previewPath") or raw.get("preview_path") or "").strip() or None
        fallback_public = raw.get("public") is not False
        access = _normalize_access(raw.get("access") or raw.get("visibility"), fallback_public)
        premium_visibility = _normalize_premium_visibility(
            raw.get("premiumVisibility") or raw.get("premium_visibility")
        )
        public = access == "public"
        items.append(
            {
                "id": mid,
                "path": path,
                "tags": tags,
                "public": public,
                "access": access,
                "premium_visibility": premium_visibility,
                "thumb_path": thumb_path,
                "preview_path": preview_path,
            }
        )
        seen_paths.add(path)
    return items


def list_media_items(db: Session) -> list[dict[str, Any]]:
    items = db.scalars(select(MediaItem).order_by(MediaItem.path.asc())).all()
    return [
        {
            "id": item.id,
            "path": item.path,
            "tags": list(item.tags or []),
            "public": item.public,
            "access": item.access,
            "premiumVisibility": item.premium_visibility,
            "thumbPath": item.thumb_path or "",
            "previewPath": item.preview_path or "",
        }
        for item in items
    ]


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
        public = item["public"]
        access = item["access"]
        premium_visibility = item["premium_visibility"]
        thumb_path = item["thumb_path"]
        preview_path = item["preview_path"]

        if mid in existing_by_id:
            record = existing_by_id[mid]
            record.path = path
            record.tags = tags
            record.public = public
            record.access = access
            record.premium_visibility = premium_visibility
            record.thumb_path = thumb_path
            record.preview_path = preview_path
            record.updated_at = now
            keep_ids.add(record.id)
            continue

        by_path = existing_by_path.get(path)
        if by_path:
            by_path.tags = tags
            by_path.public = public
            by_path.access = access
            by_path.premium_visibility = premium_visibility
            by_path.thumb_path = thumb_path
            by_path.preview_path = preview_path
            by_path.updated_at = now
            keep_ids.add(by_path.id)
            continue

        record = MediaItem(
            id=mid,
            path=path,
            tags=tags,
            public=public,
            access=access,
            premium_visibility=premium_visibility,
            thumb_path=thumb_path,
            preview_path=preview_path,
            created_at=now,
            updated_at=now,
        )
        db.add(record)
        keep_ids.add(record.id)

    for record in existing:
        if record.id not in keep_ids:
            db.delete(record)

    db.flush()
    removed_ids = {record.id for record in existing if record.id not in keep_ids}
    _sync_media_previews(db, items, removed_ids)

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
