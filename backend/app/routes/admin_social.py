from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..bluesky import BlueskyClient, BlueskyError
from ..db import get_db
from ..models import SocialAccount
from .admin_utils import iso_z, require_admin


router = APIRouter()


class BlueskyConnectRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    handle: str
    app_password: str = Field(alias="appPassword")
    pds_url: str | None = Field(default=None, alias="pdsUrl")


@router.get("/api/admin/bluesky/status")
def bluesky_status(request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    account = db.scalar(select(SocialAccount).where(SocialAccount.provider == "bluesky"))
    if not account or not account.access_token or not account.refresh_token:
        return {"connected": False, "error": "Bluesky account is not connected"}

    profile = None
    error = ""
    try:
        client = BlueskyClient(account)
        profile = client.get_profile(db)
    except BlueskyError as exc:
        error = str(exc)

    return {
        "connected": True if not error else False,
        "handle": account.handle or "",
        "did": account.did or "",
        "pdsUrl": account.pds_url or "",
        "updatedAt": iso_z(account.updated_at),
        "profile": profile or {},
        "error": error,
    }


@router.get("/api/admin/bluesky/notifications")
def bluesky_notifications(request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    try:
        client = BlueskyClient.from_db(db)
        data = client.list_notifications(db)
    except BlueskyError as exc:
        return JSONResponse(status_code=502, content={"error": str(exc)})

    return {
        "notifications": data.get("notifications", []),
        "cursor": data.get("cursor"),
        "generatedAt": iso_z(datetime.now(timezone.utc)),
    }


@router.post("/api/admin/bluesky/connect")
def bluesky_connect(payload: BlueskyConnectRequest, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    if not admin:
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    handle = (payload.handle or "").strip()
    app_password = (payload.app_password or "").strip()
    if not handle or not app_password:
        return JSONResponse(status_code=400, content={"error": "handle and appPassword are required"})

    try:
        session = BlueskyClient.create_session(handle, app_password)
    except BlueskyError as exc:
        return JSONResponse(status_code=502, content={"error": str(exc)})

    account = db.scalar(select(SocialAccount).where(SocialAccount.provider == "bluesky"))
    now = datetime.now(timezone.utc)
    if account:
        account.handle = session.get("handle") or handle
        account.did = session.get("did") or account.did
        account.access_token = session.get("accessJwt")
        account.refresh_token = session.get("refreshJwt")
        if payload.pds_url:
            account.pds_url = (payload.pds_url or "").strip() or account.pds_url
        account.updated_at = now
    else:
        account = SocialAccount(
            id=uuid4(),
            provider="bluesky",
            handle=session.get("handle") or handle,
            did=session.get("did"),
            access_token=session.get("accessJwt"),
            refresh_token=session.get("refreshJwt"),
            pds_url=(payload.pds_url or "").strip() or None,
            created_at=now,
            updated_at=now,
        )
    db.add(account)
    db.commit()

    return {"status": "ok", "handle": account.handle or "", "did": account.did or ""}


@router.post("/api/admin/bluesky/disconnect")
def bluesky_disconnect(request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    account = db.scalar(select(SocialAccount).where(SocialAccount.provider == "bluesky"))
    if not account:
        return {"status": "ok"}

    account.access_token = None
    account.refresh_token = None
    account.updated_at = datetime.now(timezone.utc)
    db.add(account)
    db.commit()
    return {"status": "ok"}
