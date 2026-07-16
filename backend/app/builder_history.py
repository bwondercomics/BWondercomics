"""Transaction-owned persistence helpers for builder page recovery history."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from .builder_security import (
    sanitize_page_meta,
    sanitize_section_settings,
    validate_column_index,
    validate_layout,
    validate_module_type,
    validate_section_type,
    validate_sort_index,
)
from .models import (
    BuilderPage,
    BuilderPageSnapshot,
    BuilderSection,
)
from .reader_bindings import (
    PAGE_SCOPE_GLOBAL,
    PAGE_SCOPE_SERIES,
    _sanitize_module_config_for_page,
    sanitize_binding_role,
    sanitize_page_scope,
)

SNAPSHOT_PAYLOAD_VERSION = 1
SNAPSHOT_RETENTION = 30

PAGE_CREATED = "page_created"
PAGE_UPDATED = "page_updated"
PAGE_DELETED = "page_deleted"
PAGE_REORDERED = "page_reordered"
BINDINGS_UPDATED = "bindings_updated"
SECTION_ADDED = "section_added"
SECTION_UPDATED = "section_updated"
SECTION_DELETED = "section_deleted"
SECTIONS_REORDERED = "sections_reordered"
MODULE_ADDED = "module_added"
MODULE_UPDATED = "module_updated"
MODULE_DELETED = "module_deleted"
MODULE_MOVED = "module_moved"
MODULES_REORDERED = "modules_reordered"
MODULE_PLACEMENTS_SAVED = "module_placements_saved"
PRE_RESTORE = "pre_restore"

SNAPSHOT_ACTIONS = frozenset(
    {
        PAGE_CREATED,
        PAGE_UPDATED,
        PAGE_DELETED,
        PAGE_REORDERED,
        BINDINGS_UPDATED,
        SECTION_ADDED,
        SECTION_UPDATED,
        SECTION_DELETED,
        SECTIONS_REORDERED,
        MODULE_ADDED,
        MODULE_UPDATED,
        MODULE_DELETED,
        MODULE_MOVED,
        MODULES_REORDERED,
        MODULE_PLACEMENTS_SAVED,
        PRE_RESTORE,
    }
)


def _ordered(items: list[Any], *attributes: str) -> list[Any]:
    return sorted(
        items,
        key=lambda item: tuple(getattr(item, attribute) for attribute in attributes)
        + (str(item.id),),
    )


def serialize_builder_page_recovery(db: Session, page: BuilderPage) -> dict[str, Any]:
    """Build a strict, sanitized version-1 recovery document from ORM records."""
    del db  # Kept in the API for future payload adapters that need database context.
    scope = sanitize_page_scope(page.scope)
    if (scope == PAGE_SCOPE_GLOBAL and page.series_id is not None) or (
        scope == PAGE_SCOPE_SERIES and not page.series_id
    ):
        raise ValueError("Stored page has inconsistent scope and series id")

    sections: list[dict[str, Any]] = []
    for section in _ordered(page.sections, "sort_index"):
        section_type = validate_section_type(section.section_type)
        layout = validate_layout(section.layout)
        sort_index = validate_sort_index(section.sort_index)
        modules: list[dict[str, Any]] = []
        for module in _ordered(section.modules, "column_index", "sort_index"):
            module_type = validate_module_type(module.module_type)
            modules.append(
                {
                    "id": str(module.id),
                    "moduleType": module_type,
                    "columnIndex": validate_column_index(module.column_index, layout),
                    "sortIndex": validate_sort_index(module.sort_index),
                    "config": _sanitize_module_config_for_page(page, module_type, module.config),
                }
            )
        sections.append(
            {
                "id": str(section.id),
                "sectionType": section_type,
                "layout": layout,
                "sortIndex": sort_index,
                "settings": sanitize_section_settings(section.settings, layout),
                "modules": modules,
            }
        )

    bindings = [
        {
            "seriesId": str(binding.series_id),
            "role": sanitize_binding_role(binding.role),
        }
        for binding in _ordered(page.bindings, "series_id", "role")
    ]
    return {
        "snapshotVersion": SNAPSHOT_PAYLOAD_VERSION,
        "page": {
            "id": str(page.id),
            "scope": scope,
            "seriesId": page.series_id,
            "slug": str(page.slug),
            "title": str(page.title),
            "pageType": str(page.page_type),
            "isPublished": bool(page.is_published),
            "isHomepage": bool(page.is_homepage),
            "sortIndex": validate_sort_index(page.sort_index),
            "meta": sanitize_page_meta(page.meta),
            "sections": sections,
        },
        "bindings": bindings,
    }


def hash_recovery_payload(payload: dict[str, Any]) -> str:
    """Return the SHA-256 of compact, sorted-key UTF-8 recovery JSON."""
    serialized = json.dumps(
        payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")
    return hashlib.sha256(serialized).hexdigest()


def capture_page_snapshot(
    db: Session,
    page_id: uuid.UUID | str,
    action: str,
    actor_user_id: uuid.UUID | None = None,
) -> BuilderPageSnapshot | None:
    """Insert and prune one snapshot without committing the owning transaction."""
    if action not in SNAPSHOT_ACTIONS:
        raise ValueError(f"Unsupported builder snapshot action: {action}")
    try:
        parsed_page_id = page_id if isinstance(page_id, uuid.UUID) else uuid.UUID(str(page_id))
    except ValueError as exc:
        raise ValueError("Snapshot page id must be a valid UUID") from exc

    page = db.scalar(
        select(BuilderPage)
        .where(BuilderPage.id == parsed_page_id)
        .options(
            selectinload(BuilderPage.sections).selectinload(BuilderSection.modules),
            selectinload(BuilderPage.bindings),
        )
    )
    if not page:
        raise ValueError("Cannot snapshot a missing builder page")

    payload = serialize_builder_page_recovery(db, page)
    payload_hash = hash_recovery_payload(payload)
    latest = db.scalar(
        select(BuilderPageSnapshot)
        .where(BuilderPageSnapshot.page_id == page.id)
        .order_by(BuilderPageSnapshot.created_at.desc(), BuilderPageSnapshot.id.desc())
        .limit(1)
    )
    if latest and latest.payload_hash == payload_hash:
        return None

    snapshot = BuilderPageSnapshot(
        page_id=page.id,
        scope=page.scope,
        series_id=page.series_id,
        slug=page.slug,
        action=action,
        created_by_user_id=actor_user_id,
        payload_version=SNAPSHOT_PAYLOAD_VERSION,
        payload=payload,
        payload_hash=payload_hash,
        created_at=datetime.now(timezone.utc),
    )
    db.add(snapshot)
    db.flush()

    expired_ids = db.scalars(
        select(BuilderPageSnapshot.id)
        .where(BuilderPageSnapshot.page_id == page.id)
        .order_by(BuilderPageSnapshot.created_at.desc(), BuilderPageSnapshot.id.desc())
        .offset(SNAPSHOT_RETENTION)
    ).all()
    if expired_ids:
        db.execute(delete(BuilderPageSnapshot).where(BuilderPageSnapshot.id.in_(expired_ids)))
    return snapshot
