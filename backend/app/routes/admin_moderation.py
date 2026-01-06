from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import BannedIP, CommentLimit, CensoredWord, User
from .admin_utils import iso_z, require_admin


router = APIRouter()


class BanIPRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    ip_address: str | None = Field(default=None, alias="ipAddress")
    ip: str | None = None
    reason: str | None = None


class RemoveIPRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    ip_address: str | None = Field(default=None, alias="ipAddress")
    ip: str | None = None


class CensorWordRequest(BaseModel):
    phrase: str


class CommentLimitRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    min_interval_seconds: int | None = Field(default=None, alias="minIntervalSeconds")
    rate_window_seconds: int | None = Field(default=None, alias="rateWindowSeconds")
    max_per_window_user: int | None = Field(default=None, alias="maxPerWindowUser")
    max_per_window_ip: int | None = Field(default=None, alias="maxPerWindowIp")
    duplicate_window_seconds: int | None = Field(default=None, alias="duplicateWindowSeconds")


def _load_limits(db: Session) -> CommentLimit:
    limits = db.scalars(select(CommentLimit).limit(1)).first()
    if limits:
        return limits
    limits = CommentLimit(
        id=uuid4(),
        min_interval_seconds=0,
        rate_window_seconds=60,
        max_per_window_user=10,
        max_per_window_ip=25,
        duplicate_window_seconds=30,
    )
    db.add(limits)
    db.commit()
    return limits


