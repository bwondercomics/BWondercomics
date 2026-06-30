"""One-time migration: move legacy panel background/spacing from page.meta onto the
reader section's columns.

Phase 2 of the Panel/Column Settings Consolidation makes the reader-section column the
source of truth for panel art (``panelBackground``) and module spacing (``panelGap``).
The runtime falls back to ``page.meta.panelBackgrounds`` / ``page.meta.panelSpacing``
for un-migrated pages; this script performs the actual data move so the legacy meta
keys can eventually be retired.

Semantics (idempotent, non-destructive):
  * Left panel  -> reader section ``columns[0]``; right panel -> ``columns[last]`` (only
    when the reader section has >= 2 columns).
  * ``panelBackground`` and ``panelGap`` migrate independently. If the target column
    already carries a field, that authored value wins and is left untouched.
  * A legacy meta key is cleared only once its corresponding column field is present
    (copied or pre-existing). A side whose column does not exist (e.g. the right panel
    on a single-column reader section) is left untouched -- data is never dropped with
    nowhere to go.
  * All writes for a series commit in a single transaction.

Dry-run is the default; pass ``--write`` to persist.

    python -m backend.app.migrate_panel_settings_to_columns --series <series_id>
    python -m backend.app.migrate_panel_settings_to_columns --series <series_id> --write
"""

from __future__ import annotations

import argparse
import json
from copy import deepcopy
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from .builder_security import (
    layout_column_count,
    sanitize_page_meta,
    sanitize_section_settings,
)
from .db import SessionLocal
from .models import BuilderPage, BuilderSection


def _clone(value: Any) -> Any:
    return deepcopy(value)


def _reader_section_for_page(page: BuilderPage) -> BuilderSection | None:
    """The section that owns the reader module (mirrors the runtime/_reader_modules_for_page
    rule: the first reader module in section/column/sort order)."""
    for section in sorted(page.sections, key=lambda item: item.sort_index):
        for module in sorted(
            section.modules, key=lambda item: (item.column_index, item.sort_index)
        ):
            if str(module.module_type or "").strip() == "reader":
                return section
    return None


def _column_entry(settings: dict[str, Any], index: int) -> dict[str, Any]:
    """Find (or create) the sparse per-column styling entry for ``index``."""
    columns = settings.setdefault("columns", [])
    for entry in columns:
        if isinstance(entry, dict) and _as_int(entry.get("index")) == index:
            return entry
    entry = {"index": index}
    columns.append(entry)
    return entry


def _as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _sanitized_column(settings: dict[str, Any], layout: str, index: int) -> dict[str, Any]:
    sanitized = sanitize_section_settings(settings, layout)
    for column in sanitized.get("columns") or []:
        if isinstance(column, dict) and _as_int(column.get("index")) == index:
            return column
    return {}


def _sanitized_column_has_field(
    settings: dict[str, Any], layout: str, index: int, field: str
) -> bool:
    return field in _sanitized_column(settings, layout, index)


