"""Business logic for the page builder feature."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .builder_security import (
    ALLOWED_MODULE_TYPES,
    CMS_SOURCE_ACTIVE_PAGE_SERIES,
    CMS_SOURCE_SPECIFIC_SERIES,
    layout_column_count,
    sanitize_module_config,
    sanitize_page_meta,
    sanitize_section_settings,
    validate_column_index,
    validate_layout,
    validate_module_type,
    validate_section_type,
    validate_sort_index,
)
from .models import BuilderModule, BuilderPage, BuilderPageBinding, BuilderSection
from .series_store import DEFAULT_SERIES_ID, sanitize_series_id

PAGE_SCOPE_SERIES = "series"
PAGE_SCOPE_GLOBAL = "global"
PAGE_SCOPES = {PAGE_SCOPE_SERIES, PAGE_SCOPE_GLOBAL}
BINDING_ROLE_READER = "reader"
BINDING_ROLES = {BINDING_ROLE_READER, "feed", "gallery"}
READER_BINDING_DEFAULT_DEVICE = "desktop"
READER_MODULE_MISSING = "reader_module_missing"
READER_MODULE_DUPLICATE = "reader_module_duplicate"
READER_MODULE_HIDDEN_DEFAULT_DEVICE = "reader_module_hidden_default_device"
READER_MODULE_WRONG_SOURCE = "reader_module_wrong_source"


class ColumnShrinkConflictError(Exception):
    """Raised when reducing a section's column count would orphan modules.

    The backend is the authority for layout changes — a direct API call must not
    silently rehome or drop a removed column's content (modules, or the panel
    background/spacing now stored on the column). A shrink that would leave modules
    in a to-be-removed column is rejected; the caller must clear them first. An empty
    removed column is allowed (an intentional collapse).
    """


class PageBuilderValidationError(ValueError):
    """Structured validation failure returned by page-builder admin routes."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "page_builder_validation_failed",
        warnings: list[dict[str, str]] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.warnings = warnings or []


def _now() -> datetime:
    return datetime.now(timezone.utc)


def sanitize_page_scope(raw: str | None) -> str:
    scope = str(raw or PAGE_SCOPE_SERIES).strip().lower()
    if scope not in PAGE_SCOPES:
        raise ValueError("Page scope must be 'series' or 'global'")
    return scope


def sanitize_binding_role(raw: str | None) -> str:
    role = str(raw or "").strip().lower()
    if role not in BINDING_ROLES:
        raise ValueError("Binding role must be reader, feed, or gallery")
    return role


def _sanitize_module_config_for_page(
    page: BuilderPage | None, module_type: str, raw_config: Any
) -> dict[str, Any]:
    config = sanitize_module_config(module_type, raw_config)
    if module_type != "reader" or not isinstance(config, dict):
        return config

    scope = (
        sanitize_page_scope(getattr(page, "scope", PAGE_SCOPE_SERIES))
        if page
        else PAGE_SCOPE_SERIES
    )
    next_config = dict(config)
    if scope == PAGE_SCOPE_GLOBAL:
        source = next_config.get("source") if isinstance(next_config.get("source"), dict) else {}
        next_source = {"mode": CMS_SOURCE_SPECIFIC_SERIES}
        series_id = str(source.get("seriesId") or "").strip()
        if series_id:
            next_source["seriesId"] = series_id
        next_config["source"] = next_source
    else:
        next_config["source"] = {"mode": CMS_SOURCE_ACTIVE_PAGE_SERIES}
    return next_config


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


def _page_can_bind_to_series(page: BuilderPage, series_id: str, role: str | None = None) -> bool:
    scope = sanitize_page_scope(page.scope)
    if role == BINDING_ROLE_READER:
        return scope == PAGE_SCOPE_SERIES and page.series_id == series_id
    return scope == PAGE_SCOPE_GLOBAL or (
        scope == PAGE_SCOPE_SERIES and page.series_id == series_id
    )


