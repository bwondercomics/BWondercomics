from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.parse import unquote, urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Entry, Series

DEFAULT_SERIES_ID = "battle-bros"


def sanitize_series_id(value: str | None) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9_-]+", "-", value).strip("-")
    return value[:64] or DEFAULT_SERIES_ID


def _series_id_from_request_path(path: str) -> str:
    path = (path or "").lstrip("/")
    if path.startswith("chapters/"):
        return DEFAULT_SERIES_ID
    if path.startswith("comics/"):
        parts = path.split("/", 3)
        if len(parts) >= 2:
            return sanitize_series_id(parts[1]) or DEFAULT_SERIES_ID
    return DEFAULT_SERIES_ID


@dataclass(frozen=True)
class PremiumPrefixes:
    series_id: str
    prefixes: set[str]
    computed_at: datetime


_cache: dict[str, PremiumPrefixes] = {}


def _compute_premium_prefixes(db: Session, series_id: str) -> set[str]:
    series_id = sanitize_series_id(series_id)
    prefixes: set[str] = set()

    series = db.get(Series, series_id)
    if series and series.active and series.premium_only:
        if series_id == DEFAULT_SERIES_ID:
            prefixes.add("/chapters/")
            prefixes.add(f"/comics/{series_id}/entries/")
        else:
            prefixes.add(f"/comics/{series_id}/entries/")
            prefixes.add(f"/comics/{series_id}/chapters/")

    # Entry-level premium gating: lock folder path.
    for folder_path in db.scalars(
        select(Entry.folder_path).where(Entry.series_id == series_id, Entry.premium_only.is_(True))
    ).all():
        folder = str(folder_path or "").strip().strip("/")
        if folder:
            prefixes.add(f"/{folder}/")

    return prefixes


def is_premium_request_path(db: Session, path: str) -> bool:
    parsed = urlparse(path)
    clean_path = unquote(parsed.path or "")
    series_id = _series_id_from_request_path(clean_path)

    # Very small TTL cache so static asset storms don't hammer the DB.
    cached = _cache.get(series_id)
    now = datetime.now(timezone.utc)
    if cached and (now - cached.computed_at) < timedelta(seconds=3):
        return any(clean_path.startswith(prefix) for prefix in cached.prefixes)

    prefixes = _compute_premium_prefixes(db, series_id)
    _cache[series_id] = PremiumPrefixes(series_id=series_id, prefixes=prefixes, computed_at=now)
    return any(clean_path.startswith(prefix) for prefix in prefixes)
