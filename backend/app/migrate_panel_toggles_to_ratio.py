"""One-time migration: reconcile legacy panel enable/disable toggles to the section ratio.

Phase 4 of the Panel/Column Settings Consolidation makes the reader section's column count
the *only* control over whether a panel exists (left = column 0, always; right = the last
column, only when the section has >= 2 columns). The runtime no longer reads the old hide
toggles -- ``section.settings.panelEnabled`` and the reader module's ``config.panels`` -- so a
page that once hid its right panel via a toggle would suddenly *show* an empty right panel.
This script reconciles those pages so their appearance is preserved, then clears the inert
toggle keys.

Semantics (idempotent, never destroys content):
  * A "disabled" panel means ``settings.panelEnabled[side] is False`` and/or the reader
    module has an explicit top-level ``config.panels`` object whose side resolves to disabled.
    Missing panel sides / ``enabled`` values fall back to legacy ``showPanels`` exactly like
    the old backend sanitizer. ``showPanels`` alone is left as inert dead data because the old
    runtime hide path was gated by an explicit ``panels`` object.
  * Removing a right panel means collapsing the reader section to a single column ("1") -- not
    dropping one column, since any 2+ column layout still yields a right panel. This is only
    safe when nothing but the ``reader`` module lives outside column 0 (the ``reader`` module
    renders to the viewport, not a panel, so it is relocated to column 0). Any authored,
    non-reader module outside column 0 blocks the collapse: the page is **flagged for manual
    review** and left completely untouched.
  * A disabled *left* panel has no structural equivalent (the left panel always exists now).
    The stale toggle is dropped and the page is flagged, because the previously hidden left
    panel becomes visible.
  * The inert toggle keys (``panelEnabled`` / ``config.panels``) are cleared on every page the
    migration reconciles. Pages with no disabled toggle are skipped (tolerated dead data).
  * All writes for a series commit in a single transaction.

Dry-run is the default; pass ``--write`` to persist.

    python -m backend.app.migrate_panel_toggles_to_ratio --series <series_id>
    python -m backend.app.migrate_panel_toggles_to_ratio --series <series_id> --write
"""

from __future__ import annotations

import argparse
import json
from copy import deepcopy
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from .builder_history import PAGE_UPDATED, capture_page_snapshot
from .builder_locking import lock_builder_page_scope
from .builder_security import _coerce_bool, layout_column_count, sanitize_section_settings
from .db import SessionLocal
from .models import BuilderModule, BuilderPage, BuilderSection


def _clone(value: Any) -> Any:
    return deepcopy(value)


def _reader_section_and_module(
    page: BuilderPage,
) -> tuple[BuilderSection, BuilderModule] | tuple[None, None]:
    """The section + module for the page's first reader module (section/column/sort order),
    mirroring the runtime rule for which section owns the reader panels."""
    for section in sorted(page.sections, key=lambda item: item.sort_index):
        for module in sorted(
            section.modules, key=lambda item: (item.column_index, item.sort_index)
        ):
            if str(module.module_type or "").strip() == "reader":
                return section, module
    return None, None


def _side_disabled(settings: dict[str, Any], reader_config: dict[str, Any], side: str) -> bool:
    """True when ``side`` is disabled by either legacy toggle (top-level only)."""
    panel_enabled = settings.get("panelEnabled")
    if isinstance(panel_enabled, dict) and panel_enabled.get(side) is False:
        return True
    panels = reader_config.get("panels")
    if isinstance(panels, dict):
        show_panels = _coerce_bool(reader_config.get("showPanels"), True)
        side_config = panels.get(side)
        side_config = side_config if isinstance(side_config, dict) else {}
        if _coerce_bool(side_config.get("enabled"), show_panels) is False:
            return True
    return False


