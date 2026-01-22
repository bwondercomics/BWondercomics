from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Comment, EmailSubscriber, PremiumCode, PremiumCodeRedemption, User
from ..security import get_current_user, public_user
from ..settings import settings

router = APIRouter()


class EmailOptRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    email_opt_in: bool = Field(alias="emailOptIn")


class RedeemPremiumRequest(BaseModel):
    code: str


class EmailSubscribeRequest(BaseModel):
    email: str
    source: str | None = None


def _iso_z(dt: datetime | None) -> str | None:
    if not dt:
        return None
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _client_ip(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return ""


def _has_premium_active(db: Session, user_id: UUID) -> bool:
    redeemed = db.scalar(
        select(func.count())
        .select_from(PremiumCodeRedemption)
        .where(PremiumCodeRedemption.user_id == user_id)
    )
    if redeemed:
        return True
    fallback = db.scalar(
        select(func.count()).select_from(PremiumCode).where(PremiumCode.redeemed_by == user_id)
    )
    return bool(fallback)


def _user_payload(user: User, premium_active: bool) -> dict:
    data = public_user(user)
    data["emailOptIn"] = bool(user.email_opt_in)
    data["emailOptInAt"] = _iso_z(user.email_opt_in_at)
    data["premiumActive"] = bool(premium_active)
    return data


def _require_user(request: Request, db: Session) -> User | None:
    return get_current_user(db, request)


@router.post("/api/email/subscribe")
def subscribe_email(
    payload: EmailSubscribeRequest, request: Request, db: Session = Depends(get_db)
):
    email = (payload.email or "").strip().lower()
    if not email or "@" not in email or len(email) > 120:
        return JSONResponse(status_code=400, content={"error": "Valid email is required"})

    source = (payload.source or "").strip()[:80] or "homepage"
    now = datetime.now(timezone.utc)

    subscriber = db.scalar(select(EmailSubscriber).where(EmailSubscriber.email == email))
    if not subscriber:
        subscriber = EmailSubscriber(
            id=uuid4(),
            email=email,
            source=source,
            ip_address=_client_ip(request),
            opted_in_at=now,
        )
        db.add(subscriber)
    else:
        subscriber.opted_in_at = now
        subscriber.source = source or subscriber.source
        if not subscriber.ip_address:
            subscriber.ip_address = _client_ip(request)

    user = db.scalar(select(User).where(User.email == email))
    if user:
        user.email_opt_in = True
        user.email_opt_in_at = now
        db.add(user)

    db.commit()
    return {"ok": True}


@router.get("/api/user/settings")
def get_user_settings(request: Request, db: Session = Depends(get_db)):
    user = _require_user(request, db)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    comment_count = (
        db.scalar(select(func.count()).select_from(Comment).where(Comment.user_id == user.id)) or 0
    )
    premium_active = _has_premium_active(db, user.id)
    return {"user": _user_payload(user, premium_active), "commentCount": comment_count}


@router.post("/api/user/email-opt")
def update_email_opt(payload: EmailOptRequest, request: Request, db: Session = Depends(get_db)):
    user = _require_user(request, db)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    enable = bool(payload.email_opt_in)
    now = datetime.now(timezone.utc)
    user.email_opt_in = enable
    user.email_opt_in_at = now if enable else None

    subscriber = db.scalar(select(EmailSubscriber).where(EmailSubscriber.email == user.email))
    if enable:
        if not subscriber:
            subscriber = EmailSubscriber(
                id=uuid4(),
                email=user.email,
                source="account",
                ip_address=_client_ip(request),
                opted_in_at=now,
            )
            db.add(subscriber)
        else:
            subscriber.opted_in_at = now
            if not subscriber.source:
                subscriber.source = "account"
            if not subscriber.ip_address:
                subscriber.ip_address = _client_ip(request)
    elif subscriber:
        db.delete(subscriber)

    db.add(user)
    db.commit()
    db.refresh(user)

    premium_active = _has_premium_active(db, user.id)
    return {"user": _user_payload(user, premium_active)}


@router.get("/api/user/comments")
def get_user_comments(
    request: Request,
    limit: int = Query(15, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    user = _require_user(request, db)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    total = (
        db.scalar(select(func.count()).select_from(Comment).where(Comment.user_id == user.id)) or 0
    )
    comments = db.scalars(
        select(Comment)
        .where(Comment.user_id == user.id)
        .order_by(Comment.created_at.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    shaped = [
        {
            "id": str(comment.id),
            "targetId": comment.target_id,
            "message": comment.message or "",
            "createdAt": _iso_z(comment.created_at),
            "hidden": bool(comment.hidden),
        }
        for comment in comments
    ]
    return {"comments": shaped, "total": total}


@router.delete("/api/user/comments/{comment_id}")
def delete_user_comment(comment_id: str, request: Request, db: Session = Depends(get_db)):
    user = _require_user(request, db)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    try:
        comment_uuid = UUID(comment_id)
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid comment id"})

    comment = db.get(Comment, comment_uuid)
    if not comment or comment.user_id != user.id:
        return JSONResponse(status_code=404, content={"error": "Comment not found"})

    db.delete(comment)
    db.commit()
    return {"status": "ok"}


@router.post("/api/user/comments/delete")
def delete_user_comments(request: Request, db: Session = Depends(get_db)):
    user = _require_user(request, db)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    db.execute(delete(Comment).where(Comment.user_id == user.id))
    db.commit()
    return {"status": "ok"}


@router.post("/api/user/premium/redeem")
def redeem_premium(payload: RedeemPremiumRequest, request: Request, db: Session = Depends(get_db)):
    user = _require_user(request, db)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    code = (payload.code or "").strip().lower()
    if not code:
        return JSONResponse(status_code=400, content={"error": "Code is required"})

    premium_code = db.scalar(select(PremiumCode).where(PremiumCode.code == code))
    if not premium_code:
        return JSONResponse(status_code=404, content={"error": "Invalid premium code"})

    if not premium_code.active:
        return JSONResponse(status_code=404, content={"error": "Invalid premium code"})

    now = datetime.now(timezone.utc)
    existing = db.scalar(
        select(PremiumCodeRedemption).where(
            PremiumCodeRedemption.code_id == premium_code.id,
            PremiumCodeRedemption.user_id == user.id,
        )
    )
    if not existing:
        db.add(
            PremiumCodeRedemption(
                id=uuid4(),
                code_id=premium_code.id,
                user_id=user.id,
                redeemed_at=now,
                redeemed_ip=_client_ip(request),
            )
        )

    if user.role not in {"admin", "premium"}:
        user.role = "premium"

    db.add(user)
    db.commit()
    db.refresh(user)

    return {"user": _user_payload(user, True)}


@router.delete("/api/user/account")
def delete_account(request: Request, db: Session = Depends(get_db)):
    user = _require_user(request, db)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})
    if user.role == "admin":
        return JSONResponse(
            status_code=403, content={"error": "Admin accounts cannot be deleted here"}
        )

    db.execute(delete(Comment).where(Comment.user_id == user.id))
    db.execute(text("DELETE FROM personal_feed_items WHERE user_id = :uid"), {"uid": user.id})
    db.execute(text("DELETE FROM visitor_sessions WHERE user_id = :uid"), {"uid": user.id})
    db.execute(text("DELETE FROM visitor_events WHERE user_id = :uid"), {"uid": user.id})
    db.execute(text("DELETE FROM premium_code_redemptions WHERE user_id = :uid"), {"uid": user.id})
    db.execute(
        text(
            "UPDATE premium_codes "
            "SET redeemed_by = NULL, redeemed_at = NULL, redeemed_ip = NULL, active = true "
            "WHERE redeemed_by = :uid"
        ),
        {"uid": user.id},
    )
    db.execute(text("DELETE FROM email_subscribers WHERE email = :email"), {"email": user.email})

    db.delete(user)
    db.commit()

    response = JSONResponse(status_code=200, content={"status": "ok"})
    response.delete_cookie(key=settings.session_cookie_name, path="/")
    return response
