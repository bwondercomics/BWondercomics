from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image, ImageFilter

from sqlalchemy import select
from sqlalchemy.orm import Session

from .file_ops import safe_path
from .models import MediaItem, PageConfig
from .series_store import DEFAULT_SERIES_ID, sanitize_series_id

logger = logging.getLogger(__name__)

PREVIEW_DIR = "media/previews"
PREVIEW_EXT = ".jpg"
PREVIEW_QUALITY = 70
PREVIEW_BLUR_RADIUS = 64
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


def _media_id_from_path(path: str) -> str:
    filename = path.split("/")[-1]
    base = re.sub(r"\.[^.]+$", "", filename)
    base = re.sub(r"[^a-zA-Z0-9]+", "-", base).strip("-").lower() or "media"
    h = 2166136261
    for ch in path:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return f"media-{base}-{h:08x}"


def _preview_rel_path(media_id: str) -> str:
    return f"{PREVIEW_DIR}/{media_id}{PREVIEW_EXT}"


def _resolve_media_source_path(path: str) -> Path | None:
    if not path:
        return None
    clean = str(path).strip().lstrip("/")
    if not clean or clean.startswith("http://") or clean.startswith("https://"):
        return None
    candidates = [clean]
    if clean.startswith("protected/"):
        candidates.append(clean.replace("protected/", "", 1))
    else:
        candidates.append(f"protected/{clean}")
    for candidate in candidates:
        try:
            abs_path = safe_path(candidate)
        except ValueError:
            continue
        if abs_path.is_file():
            return abs_path
    return None


def _generate_blur_preview(source: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as img:
        blurred = img.convert("RGB").filter(ImageFilter.GaussianBlur(radius=PREVIEW_BLUR_RADIUS))
        blurred.save(dest, format="JPEG", quality=PREVIEW_QUALITY, optimize=True, progressive=True)


def _sync_media_previews(items: list[dict[str, Any]], removed_ids: set[str]) -> None:
    for media_id in removed_ids:
        try:
            abs_preview = safe_path(_preview_rel_path(media_id))
            if abs_preview.exists():
                abs_preview.unlink()
        except Exception:
            continue

    for item in items:
        media_id = item.get("id") or ""
        if not media_id:
            continue
        access = item.get("access") or "public"
        premium_visibility = item.get("premium_visibility") or "blur"
        preview_rel = _preview_rel_path(media_id)
        try:
            abs_preview = safe_path(preview_rel)
        except ValueError:
            continue

        should_blur = access == "premium" and premium_visibility == "blur"
        if not should_blur:
            if abs_preview.exists():
                try:
                    abs_preview.unlink()
                except Exception:
                    continue
            continue

        source = _resolve_media_source_path(item.get("path") or "")
        if not source:
            logger.warning("Media preview source missing for %s", item.get("path"))
            continue
        try:
            _generate_blur_preview(source, abs_preview)
        except Exception as exc:
            logger.warning("Failed to generate media preview for %s: %s", item.get("path"), exc)


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
        if path.startswith(PREVIEW_DIR + "/") or path.startswith(POST_ASSET_PREFIX):
            continue
        mid = str(raw.get("id") or "").strip() or _media_id_from_path(path)
        tags = _normalize_tags(raw.get("tags"))
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

        if mid in existing_by_id:
            record = existing_by_id[mid]
            record.path = path
            record.tags = tags
            record.public = public
            record.access = access
            record.premium_visibility = premium_visibility
            record.updated_at = now
            keep_ids.add(record.id)
            continue

        by_path = existing_by_path.get(path)
        if by_path:
            by_path.tags = tags
            by_path.public = public
            by_path.access = access
            by_path.premium_visibility = premium_visibility
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
            created_at=now,
            updated_at=now,
        )
        db.add(record)
        keep_ids.add(record.id)

    for record in existing:
        if record.id not in keep_ids:
            db.delete(record)

    db.commit()

    removed_ids = {record.id for record in existing if record.id not in keep_ids}
    _sync_media_previews(items, removed_ids)


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
