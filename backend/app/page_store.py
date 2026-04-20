"""Business logic for the page builder feature."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .builder_security import (
    ALLOWED_MODULE_TYPES,
    sanitize_module_config,
    sanitize_page_meta,
    sanitize_section_settings,
    validate_column_index,
    validate_layout,
    validate_module_type,
    validate_section_type,
    validate_sort_index,
)
from .models import BuilderModule, BuilderPage, BuilderSection
from .series_store import DEFAULT_SERIES_ID, sanitize_series_id


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _serialize_module(module: BuilderModule) -> dict[str, Any]:
    try:
        module_type = validate_module_type(module.module_type)
    except ValueError:
        module_type = str(module.module_type or "unknown").strip()[:50] or "unknown"
    return {
        "id": str(module.id),
        "moduleType": module_type,
        "columnIndex": max(0, int(module.column_index or 0)),
        "sortIndex": max(0, int(module.sort_index or 0)),
        "config": sanitize_module_config(module_type, module.config)
        if module_type in ALLOWED_MODULE_TYPES
        else {},
    }


def _serialize_section(section: BuilderSection) -> dict[str, Any]:
    try:
        layout = validate_layout(section.layout)
    except ValueError:
        layout = "1"
    try:
        section_type = validate_section_type(section.section_type)
    except ValueError:
        section_type = "row"
    modules = []
    for module in sorted(section.modules, key=lambda m: (m.column_index, m.sort_index)):
        try:
            validate_column_index(module.column_index, layout)
        except ValueError:
            continue
        modules.append(_serialize_module(module))
    return {
        "id": str(section.id),
        "sectionType": section_type,
        "layout": layout,
        "sortIndex": max(0, int(section.sort_index or 0)),
        "settings": sanitize_section_settings(section.settings),
        "modules": modules,
    }


def _serialize_page(page: BuilderPage, include_sort_index: bool = True) -> dict[str, Any]:
    payload = {
        "id": str(page.id),
        "seriesId": page.series_id,
        "slug": page.slug,
        "title": page.title,
        "pageType": page.page_type,
        "isPublished": page.is_published,
        "isHomepage": page.is_homepage,
        "meta": sanitize_page_meta(page.meta),
        "createdAt": page.created_at.isoformat() if page.created_at else None,
        "updatedAt": page.updated_at.isoformat() if page.updated_at else None,
    }
    if include_sort_index:
        payload["sortIndex"] = page.sort_index
    return payload


# Page operations


def list_pages(db: Session, series_id: str | None) -> list[dict[str, Any]]:
    """List all pages for a series."""
    sid = sanitize_series_id(series_id) if series_id else DEFAULT_SERIES_ID
    pages = db.scalars(
        select(BuilderPage)
        .where(BuilderPage.series_id == sid)
        .order_by(BuilderPage.sort_index.asc(), BuilderPage.created_at.asc())
    ).all()
    return [_serialize_page(page) for page in pages]


def get_page(db: Session, page_id: str) -> dict[str, Any] | None:
    """Get a single page with all sections and modules."""
    try:
        pid = uuid.UUID(page_id)
    except ValueError:
        return None

    page = db.scalar(
        select(BuilderPage)
        .where(BuilderPage.id == pid)
        .options(selectinload(BuilderPage.sections).selectinload(BuilderSection.modules))
    )
    if not page:
        return None

    payload = _serialize_page(page)
    payload["sections"] = [
        _serialize_section(section)
        for section in sorted(page.sections, key=lambda s: s.sort_index)
    ]
    return payload


def get_page_by_slug(db: Session, series_id: str | None, slug: str) -> dict[str, Any] | None:
    """Get a page by series and slug (for public rendering)."""
    sid = sanitize_series_id(series_id) if series_id else DEFAULT_SERIES_ID

    page = db.scalar(
        select(BuilderPage)
        .where(BuilderPage.series_id == sid, BuilderPage.slug == slug)
        .options(selectinload(BuilderPage.sections).selectinload(BuilderSection.modules))
    )
    if not page:
        return None

    payload = _serialize_page(page, include_sort_index=False)
    payload["sections"] = [
        _serialize_section(section)
        for section in sorted(page.sections, key=lambda s: s.sort_index)
    ]
    return payload


def get_homepage_page(
    db: Session,
    series_id: str | None,
    *,
    published_only: bool = False,
) -> dict[str, Any] | None:
    """Resolve the homepage page for a series, falling back to the reader page."""
    sid = sanitize_series_id(series_id) if series_id else DEFAULT_SERIES_ID

    def load_page(*filters: Any) -> BuilderPage | None:
        return db.scalar(
            select(BuilderPage)
            .where(BuilderPage.series_id == sid, *filters)
            .options(selectinload(BuilderPage.sections).selectinload(BuilderSection.modules))
        )

    visibility_filters: list[Any] = []
    if published_only:
        visibility_filters.append(BuilderPage.is_published == True)  # noqa: E712

    page = load_page(BuilderPage.is_homepage == True, *visibility_filters)  # noqa: E712
    if not page:
        page = load_page(BuilderPage.slug == "reader", *visibility_filters)
    if not page:
        return None

    payload = _serialize_page(page, include_sort_index=False)
    payload["sections"] = [
        _serialize_section(section)
        for section in sorted(page.sections, key=lambda s: s.sort_index)
    ]
    return payload


def create_page(db: Session, series_id: str | None, data: dict[str, Any]) -> dict[str, Any]:
    """Create a new page."""
    sid = sanitize_series_id(series_id) if series_id else DEFAULT_SERIES_ID
    now = _now()

    slug = str(data.get("slug") or "").strip().lower()
    if not slug:
        raise ValueError("Page slug is required")
    slug = slug[:100]

    existing = db.scalar(
        select(BuilderPage).where(BuilderPage.series_id == sid, BuilderPage.slug == slug)
    )
    if existing:
        raise ValueError(f"Page with slug '{slug}' already exists")

    title = str(data.get("title") or slug.replace("-", " ").title()).strip()[:200]
    page_type = str(data.get("pageType") or "custom").strip()[:30]
    is_homepage = bool(data.get("isHomepage", False))

    if is_homepage:
        db.execute(
            BuilderPage.__table__.update()
            .where(BuilderPage.series_id == sid, BuilderPage.is_homepage == True)  # noqa: E712
            .values(is_homepage=False)
        )

    max_sort = (
        db.scalar(
            select(BuilderPage.sort_index)
            .where(BuilderPage.series_id == sid)
            .order_by(BuilderPage.sort_index.desc())
        )
        or 0
    )

    page = BuilderPage(
        series_id=sid,
        slug=slug,
        title=title,
        page_type=page_type,
        is_published=bool(data.get("isPublished", False)),
        is_homepage=is_homepage,
        sort_index=max_sort + 1,
        meta=sanitize_page_meta(data.get("meta") or {}),
        created_at=now,
        updated_at=now,
    )
    db.add(page)
    db.commit()

    return get_page(db, str(page.id)) or {}


def update_page(db: Session, page_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
    """Update page metadata."""
    try:
        pid = uuid.UUID(page_id)
    except ValueError:
        return None

    page = db.get(BuilderPage, pid)
    if not page:
        return None

    now = _now()

    if "title" in data:
        page.title = str(data["title"]).strip()[:200]
    if "slug" in data:
        new_slug = str(data["slug"]).strip().lower()[:100]
        if new_slug and new_slug != page.slug:
            existing = db.scalar(
                select(BuilderPage).where(
                    BuilderPage.series_id == page.series_id,
                    BuilderPage.slug == new_slug,
                    BuilderPage.id != pid,
                )
            )
            if existing:
                raise ValueError(f"Page with slug '{new_slug}' already exists")
            page.slug = new_slug
    if "pageType" in data:
        page.page_type = str(data["pageType"]).strip()[:30]
    if "isPublished" in data:
        page.is_published = bool(data["isPublished"])
    if "isHomepage" in data:
        if data["isHomepage"] and not page.is_homepage:
            db.execute(
                BuilderPage.__table__.update()
                .where(BuilderPage.series_id == page.series_id, BuilderPage.is_homepage == True)  # noqa: E712
                .values(is_homepage=False)
            )
        page.is_homepage = bool(data["isHomepage"])
    if "meta" in data and isinstance(data["meta"], dict):
        page.meta = sanitize_page_meta(data["meta"])

    page.updated_at = now
    db.commit()

    return get_page(db, page_id)


def delete_page(db: Session, page_id: str) -> bool:
    """Delete a page and all its sections/modules."""
    try:
        pid = uuid.UUID(page_id)
    except ValueError:
        return False

    page = db.get(BuilderPage, pid)
    if not page:
        return False

    db.delete(page)
    db.commit()
    return True


def reorder_pages(db: Session, series_id: str | None, page_ids: list[str]) -> bool:
    """Reorder pages by updating sort_index."""
    sid = sanitize_series_id(series_id) if series_id else DEFAULT_SERIES_ID

    for index, page_id in enumerate(page_ids):
        try:
            pid = uuid.UUID(page_id)
        except ValueError:
            continue
        page = db.get(BuilderPage, pid)
        if page and page.series_id == sid:
            page.sort_index = index

    db.commit()
    return True


# Section operations


def add_section(db: Session, page_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
    """Add a section to a page."""
    try:
        pid = uuid.UUID(page_id)
    except ValueError:
        return None

    page = db.get(BuilderPage, pid)
    if not page:
        return None

    now = _now()

    max_sort = (
        db.scalar(
            select(BuilderSection.sort_index)
            .where(BuilderSection.page_id == pid)
            .order_by(BuilderSection.sort_index.desc())
        )
        or 0
    )

    section_type = validate_section_type(data.get("sectionType") or "row")
    layout = validate_layout(data.get("layout") or "1")
    sort_index = (
        validate_sort_index(data["sortIndex"]) if "sortIndex" in data else max_sort + 1
    )

    section = BuilderSection(
        page_id=pid,
        section_type=section_type,
        layout=layout,
        sort_index=sort_index,
        settings=sanitize_section_settings(data.get("settings") or {}),
        created_at=now,
    )
    db.add(section)

    page.updated_at = now
    db.commit()

    return _serialize_section(section)


def update_section(db: Session, section_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
    """Update a section."""
    try:
        sid = uuid.UUID(section_id)
    except ValueError:
        return None

    section = db.scalar(
        select(BuilderSection)
        .where(BuilderSection.id == sid)
        .options(selectinload(BuilderSection.modules))
    )
    if not section:
        return None

    next_layout = (
        validate_layout(data["layout"]) if "layout" in data else validate_layout(section.layout)
    )
    if "layout" in data:
        for module in section.modules:
            validate_column_index(module.column_index, next_layout)
    if "sectionType" in data:
        section.section_type = validate_section_type(data["sectionType"])
    if "layout" in data:
        section.layout = next_layout
    if "sortIndex" in data:
        section.sort_index = validate_sort_index(data["sortIndex"])
    if "settings" in data and isinstance(data["settings"], dict):
        section.settings = sanitize_section_settings(data["settings"])

    page = db.get(BuilderPage, section.page_id)
    if page:
        page.updated_at = _now()

    db.commit()

    return _serialize_section(section)


def delete_section(db: Session, section_id: str) -> bool:
    """Delete a section and all its modules."""
    try:
        sid = uuid.UUID(section_id)
    except ValueError:
        return False

    section = db.get(BuilderSection, sid)
    if not section:
        return False

    page = db.get(BuilderPage, section.page_id)
    if page:
        page.updated_at = _now()

    db.delete(section)
    db.commit()
    return True


def reorder_sections(db: Session, page_id: str, section_ids: list[str]) -> bool:
    """Reorder sections within a page."""
    try:
        pid = uuid.UUID(page_id)
    except ValueError:
        return False

    for index, section_id in enumerate(section_ids):
        try:
            sid = uuid.UUID(section_id)
        except ValueError:
            continue
        section = db.get(BuilderSection, sid)
        if section and section.page_id == pid:
            section.sort_index = index

    page = db.get(BuilderPage, pid)
    if page:
        page.updated_at = _now()

    db.commit()
    return True


# Module operations


def add_module(db: Session, section_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
    """Add a module to a section."""
    try:
        sid = uuid.UUID(section_id)
    except ValueError:
        return None

    section = db.get(BuilderSection, sid)
    if not section:
        return None

    now = _now()
    layout = validate_layout(section.layout)
    module_type = validate_module_type(data.get("moduleType") or "text")
    column_index = validate_column_index(data.get("columnIndex") or 0, layout)

    max_sort = (
        db.scalar(
            select(BuilderModule.sort_index)
            .where(BuilderModule.section_id == sid, BuilderModule.column_index == column_index)
            .order_by(BuilderModule.sort_index.desc())
        )
        or 0
    )

    sort_index = (
        validate_sort_index(data["sortIndex"]) if "sortIndex" in data else max_sort + 1
    )
    module = BuilderModule(
        section_id=sid,
        module_type=module_type,
        column_index=column_index,
        sort_index=sort_index,
        config=sanitize_module_config(module_type, data.get("config") or {}),
        created_at=now,
        updated_at=now,
    )
    db.add(module)

    page = db.get(BuilderPage, section.page_id)
    if page:
        page.updated_at = now

    db.commit()

    return _serialize_module(module)


def update_module(db: Session, module_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
    """Update a module's config."""
    try:
        mid = uuid.UUID(module_id)
    except ValueError:
        return None

    module = db.get(BuilderModule, mid)
    if not module:
        return None

    now = _now()

    section = db.get(BuilderSection, module.section_id)
    layout = validate_layout(section.layout) if section else "1"
    next_type = validate_module_type(data["moduleType"]) if "moduleType" in data else validate_module_type(module.module_type)
    if "moduleType" in data:
        module.module_type = next_type
    if "columnIndex" in data:
        module.column_index = validate_column_index(data["columnIndex"], layout)
    if "sortIndex" in data:
        module.sort_index = validate_sort_index(data["sortIndex"])
    if "config" in data and isinstance(data["config"], dict):
        module.config = sanitize_module_config(next_type, data["config"])

    module.updated_at = now

    if section:
        page = db.get(BuilderPage, section.page_id)
        if page:
            page.updated_at = now

    db.commit()

    return _serialize_module(module)


