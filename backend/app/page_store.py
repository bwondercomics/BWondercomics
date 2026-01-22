"""Business logic for the page builder feature."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .models import BuilderModule, BuilderPage, BuilderSection
from .series_store import DEFAULT_SERIES_ID, sanitize_series_id


def _now() -> datetime:
    return datetime.now(timezone.utc)


# Page operations


def list_pages(db: Session, series_id: str | None) -> list[dict[str, Any]]:
    """List all pages for a series."""
    sid = sanitize_series_id(series_id) if series_id else DEFAULT_SERIES_ID
    pages = db.scalars(
        select(BuilderPage)
        .where(BuilderPage.series_id == sid)
        .order_by(BuilderPage.sort_index.asc(), BuilderPage.created_at.asc())
    ).all()
    return [
        {
            "id": str(page.id),
            "seriesId": page.series_id,
            "slug": page.slug,
            "title": page.title,
            "pageType": page.page_type,
            "isPublished": page.is_published,
            "isHomepage": page.is_homepage,
            "sortIndex": page.sort_index,
            "meta": page.meta,
            "createdAt": page.created_at.isoformat() if page.created_at else None,
            "updatedAt": page.updated_at.isoformat() if page.updated_at else None,
        }
        for page in pages
    ]


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

    return {
        "id": str(page.id),
        "seriesId": page.series_id,
        "slug": page.slug,
        "title": page.title,
        "pageType": page.page_type,
        "isPublished": page.is_published,
        "isHomepage": page.is_homepage,
        "sortIndex": page.sort_index,
        "meta": page.meta,
        "createdAt": page.created_at.isoformat() if page.created_at else None,
        "updatedAt": page.updated_at.isoformat() if page.updated_at else None,
        "sections": [
            {
                "id": str(section.id),
                "sectionType": section.section_type,
                "layout": section.layout,
                "sortIndex": section.sort_index,
                "settings": section.settings,
                "modules": [
                    {
                        "id": str(module.id),
                        "moduleType": module.module_type,
                        "columnIndex": module.column_index,
                        "sortIndex": module.sort_index,
                        "config": module.config,
                    }
                    for module in sorted(
                        section.modules, key=lambda m: (m.column_index, m.sort_index)
                    )
                ],
            }
            for section in sorted(page.sections, key=lambda s: s.sort_index)
        ],
    }


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

    return {
        "id": str(page.id),
        "seriesId": page.series_id,
        "slug": page.slug,
        "title": page.title,
        "pageType": page.page_type,
        "isPublished": page.is_published,
        "isHomepage": page.is_homepage,
        "meta": page.meta,
        "sections": [
            {
                "id": str(section.id),
                "sectionType": section.section_type,
                "layout": section.layout,
                "settings": section.settings,
                "modules": [
                    {
                        "id": str(module.id),
                        "moduleType": module.module_type,
                        "columnIndex": module.column_index,
                        "sortIndex": module.sort_index,
                        "config": module.config,
                    }
                    for module in sorted(
                        section.modules, key=lambda m: (m.column_index, m.sort_index)
                    )
                ],
            }
            for section in sorted(page.sections, key=lambda s: s.sort_index)
        ],
    }


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
        meta=data.get("meta") or {},
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
        page.meta = data["meta"]

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

    section = BuilderSection(
        page_id=pid,
        section_type=str(data.get("sectionType") or "row").strip()[:30],
        layout=str(data.get("layout") or "1").strip()[:50],
        sort_index=data.get("sortIndex") if "sortIndex" in data else max_sort + 1,
        settings=data.get("settings") or {},
        created_at=now,
    )
    db.add(section)

    page.updated_at = now
    db.commit()

    return {
        "id": str(section.id),
        "sectionType": section.section_type,
        "layout": section.layout,
        "sortIndex": section.sort_index,
        "settings": section.settings,
        "modules": [],
    }


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

    if "sectionType" in data:
        section.section_type = str(data["sectionType"]).strip()[:30]
    if "layout" in data:
        section.layout = str(data["layout"]).strip()[:50]
    if "sortIndex" in data:
        section.sort_index = int(data["sortIndex"])
    if "settings" in data and isinstance(data["settings"], dict):
        section.settings = data["settings"]

    page = db.get(BuilderPage, section.page_id)
    if page:
        page.updated_at = _now()

    db.commit()

    return {
        "id": str(section.id),
        "sectionType": section.section_type,
        "layout": section.layout,
        "sortIndex": section.sort_index,
        "settings": section.settings,
        "modules": [
            {
                "id": str(m.id),
                "moduleType": m.module_type,
                "columnIndex": m.column_index,
                "sortIndex": m.sort_index,
                "config": m.config,
            }
            for m in sorted(section.modules, key=lambda m: (m.column_index, m.sort_index))
        ],
    }


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
    column_index = int(data.get("columnIndex") or 0)

    max_sort = (
        db.scalar(
            select(BuilderModule.sort_index)
            .where(BuilderModule.section_id == sid, BuilderModule.column_index == column_index)
            .order_by(BuilderModule.sort_index.desc())
        )
        or 0
    )

    module = BuilderModule(
        section_id=sid,
        module_type=str(data.get("moduleType") or "text").strip()[:50],
        column_index=column_index,
        sort_index=data.get("sortIndex") if "sortIndex" in data else max_sort + 1,
        config=data.get("config") or {},
        created_at=now,
        updated_at=now,
    )
    db.add(module)

    page = db.get(BuilderPage, section.page_id)
    if page:
        page.updated_at = now

    db.commit()

    return {
        "id": str(module.id),
        "moduleType": module.module_type,
        "columnIndex": module.column_index,
        "sortIndex": module.sort_index,
        "config": module.config,
    }


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

    if "moduleType" in data:
        module.module_type = str(data["moduleType"]).strip()[:50]
    if "columnIndex" in data:
        module.column_index = int(data["columnIndex"])
    if "sortIndex" in data:
        module.sort_index = int(data["sortIndex"])
    if "config" in data and isinstance(data["config"], dict):
        module.config = data["config"]

    module.updated_at = now

    section = db.get(BuilderSection, module.section_id)
    if section:
        page = db.get(BuilderPage, section.page_id)
        if page:
            page.updated_at = now

    db.commit()

    return {
        "id": str(module.id),
        "moduleType": module.module_type,
        "columnIndex": module.column_index,
        "sortIndex": module.sort_index,
        "config": module.config,
    }


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

    module.section_id = target_sid
    module.column_index = column_index
    module.sort_index = sort_index
    module.updated_at = now

    page = db.get(BuilderPage, target_section.page_id)
    if page:
        page.updated_at = now

    db.commit()

    return {
        "id": str(module.id),
        "moduleType": module.module_type,
        "columnIndex": module.column_index,
        "sortIndex": module.sort_index,
        "config": module.config,
    }


def reorder_modules(db: Session, section_id: str, column_index: int, module_ids: list[str]) -> bool:
    """Reorder modules within a section column."""
    try:
        sid = uuid.UUID(section_id)
    except ValueError:
        return False

    for index, module_id in enumerate(module_ids):
        try:
            mid = uuid.UUID(module_id)
        except ValueError:
            continue
        module = db.get(BuilderModule, mid)
        if module and module.section_id == sid and module.column_index == column_index:
            module.sort_index = index

    section = db.get(BuilderSection, sid)
    if section:
        page = db.get(BuilderPage, section.page_id)
        if page:
            page.updated_at = _now()

    db.commit()
    return True