@router.get("/api/admin/moderation/bans")
def list_banned_ips(request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    bans = db.scalars(select(BannedIP).order_by(BannedIP.banned_at.desc())).all()
    user_ids = {b.banned_by for b in bans if b.banned_by}
    user_email_map = {}
    if user_ids:
        for user in db.scalars(select(User).where(User.id.in_(user_ids))).all():
            user_email_map[user.id] = user.email

    return {
        "bans": [
            {
                "ipAddress": ban.ip_address,
                "reason": ban.reason or "",
                "bannedAt": iso_z(ban.banned_at),
                "bannedBy": str(ban.banned_by) if ban.banned_by else None,
                "bannedByEmail": user_email_map.get(ban.banned_by) if ban.banned_by else None,
            }
            for ban in bans
        ]
    }


@router.post("/api/admin/moderation/bans")
def ban_ip(payload: BanIPRequest, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    if not admin:
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    ip_address = (payload.ip_address or payload.ip or "").strip()
    if not ip_address:
        return JSONResponse(status_code=400, content={"error": "ipAddress is required"})

    now = datetime.now(timezone.utc)
    ban = db.get(BannedIP, ip_address)
    if ban:
        ban.reason = (payload.reason or "").strip() or ban.reason
        ban.banned_by = admin.id
        ban.banned_at = now
    else:
        ban = BannedIP(
            ip_address=ip_address,
            reason=(payload.reason or "").strip() or None,
            banned_at=now,
            banned_by=admin.id,
        )
    db.add(ban)
    db.commit()
    return {"status": "ok"}


@router.delete("/api/admin/moderation/bans/{ip_address}")
def unban_ip(ip_address: str, request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    ip_address = (ip_address or "").strip()
    ban = db.get(BannedIP, ip_address)
    if not ban:
        return JSONResponse(status_code=404, content={"error": "IP not found"})
    db.delete(ban)
    db.commit()
    return {"status": "ok"}


@router.post("/api/admin/moderation/bans/remove")
def unban_ip_body(payload: RemoveIPRequest, request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    ip_address = (payload.ip_address or payload.ip or "").strip()
    if not ip_address:
        return JSONResponse(status_code=400, content={"error": "ipAddress is required"})
    ban = db.get(BannedIP, ip_address)
    if not ban:
        return JSONResponse(status_code=404, content={"error": "IP not found"})
    db.delete(ban)
    db.commit()
    return {"status": "ok"}


@router.get("/api/admin/moderation/words")
def list_censored_words(request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    words = db.scalars(select(CensoredWord).order_by(CensoredWord.created_at.desc())).all()
    user_ids = {w.created_by for w in words if w.created_by}
    user_email_map = {}
    if user_ids:
        for user in db.scalars(select(User).where(User.id.in_(user_ids))).all():
            user_email_map[user.id] = user.email

    return {
        "words": [
            {
                "id": str(word.id),
                "phrase": word.phrase,
                "createdAt": iso_z(word.created_at),
                "createdBy": str(word.created_by) if word.created_by else None,
                "createdByEmail": user_email_map.get(word.created_by) if word.created_by else None,
            }
            for word in words
        ]
    }


@router.post("/api/admin/moderation/words")
def add_censored_word(payload: CensorWordRequest, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    if not admin:
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    phrase = (payload.phrase or "").strip()
    if not phrase:
        return JSONResponse(status_code=400, content={"error": "phrase is required"})

    existing = db.scalar(select(CensoredWord).where(CensoredWord.phrase == phrase))
    if existing:
        return JSONResponse(status_code=409, content={"error": "Phrase already exists"})

    word = CensoredWord(
        phrase=phrase[:200],
        created_at=datetime.now(timezone.utc),
        created_by=admin.id,
    )
    db.add(word)
    db.commit()
    return {"status": "ok", "wordId": str(word.id)}


@router.delete("/api/admin/moderation/words/{word_id}")
def remove_censored_word(word_id: str, request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    word = db.get(CensoredWord, word_id)
    if not word:
        return JSONResponse(status_code=404, content={"error": "Word not found"})
    db.delete(word)
    db.commit()
    return {"status": "ok"}


@router.post("/api/admin/moderation/words/remove")
def remove_censored_word_body(payload: CensorWordRequest, request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    phrase = (payload.phrase or "").strip()
    if not phrase:
        return JSONResponse(status_code=400, content={"error": "phrase is required"})

    word = db.scalar(select(CensoredWord).where(CensoredWord.phrase == phrase))
    if not word:
        return JSONResponse(status_code=404, content={"error": "Word not found"})
    db.delete(word)
    db.commit()
    return {"status": "ok"}


@router.get("/api/admin/moderation/comment-limits")
def get_comment_limits(request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    limits = _load_limits(db)
    return {
        "limits": {
            "minIntervalSeconds": int(limits.min_interval_seconds),
            "rateWindowSeconds": int(limits.rate_window_seconds),
            "maxPerWindowUser": int(limits.max_per_window_user),
            "maxPerWindowIp": int(limits.max_per_window_ip),
            "duplicateWindowSeconds": int(limits.duplicate_window_seconds),
            "updatedAt": iso_z(limits.updated_at),
        }
    }


@router.put("/api/admin/moderation/comment-limits")
def update_comment_limits(payload: CommentLimitRequest, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    if not admin:
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    limits = _load_limits(db)
    changed = False

    if payload.min_interval_seconds is not None:
        limits.min_interval_seconds = max(0, int(payload.min_interval_seconds))
        changed = True
    if payload.rate_window_seconds is not None:
        limits.rate_window_seconds = max(10, int(payload.rate_window_seconds))
        changed = True
    if payload.max_per_window_user is not None:
        limits.max_per_window_user = max(1, int(payload.max_per_window_user))
        changed = True
    if payload.max_per_window_ip is not None:
        limits.max_per_window_ip = max(1, int(payload.max_per_window_ip))
        changed = True
    if payload.duplicate_window_seconds is not None:
        limits.duplicate_window_seconds = max(5, int(payload.duplicate_window_seconds))
        changed = True

    if changed:
        limits.updated_at = datetime.now(timezone.utc)
        limits.updated_by = admin.id
        db.add(limits)
        db.commit()

    return {"status": "ok"}


@router.post("/api/admin/moderation/comment-limits")
def update_comment_limits_post(payload: CommentLimitRequest, request: Request, db: Session = Depends(get_db)):
    return update_comment_limits(payload, request, db)
