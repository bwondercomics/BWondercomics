"""Business logic for the page builder feature."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from functools import wraps
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .builder_history import (
    BINDINGS_UPDATED,
    MODULE_ADDED,
    MODULE_DELETED,
    MODULE_MOVED,
    MODULE_PLACEMENTS_SAVED,
    MODULE_UPDATED,
    MODULES_REORDERED,
    PAGE_CREATED,
    PAGE_DELETED,
    PAGE_REORDERED,
    PAGE_UPDATED,
    SECTION_ADDED,
    SECTION_DELETED,
    SECTION_UPDATED,
    SECTIONS_REORDERED,
    capture_page_snapshot,
)
from .builder_locking import lock_builder_page_scope
from .builder_security import (
    ALLOWED_MODULE_TYPES,
    layout_column_count,
    sanitize_page_meta,
    sanitize_section_settings,
    validate_column_index,
    validate_layout,
    validate_module_type,
    validate_section_type,
    validate_sort_index,
)
from .models import BuilderModule, BuilderPage, BuilderPageBinding, BuilderSection
from .reader_bindings import (
    BINDING_ROLE_READER,
    PAGE_SCOPE_GLOBAL,
    PAGE_SCOPE_SERIES,
    _ensure_reader_binding_for_page,
    _page_can_bind_to_series,
    _page_has_reader_binding,
    _raise_for_invalid_reader_binding,
    _reader_binding_module_warnings,
    _sanitize_module_config_for_page,
    sanitize_binding_role,
    sanitize_page_scope,
)
from .reader_bindings import (
    PageBuilderValidationError as PageBuilderValidationError,
)
from .series_store import DEFAULT_SERIES_ID, sanitize_series_id


class ColumnShrinkConflictError(Exception):
    """Raised when reducing a section's column count would orphan modules.

    The backend is the authority for layout changes — a direct API call must not
    silently rehome or drop a removed column's content (modules, or the panel
    background/spacing now stored on the column). A shrink that would leave modules
    in a to-be-removed column is rejected; the caller must clear them first. An empty
    removed column is allowed (an intentional collapse).
    """


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _rollback_on_error(function):
    """Rollback the request-owned transaction whenever a mutation fails."""

    @wraps(function)
    def wrapped(db: Session, *args, **kwargs):
        try:
            return function(db, *args, **kwargs)
        except Exception:
            db.rollback()
            raise

    return wrapped


def _lock_pages(db: Session, page_ids: list[uuid.UUID] | set[uuid.UUID]) -> list[BuilderPage]:
    """Lock and fully load pages in deterministic UUID order."""
    ordered_ids = sorted(set(page_ids), key=str)
    if not ordered_ids:
        return []
    return list(
        db.scalars(
            select(BuilderPage)
            .where(BuilderPage.id.in_(ordered_ids))
            .order_by(BuilderPage.id.asc())
            .with_for_update()
            .execution_options(populate_existing=True)
            .options(
                selectinload(BuilderPage.sections).selectinload(BuilderSection.modules),
                selectinload(BuilderPage.bindings),
            )
        ).all()
    )


def _capture_pages(
    db: Session,
    pages: list[BuilderPage],
    action: str,
    actor_user_id: uuid.UUID | None,
) -> None:
    for page in sorted(pages, key=lambda item: str(item.id)):
        capture_page_snapshot(db, page.id, action, actor_user_id)


def _lock_page_bindings(
    db: Session,
    *,
    series_id: str | None = None,
    page_ids: set[uuid.UUID] | None = None,
) -> list[BuilderPageBinding]:
    """Lock affected binding rows in stable series/role/UUID order."""
    query = select(BuilderPageBinding)
    if series_id is not None:
        query = query.where(BuilderPageBinding.series_id == series_id)
    if page_ids is not None:
        if not page_ids:
            return []
        query = query.where(BuilderPageBinding.page_id.in_(page_ids))
    return list(
        db.scalars(
            query.order_by(
                BuilderPageBinding.series_id.asc(),
                BuilderPageBinding.role.asc(),
                BuilderPageBinding.id.asc(),
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        ).all()
    )


def _serialize_module(module: BuilderModule, page: BuilderPage | None = None) -> dict[str, Any]:
    try:
        module_type = validate_module_type(module.module_type)
    except ValueError:
        module_type = str(module.module_type or "unknown").strip()[:50] or "unknown"
    return {
        "id": str(module.id),
        "moduleType": module_type,
        "columnIndex": max(0, int(module.column_index or 0)),
        "sortIndex": max(0, int(module.sort_index or 0)),
        "config": _sanitize_module_config_for_page(page, module_type, module.config)
        if module_type in ALLOWED_MODULE_TYPES
        else {},
    }


def _serialize_section(section: BuilderSection, page: BuilderPage | None = None) -> dict[str, Any]:
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
        modules.append(_serialize_module(module, page))
    return {
        "id": str(section.id),
        "sectionType": section_type,
        "layout": layout,
        "sortIndex": max(0, int(section.sort_index or 0)),
        "settings": sanitize_section_settings(section.settings, layout),
        "modules": modules,
    }


def _serialize_page(page: BuilderPage, include_sort_index: bool = True) -> dict[str, Any]:
    scope = sanitize_page_scope(page.scope)
    payload = {
        "id": str(page.id),
        "scope": scope,
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


def _normalize_slug(raw: str | None) -> str:
    slug = str(raw or "").strip().lower()[:100]
    if not slug:
        raise ValueError("Page slug is required")
    return slug


def _require_series_id(series_id: str | None) -> str:
    if not series_id:
        raise ValueError("Series pages require a series id")
    return sanitize_series_id(series_id)


def _scope_filters(scope: str, series_id: str | None = None) -> list[Any]:
    if scope == PAGE_SCOPE_GLOBAL:
        return [BuilderPage.scope == PAGE_SCOPE_GLOBAL, BuilderPage.series_id.is_(None)]
    return [
        BuilderPage.scope == PAGE_SCOPE_SERIES,
        BuilderPage.series_id == _require_series_id(series_id),
    ]


def _load_page_with_content(db: Session, *filters: Any) -> BuilderPage | None:
    return db.scalar(
        select(BuilderPage)
        .where(*filters)
        .options(selectinload(BuilderPage.sections).selectinload(BuilderSection.modules))
    )


def _load_page_model_with_content(db: Session, page_id: uuid.UUID) -> BuilderPage | None:
    return _load_page_with_content(db, BuilderPage.id == page_id)


def _serialize_page_with_sections(
    page: BuilderPage, include_sort_index: bool = True
) -> dict[str, Any]:
    payload = _serialize_page(page, include_sort_index=include_sort_index)
    payload["sections"] = [
        _serialize_section(section, page)
        for section in sorted(page.sections, key=lambda s: s.sort_index)
    ]
    return payload


def _find_page_by_slug(
    db: Session,
    scope: str,
    series_id: str | None,
    slug: str,
    exclude_page_id: uuid.UUID | None = None,
) -> BuilderPage | None:
    filters = [*_scope_filters(scope, series_id), BuilderPage.slug == slug]
    if exclude_page_id:
        filters.append(BuilderPage.id != exclude_page_id)
    return db.scalar(select(BuilderPage).where(*filters))


def _unset_homepages(
    db: Session, scope: str, series_id: str | None, exclude_page_id: uuid.UUID | None = None
) -> None:
    filters = [*_scope_filters(scope, series_id), BuilderPage.is_homepage == True]  # noqa: E712
    if exclude_page_id:
        filters.append(BuilderPage.id != exclude_page_id)
    db.execute(BuilderPage.__table__.update().where(*filters).values(is_homepage=False))


def _next_sort_index(db: Session, scope: str, series_id: str | None) -> int:
    return (
        db.scalar(
            select(BuilderPage.sort_index)
            .where(*_scope_filters(scope, series_id))
            .order_by(BuilderPage.sort_index.desc())
        )
        or 0
    ) + 1


def _would_add_reader_binding(
    db: Session,
    page: BuilderPage,
    *,
    slug: str | None = None,
    page_type: str | None = None,
) -> bool:
    if sanitize_page_scope(page.scope) != PAGE_SCOPE_SERIES or not page.series_id:
        return False
    if (slug if slug is not None else page.slug) != "reader" and (
        page_type if page_type is not None else page.page_type
    ) != "reader":
        return False
    if _reader_binding_module_warnings(page, page.series_id):
        return False
    return (
        db.scalar(
            select(BuilderPageBinding.id).where(
                BuilderPageBinding.series_id == page.series_id,
                BuilderPageBinding.role == BINDING_ROLE_READER,
            )
        )
        is None
    )


def list_scoped_pages(
    db: Session,
    scope: str,
    series_id: str | None = None,
) -> list[dict[str, Any]]:
    """List all pages for a page scope."""
    safe_scope = sanitize_page_scope(scope)
    pages = db.scalars(
        select(BuilderPage)
        .where(*_scope_filters(safe_scope, series_id))
        .order_by(BuilderPage.sort_index.asc(), BuilderPage.created_at.asc())
    ).all()
    return [_serialize_page(page) for page in pages]


def list_pages(db: Session, series_id: str | None) -> list[dict[str, Any]]:
    """Compatibility list for series pages."""
    return list_scoped_pages(db, PAGE_SCOPE_SERIES, series_id or DEFAULT_SERIES_ID)


def list_global_pages(db: Session) -> list[dict[str, Any]]:
    """List global pages."""
    return list_scoped_pages(db, PAGE_SCOPE_GLOBAL)


def list_series_pages(db: Session, series_id: str | None) -> list[dict[str, Any]]:
    """List series pages."""
    return list_scoped_pages(db, PAGE_SCOPE_SERIES, series_id)


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

    return _serialize_page_with_sections(page)


def get_scoped_page_by_slug(
    db: Session,
    scope: str,
    series_id: str | None,
    slug: str,
) -> dict[str, Any] | None:
    """Get a page by explicit scope and slug."""
    safe_scope = sanitize_page_scope(scope)
    page = _load_page_with_content(
        db, *_scope_filters(safe_scope, series_id), BuilderPage.slug == slug
    )
    if not page:
        return None
    return _serialize_page_with_sections(page, include_sort_index=False)


def get_page_by_slug(db: Session, series_id: str | None, slug: str) -> dict[str, Any] | None:
    """Compatibility series page lookup by slug."""
    return get_scoped_page_by_slug(db, PAGE_SCOPE_SERIES, series_id or DEFAULT_SERIES_ID, slug)


def get_global_page_by_slug(db: Session, slug: str) -> dict[str, Any] | None:
    """Get a global page by slug."""
    return get_scoped_page_by_slug(db, PAGE_SCOPE_GLOBAL, None, slug)


def get_bound_page(
    db: Session,
    series_id: str | None,
    role: str,
    *,
    published_only: bool = False,
) -> BuilderPage | None:
    """Load the page bound to a series route role."""
    sid = _require_series_id(series_id)
    safe_role = sanitize_binding_role(role)
    filters: list[Any] = [
        BuilderPageBinding.series_id == sid,
        BuilderPageBinding.role == safe_role,
    ]
    if published_only:
        filters.append(BuilderPage.is_published == True)  # noqa: E712
    page = db.scalar(
        select(BuilderPage)
        .join(BuilderPageBinding, BuilderPageBinding.page_id == BuilderPage.id)
        .where(*filters)
        .options(selectinload(BuilderPage.sections).selectinload(BuilderSection.modules))
    )
    if not page or not _page_can_bind_to_series(page, sid, safe_role):
        return None
    if safe_role == BINDING_ROLE_READER and _reader_binding_module_warnings(page, sid):
        return None
    return page


def get_homepage_page(
    db: Session,
    series_id: str | None,
    *,
    published_only: bool = False,
) -> dict[str, Any] | None:
    """Resolve the homepage page for a series, falling back to the reader binding."""
    sid = _require_series_id(series_id or DEFAULT_SERIES_ID)

    filters: list[Any] = [
        *_scope_filters(PAGE_SCOPE_SERIES, sid),
        BuilderPage.is_homepage == True,  # noqa: E712
    ]
    if published_only:
        filters.append(BuilderPage.is_published == True)  # noqa: E712

    page = _load_page_with_content(db, *filters)
    if not page:
        page = get_bound_page(db, sid, BINDING_ROLE_READER, published_only=published_only)
    if not page:
        return None

    return _serialize_page_with_sections(page, include_sort_index=False)


@_rollback_on_error
def create_scoped_page(
    db: Session,
    scope: str,
    series_id: str | None,
    data: dict[str, Any],
    *,
    actor_user_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    """Create a new page in an explicit scope."""
    safe_scope = sanitize_page_scope(scope)
    sid = _require_series_id(series_id) if safe_scope == PAGE_SCOPE_SERIES else None
    slug = _normalize_slug(data.get("slug"))
    title = str(data.get("title") or slug.replace("-", " ").title()).strip()[:200]
    page_type = str(data.get("pageType") or "custom").strip()[:30]
    is_published = bool(data.get("isPublished", False))
    is_homepage = bool(data.get("isHomepage", False))
    meta = sanitize_page_meta(data.get("meta") or {})

    lock_builder_page_scope(db, safe_scope, sid)

    scope_pages = list(
        db.scalars(
            select(BuilderPage)
            .where(*_scope_filters(safe_scope, sid))
            .order_by(BuilderPage.id.asc())
            .with_for_update()
            .execution_options(populate_existing=True)
            .options(
                selectinload(BuilderPage.sections).selectinload(BuilderSection.modules),
                selectinload(BuilderPage.bindings),
            )
        ).all()
    )
    if sid is not None:
        _lock_page_bindings(db, series_id=sid)
    if any(page.slug == slug for page in scope_pages):
        raise ValueError(f"Page with slug '{slug}' already exists")

    now = _now()
    displaced_homepages = [page for page in scope_pages if is_homepage and page.is_homepage]
    _capture_pages(db, displaced_homepages, PAGE_UPDATED, actor_user_id)
    for displaced in displaced_homepages:
        displaced.is_homepage = False
        displaced.updated_at = now

    page = BuilderPage(
        scope=safe_scope,
        series_id=sid,
        slug=slug,
        title=title,
        page_type=page_type,
        is_published=is_published,
        is_homepage=is_homepage,
        sort_index=_next_sort_index(db, safe_scope, sid),
        meta=meta,
        created_at=now,
        updated_at=now,
    )
    db.add(page)
    db.flush()
    _ensure_reader_binding_for_page(db, page)
    capture_page_snapshot(db, page.id, PAGE_CREATED, actor_user_id)
    db.commit()

    return get_page(db, str(page.id)) or {}


def create_page(
    db: Session,
    series_id: str | None,
    data: dict[str, Any],
    *,
    actor_user_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    """Compatibility create for series pages."""
    return create_scoped_page(
        db,
        PAGE_SCOPE_SERIES,
        series_id or DEFAULT_SERIES_ID,
        data,
        actor_user_id=actor_user_id,
    )


@_rollback_on_error
def update_page(
    db: Session,
    page_id: str,
    data: dict[str, Any],
    *,
    actor_user_id: uuid.UUID | None = None,
) -> dict[str, Any] | None:
    """Update page metadata."""
    try:
        pid = uuid.UUID(page_id)
    except ValueError:
        return None

    sanitized_updates: dict[str, Any] = {}
    if "title" in data:
        sanitized_updates["title"] = str(data["title"]).strip()[:200]
    if "slug" in data:
        sanitized_updates["slug"] = _normalize_slug(data["slug"])
    if "pageType" in data:
        sanitized_updates["pageType"] = str(data["pageType"]).strip()[:30]
    if "isPublished" in data:
        sanitized_updates["isPublished"] = bool(data["isPublished"])
    if "isHomepage" in data:
        sanitized_updates["isHomepage"] = bool(data["isHomepage"])
    if "meta" in data and isinstance(data["meta"], dict):
        sanitized_updates["meta"] = sanitize_page_meta(data["meta"])

    initial = db.get(BuilderPage, pid)
    if not initial:
        db.rollback()
        return None
    scope = sanitize_page_scope(initial.scope)
    lock_builder_page_scope(db, scope, initial.series_id)
    scope_pages = list(
        db.scalars(
            select(BuilderPage)
            .where(*_scope_filters(scope, initial.series_id))
            .order_by(BuilderPage.id.asc())
            .with_for_update()
            .execution_options(populate_existing=True)
            .options(
                selectinload(BuilderPage.sections).selectinload(BuilderSection.modules),
                selectinload(BuilderPage.bindings),
            )
        ).all()
    )
    if initial.series_id is not None:
        _lock_page_bindings(db, series_id=initial.series_id)
    page = next((item for item in scope_pages if item.id == pid), None)
    if not page:
        db.rollback()
        return None

    if sanitized_updates.get("isPublished") is True and _page_has_reader_binding(db, page):
        _raise_for_invalid_reader_binding(page, _require_series_id(page.series_id))

    next_title = sanitized_updates.get("title", page.title)
    next_slug = sanitized_updates.get("slug", page.slug)
    if next_slug != page.slug and any(
        item.id != pid and item.slug == next_slug for item in scope_pages
    ):
        raise ValueError(f"Page with slug '{next_slug}' already exists")
    next_page_type = sanitized_updates.get("pageType", page.page_type)
    next_published = sanitized_updates.get("isPublished", page.is_published)
    next_homepage = sanitized_updates.get("isHomepage", page.is_homepage)
    next_meta = sanitized_updates.get("meta", page.meta)
    displaced_homepages = [
        item
        for item in scope_pages
        if next_homepage and not page.is_homepage and item.id != pid and item.is_homepage
    ]
    page_changed = (
        next_title != page.title
        or next_slug != page.slug
        or next_page_type != page.page_type
        or next_published != page.is_published
        or next_homepage != page.is_homepage
        or next_meta != page.meta
    )
    binding_will_be_added = _would_add_reader_binding(
        db,
        page,
        slug=next_slug,
        page_type=next_page_type,
    )
    if not page_changed and not displaced_homepages and not binding_will_be_added:
        response = get_page(db, page_id)
        db.rollback()
        return response

    _capture_pages(db, [page], PAGE_UPDATED, actor_user_id)
    _capture_pages(db, displaced_homepages, PAGE_UPDATED, actor_user_id)
    now = _now()
    for displaced in displaced_homepages:
        displaced.is_homepage = False
        displaced.updated_at = now

    page.title = next_title
    page.slug = next_slug
    page.page_type = next_page_type
    page.is_published = next_published
    page.is_homepage = next_homepage
    page.meta = next_meta
    page.updated_at = now
    _ensure_reader_binding_for_page(db, page)
    db.commit()

    return get_page(db, page_id)


@_rollback_on_error
def delete_page(db: Session, page_id: str, *, actor_user_id: uuid.UUID | None = None) -> bool:
    """Delete a page and all its sections/modules."""
    try:
        pid = uuid.UUID(page_id)
    except ValueError:
        return False

    initial = db.get(BuilderPage, pid)
    if not initial:
        db.rollback()
        return False
    scope = sanitize_page_scope(initial.scope)
    lock_builder_page_scope(db, scope, initial.series_id)
    pages = _lock_pages(db, [pid])
    page = pages[0] if pages else None
    if not page:
        db.rollback()
        return False

    _lock_page_bindings(db, page_ids={page.id})
    capture_page_snapshot(db, page.id, PAGE_DELETED, actor_user_id)
    db.delete(page)
    db.commit()
    return True


@_rollback_on_error
def reorder_scoped_pages(
    db: Session,
    scope: str,
    series_id: str | None,
    page_ids: list[str],
    *,
    actor_user_id: uuid.UUID | None = None,
) -> bool:
    """Reorder pages inside one page scope."""
    safe_scope = sanitize_page_scope(scope)
    sid = _require_series_id(series_id) if safe_scope == PAGE_SCOPE_SERIES else None

    parsed_ids: list[uuid.UUID] = []
    seen_ids: set[uuid.UUID] = set()
    for page_id in page_ids:
        try:
            pid = uuid.UUID(page_id)
        except ValueError as exc:
            raise ValueError("Page reorder contains an invalid page id") from exc
        if pid in seen_ids:
            raise ValueError("Page reorder contains duplicate page ids")
        seen_ids.add(pid)
        parsed_ids.append(pid)

    lock_builder_page_scope(db, safe_scope, sid)
    pages = db.scalars(
        select(BuilderPage)
        .where(*_scope_filters(safe_scope, sid))
        .order_by(BuilderPage.id.asc())
        .with_for_update()
        .execution_options(populate_existing=True)
        .options(
            selectinload(BuilderPage.sections).selectinload(BuilderSection.modules),
            selectinload(BuilderPage.bindings),
        )
    ).all()
    pages_by_id = {page.id: page for page in pages}
    if set(parsed_ids) != set(pages_by_id):
        raise ValueError("Page reorder must include exactly the active scope pages")

    changed_pages = [
        pages_by_id[pid]
        for index, pid in enumerate(parsed_ids)
        if pages_by_id[pid].sort_index != index
    ]
    if not changed_pages:
        db.rollback()
        return True
    _capture_pages(db, changed_pages, PAGE_REORDERED, actor_user_id)
    now = _now()
    for index, pid in enumerate(parsed_ids):
        page = pages_by_id[pid]
        if page.sort_index != index:
            page.sort_index = index
            page.updated_at = now

    db.commit()
    return True


def reorder_pages(
    db: Session,
    series_id: str | None,
    page_ids: list[str],
    *,
    actor_user_id: uuid.UUID | None = None,
) -> bool:
    """Compatibility reorder for series pages."""
    return reorder_scoped_pages(
        db,
        PAGE_SCOPE_SERIES,
        series_id or DEFAULT_SERIES_ID,
        page_ids,
        actor_user_id=actor_user_id,
    )


def get_page_bindings(db: Session, series_id: str | None) -> dict[str, Any]:
    """Return route-role page bindings and setup warnings for a series."""
    sid = _require_series_id(series_id)
    binding_rows = db.scalars(
        select(BuilderPageBinding)
        .where(BuilderPageBinding.series_id == sid)
        .options(
            selectinload(BuilderPageBinding.page)
            .selectinload(BuilderPage.sections)
            .selectinload(BuilderSection.modules)
        )
        .order_by(BuilderPageBinding.role.asc())
    ).all()

    bindings: dict[str, Any] = {}
    warnings: list[dict[str, str]] = []
    for binding in binding_rows:
        role = sanitize_binding_role(binding.role)
        page = binding.page
        if not page or not _page_can_bind_to_series(page, sid, role):
            warnings.append(
                {
                    "role": role,
                    "code": f"{role}_binding_invalid",
                    "message": f"The {role} page binding points to an invalid page.",
                }
            )
            continue
        bindings[role] = {
            "role": role,
            "pageId": str(page.id),
            "page": _serialize_page(page, include_sort_index=False),
        }
        if role == BINDING_ROLE_READER:
            warnings.extend(_reader_binding_module_warnings(page, sid))
            if not page.is_published:
                warnings.append(
                    {
                        "role": role,
                        "code": "reader_page_unpublished",
                        "message": "The bound reader page is not published.",
                    }
                )

    if BINDING_ROLE_READER not in bindings:
        warnings.append(
            {
                "role": BINDING_ROLE_READER,
                "code": "missing_reader_binding",
                "message": "This series is missing a reader page binding.",
            }
        )

    return {"seriesId": sid, "bindings": bindings, "warnings": warnings}


@_rollback_on_error
def update_page_bindings(
    db: Session,
    series_id: str | None,
    bindings: dict[str, str | None],
    *,
    actor_user_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    """Update page bindings for one series."""
    sid = _require_series_id(series_id)
    validated: dict[str, uuid.UUID | None] = {}
    for raw_role, raw_page_id in (bindings or {}).items():
        role = sanitize_binding_role(raw_role)
        if raw_page_id in (None, ""):
            validated[role] = None
            continue
        try:
            pid = uuid.UUID(str(raw_page_id))
        except ValueError as exc:
            raise ValueError(f"Invalid page id for {role} binding") from exc
        validated[role] = pid

    lock_builder_page_scope(db, PAGE_SCOPE_SERIES, sid)

    initial_existing_rows = list(
        db.scalars(
            select(BuilderPageBinding)
            .where(BuilderPageBinding.series_id == sid)
            .order_by(BuilderPageBinding.role.asc())
        ).all()
    )
    initial_existing_by_role = {row.role: row for row in initial_existing_rows}
    affected_ids = {
        row.page_id
        for role, row in initial_existing_by_role.items()
        if role in validated and validated[role] != row.page_id
    }
    affected_ids.update(
        page_id
        for role, page_id in validated.items()
        if page_id is not None
        and (
            role not in initial_existing_by_role
            or initial_existing_by_role[role].page_id != page_id
        )
    )
    requested_ids = {page_id for page_id in validated.values() if page_id is not None}
    locked_pages = _lock_pages(db, affected_ids | requested_ids)
    pages_by_id = {page.id: page for page in locked_pages}
    existing_rows = list(
        db.scalars(
            select(BuilderPageBinding)
            .where(BuilderPageBinding.series_id == sid)
            .order_by(BuilderPageBinding.role.asc())
            .with_for_update()
            .execution_options(populate_existing=True)
        ).all()
    )
    existing_by_role = {row.role: row for row in existing_rows}
    affected_ids = {
        row.page_id
        for role, row in existing_by_role.items()
        if role in validated and validated[role] != row.page_id
    }
    affected_ids.update(
        page_id
        for role, page_id in validated.items()
        if page_id is not None
        and (role not in existing_by_role or existing_by_role[role].page_id != page_id)
    )

    for role, pid in validated.items():
        if pid is None:
            continue
        page = pages_by_id.get(pid)
        if not page or not _page_can_bind_to_series(page, sid, role):
            raise ValueError(f"Page cannot be used for {role} binding")
        if role == BINDING_ROLE_READER:
            _raise_for_invalid_reader_binding(page, sid)

    changed_roles = [
        role
        for role, pid in validated.items()
        if (existing_by_role.get(role).page_id if existing_by_role.get(role) else None) != pid
    ]
    if not changed_roles:
        response = get_page_bindings(db, sid)
        db.rollback()
        return response

    _capture_pages(
        db,
        [page for page in locked_pages if page.id in affected_ids],
        BINDINGS_UPDATED,
        actor_user_id,
    )
    now = _now()
    for role in changed_roles:
        pid = validated[role]
        existing = existing_by_role.get(role)
        if pid is None:
            if existing:
                db.delete(existing)
            continue
        if existing:
            existing.page_id = pid
            existing.updated_at = now
        else:
            db.add(
                BuilderPageBinding(
                    series_id=sid,
                    role=role,
                    page_id=pid,
                    created_at=now,
                    updated_at=now,
                )
            )

    db.commit()
    return get_page_bindings(db, sid)


# Section operations


@_rollback_on_error
def add_section(
    db: Session,
    page_id: str,
    data: dict[str, Any],
    *,
    actor_user_id: uuid.UUID | None = None,
) -> dict[str, Any] | None:
    """Add a section to a page."""
    try:
        pid = uuid.UUID(page_id)
    except ValueError:
        return None

    pages = _lock_pages(db, [pid])
    page = pages[0] if pages else None
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
    sort_index = validate_sort_index(data["sortIndex"]) if "sortIndex" in data else max_sort + 1

    section = BuilderSection(
        page_id=pid,
        section_type=section_type,
        layout=layout,
        sort_index=sort_index,
        settings=sanitize_section_settings(data.get("settings") or {}, layout),
        created_at=now,
    )
    capture_page_snapshot(db, page.id, SECTION_ADDED, actor_user_id)
    db.add(section)

    page.updated_at = now
    db.commit()

    return _serialize_section(section)


@_rollback_on_error
def update_section(
    db: Session,
    section_id: str,
    data: dict[str, Any],
    *,
    actor_user_id: uuid.UUID | None = None,
) -> dict[str, Any] | None:
    """Update a section."""
    try:
        sid = uuid.UUID(section_id)
    except ValueError:
        return None

    initial = db.get(BuilderSection, sid)
    if not initial:
        return None
    pages = _lock_pages(db, [initial.page_id])
    if not pages:
        return None
    page = pages[0]
    section = next((item for item in page.sections if item.id == sid), None)
    if not section:
        return None

    next_layout = (
        validate_layout(data["layout"]) if "layout" in data else validate_layout(section.layout)
    )
    previous_column_count = layout_column_count(section.layout)
    next_column_count = layout_column_count(next_layout)
    if "layout" in data and next_column_count < previous_column_count:
        # Reject a column-count reduction that would orphan modules in a removed
        # column. Silently rehoming them (the previous behavior) loses the column's
        # placement and its panel art/spacing; the caller must clear those modules
        # first. Empty removed columns are allowed (an intentional collapse).
        orphaned_modules = [
            module for module in section.modules if module.column_index >= next_column_count
        ]
        if orphaned_modules:
            raise ColumnShrinkConflictError(
                "Cannot reduce the column count while a to-be-removed column still has "
                "modules. Move or delete those modules first."
            )
    next_type = (
        validate_section_type(data["sectionType"])
        if "sectionType" in data
        else validate_section_type(section.section_type)
    )
    next_sort_index = (
        validate_sort_index(data["sortIndex"])
        if "sortIndex" in data
        else validate_sort_index(section.sort_index)
    )
    next_settings = (
        sanitize_section_settings(data["settings"], next_layout)
        if "settings" in data and isinstance(data["settings"], dict)
        else sanitize_section_settings(section.settings, next_layout)
    )
    if (
        next_type == section.section_type
        and next_layout == section.layout
        and next_sort_index == section.sort_index
        and next_settings == section.settings
    ):
        return _serialize_section(section, page)

    capture_page_snapshot(db, page.id, SECTION_UPDATED, actor_user_id)
    section.section_type = next_type
    section.layout = next_layout
    section.sort_index = next_sort_index
    section.settings = next_settings
    page.updated_at = _now()

    db.commit()

    return _serialize_section(section)


@_rollback_on_error
def delete_section(db: Session, section_id: str, *, actor_user_id: uuid.UUID | None = None) -> bool:
    """Delete a section and all its modules."""
    try:
        sid = uuid.UUID(section_id)
    except ValueError:
        return False

    initial = db.get(BuilderSection, sid)
    if not initial:
        return False
    pages = _lock_pages(db, [initial.page_id])
    if not pages:
        return False
    page = pages[0]
    section = next((item for item in page.sections if item.id == sid), None)
    if not section:
        return False

    capture_page_snapshot(db, page.id, SECTION_DELETED, actor_user_id)
    page.updated_at = _now()
    db.delete(section)
    db.commit()
    return True


@_rollback_on_error
def reorder_sections(
    db: Session,
    page_id: str,
    section_ids: list[str],
    *,
    actor_user_id: uuid.UUID | None = None,
) -> bool:
    """Reorder sections within a page."""
    try:
        pid = uuid.UUID(page_id)
    except ValueError:
        return False

    parsed_ids: list[uuid.UUID] = []
    seen_ids: set[uuid.UUID] = set()
    for section_id in section_ids:
        try:
            sid = uuid.UUID(section_id)
        except ValueError as exc:
            raise ValueError("Section reorder contains an invalid section id") from exc
        if sid in seen_ids:
            raise ValueError("Section reorder contains duplicate section ids")
        seen_ids.add(sid)
        parsed_ids.append(sid)

    pages = _lock_pages(db, [pid])
    page = pages[0] if pages else None
    if not page:
        return False
    sections_by_id = {section.id: section for section in page.sections}
    if set(parsed_ids) != set(sections_by_id):
        raise ValueError("Section reorder must include exactly the page sections")
    changed = [
        sections_by_id[sid]
        for index, sid in enumerate(parsed_ids)
        if sections_by_id[sid].sort_index != index
    ]
    if not changed:
        return True

    capture_page_snapshot(db, page.id, SECTIONS_REORDERED, actor_user_id)
    for index, sid in enumerate(parsed_ids):
        sections_by_id[sid].sort_index = index
    page.updated_at = _now()

    db.commit()
    return True


# Module operations


@_rollback_on_error
def add_module(
    db: Session,
    section_id: str,
    data: dict[str, Any],
    *,
    actor_user_id: uuid.UUID | None = None,
) -> dict[str, Any] | None:
    """Add a module to a section."""
    try:
        sid = uuid.UUID(section_id)
    except ValueError:
        return None

    initial = db.get(BuilderSection, sid)
    if not initial:
        return None
    pages = _lock_pages(db, [initial.page_id])
    if not pages:
        return None
    page = pages[0]
    section = next((item for item in page.sections if item.id == sid), None)
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

    sort_index = validate_sort_index(data["sortIndex"]) if "sortIndex" in data else max_sort + 1
    module = BuilderModule(
        section_id=sid,
        module_type=module_type,
        column_index=column_index,
        sort_index=sort_index,
        config=_sanitize_module_config_for_page(page, module_type, data.get("config") or {}),
        created_at=now,
        updated_at=now,
    )
    capture_page_snapshot(db, page.id, MODULE_ADDED, actor_user_id)
    db.add(module)

    page.updated_at = now

    db.commit()

    return _serialize_module(module, page)


@_rollback_on_error
def update_module(
    db: Session,
    module_id: str,
    data: dict[str, Any],
    *,
    actor_user_id: uuid.UUID | None = None,
) -> dict[str, Any] | None:
    """Update a module's config."""
    try:
        mid = uuid.UUID(module_id)
    except ValueError:
        return None

    initial = db.get(BuilderModule, mid)
    if not initial:
        return None
    initial_section = db.get(BuilderSection, initial.section_id)
    if not initial_section:
        return None
    pages = _lock_pages(db, [initial_section.page_id])
    if not pages:
        return None
    page = pages[0]
    section = next(
        (item for item in page.sections if item.id == initial.section_id),
        None,
    )
    module = next((item for item in section.modules if item.id == mid), None) if section else None
    if not section or not module:
        return None
    layout = validate_layout(section.layout)
    next_type = (
        validate_module_type(data["moduleType"])
        if "moduleType" in data
        else validate_module_type(module.module_type)
    )
    next_column_index = (
        validate_column_index(data["columnIndex"], layout)
        if "columnIndex" in data
        else validate_column_index(module.column_index, layout)
    )
    next_sort_index = (
        validate_sort_index(data["sortIndex"])
        if "sortIndex" in data
        else validate_sort_index(module.sort_index)
    )
    proposed_config = (
        data["config"]
        if "config" in data and isinstance(data["config"], dict)
        else module.config or {}
    )
    next_config = _sanitize_module_config_for_page(page, next_type, proposed_config)

    if (
        next_type == module.module_type
        and next_column_index == module.column_index
        and next_sort_index == module.sort_index
        and next_config == module.config
    ):
        return _serialize_module(module, page)

    capture_page_snapshot(db, page.id, MODULE_UPDATED, actor_user_id)
    now = _now()
    module.module_type = next_type
    module.column_index = next_column_index
    module.sort_index = next_sort_index
    module.config = next_config

    module.updated_at = now

    page.updated_at = now

    db.commit()

    return _serialize_module(module, page)