def _reader_warning(code: str, message: str) -> dict[str, str]:
    return {
        "role": BINDING_ROLE_READER,
        "code": code,
        "message": message,
    }


def _reader_modules_for_page(page: BuilderPage) -> list[BuilderModule]:
    modules: list[BuilderModule] = []
    for section in sorted(page.sections, key=lambda item: item.sort_index):
        for module in sorted(
            section.modules, key=lambda item: (item.column_index, item.sort_index)
        ):
            if str(module.module_type or "").strip() == "reader":
                modules.append(module)
    return modules


def _reader_module_hidden_for_default_device(page: BuilderPage, module: BuilderModule) -> bool:
    config = _sanitize_module_config_for_page(page, "reader", module.config)
    responsive = config.get("responsive") if isinstance(config.get("responsive"), dict) else {}
    branch = responsive.get(READER_BINDING_DEFAULT_DEVICE)
    return isinstance(branch, dict) and branch.get("hidden") is True


def _reader_module_has_wrong_source(module: BuilderModule) -> bool:
    config = module.config if isinstance(module.config, dict) else {}
    source = config.get("source") if isinstance(config.get("source"), dict) else {}
    raw_mode = str(source.get("mode") or "").strip()
    if not raw_mode:
        return False
    return raw_mode != CMS_SOURCE_ACTIVE_PAGE_SERIES


def _reader_binding_module_warnings(
    page: BuilderPage, series_id: str | None
) -> list[dict[str, str]]:
    if sanitize_page_scope(page.scope) != PAGE_SCOPE_SERIES or page.series_id != series_id:
        return [
            _reader_warning(
                "reader_binding_invalid",
                "The reader page binding must point to a same-series page.",
            )
        ]

    reader_modules = _reader_modules_for_page(page)
    if not reader_modules:
        return [
            _reader_warning(
                READER_MODULE_MISSING,
                "The bound reader page must contain one Comic Reader module.",
            )
        ]
    if len(reader_modules) > 1:
        return [
            _reader_warning(
                READER_MODULE_DUPLICATE,
                "The bound reader page must contain exactly one Comic Reader module.",
            )
        ]

    [reader_module] = reader_modules
    warnings: list[dict[str, str]] = []
    if _reader_module_hidden_for_default_device(page, reader_module):
        warnings.append(
            _reader_warning(
                READER_MODULE_HIDDEN_DEFAULT_DEVICE,
                "The bound reader page's Comic Reader module cannot be hidden on Desktop.",
            )
        )
    if _reader_module_has_wrong_source(reader_module):
        warnings.append(
            _reader_warning(
                READER_MODULE_WRONG_SOURCE,
                "The bound reader page's Comic Reader module must use the active page series.",
            )
        )
    return warnings


def _raise_for_invalid_reader_binding(page: BuilderPage, series_id: str) -> None:
    warnings = _reader_binding_module_warnings(page, series_id)
    if not warnings:
        return
    first = warnings[0]
    raise PageBuilderValidationError(first["message"], code=first["code"], warnings=warnings)


def _page_has_reader_binding(db: Session, page: BuilderPage) -> bool:
    if sanitize_page_scope(page.scope) != PAGE_SCOPE_SERIES or not page.series_id:
        return False
    existing = db.scalar(
        select(BuilderPageBinding).where(
            BuilderPageBinding.series_id == page.series_id,
            BuilderPageBinding.role == BINDING_ROLE_READER,
            BuilderPageBinding.page_id == page.id,
        )
    )
    return existing is not None


