from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from ..db import get_db
from ..series_store import series_data_payload, series_index_payload


router = APIRouter()


@router.get("/admin/series.json")
def admin_series_index(db: Session = Depends(get_db)):
    return JSONResponse(content=series_index_payload(db))


@router.get("/admin/data.json")
def admin_default_series_data(db: Session = Depends(get_db)):
    return JSONResponse(content=series_data_payload(db, "battle-bros"))


@router.get("/admin/series/{series_id}/data.json")
def admin_series_data(series_id: str, db: Session = Depends(get_db)):
    return JSONResponse(content=series_data_payload(db, series_id))
