from __future__ import annotations

from collections.abc import Callable

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from ..db import get_db
from ..series_store import series_data_payload, series_index_payload
from .admin_utils import require_admin

router = APIRouter()


def _admin_json(request: Request, db: Session, content_factory: Callable[[], dict]) -> JSONResponse:
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})
    return JSONResponse(
        content=content_factory(),
        headers={"Cache-Control": "no-store"},
    )


@router.get("/admin/series.json")
def admin_series_index(request: Request, db: Session = Depends(get_db)):
    return _admin_json(request, db, lambda: series_index_payload(db))


@router.get("/admin/data.json")
def admin_default_series_data(request: Request, db: Session = Depends(get_db)):
    return _admin_json(
        request,
        db,
        lambda: series_data_payload(db, "battle-bros", include_unpublished=True),
    )


@router.get("/admin/series/{series_id}/data.json")
def admin_series_data(series_id: str, request: Request, db: Session = Depends(get_db)):
    return _admin_json(
        request,
        db,
        lambda: series_data_payload(db, series_id, include_unpublished=True),
    )


@router.get("/series.json")
def public_series_index(db: Session = Depends(get_db)):
    return JSONResponse(content=series_index_payload(db))


@router.get("/data.json")
def public_default_series_data(db: Session = Depends(get_db)):
    return JSONResponse(content=series_data_payload(db, "battle-bros"))


@router.get("/series/{series_id}/data.json")
def public_series_data(series_id: str, db: Session = Depends(get_db)):
    return JSONResponse(content=series_data_payload(db, series_id))


@router.get("/api/admin/series/{series_id}/data")
@router.get("/api/admin/series/{series_id}/data.json")
def admin_series_data_api(series_id: str, request: Request, db: Session = Depends(get_db)):
    return _admin_json(
        request,
        db,
        lambda: series_data_payload(db, series_id, include_unpublished=True),
    )


@router.get("/api/admin/series.json")
def admin_series_index_api(request: Request, db: Session = Depends(get_db)):
    return _admin_json(request, db, lambda: series_index_payload(db))


@router.get("/api/admin/data.json")
def admin_default_series_data_api(request: Request, db: Session = Depends(get_db)):
    return _admin_json(
        request,
        db,
        lambda: series_data_payload(db, "battle-bros", include_unpublished=True),
    )