def _ensure_reader_binding_for_page(db: Session, page: BuilderPage) -> None:
    if sanitize_page_scope(page.scope) != PAGE_SCOPE_SERIES or not page.series_id:
        return
    if page.slug != "reader" and page.page_type != "reader":
        return
    if _reader_binding_module_warnings(page, page.series_id):
        return
    existing = db.scalar(
        select(BuilderPageBinding).where(
            BuilderPageBinding.series_id == page.series_id,
            BuilderPageBinding.role == BINDING_ROLE_READER,
        )
    )
    if existing:
        return
    now = _now()
    db.add(
        BuilderPageBinding(
            series_id=page.series_id,
            role=BINDING_ROLE_READER,
            page_id=page.id,
            created_at=now,
            updated_at=now,
        )
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


def create_scoped_page(
    db: Session,
    scope: str,
    series_id: str | None,
    data: dict[str, Any],
) -> dict[str, Any]:
    """Create a new page in an explicit scope."""
    safe_scope = sanitize_page_scope(scope)
    sid = _require_series_id(series_id) if safe_scope == PAGE_SCOPE_SERIES else None
    now = _now()

    slug = _normalize_slug(data.get("slug"))

    if _find_page_by_slug(db, safe_scope, sid, slug):
        raise ValueError(f"Page with slug '{slug}' already exists")

    title = str(data.get("title") or slug.replace("-", " ").title()).strip()[:200]
    page_type = str(data.get("pageType") or "custom").strip()[:30]
    is_homepage = bool(data.get("isHomepage", False))

    if is_homepage:
        _unset_homepages(db, safe_scope, sid)

    page = BuilderPage(
        scope=safe_scope,
        series_id=sid,
        slug=slug,
        title=title,
        page_type=page_type,
        is_published=bool(data.get("isPublished", False)),
        is_homepage=is_homepage,
        sort_index=_next_sort_index(db, safe_scope, sid),
        meta=sanitize_page_meta(data.get("meta") or {}),
        created_at=now,
        updated_at=now,
    )
    db.add(page)
    db.flush()
    _ensure_reader_binding_for_page(db, page)
    db.commit()

    return get_page(db, str(page.id)) or {}


def create_page(db: Session, series_id: str | None, data: dict[str, Any]) -> dict[str, Any]:
    """Compatibility create for series pages."""
    return create_scoped_page(db, PAGE_SCOPE_SERIES, series_id or DEFAULT_SERIES_ID, data)


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
    scope = sanitize_page_scope(page.scope)

    if data.get("isPublished") is True and _page_has_reader_binding(db, page):
        _raise_for_invalid_reader_binding(page, _require_series_id(page.series_id))

    if "title" in data:
        page.title = str(data["title"]).strip()[:200]
    if "slug" in data:
        new_slug = _normalize_slug(data["slug"])
        if new_slug and new_slug != page.slug:
            if _find_page_by_slug(db, scope, page.series_id, new_slug, exclude_page_id=pid):
                raise ValueError(f"Page with slug '{new_slug}' already exists")
            page.slug = new_slug
    if "pageType" in data:
        page.page_type = str(data["pageType"]).strip()[:30]
    if "isPublished" in data:
        page.is_published = bool(data["isPublished"])
    if "isHomepage" in data:
        if data["isHomepage"] and not page.is_homepage:
            _unset_homepages(db, scope, page.series_id, exclude_page_id=pid)
        page.is_homepage = bool(data["isHomepage"])
    if "meta" in data and isinstance(data["meta"], dict):
        page.meta = sanitize_page_meta(data["meta"])

    page.updated_at = now
    _ensure_reader_binding_for_page(db, page)
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

    db.query(BuilderPageBinding).filter(BuilderPageBinding.page_id == pid).delete()
    db.delete(page)
    db.commit()
    return True


def reorder_scoped_pages(
    db: Session,
    scope: str,
    series_id: str | None,
    page_ids: list[str],
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

    pages = db.scalars(select(BuilderPage).where(*_scope_filters(safe_scope, sid))).all()
    pages_by_id = {page.id: page for page in pages}
    if set(parsed_ids) != set(pages_by_id):
        raise ValueError("Page reorder must include exactly the active scope pages")

    for index, pid in enumerate(parsed_ids):
        pages_by_id[pid].sort_index = index

    db.commit()
    return True


def reorder_pages(db: Session, series_id: str | None, page_ids: list[str]) -> bool:
    """Compatibility reorder for series pages."""
    return reorder_scoped_pages(db, PAGE_SCOPE_SERIES, series_id or DEFAULT_SERIES_ID, page_ids)


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


def update_page_bindings(
    db: Session,
    series_id: str | None,
    bindings: dict[str, str | None],
) -> dict[str, Any]:
    """Update page bindings for one series."""
    sid = _require_series_id(series_id)
    now = _now()
    for raw_role, raw_page_id in (bindings or {}).items():
        role = sanitize_binding_role(raw_role)
        existing = db.scalar(
            select(BuilderPageBinding).where(
                BuilderPageBinding.series_id == sid,
                BuilderPageBinding.role == role,
            )
        )
        if raw_page_id in (None, ""):
            if existing:
                db.delete(existing)
            continue
        try:
            pid = uuid.UUID(str(raw_page_id))
        except ValueError as exc:
            raise ValueError(f"Invalid page id for {role} binding") from exc
        page = _load_page_model_with_content(db, pid)
        if not page or not _page_can_bind_to_series(page, sid, role):
            raise ValueError(f"Page cannot be used for {role} binding")
        if role == BINDING_ROLE_READER:
            _raise_for_invalid_reader_binding(page, sid)
        if existing:
            existing.page_id = page.id
            existing.updated_at = now
        else:
            db.add(
                BuilderPageBinding(
                    series_id=sid,
                    role=role,
                    page_id=page.id,
                    created_at=now,
                    updated_at=now,
                )
            )

    db.commit()
    return get_page_bindings(db, sid)


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
    sort_index = validate_sort_index(data["sortIndex"]) if "sortIndex" in data else max_sort + 1

    section = BuilderSection(
        page_id=pid,
        section_type=section_type,
        layout=layout,
        sort_index=sort_index,
        settings=sanitize_section_settings(data.get("settings") or {}, layout),
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
    if "sectionType" in data:
        section.section_type = validate_section_type(data["sectionType"])
    if "layout" in data:
        section.layout = next_layout
    if "sortIndex" in data:
        section.sort_index = validate_sort_index(data["sortIndex"])
    if "settings" in data and isinstance(data["settings"], dict):
        section.settings = sanitize_section_settings(data["settings"], section.layout)

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
    page = db.get(BuilderPage, section.page_id)

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
    db.add(module)

    if page:
        page.updated_at = now

    db.commit()

    return _serialize_module(module, page)


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
    page = db.get(BuilderPage, section.page_id) if section else None
    layout = validate_layout(section.layout) if section else "1"
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

    module.module_type = next_type
    module.column_index = next_column_index
    module.sort_index = next_sort_index
    module.config = next_config

    module.updated_at = now

    if page:
        page.updated_at = now

    db.commit()

    return _serialize_module(module, page)


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

    # Validate before mutating so a rejected column index cannot leave a
    # half-applied move (e.g. a changed section_id) on the session.
    next_column_index = validate_column_index(column_index, layout)
    next_sort_index = validate_sort_index(sort_index)

    module.section_id = target_sid
    module.column_index = next_column_index
    module.sort_index = next_sort_index
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


def save_module_placements(
    db: Session, page_id: str, placements: list[dict[str, Any]]
) -> dict[str, Any] | None:
    """Atomically replace every module placement on one page.

    Validation is deliberately completed before any ORM fields change: a malformed batch
    cannot persist a partial arrow-move draft. The list must describe each current module once.
    """
    try:
        pid = uuid.UUID(page_id)
    except ValueError:
        return None
    page = _load_page_model_with_content(db, pid)
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

    now = _now()
    for module, section, column_index, sort_index in validated:
        module.section_id = section.id
        module.column_index = column_index
        module.sort_index = sort_index
        module.updated_at = now
    page.updated_at = now
    db.commit()
    return _serialize_page_with_sections(page)
