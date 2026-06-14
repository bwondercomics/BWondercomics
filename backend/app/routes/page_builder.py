"""API routes for the page builder feature."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User
from ..page_store import (
    PAGE_SCOPE_GLOBAL,
    PAGE_SCOPE_SERIES,
    PageBuilderValidationError,
    add_module,
    add_section,
    create_page,
    create_scoped_page,
    delete_module,
    delete_page,
    delete_section,
    get_global_page_by_slug,
    get_homepage_page,
    get_page,
    get_page_bindings,
    get_page_by_slug,
    get_scoped_page_by_slug,
    list_global_pages,
    list_pages,
    list_series_pages,
    move_module,
    reorder_modules,
    reorder_pages,
    reorder_scoped_pages,
    reorder_sections,
    update_module,
    update_page,
    update_page_bindings,
    update_section,
)
from ..security import get_current_user
from ..validation import is_admin_role

router = APIRouter()


def _require_admin(request: Request, db: Session) -> User | None:
    user = get_current_user(db, request)
    if not user or not is_admin_role(user.role):
        return None
    return user


# Page endpoints


class CreatePageRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    slug: str
    title: str | None = None
    page_type: str | None = Field(None, alias="pageType")
    is_published: bool | None = Field(None, alias="isPublished")
    is_homepage: bool | None = Field(None, alias="isHomepage")
    meta: dict[str, Any] | None = None


class UpdatePageRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    slug: str | None = None
    title: str | None = None
    page_type: str | None = Field(None, alias="pageType")
    is_published: bool | None = Field(None, alias="isPublished")
    is_homepage: bool | None = Field(None, alias="isHomepage")
    meta: dict[str, Any] | None = None


class ReorderPagesRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    page_ids: list[str] = Field(alias="pageIds")


class PageBindingsRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    bindings: dict[str, str | None] = Field(default_factory=dict)


@router.get("/api/admin/pages")
def api_list_pages(
    request: Request,
    series_id: str | None = None,
    db: Session = Depends(get_db),
):
    """List all pages for a series."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    pages = list_pages(db, series_id)
    return {"pages": pages}


@router.get("/api/admin/pages/global")
def api_list_global_pages(request: Request, db: Session = Depends(get_db)):
    """List global pages."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    return {"pages": list_global_pages(db)}


@router.post("/api/admin/pages/global")
def api_create_global_page(
    payload: CreatePageRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Create a global page."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    try:
        page = create_scoped_page(
            db,
            PAGE_SCOPE_GLOBAL,
            None,
            payload.model_dump(by_alias=True, exclude_none=True),
        )
        return {"page": page}
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


@router.get("/api/admin/pages/global/by-slug/{slug}")
def api_get_global_page_by_slug_admin(
    slug: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Get a global page by slug for admin preview and draft viewing."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    page = get_global_page_by_slug(db, slug)
    if not page:
        return JSONResponse(status_code=404, content={"error": "Page not found"})
    return {"page": page}


@router.post("/api/admin/pages/global/reorder")
def api_reorder_global_pages(
    payload: ReorderPagesRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Reorder global pages."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    try:
        reorder_scoped_pages(db, PAGE_SCOPE_GLOBAL, None, payload.page_ids)
        return {"status": "success"}
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


@router.get("/api/admin/pages/series/{series_id}")
def api_list_series_pages(
    series_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """List pages for a series."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    try:
        return {"pages": list_series_pages(db, series_id)}
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