def project_page_migration(page: BuilderPage) -> dict[str, Any] | None:
    """Compute the migrated reader-section settings + page meta for one page.

    Returns ``None`` when there is nothing to migrate (no reader section, or no legacy
    panel meta with a column to receive it). Pure: it operates on clones and never
    mutates the ORM objects, so it is safe for dry-run reporting.
    """
    reader_section = _reader_section_for_page(page)
    if reader_section is None:
        return None

    meta = _clone(page.meta or {})
    backgrounds = meta.get("panelBackgrounds")
    spacing = meta.get("panelSpacing")
    backgrounds = backgrounds if isinstance(backgrounds, dict) else {}
    spacing = spacing if isinstance(spacing, dict) else {}

    settings = _clone(reader_section.settings or {})
    column_count = layout_column_count(reader_section.layout)
    side_to_index = {"left": 0}
    if column_count >= 2:
        side_to_index["right"] = column_count - 1

    changed_fields: list[str] = []
    for side, index in side_to_index.items():
        entry = _column_entry(settings, index)

        # panelBackground: copy from meta only when the persisted column would not
        # already carry a valid value. Authored column data wins, but only after the
        # sanitizer confirms it will survive the save.
        if (
            side in backgrounds
            and not _sanitized_column_has_field(
                settings, reader_section.layout, index, "panelBackground"
            )
            and isinstance(backgrounds.get(side), dict)
        ):
            entry["panelBackground"] = _clone(backgrounds[side])
            if _sanitized_column_has_field(
                settings, reader_section.layout, index, "panelBackground"
            ):
                changed_fields.append(f"{side}.panelBackground")
        # Clear the legacy meta key only once the sanitized column field is satisfied.
        if side in backgrounds and _sanitized_column_has_field(
            settings, reader_section.layout, index, "panelBackground"
        ):
            del backgrounds[side]
            changed_fields.append(f"{side}.meta.panelBackgrounds(cleared)")

        # panelGap: same rules.
        if (
            side in spacing
            and not _sanitized_column_has_field(settings, reader_section.layout, index, "panelGap")
            and spacing.get(side) not in (None, "")
        ):
            entry["panelGap"] = spacing[side]
            if _sanitized_column_has_field(settings, reader_section.layout, index, "panelGap"):
                changed_fields.append(f"{side}.panelGap")
        if side in spacing and _sanitized_column_has_field(
            settings, reader_section.layout, index, "panelGap"
        ):
            del spacing[side]
            changed_fields.append(f"{side}.meta.panelSpacing(cleared)")

    # Drop emptied meta containers so they don't linger as empty dicts.
    if backgrounds:
        meta["panelBackgrounds"] = backgrounds
    else:
        meta.pop("panelBackgrounds", None)
    if spacing:
        meta["panelSpacing"] = spacing
    else:
        meta.pop("panelSpacing", None)

    if not changed_fields:
        return None

    return {
        "pageId": str(page.id),
        "readerSectionId": str(reader_section.id),
        "changedFields": sorted(changed_fields),
        "nextSettings": sanitize_section_settings(settings, reader_section.layout),
        "nextMeta": sanitize_page_meta(meta),
    }


def migrate_series_panel_settings(db, series_id: str, *, write: bool = False) -> dict[str, Any]:
    pages = db.scalars(
        select(BuilderPage)
        .where(BuilderPage.series_id == series_id)
        .order_by(BuilderPage.sort_index.asc(), BuilderPage.created_at.asc())
        .options(selectinload(BuilderPage.sections).selectinload(BuilderSection.modules))
    ).all()

    changed_page_ids: list[str] = []
    page_reports: list[dict[str, Any]] = []

    for page in pages:
        projected = project_page_migration(page)
        if projected is None:
            continue
        changed_page_ids.append(projected["pageId"])
        page_reports.append(
            {
                "pageId": projected["pageId"],
                "readerSectionId": projected["readerSectionId"],
                "changedFields": projected["changedFields"],
            }
        )
        if write:
            reader_section = next(
                section
                for section in page.sections
                if str(section.id) == projected["readerSectionId"]
            )
            reader_section.settings = projected["nextSettings"]
            page.meta = projected["nextMeta"]

    # Single transaction for the whole series (all-or-nothing).
    if write and changed_page_ids:
        db.commit()

    return {
        "seriesId": series_id,
        "dryRun": not write,
        "scannedPages": len(pages),
        "pagesNeedingChanges": len(changed_page_ids),
        "changedPageIds": changed_page_ids,
        "pageReports": page_reports,
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Migrate legacy page.meta panel background/spacing onto the reader "
            "section's columns (Phase 2 of the panel/column settings consolidation)."
        )
    )
    parser.add_argument("--series", required=True, help="Series id to migrate.")
    parser.add_argument(
        "--write",
        action="store_true",
        help="Persist the migration. Without this flag the command only reports projected changes.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    db = SessionLocal()
    try:
        existing = db.scalar(select(BuilderPage.id).where(BuilderPage.series_id == args.series))
        if existing is None:
            print(
                json.dumps(
                    {
                        "seriesId": args.series,
                        "dryRun": not args.write,
                        "error": "No builder pages found for series.",
                    },
                    ensure_ascii=True,
                    indent=2,
                    sort_keys=True,
                )
            )
            return 1
        summary = migrate_series_panel_settings(db, args.series, write=args.write)
        print(json.dumps(summary, ensure_ascii=True, indent=2, sort_keys=True))
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
