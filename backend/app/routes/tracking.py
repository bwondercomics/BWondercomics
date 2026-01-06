from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import VisitorEvent, VisitorSession
from ..security import get_current_user


router = APIRouter()


class TrackVisitorRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    visitor_id: Annotated[str, Field(alias="visitorId")]
    path: str | None = None
    title: str | None = None
    origin: str | None = None
    referrer: str | None = None
    series_id: Annotated[str | None, Field(alias="seriesId")] = None
    entry_title: Annotated[str | None, Field(alias="entryTitle")] = None
    entry_label: Annotated[str | None, Field(alias="entryLabel")] = None
    page_number: Annotated[int | None, Field(alias="pageNumber")] = None


def _client_ip(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return ""


def _normalize(value: str | None, max_len: int = 300) -> str | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:max_len]


@router.post("/api/track/visitor")
def track_visitor(payload: TrackVisitorRequest, request: Request, db: Session = Depends(get_db)):
    visitor_id = (payload.visitor_id or "").strip()
    if not visitor_id:
        return JSONResponse(status_code=400, content={"error": "visitorId is required"})

    now = datetime.now(timezone.utc)
    user = get_current_user(db, request)
    client_ip = _client_ip(request)

    session = db.scalar(select(VisitorSession).where(VisitorSession.visitor_id == visitor_id))
    entry_label = _normalize(payload.entry_label, 200)
    series_id = _normalize(payload.series_id, 64)
    entry_title = _normalize(payload.entry_title, 200)

    if session:
        session.last_seen = now
        session.hit_count = int(session.hit_count or 0) + 1
        session.path = _normalize(payload.path, 300)
        session.title = _normalize(payload.title, 300)
        session.origin = _normalize(payload.origin, 300)
        session.referrer = _normalize(payload.referrer, 500)
        session.series_id = series_id or session.series_id
        session.entry_title = entry_title or session.entry_title
        session.entry_label = entry_label or session.entry_label
        session.page_number = payload.page_number
        if user and not session.user_id:
            session.user_id = user.id
        if client_ip:
            session.ip_address = client_ip

        entries_read = list(session.entries_read or [])
        if entry_label and entry_label not in entries_read:
            entries_read.append(entry_label)
        session.entries_read = entries_read

        series_read = list(session.series_read or [])
        if series_id and series_id not in series_read:
            series_read.append(series_id)
        session.series_read = series_read
    else:
        session = VisitorSession(
            id=uuid4(),
            visitor_id=visitor_id[:120],
            user_id=user.id if user else None,
            ip_address=client_ip or None,
            origin=_normalize(payload.origin, 300),
            referrer=_normalize(payload.referrer, 500),
            path=_normalize(payload.path, 300),
            title=_normalize(payload.title, 300),
            series_id=series_id,
            entry_title=entry_title,
            entry_label=entry_label,
            page_number=payload.page_number,
            entries_read=[entry_label] if entry_label else [],
            series_read=[series_id] if series_id else [],
            first_seen=now,
            last_seen=now,
            hit_count=1,
        )
        db.add(session)

    db.add(
        VisitorEvent(
            id=uuid4(),
            visitor_id=visitor_id[:120],
            user_id=user.id if user else None,
            ip_address=client_ip or None,
            origin=_normalize(payload.origin, 300),
            referrer=_normalize(payload.referrer, 500),
            path=_normalize(payload.path, 300),
            title=_normalize(payload.title, 300),
            series_id=series_id,
            entry_title=entry_title,
            entry_label=entry_label,
            page_number=payload.page_number,
            created_at=now,
        )
    )
    db.commit()

    return {"status": "ok"}