def project_page_migration(page: BuilderPage) -> dict[str, Any] | None:
    """Compute the reconciliation for one page.

    Returns ``None`` when there is nothing to do (no reader section, or no disabled toggle).
    Pure: operates on clones and never mutates ORM objects, so it is safe for dry-run
    reporting. The returned dict's ``action`` is one of ``collapsed`` / ``cleared`` /
    ``flagged``; ``flagged`` carries no ``next*`` payload (nothing is written).
    """
    section, reader_module = _reader_section_and_module(page)
    if section is None:
        return None

    settings = _clone(section.settings or {})
    reader_config = _clone(reader_module.config or {}) if reader_module else {}

    right_disabled = _side_disabled(settings, reader_config, "right")
    left_disabled = _side_disabled(settings, reader_config, "left")
    if not (right_disabled or left_disabled):
        return None

    column_count = layout_column_count(section.layout)
    content_outside_col0 = any(
        str(module.module_type or "").strip() != "reader" and module.column_index >= 1
        for module in section.modules
    )

    flags: list[str] = []
    if left_disabled:
        flags.append("left.disabled-now-visible(review)")

    # Unsafe right-disable: collapsing to one column would orphan authored content, so leave
    # the whole section untouched for manual review (never move or drop content).
    if right_disabled and column_count >= 2 and content_outside_col0:
        flags.append("right.disabled-with-content(manual-review)")
        return {
            "pageId": str(page.id),
            "readerSectionId": str(section.id),
            "action": "flagged",
            "changedFields": [],
            "flags": sorted(flags),
        }

    changed_fields: list[str] = []
    module_moves: list[tuple[str, int]] = []
    next_layout = section.layout

    if right_disabled and column_count >= 2:
        # Safe collapse: relocate the reader module(s) to column 0 (they render to the
        # viewport, not a panel) and drop to a single column so the right panel no longer
        # exists structurally.
        for module in section.modules:
            if module.column_index >= 1:
                module_moves.append((str(module.id), 0))
        next_layout = "1"
        changed_fields.append("layout->1")

    # Clear the now-inert toggle keys wherever they live.
    if isinstance(settings.get("panelEnabled"), dict):
        settings.pop("panelEnabled", None)
        changed_fields.append("panelEnabled(cleared)")
    reader_panels_cleared = isinstance(reader_config.get("panels"), dict)
    if reader_panels_cleared:
        reader_config.pop("panels", None)
        changed_fields.append("config.panels(cleared)")

    if not changed_fields:
        return None

    collapsed = next_layout == "1" and str(section.layout) != "1"
    return {
        "pageId": str(page.id),
        "readerSectionId": str(section.id),
        "action": "collapsed" if collapsed else "cleared",
        "changedFields": sorted(changed_fields),
        "flags": sorted(flags),
        "nextLayout": next_layout,
        "nextSettings": sanitize_section_settings(settings, next_layout),
        "moduleMoves": module_moves,
        "readerModuleId": (
            str(reader_module.id) if (reader_module and reader_panels_cleared) else None
        ),
        "nextReaderConfig": reader_config if reader_panels_cleared else None,
    }


def _apply_projection(section: BuilderSection, projected: dict[str, Any]) -> None:
    section.layout = projected["nextLayout"]
    section.settings = projected["nextSettings"]
    moves = {module_id: index for module_id, index in projected["moduleMoves"]}
    reader_module_id = projected["readerModuleId"]
    next_reader_config = projected["nextReaderConfig"]
    for module in section.modules:
        module_id = str(module.id)
        if module_id in moves:
            module.column_index = moves[module_id]
        if reader_module_id is not None and module_id == reader_module_id:
            module.config = next_reader_config


def migrate_series_panel_toggles(db, series_id: str, *, write: bool = False) -> dict[str, Any]:
    query = (
        select(BuilderPage)
        .where(BuilderPage.series_id == series_id)
        .options(selectinload(BuilderPage.sections).selectinload(BuilderSection.modules))
    )
    query = (
        query.order_by(BuilderPage.id.asc()).with_for_update()
        if write
        else query.order_by(BuilderPage.sort_index.asc(), BuilderPage.created_at.asc())
    )
    try:
        if write:
            lock_builder_page_scope(db, "series", series_id)
        pages = db.scalars(query).all()
    except Exception:
        db.rollback()
        raise

    changed_page_ids: list[str] = []
    flagged_page_ids: list[str] = []
    page_reports: list[dict[str, Any]] = []
    projections: list[tuple[BuilderPage, dict[str, Any]]] = []

    try:
        for page in pages:
            projected = project_page_migration(page)
            if projected is None:
                continue

            page_reports.append(
                {
                    "pageId": projected["pageId"],
                    "readerSectionId": projected["readerSectionId"],
                    "action": projected["action"],
                    "changedFields": projected["changedFields"],
                    "flags": projected["flags"],
                }
            )

            if projected["action"] == "flagged":
                flagged_page_ids.append(projected["pageId"])
                continue

            projections.append((page, projected))
            changed_page_ids.append(projected["pageId"])
            if projected["flags"]:
                flagged_page_ids.append(projected["pageId"])
        if write:
            for page, _ in projections:
                capture_page_snapshot(db, page.id, PAGE_UPDATED, None)
        for page, projected in projections:
            if not write:
                continue
            section = next(
                item for item in page.sections if str(item.id) == projected["readerSectionId"]
            )
            _apply_projection(section, projected)

        # Single transaction for the whole series (all-or-nothing).
        if write:
            if changed_page_ids:
                db.commit()
            else:
                db.rollback()
    except Exception:
        db.rollback()
        raise

    return {
        "seriesId": series_id,
        "dryRun": not write,
        "scannedPages": len(pages),
        "pagesChanged": len(changed_page_ids),
        "pagesFlagged": len(flagged_page_ids),
        "changedPageIds": changed_page_ids,
        "flaggedPageIds": flagged_page_ids,
        "pageReports": page_reports,
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Reconcile legacy panel enable/disable toggles to the reader section's column "
            "ratio (Phase 4 of the panel/column settings consolidation)."
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
        summary = migrate_series_panel_toggles(db, args.series, write=args.write)
        print(json.dumps(summary, ensure_ascii=True, indent=2, sort_keys=True))
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