@router.post("/api/admin/pages/series/{series_id}")
def api_create_series_page(
    series_id: str,
    payload: CreatePageRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Create a page for a series."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    try:
        page = create_scoped_page(
            db,
            PAGE_SCOPE_SERIES,
            series_id,
            payload.model_dump(by_alias=True, exclude_none=True),
        )
        return {"page": page}
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


@router.get("/api/admin/pages/series/{series_id}/by-slug/{slug}")
def api_get_series_page_by_slug_admin(
    series_id: str,
    slug: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Get a series page by slug for admin preview and draft viewing."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    try:
        page = get_scoped_page_by_slug(db, PAGE_SCOPE_SERIES, series_id, slug)
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
    if not page:
        return JSONResponse(status_code=404, content={"error": "Page not found"})
    return {"page": page}


@router.post("/api/admin/pages/series/{series_id}/reorder")
def api_reorder_series_pages(
    series_id: str,
    payload: ReorderPagesRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Reorder pages for a series."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    try:
        reorder_scoped_pages(db, PAGE_SCOPE_SERIES, series_id, payload.page_ids)
        return {"status": "success"}
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


@router.get("/api/admin/page-bindings/{series_id}")
def api_get_page_bindings(
    series_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Get page route-role bindings for a series."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    try:
        return get_page_bindings(db, series_id)
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


@router.put("/api/admin/page-bindings/{series_id}")
def api_update_page_bindings(
    series_id: str,
    payload: PageBindingsRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Update page route-role bindings for a series."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    try:
        return update_page_bindings(db, series_id, payload.bindings)
    except PageBuilderValidationError as e:
        db.rollback()
        return JSONResponse(
            status_code=400,
            content={"error": str(e), "code": e.code, "warnings": e.warnings},
        )
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


@router.get("/api/admin/pages/{page_id}")
def api_get_page(page_id: str, request: Request, db: Session = Depends(get_db)):
    """Get a single page with all sections and modules."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    page = get_page(db, page_id)
    if not page:
        return JSONResponse(status_code=404, content={"error": "Page not found"})

    return {"page": page}


@router.get("/api/admin/pages/by-slug/{series_id}/{slug}")
def api_get_page_by_slug_admin(
    series_id: str,
    slug: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Get a page by series/slug for admin preview and draft viewing."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    page = get_page_by_slug(db, series_id, slug)
    if not page:
        return JSONResponse(status_code=404, content={"error": "Page not found"})

    return {"page": page}


@router.get("/api/admin/pages/home/{series_id}")
def api_get_homepage_page_admin(
    series_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Get the effective homepage page for admin preview and draft viewing."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    page = get_homepage_page(db, series_id, published_only=False)
    if not page:
        return JSONResponse(status_code=404, content={"error": "Page not found"})

    return {"page": page}


@router.post("/api/admin/pages")
def api_create_page(
    payload: CreatePageRequest,
    request: Request,
    series_id: str | None = None,
    db: Session = Depends(get_db),
):
    """Create a new page."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    try:
        page = create_page(db, series_id, payload.model_dump(by_alias=True, exclude_none=True))
        return {"page": page}
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


@router.put("/api/admin/pages/{page_id}")
def api_update_page(
    page_id: str,
    payload: UpdatePageRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Update page metadata."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    try:
        page = update_page(db, page_id, payload.model_dump(by_alias=True, exclude_none=True))
        if not page:
            return JSONResponse(status_code=404, content={"error": "Page not found"})
        return {"page": page}
    except PageBuilderValidationError as e:
        db.rollback()
        return JSONResponse(
            status_code=400,
            content={"error": str(e), "code": e.code, "warnings": e.warnings},
        )
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


@router.delete("/api/admin/pages/{page_id}")
def api_delete_page(page_id: str, request: Request, db: Session = Depends(get_db)):
    """Delete a page and all its sections/modules."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    if delete_page(db, page_id):
        return {"status": "success"}
    return JSONResponse(status_code=404, content={"error": "Page not found"})


@router.post("/api/admin/pages/reorder")
def api_reorder_pages(
    payload: ReorderPagesRequest,
    request: Request,
    series_id: str | None = None,
    db: Session = Depends(get_db),
):
    """Reorder pages."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    try:
        reorder_pages(db, series_id, payload.page_ids)
        return {"status": "success"}
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


# Section endpoints


class CreateSectionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    section_type: str | None = Field(None, alias="sectionType")
    layout: str | None = None
    sort_index: int | None = Field(None, alias="sortIndex")
    settings: dict[str, Any] | None = None


class UpdateSectionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    section_type: str | None = Field(None, alias="sectionType")
    layout: str | None = None
    sort_index: int | None = Field(None, alias="sortIndex")
    settings: dict[str, Any] | None = None


class ReorderSectionsRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    section_ids: list[str] = Field(alias="sectionIds")


@router.post("/api/admin/pages/{page_id}/sections")
def api_add_section(
    page_id: str,
    payload: CreateSectionRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Add a section to a page."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    try:
        section = add_section(db, page_id, payload.model_dump(by_alias=True, exclude_none=True))
        if not section:
            return JSONResponse(status_code=404, content={"error": "Page not found"})
        return {"section": section}
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


@router.put("/api/admin/sections/{section_id}")
def api_update_section(
    section_id: str,
    payload: UpdateSectionRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Update a section."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    try:
        section = update_section(
            db, section_id, payload.model_dump(by_alias=True, exclude_none=True)
        )
        if not section:
            return JSONResponse(status_code=404, content={"error": "Section not found"})
        return {"section": section}
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


@router.delete("/api/admin/sections/{section_id}")
def api_delete_section(section_id: str, request: Request, db: Session = Depends(get_db)):
    """Delete a section and all its modules."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    if delete_section(db, section_id):
        return {"status": "success"}
    return JSONResponse(status_code=404, content={"error": "Section not found"})


@router.post("/api/admin/pages/{page_id}/sections/reorder")
def api_reorder_sections(
    page_id: str,
    payload: ReorderSectionsRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Reorder sections within a page."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    reorder_sections(db, page_id, payload.section_ids)
    return {"status": "success"}


# Module endpoints


class CreateModuleRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    module_type: str = Field(alias="moduleType")
    column_index: int | None = Field(None, alias="columnIndex")
    sort_index: int | None = Field(None, alias="sortIndex")
    config: dict[str, Any] | None = None


class UpdateModuleRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    module_type: str | None = Field(None, alias="moduleType")
    column_index: int | None = Field(None, alias="columnIndex")
    sort_index: int | None = Field(None, alias="sortIndex")
    config: dict[str, Any] | None = None


class MoveModuleRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    target_section_id: str = Field(alias="targetSectionId")
    column_index: int = Field(alias="columnIndex")
    sort_index: int = Field(alias="sortIndex")


class ReorderModulesRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    column_index: int = Field(alias="columnIndex")
    module_ids: list[str] = Field(alias="moduleIds")


@router.post("/api/admin/sections/{section_id}/modules")
def api_add_module(
    section_id: str,
    payload: CreateModuleRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Add a module to a section."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    try:
        module = add_module(db, section_id, payload.model_dump(by_alias=True, exclude_none=True))
        if not module:
            return JSONResponse(status_code=404, content={"error": "Section not found"})
        return {"module": module}
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


@router.put("/api/admin/modules/{module_id}")
def api_update_module(
    module_id: str,
    payload: UpdateModuleRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Update a module's config."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    try:
        module = update_module(db, module_id, payload.model_dump(by_alias=True, exclude_none=True))
        if not module:
            return JSONResponse(status_code=404, content={"error": "Module not found"})
        return {"module": module}
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


@router.delete("/api/admin/modules/{module_id}")
def api_delete_module(module_id: str, request: Request, db: Session = Depends(get_db)):
    """Delete a module."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    if delete_module(db, module_id):
        return {"status": "success"}
    return JSONResponse(status_code=404, content={"error": "Module not found"})


@router.post("/api/admin/modules/{module_id}/move")
def api_move_module(
    module_id: str,
    payload: MoveModuleRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Move a module to a different section/column."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    try:
        module = move_module(
            db, module_id, payload.target_section_id, payload.column_index, payload.sort_index
        )
        if not module:
            return JSONResponse(status_code=404, content={"error": "Module or section not found"})
        return {"module": module}
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


@router.post("/api/admin/sections/{section_id}/modules/reorder")
def api_reorder_modules(
    section_id: str,
    payload: ReorderModulesRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Reorder modules within a section column."""
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    try:
        reorder_modules(db, section_id, payload.column_index, payload.module_ids)
        return {"status": "success"}
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


# Public endpoint for page rendering


@router.get("/api/pages/home/{series_id}")
def api_public_homepage(series_id: str, db: Session = Depends(get_db)):
    """Get the effective published homepage page for public rendering."""
    page = get_homepage_page(db, series_id, published_only=True)
    if not page:
        return JSONResponse(status_code=404, content={"error": "Page not found"})

    return {"page": page}


@router.get("/api/pages/global/by-slug/{slug}")
def api_public_global_page(slug: str, db: Session = Depends(get_db)):
    """Get a published global page for public rendering."""
    page = get_global_page_by_slug(db, slug)
    if not page or not page.get("isPublished"):
        return JSONResponse(status_code=404, content={"error": "Page not found"})

    return {"page": page}


@router.get("/api/pages/{series_id}/{slug}")
def api_public_page(series_id: str, slug: str, db: Session = Depends(get_db)):
    """Get a published page for public rendering."""
    page = get_page_by_slug(db, series_id, slug)
    if not page:
        return JSONResponse(status_code=404, content={"error": "Page not found"})

    if not page.get("isPublished"):
        return JSONResponse(status_code=404, content={"error": "Page not found"})

    return {"page": page}
