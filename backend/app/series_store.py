from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from .file_ops import safe_path
from .models import Entry, EntryLabel, EntryPage, Series
from .preview_pipeline import (
    delete_preview_file,
    entry_cover_thumb_rel_path,
    generate_thumbnail,
    resolve_source_path,
)

DEFAULT_SERIES_ID = "battle-bros"
SERIES_ID_RE = re.compile(r"^[a-z0-9_-]{1,64}$")
logger = logging.getLogger(__name__)


def sanitize_series_id(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    value = re.sub(r"[^a-z0-9_-]+", "-", value).strip("-")
    return value[:64] or DEFAULT_SERIES_ID


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_label_text(raw: Any, fallback: str) -> str:
    text = str(raw or "").strip()
    return text[:30] if text else fallback


def _slugify_label(raw: Any, fallback: str) -> str:
    base = str(raw or "").strip().lower()
    base = re.sub(r"[^a-z0-9_-]+", "-", base).strip("-")
    return base[:64] or fallback


def _ensure_entry_labels(db: Session, series: Series) -> list[EntryLabel]:
    labels = db.scalars(
        select(EntryLabel)
        .where(EntryLabel.series_id == series.id)
        .order_by(EntryLabel.sort_index.asc(), EntryLabel.created_at.asc())
    ).all()
    if labels:
        if not any(label.is_default for label in labels):
            labels[0].is_default = True
            labels[0].updated_at = _now()
            db.add(labels[0])
            db.commit()
        return labels

    label = EntryLabel(
        id=uuid4(),
        series_id=series.id,
        slug=_slugify_label(series.unit_label_plural or series.unit_label_singular, "entries"),
        singular=_normalize_label_text(series.unit_label_singular, "Entry"),
        plural=_normalize_label_text(series.unit_label_plural, "Entries"),
        sort_index=0,
        is_default=True,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(label)
    db.commit()
    return [label]


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
    items = db.scalars(
        select(Series).where(Series.active.is_(True)).order_by(Series.created_at.asc())
    ).all()
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
            "entries": {},
            "entryFolders": {},
            "entryMeta": {},
            "statusMessage": "",
            "premiumOnly": False,
            "unitLabelSingular": "Chapter",
            "unitLabelPlural": "Chapters",
            "lastUpdated": _now().isoformat().replace("+00:00", "Z"),
            "publishedBy": "Database",
            "payloadVersion": 2,
        }

    entry_labels = _ensure_entry_labels(db, series)
    entry_labels = sorted(entry_labels, key=lambda label: (label.sort_index, label.created_at))
    default_label = next(
        (label for label in entry_labels if label.is_default),
        entry_labels[0] if entry_labels else None,
    )
    label_by_id = {label.id: label for label in entry_labels}

    entries = db.scalars(
        select(Entry)
        .where(Entry.series_id == sid)
        .order_by(Entry.sort_index.asc(), Entry.publish_at.asc())
    ).all()

    chapters: dict[str, list[str]] = {}
    chapter_folders: dict[str, str] = {}
    chapter_meta: dict[str, dict[str, Any]] = {}

    for entry in entries:
        pages = db.scalars(
            select(EntryPage)
            .where(EntryPage.entry_id == entry.id)
            .order_by(EntryPage.sort_index.asc())
        ).all()
        chapters[entry.title] = [p.path for p in pages]
        if entry.folder_path:
            chapter_folders[entry.title] = entry.folder_path
        label = label_by_id.get(entry.entry_label_id) or default_label
        meta = {
            "entryId": str(entry.id),
            "premium": bool(entry.premium_only),
            "showInDropdown": bool(entry.show_in_dropdown),
            "showInGallery": bool(entry.show_in_gallery),
            "releaseType": entry.release_type or "digital",
            "storeUrl": entry.store_url or "",
            "coverImage": entry.cover_image or "",
            "coverThumbPath": entry.cover_thumb_path or "",
        }
        if label:
            meta["entryLabelId"] = str(label.id)
            meta["entryLabelSingular"] = label.singular
            meta["entryLabelPlural"] = label.plural
        if entry.display_number is not None:
            meta["displayNumber"] = int(entry.display_number)
        chapter_meta[entry.title] = meta

    return {
        "entries": chapters,
        "entryFolders": chapter_folders,
        "entryMeta": chapter_meta,
        "statusMessage": series.status_message or "",
        "premiumOnly": bool(series.premium_only),
        "unitLabelSingular": default_label.singular
        if default_label
        else series.unit_label_singular,
        "unitLabelPlural": default_label.plural if default_label else series.unit_label_plural,
        "entryLabels": [
            {
                "id": str(label.id),
                "slug": label.slug,
                "singular": label.singular,
                "plural": label.plural,
                "sortIndex": int(label.sort_index),
                "isDefault": bool(label.is_default),
            }
            for label in entry_labels
        ],
        "lastUpdated": (series.updated_at or _now())
        .astimezone(timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
        "publishedBy": "Database",
        "payloadVersion": 2,
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
                unit_label_singular=str(
                    item.get("unitLabelSingular")
                    or ("Issue" if sid == DEFAULT_SERIES_ID else "Chapter")
                )[:30],
                unit_label_plural=str(
                    item.get("unitLabelPlural")
                    or ("Issues" if sid == DEFAULT_SERIES_ID else "Chapters")
                )[:30],
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
                series.unit_label_singular = (
                    str(item.get("unitLabelSingular") or "").strip()[:30]
                    or series.unit_label_singular
                )
            if "unitLabelPlural" in item:
                series.unit_label_plural = (
                    str(item.get("unitLabelPlural") or "").strip()[:30] or series.unit_label_plural
                )
            series.active = True
            series.updated_at = _now()

        db.add(series)

        labels = db.scalars(
            select(EntryLabel)
            .where(EntryLabel.series_id == sid)
            .order_by(EntryLabel.sort_index.asc(), EntryLabel.created_at.asc())
        ).all()
        if not labels:
            labels = [
                EntryLabel(
                    id=uuid4(),
                    series_id=sid,
                    slug=_slugify_label(
                        series.unit_label_plural or series.unit_label_singular, "entries"
                    ),
                    singular=_normalize_label_text(series.unit_label_singular, "Entry"),
                    plural=_normalize_label_text(series.unit_label_plural, "Entries"),
                    sort_index=0,
                    is_default=True,
                    created_at=_now(),
                    updated_at=_now(),
                )
            ]
            db.add(labels[0])
        default_label = next((label for label in labels if label.is_default), labels[0])
        default_label.singular = _normalize_label_text(series.unit_label_singular, "Entry")
        default_label.plural = _normalize_label_text(series.unit_label_plural, "Entries")
        default_label.slug = _slugify_label(
            default_label.plural or default_label.singular, "entries"
        )
        default_label.updated_at = _now()
        db.add(default_label)

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
    allow_deletions = bool(payload.get("allowDeletions"))

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

    chapters = payload.get("entries") if isinstance(payload.get("entries"), dict) else {}
    chapter_folders = (
        payload.get("entryFolders") if isinstance(payload.get("entryFolders"), dict) else {}
    )
    chapter_meta = payload.get("entryMeta") if isinstance(payload.get("entryMeta"), dict) else {}
    entry_labels_payload = (
        payload.get("entryLabels") if isinstance(payload.get("entryLabels"), list) else None
    )

    existing_labels = db.scalars(
        select(EntryLabel)
        .where(EntryLabel.series_id == sid)
        .order_by(EntryLabel.sort_index.asc(), EntryLabel.created_at.asc())
    ).all()
    existing_by_id = {str(label.id): label for label in existing_labels}

    requested_label_ids: list[UUID] = []
    labels: list[EntryLabel] = []
    if entry_labels_payload is not None:
        for idx, raw in enumerate(entry_labels_payload):
            if not isinstance(raw, dict):
                continue
            raw_id = str(raw.get("id") or "").strip()
            label = existing_by_id.get(raw_id)
            if not label:
                label = EntryLabel(
                    id=uuid4(),
                    series_id=sid,
                    created_at=_now(),
                    updated_at=_now(),
                    sort_index=idx,
                    is_default=False,
                    singular="Entry",
                    plural="Entries",
                )
            label.singular = _normalize_label_text(raw.get("singular"), "Entry")
            label.plural = _normalize_label_text(raw.get("plural"), "Entries")
            label.slug = _slugify_label(
                raw.get("slug") or label.plural or label.singular, "entries"
            )
            label.sort_index = int(
                raw.get("sortIndex") if raw.get("sortIndex") is not None else idx
            )
            label.is_default = bool(raw.get("isDefault"))
            label.updated_at = _now()
            labels.append(label)
            requested_label_ids.append(label.id)
            db.add(label)

        if labels and not any(label.is_default for label in labels):
            labels[0].is_default = True
            labels[0].updated_at = _now()
            db.add(labels[0])

        for label in existing_labels:
            if label.id not in requested_label_ids:
                db.delete(label)
    else:
        labels = existing_labels

    if not labels:
        label = EntryLabel(
            id=uuid4(),
            series_id=sid,
            slug=_slugify_label(series.unit_label_plural or series.unit_label_singular, "entries"),
            singular=_normalize_label_text(series.unit_label_singular, "Entry"),
            plural=_normalize_label_text(series.unit_label_plural, "Entries"),
            sort_index=0,
            is_default=True,
            created_at=_now(),
            updated_at=_now(),
        )
        labels = [label]
        db.add(label)

    default_label = next((label for label in labels if label.is_default), labels[0])
    series.unit_label_singular = default_label.singular
    series.unit_label_plural = default_label.plural
    db.add(series)

    requested_titles: set[str] = set()
    requested_entry_ids: set[UUID] = set()
    fallback_index = 0

    for raw_title, raw_pages in chapters.items():
        if not isinstance(raw_title, str):
            continue
        title = raw_title.strip()
        if not title:
            continue

        requested_titles.add(title)
        pages = [p.strip() for p in (raw_pages or []) if isinstance(p, str) and p.strip()]
        folder_path = (
            str(chapter_folders.get(raw_title) or chapter_folders.get(title) or "")
            .strip()
            .strip("/")
        )

        meta = chapter_meta.get(raw_title) or chapter_meta.get(title) or {}
        premium_only = bool(meta.get("premium")) if isinstance(meta, dict) else False
        display_number = None
        if isinstance(meta, dict):
            raw_display = meta.get("displayNumber")
            if raw_display is None:
                raw_display = meta.get("display_number")
            if raw_display is not None and raw_display != "":
                try:
                    parsed = int(raw_display)
                except (TypeError, ValueError):
                    parsed = None
                if parsed is not None and parsed >= 0:
                    display_number = parsed

        entry_label_id = None
        if isinstance(meta, dict):
            raw_label_id = meta.get("entryLabelId") or meta.get("entry_label_id")
            if raw_label_id:
                try:
                    entry_label_id = UUID(str(raw_label_id))
                except Exception:
                    entry_label_id = None
        if entry_label_id is None:
            entry_label_id = default_label.id if default_label else None

        show_in_dropdown = True
        show_in_gallery = True
        release_type = "digital"
        store_url = ""
        cover_image = ""
        if isinstance(meta, dict):
            show_in_dropdown = bool(meta.get("showInDropdown", True))
            show_in_gallery = bool(meta.get("showInGallery", True))
            release_type = str(meta.get("releaseType") or "digital").strip().lower() or "digital"
            if release_type not in ("digital", "store"):
                release_type = "digital"
            store_url = str(meta.get("storeUrl") or meta.get("store_url") or "").strip()
            cover_image = str(meta.get("coverImage") or meta.get("cover") or "").strip()

        entry_id: UUID | None = None
        if isinstance(meta, dict):
            raw_entry_id = meta.get("entryId") or meta.get("entry_id")
            if raw_entry_id:
                try:
                    entry_id = UUID(str(raw_entry_id))
                except Exception:
                    entry_id = None

        entry = None
        if entry_id is not None:
            entry = db.get(Entry, entry_id)
            if entry and entry.series_id != sid:
                entry = None
        if entry is None:
            entry = db.scalar(select(Entry).where(Entry.series_id == sid, Entry.title == title))
        existing_cover = entry.cover_image if entry else ""
        existing_thumb = entry.cover_thumb_path if entry else ""
        if not entry:
            entry = Entry(
                id=uuid4(),
                series_id=sid,
                title=title[:200],
                display_number=display_number,
                entry_label_id=entry_label_id,
                folder_path=folder_path,
                premium_only=premium_only,
                show_in_dropdown=show_in_dropdown,
                show_in_gallery=show_in_gallery,
                release_type=release_type,
                store_url=store_url or None,
                cover_image=cover_image or None,
                cover_thumb_path=None,
                status="published",
                publish_at=_now(),
                sort_index=display_number
                if display_number is not None
                else _extract_sort_index(
                    title,
                    folder_path,
                    fallback_index,
                ),
                created_at=_now(),
                updated_at=_now(),
            )
        else:
            entry.title = title[:200]
            entry.folder_path = folder_path
            entry.premium_only = premium_only
            entry.entry_label_id = entry_label_id
            entry.show_in_dropdown = show_in_dropdown
            entry.show_in_gallery = show_in_gallery
            entry.release_type = release_type
            entry.store_url = store_url or None
            entry.cover_image = cover_image or None
            if display_number is not None:
                entry.display_number = display_number
            effective_display = (
                display_number if display_number is not None else entry.display_number
            )
            entry.sort_index = (
                effective_display
                if effective_display is not None
                else _extract_sort_index(title, folder_path, entry.sort_index or fallback_index)
            )
            entry.updated_at = _now()

        fallback_index += 1
        db.add(entry)
        db.flush()
        requested_entry_ids.add(entry.id)

        expected_thumb = entry_cover_thumb_rel_path(str(entry.id)) if cover_image else ""
        thumb_ok = False
        if cover_image:
            should_regen = (
                str(existing_cover or "") != cover_image
                or str(existing_thumb or "") != expected_thumb
                or not str(existing_thumb or "")
            )
            try:
                abs_thumb = safe_path(expected_thumb)
            except ValueError:
                abs_thumb = None
            if should_regen and abs_thumb:
                source = resolve_source_path(cover_image)
                if source:
                    try:
                        generate_thumbnail(source, abs_thumb)
                    except Exception as exc:
                        logger.warning(
                            "Failed to generate entry cover thumbnail for %s: %s", cover_image, exc
                        )
                else:
                    logger.warning("Cover source missing for %s", cover_image)
            if abs_thumb:
                thumb_ok = abs_thumb.exists()
            if thumb_ok:
                entry.cover_thumb_path = expected_thumb
            else:
                delete_preview_file(expected_thumb)
                entry.cover_thumb_path = None
        else:
            if existing_thumb:
                delete_preview_file(existing_thumb)
            entry.cover_thumb_path = None

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
    removed_entries = []
    for entry in db.scalars(select(Entry).where(Entry.series_id == sid)).all():
        keep_by_id = entry.id in requested_entry_ids if requested_entry_ids else False
        keep_by_title = entry.title in requested_titles
        if not keep_by_id and not keep_by_title:
            removed_entries.append(entry)
    if removed_entries and not allow_deletions:
        raise ValueError(
            f"Refusing to delete {len(removed_entries)} entries without allowDeletions=true"
        )
    for entry in removed_entries:
        db.delete(entry)

    db.commit()
