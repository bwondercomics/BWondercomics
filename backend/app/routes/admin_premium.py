from __future__ import annotations

import secrets
import string
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import EmailSubscriber, PremiumCode, PremiumCodeRedemption, User
from .admin_utils import client_ip, iso_z, require_admin

router = APIRouter()


class PremiumCodeCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    count: int = 1
    code: str | None = None
    note: str | None = None
    active: bool = True


class PremiumCodeUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    code_id: str | None = Field(default=None, alias="codeId")
    active: bool | None = None
    note: str | None = None


class PremiumCodeDeactivateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    code_id: str | None = Field(default=None, alias="codeId")
    id: str | None = None


class EmailSubscriberCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    email: str
    source: str | None = None


def _generate_code(length: int = 10) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


@router.get("/api/admin/email-subscribers")
def list_email_subscribers(
    request: Request,
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    total = db.scalar(select(func.count()).select_from(EmailSubscriber)) or 0
    subs = db.scalars(
        select(EmailSubscriber)
        .order_by(EmailSubscriber.opted_in_at.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    return {
        "subscribers": [
            {
                "id": str(sub.id),
                "email": sub.email,
                "source": sub.source or "",
                "ipAddress": sub.ip_address or "",
                "optedInAt": iso_z(sub.opted_in_at),
            }
            for sub in subs
        ],
        "total": int(total),
    }


@router.post("/api/admin/email-subscribers")
def create_email_subscriber(
    payload: EmailSubscriberCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = require_admin(request, db)
    if not admin:
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    email = (payload.email or "").strip().lower()
    if not email or "@" not in email or len(email) > 120:
        return JSONResponse(status_code=400, content={"error": "Valid email is required"})

    source = (payload.source or "").strip()[:80] or "admin"
    now = datetime.now(timezone.utc)

    subscriber = db.scalar(select(EmailSubscriber).where(EmailSubscriber.email == email))
    if not subscriber:
        subscriber = EmailSubscriber(
            id=uuid4(),
            email=email,
            source=source,
            ip_address=client_ip(request),
            opted_in_at=now,
        )
        db.add(subscriber)
    else:
        subscriber.opted_in_at = now
        subscriber.source = source or subscriber.source
        if not subscriber.ip_address:
            subscriber.ip_address = client_ip(request)

    user = db.scalar(select(User).where(User.email == email))
    if user:
        user.email_opt_in = True
        user.email_opt_in_at = now
        db.add(user)

    db.commit()
    db.refresh(subscriber)

    return {
        "subscriber": {
            "id": str(subscriber.id),
            "email": subscriber.email,
            "source": subscriber.source or "",
            "ipAddress": subscriber.ip_address or "",
            "optedInAt": iso_z(subscriber.opted_in_at),
        }
    }


@router.delete("/api/admin/email-subscribers/{subscriber_id}")
def delete_email_subscriber(
    subscriber_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = require_admin(request, db)
    if not admin:
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    sub_id_raw = (subscriber_id or "").strip()
    if not sub_id_raw:
        return JSONResponse(status_code=400, content={"error": "subscriberId is required"})

    try:
        sub_id = UUID(sub_id_raw)
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid subscriberId"})

    subscriber = db.get(EmailSubscriber, sub_id)
    if not subscriber:
        return JSONResponse(status_code=404, content={"error": "Subscriber not found"})

    email = subscriber.email
    db.delete(subscriber)

    user = db.scalar(select(User).where(User.email == email))
    if user:
        user.email_opt_in = False
        user.email_opt_in_at = None
        db.add(user)

    db.commit()

    return {"status": "ok"}


@router.get("/api/admin/premium-codes")
def list_premium_codes(request: Request, db: Session = Depends(get_db)):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    rows = db.execute(
        select(
            PremiumCode,
            func.count(PremiumCodeRedemption.id).label("redemption_count"),
            func.count(func.distinct(PremiumCodeRedemption.user_id)).label("unique_users"),
            func.max(PremiumCodeRedemption.redeemed_at).label("last_redeemed_at"),
        )
        .outerjoin(PremiumCodeRedemption, PremiumCodeRedemption.code_id == PremiumCode.id)
        .group_by(PremiumCode.id)
        .order_by(PremiumCode.created_at.desc())
    ).all()

    user_ids = {code.created_by for code, *_ in rows if code.created_by}
    user_email_map = {}
    if user_ids:
        for user in db.scalars(select(User).where(User.id.in_(user_ids))).all():
            user_email_map[user.id] = user.email

    codes = []
    for code, redemption_count, unique_users, last_redeemed_at in rows:
        codes.append(
            {
                "id": str(code.id),
                "code": code.code,
                "note": code.note or "",
                "active": bool(code.active),
                "createdAt": iso_z(code.created_at),
                "createdBy": str(code.created_by) if code.created_by else None,
                "createdByEmail": user_email_map.get(code.created_by) if code.created_by else None,
                "redemptionCount": int(redemption_count or 0),
                "uniqueUsers": int(unique_users or 0),
                "lastRedeemedAt": iso_z(last_redeemed_at),
            }
        )

    return {"codes": codes}


@router.post("/api/admin/premium-codes")
def create_premium_codes(
    payload: PremiumCodeCreateRequest, request: Request, db: Session = Depends(get_db)
):
    admin = require_admin(request, db)
    if not admin:
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    count = int(payload.count or 1)
    if count < 1 or count > 100:
        return JSONResponse(status_code=400, content={"error": "count must be between 1 and 100"})

    note = (payload.note or "").strip()[:120] or None
    codes: list[PremiumCode] = []
    now = datetime.now(timezone.utc)

    if payload.code:
        raw_code = payload.code.strip().upper()
        if not raw_code:
            return JSONResponse(status_code=400, content={"error": "code is required"})
        exists = db.scalar(select(PremiumCode).where(PremiumCode.code == raw_code))
        if exists:
            return JSONResponse(status_code=409, content={"error": "Code already exists"})
        codes.append(
            PremiumCode(
                id=uuid4(),
                code=raw_code,
                note=note,
                active=bool(payload.active),
                created_at=now,
                created_by=admin.id,
            )
        )
    else:
        for _ in range(count):
            attempt = 0
            while attempt < 5:
                new_code = _generate_code()
                exists = db.scalar(select(PremiumCode).where(PremiumCode.code == new_code))
                if not exists:
                    codes.append(
                        PremiumCode(
                            id=uuid4(),
                            code=new_code,
                            note=note,
                            active=bool(payload.active),
                            created_at=now,
                            created_by=admin.id,
                        )
                    )
                    break
                attempt += 1
            if attempt >= 5:
                return JSONResponse(
                    status_code=500, content={"error": "Failed to generate unique code"}
                )

    for code in codes:
        db.add(code)
    db.commit()

    return {"codes": [{"id": str(c.id), "code": c.code} for c in codes]}


@router.patch("/api/admin/premium-codes/{code_id}")
def update_premium_code(
    code_id: str, payload: PremiumCodeUpdateRequest, request: Request, db: Session = Depends(get_db)
):
    admin = require_admin(request, db)
    if not admin:
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    try:
        code_uuid = UUID(code_id)
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid code id"})

    code = db.get(PremiumCode, code_uuid)
    if not code:
        return JSONResponse(status_code=404, content={"error": "Code not found"})

    if payload.active is not None:
        code.active = bool(payload.active)
    if payload.note is not None:
        code.note = (payload.note or "").strip()[:120] or None

    db.add(code)
    db.commit()
    return {"status": "ok"}


@router.post("/api/admin/premium-codes/deactivate")
def deactivate_premium_code(
    payload: PremiumCodeDeactivateRequest, request: Request, db: Session = Depends(get_db)
):
    admin = require_admin(request, db)
    if not admin:
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    code_id = (payload.code_id or payload.id or "").strip()
    if not code_id:
        return JSONResponse(status_code=400, content={"error": "codeId is required"})
    try:
        code_uuid = UUID(code_id)
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid code id"})

    code = db.get(PremiumCode, code_uuid)
    if not code:
        return JSONResponse(status_code=404, content={"error": "Code not found"})

    code.active = False
    db.add(code)
    db.commit()
    return {"status": "ok"}


@router.delete("/api/admin/premium-codes/{code_id}")
def delete_premium_code(code_id: str, request: Request, db: Session = Depends(get_db)):
    admin = require_admin(request, db)
    if not admin:
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    try:
        code_uuid = UUID(code_id)
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid code id"})

    code = db.get(PremiumCode, code_uuid)
    if not code:
        return JSONResponse(status_code=404, content={"error": "Code not found"})
    db.delete(code)
    db.commit()
    return {"status": "ok"}