@_rollback_on_error
def delete_module(db: Session, module_id: str, *, actor_user_id: uuid.UUID | None = None) -> bool:
    """Delete a module."""
    try:
        mid = uuid.UUID(module_id)
    except ValueError:
        return False

    initial = db.get(BuilderModule, mid)
    if not initial:
        return False
    initial_section = db.get(BuilderSection, initial.section_id)
    if not initial_section:
        return False
    pages = _lock_pages(db, [initial_section.page_id])
    if not pages:
        return False
    page = pages[0]
    section = next((item for item in page.sections if item.id == initial.section_id), None)
    module = next((item for item in section.modules if item.id == mid), None) if section else None
    if not module:
        return False

    capture_page_snapshot(db, page.id, MODULE_DELETED, actor_user_id)
    page.updated_at = _now()
    db.delete(module)
    db.commit()
    return True


@_rollback_on_error
def move_module(
    db: Session,
    module_id: str,
    target_section_id: str,
    column_index: int,
    sort_index: int,
    *,
    actor_user_id: uuid.UUID | None = None,
) -> dict[str, Any] | None:
    """Move a module to a different section/column."""
    try:
        mid = uuid.UUID(module_id)
        target_sid = uuid.UUID(target_section_id)
    except ValueError:
        return None

    initial_module = db.get(BuilderModule, mid)
    if not initial_module:
        return None
    source_section = db.get(BuilderSection, initial_module.section_id)
    initial_target = db.get(BuilderSection, target_sid)
    if not source_section or not initial_target:
        return None
    if source_section.page_id != initial_target.page_id:
        raise ValueError("Modules can only move between sections on the same page")
    pages = _lock_pages(db, [source_section.page_id])
    if not pages:
        return None
    page = pages[0]
    target_section = next((item for item in page.sections if item.id == target_sid), None)
    source_section = next(
        (item for item in page.sections if item.id == initial_module.section_id), None
    )
    module = (
        next((item for item in source_section.modules if item.id == mid), None)
        if source_section
        else None
    )
    if not target_section or not module:
        return None

    layout = validate_layout(target_section.layout)

    # Validate before mutating so a rejected column index cannot leave a
    # half-applied move (e.g. a changed section_id) on the session.
    next_column_index = validate_column_index(column_index, layout)
    next_sort_index = validate_sort_index(sort_index)
    if (
        module.section_id == target_sid
        and module.column_index == next_column_index
        and module.sort_index == next_sort_index
    ):
        return _serialize_module(module, page)

    capture_page_snapshot(db, page.id, MODULE_MOVED, actor_user_id)
    now = _now()
    module.section_id = target_sid
    module.column_index = next_column_index
    module.sort_index = next_sort_index
    module.updated_at = now

    page.updated_at = now

    db.commit()

    return _serialize_module(module, page)