def delete_module(db: Session, module_id: str) -> bool:
    """Delete a module."""
    try:
        mid = uuid.UUID(module_id)
    except ValueError:
        return False

    module = db.get(BuilderModule, mid)
    if not module:
        return False

    section = db.get(BuilderSection, module.section_id)
    if section:
        page = db.get(BuilderPage, section.page_id)
        if page:
            page.updated_at = _now()

    db.delete(module)
    db.commit()
    return True


def move_module(
    db: Session, module_id: str, target_section_id: str, column_index: int, sort_index: int
) -> dict[str, Any] | None:
    """Move a module to a different section/column."""
    try:
        mid = uuid.UUID(module_id)
        target_sid = uuid.UUID(target_section_id)
    except ValueError:
        return None

    module = db.get(BuilderModule, mid)
    if not module:
        return None

    target_section = db.get(BuilderSection, target_sid)
    if not target_section:
        return None

    now = _now()
    layout = validate_layout(target_section.layout)

    module.section_id = target_sid
    module.column_index = validate_column_index(column_index, layout)
    module.sort_index = validate_sort_index(sort_index)
    module.updated_at = now

    page = db.get(BuilderPage, target_section.page_id)
    if page:
        page.updated_at = now

    db.commit()

    return _serialize_module(module)


def reorder_modules(db: Session, section_id: str, column_index: int, module_ids: list[str]) -> bool:
    """Reorder modules within a section column."""
    try:
        sid = uuid.UUID(section_id)
    except ValueError:
        return False

    section = db.get(BuilderSection, sid)
    if not section:
        return False
    validate_column_index(column_index, validate_layout(section.layout))

    for index, module_id in enumerate(module_ids):
        try:
            mid = uuid.UUID(module_id)
        except ValueError:
            continue
        module = db.get(BuilderModule, mid)
        if module and module.section_id == sid and module.column_index == column_index:
            module.sort_index = index

    if section:
        page = db.get(BuilderPage, section.page_id)
        if page:
            page.updated_at = _now()

    db.commit()
    return True
