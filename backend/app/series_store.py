from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Entry, EntryPage, Series
from .settings import settings


DEFAULT_SERIES_ID = "battle-bros"
SERIES_ID_RE = re.compile(r"^[a-z0-9_-]{1,64}$")


def sanitize_series_id(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    value = re.sub(r"[^a-z0-9_-]+", "-", value).strip("-")
    return value[:64] or DEFAULT_SERIES_ID


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _extract_sort_index(title: str, folder_path: str, fallback: int) -> int:
    candidates: list[str] = []
    if folder_path:
        candidates.append(folder_path)
    if title:
        candidates.append(title)
    for item in candidates:
        nums = re.findall(r"(\d+)", str(item))
        if nums:
            try:
                return int(nums[0])
            except Exception:
                pass
    return fallback


def ensure_seeded(db: Session) -> None:
    have_series = bool(db.scalar(select(Series.id).limit(1)))
    have_entries = bool(db.scalar(select(Entry.id).limit(1)))
    if have_series and have_entries:
        return

    if not have_series:
        series = Series(
            id=DEFAULT_SERIES_ID,
            title="Battle Bros",
            description="",
            cover_image=None,
            premium_only=False,
            status_message="",
            unit_label_singular="Issue",
            unit_label_plural="Issues",
            active=True,
            created_at=_now(),
            updated_at=_now(),
        )
        db.add(series)
        db.commit()


def series_index_payload(db: Session) -> dict[str, Any]:
    ensure_seeded(db)
    items = db.scalars(select(Series).where(Series.active.is_(True)).order_by(Series.created_at.asc())).all()
    return {
        "version": 1,
        "defaultSeriesId": DEFAULT_SERIES_ID,
        "series": [
            {
                "id": s.id,
                "title": s.title,
                "description": s.description,
                "premiumOnly": bool(s.premium_only),
                "unitLabelSingular": s.unit_label_singular,
                "unitLabelPlural": s.unit_label_plural,
                **({"coverImage": s.cover_image} if s.cover_image else {}),
            }
            for s in items
        ],
    }


def series_data_payload(db: Session, series_id: str) -> dict[str, Any]:
    ensure_seeded(db)
    sid = sanitize_series_id(series_id)
    series = db.get(Series, sid)
    if not series or not series.active:
        # Keep reader resilient: return a valid empty structure.
        return {
            "chapters": {},
            "chapterFolders": {},
            "chapterMeta": {},
            "statusMessage": "",
            "premiumOnly": False,
            "unitLabelSingular": "Chapter",
            "unitLabelPlural": "Chapters",
            "lastUpdated": _now().isoformat().replace("+00:00", "Z"),
            "publishedBy": "Database",
        }

    entries = db.scalars(select(Entry).where(Entry.series_id == sid).order_by(Entry.sort_index.asc(), Entry.publish_at.asc())).all()

    chapters: dict[str, list[str]] = {}
    chapter_folders: dict[str, str] = {}
    chapter_meta: dict[str, dict[str, Any]] = {}

    for entry in entries:
        pages = db.scalars(select(EntryPage).where(EntryPage.entry_id == entry.id).order_by(EntryPage.sort_index.asc())).all()
        chapters[entry.title] = [p.path for p in pages]
        if entry.folder_path:
            chapter_folders[entry.title] = entry.folder_path
        chapter_meta[entry.title] = {"premium": bool(entry.premium_only)}

    return {
        "chapters": chapters,
        "chapterFolders": chapter_folders,
        "chapterMeta": chapter_meta,
        "statusMessage": series.status_message or "",
        "premiumOnly": bool(series.premium_only),
        "unitLabelSingular": series.unit_label_singular,
        "unitLabelPlural": series.unit_label_plural,
        "lastUpdated": (series.updated_at or _now()).astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "publishedBy": "Database",
    }


def apply_series_index_save(db: Session, payload: Any) -> None:
    if not isinstance(payload, dict):
        raise ValueError("Invalid series index payload")
    raw = payload.get("series")
    if not isinstance(raw, list):
        raise ValueError("Invalid series index payload")

    requested_ids: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        sid = sanitize_series_id(item.get("id"))
        if not SERIES_ID_RE.match(sid):
            continue
        requested_ids.add(sid)

        series = db.get(Series, sid)
        if not series:
            series = Series(
                id=sid,
                title=str(item.get("title") or sid)[:200],
                description=str(item.get("description") or ""),
                cover_image=str(item.get("coverImage") or "").strip() or None,
                premium_only=bool(item.get("premiumOnly")),
                status_message="",
                unit_label_singular=str(item.get("unitLabelSingular") or ("Issue" if sid == DEFAULT_SERIES_ID else "Chapter"))[
                    :30
                ],
                unit_label_plural=str(item.get("unitLabelPlural") or ("Issues" if sid == DEFAULT_SERIES_ID else "Chapters"))[
                    :30
                ],
                active=True,
                created_at=_now(),
                updated_at=_now(),
            )
        else:
            series.title = str(item.get("title") or series.title)[:200]
            series.description = str(item.get("description") or "")
            series.cover_image = str(item.get("coverImage") or "").strip() or None
            series.premium_only = bool(item.get("premiumOnly"))
            if "unitLabelSingular" in item:
                series.unit_label_singular = str(item.get("unitLabelSingular") or "").strip()[:30] or series.unit_label_singular
            if "unitLabelPlural" in item:
                series.unit_label_plural = str(item.get("unitLabelPlural") or "").strip()[:30] or series.unit_label_plural
            series.active = True
            series.updated_at = _now()

        db.add(series)

    # Soft-hide any series that were removed from the index.
    for s in db.scalars(select(Series).where(Series.active.is_(True))).all():
        if s.id not in requested_ids:
            s.active = False
            s.updated_at = _now()
            db.add(s)

    db.commit()


def apply_series_data_save(db: Session, series_id: str, payload: Any) -> None:
    if not isinstance(payload, dict):
        raise ValueError("Invalid series data payload")
    sid = sanitize_series_id(series_id)

    series = db.get(Series, sid)
    if not series:
        series = Series(
            id=sid,
            title=sid,
            description="",
            cover_image=None,
            premium_only=False,
            status_message="",
            unit_label_singular="Issue" if sid == DEFAULT_SERIES_ID else "Chapter",
            unit_label_plural="Issues" if sid == DEFAULT_SERIES_ID else "Chapters",
            active=True,
            created_at=_now(),
            updated_at=_now(),
        )
        db.add(series)
        db.flush()

    if "statusMessage" in payload:
        series.status_message = str(payload.get("statusMessage") or "").strip()[:200]
    if "premiumOnly" in payload:
        series.premium_only = bool(payload.get("premiumOnly"))
    series.active = True
    series.updated_at = _now()
    db.add(series)

    chapters = payload.get("chapters") if isinstance(payload.get("chapters"), dict) else {}
    chapter_folders = payload.get("chapterFolders") if isinstance(payload.get("chapterFolders"), dict) else {}
    chapter_meta = payload.get("chapterMeta") if isinstance(payload.get("chapterMeta"), dict) else {}

    requested_titles: set[str] = set()
    fallback_index = 0

    for raw_title, raw_pages in chapters.items():
        if not isinstance(raw_title, str):
            continue
        title = raw_title.strip()
        if not title:
            continue

        requested_titles.add(title)
        pages = [p.strip() for p in (raw_pages or []) if isinstance(p, str) and p.strip()]
        folder_path = str(chapter_folders.get(raw_title) or chapter_folders.get(title) or "").strip().strip("/")

        meta = chapter_meta.get(raw_title) or chapter_meta.get(title) or {}
        premium_only = bool(meta.get("premium")) if isinstance(meta, dict) else False

        entry = db.scalar(select(Entry).where(Entry.series_id == sid, Entry.title == title))
        if not entry:
            entry = Entry(
                id=uuid4(),
                series_id=sid,
                title=title[:200],
                display_number=None,
                folder_path=folder_path,
                premium_only=premium_only,
                status="published",
                publish_at=_now(),
                sort_index=_extract_sort_index(title, folder_path, fallback_index),
                created_at=_now(),
                updated_at=_now(),
            )
        else:
            entry.folder_path = folder_path
            entry.premium_only = premium_only
            entry.sort_index = _extract_sort_index(title, folder_path, entry.sort_index or fallback_index)
            entry.updated_at = _now()

        fallback_index += 1
        db.add(entry)
        db.flush()

        # Replace pages.
        for existing in db.scalars(select(EntryPage).where(EntryPage.entry_id == entry.id)).all():
            db.delete(existing)
        for idx, path in enumerate(pages):
            db.add(
                EntryPage(
                    id=uuid4(),
                    entry_id=entry.id,
                    sort_index=idx,
                    path=path,
                    alt_text=None,
                    created_at=_now(),
                    updated_at=_now(),
                )
            )

    # Delete entries that were removed from the payload (hard cut).
    for entry in db.scalars(select(Entry).where(Entry.series_id == sid)).all():
        if entry.title not in requested_titles:
            db.delete(entry)

    db.commit()