@_rollback_on_error
def reorder_modules(
    db: Session,
    section_id: str,
    column_index: int,
    module_ids: list[str],
    *,
    actor_user_id: uuid.UUID | None = None,
) -> bool:
    """Reorder modules within a section column."""
    try:
        sid = uuid.UUID(section_id)
    except ValueError:
        return False

    initial = db.get(BuilderSection, sid)
    if not initial:
        return False
    pages = _lock_pages(db, [initial.page_id])
    if not pages:
        return False
    page = pages[0]
    section = next((item for item in page.sections if item.id == sid), None)
    if not section:
        return False
    validate_column_index(column_index, validate_layout(section.layout))

    parsed_ids: list[uuid.UUID] = []
    seen_ids: set[uuid.UUID] = set()
    for module_id in module_ids:
        try:
            mid = uuid.UUID(module_id)
        except ValueError as exc:
            raise ValueError("Module reorder contains an invalid module id") from exc
        if mid in seen_ids:
            raise ValueError("Module reorder contains duplicate module ids")
        seen_ids.add(mid)
        parsed_ids.append(mid)
    column_modules = [module for module in section.modules if module.column_index == column_index]
    modules_by_id = {module.id: module for module in column_modules}
    if set(parsed_ids) != set(modules_by_id):
        raise ValueError("Module reorder must include exactly the section-column modules")
    if all(modules_by_id[mid].sort_index == index for index, mid in enumerate(parsed_ids)):
        return True

    capture_page_snapshot(db, page.id, MODULES_REORDERED, actor_user_id)
    for index, mid in enumerate(parsed_ids):
        modules_by_id[mid].sort_index = index
        modules_by_id[mid].updated_at = _now()
    page.updated_at = _now()

    db.commit()
    return True


@_rollback_on_error
def save_module_placements(
    db: Session,
    page_id: str,
    placements: list[dict[str, Any]],
    *,
    actor_user_id: uuid.UUID | None = None,
) -> dict[str, Any] | None:
    """Atomically replace every module placement on one page.

    Validation is deliberately completed before any ORM fields change: a malformed batch
    cannot persist a partial arrow-move draft. The list must describe each current module once.
    """
    try:
        pid = uuid.UUID(page_id)
    except ValueError:
        return None
    pages = _lock_pages(db, [pid])
    page = pages[0] if pages else None
    if not page:
        return None
    if not isinstance(placements, list):
        raise ValueError("Placements must be a list")

    sections_by_id = {section.id: section for section in page.sections}
    modules_by_id = {module.id: module for section in page.sections for module in section.modules}
    if len(placements) != len(modules_by_id):
        raise ValueError("Placements must include every page module exactly once")

    validated: list[tuple[BuilderModule, BuilderSection, int, int]] = []
    seen_modules: set[uuid.UUID] = set()
    seen_positions: set[tuple[uuid.UUID, int, int]] = set()
    for placement in placements:
        if not isinstance(placement, dict):
            raise ValueError("Each placement must be an object")
        try:
            module_id = uuid.UUID(str(placement.get("moduleId") or ""))
            section_id = uuid.UUID(str(placement.get("sectionId") or ""))
        except ValueError as exc:
            raise ValueError("Placement moduleId and sectionId must be valid IDs") from exc
        if module_id in seen_modules:
            raise ValueError("Placements contain a duplicate module")
        module = modules_by_id.get(module_id)
        if not module:
            raise ValueError("Placement module does not belong to this page")
        section = sections_by_id.get(section_id)
        if not section:
            raise ValueError("Placement section does not belong to this page")
        column_index = validate_column_index(
            placement.get("columnIndex"), validate_layout(section.layout)
        )
        sort_index = validate_sort_index(placement.get("sortIndex"))
        position = (section_id, column_index, sort_index)
        if position in seen_positions:
            raise ValueError("Placements contain a duplicate position")
        seen_modules.add(module_id)
        seen_positions.add(position)
        validated.append((module, section, column_index, sort_index))

    if seen_modules != set(modules_by_id):
        raise ValueError("Placements must include every page module exactly once")

    changed = any(
        module.section_id != section.id
        or module.column_index != column_index
        or module.sort_index != sort_index
        for module, section, column_index, sort_index in validated
    )
    if not changed:
        return _serialize_page_with_sections(page)

    capture_page_snapshot(db, page.id, MODULE_PLACEMENTS_SAVED, actor_user_id)
    now = _now()
    for module, section, column_index, sort_index in validated:
        module.section_id = section.id
        module.column_index = column_index
        module.sort_index = sort_index
        module.updated_at = now
    page.updated_at = now
    db.commit()
    return _serialize_page_with_sections(page)
