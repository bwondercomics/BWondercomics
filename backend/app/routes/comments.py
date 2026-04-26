from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import BannedIP, CensoredWord, Comment, CommentLimit
from ..security import get_current_user
from ..validation import is_admin_role, sanitize_target

router = APIRouter()


class PostCommentRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    target_id: str = Field(alias="targetId")
    message: str


def _iso_z(dt: datetime | None) -> str | None:
    if not dt:
        return None
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _client_ip(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return ""


def _load_comment_limits(db: Session) -> CommentLimit:
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


def _contains_censored_phrase(db: Session, message: str) -> bool:
    words = db.scalars(select(CensoredWord.phrase)).all()
    if not words:
        return False
    normalized = message.lower()
    for phrase in words:
        if phrase and str(phrase).lower() in normalized:
            return True
    return False


@router.get("/api/comments")
def get_comments(
    request: Request,
    target_id: str = Query(alias="targetId"),
    db: Session = Depends(get_db),
):
    try:
        target_id = sanitize_target(target_id)
    except ValueError:
        return JSONResponse(status_code=400, content={"error": "targetId is required"})

    current_user = get_current_user(db, request)
    is_admin = bool(current_user and is_admin_role(current_user.role))

    comments = db.scalars(
        select(Comment).where(Comment.target_id == target_id).order_by(Comment.created_at.asc())
    ).all()

    shaped: list[dict] = []
    for comment in comments:
        hidden = bool(comment.hidden)
        item: dict = {
            "id": str(comment.id),
            "displayName": comment.display_name or "User",
            "message": comment.message or "",
            "createdAt": _iso_z(comment.created_at),
        }
        if hidden:
            item["hidden"] = True
            if not is_admin:
                item["message"] = "Comment removed by moderator"
        if is_admin:
            item["userId"] = str(comment.user_id)
            if hidden:
                item["hiddenBy"] = str(comment.hidden_by) if comment.hidden_by else None
                item["hiddenAt"] = _iso_z(comment.hidden_at)
        shaped.append(item)

    return {"comments": shaped}


@router.post("/api/comments")
def post_comment(payload: PostCommentRequest, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(db, request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    if user.banned_at:
        return JSONResponse(status_code=403, content={"error": "Account is banned from commenting"})

    client_ip = _client_ip(request)
    if client_ip:
        banned_ip = db.get(BannedIP, client_ip)
        if banned_ip:
            return JSONResponse(status_code=403, content={"error": "IP is banned from commenting"})

    message = (payload.message or "").strip()
    if not message or len(message) > 2000:
        return JSONResponse(
            status_code=400,
            content={"error": "Message must be between 1 and 2000 characters"},
        )

    if not is_admin_role(user.role):
        limits = _load_comment_limits(db)
        now = datetime.now(timezone.utc)
        if limits.min_interval_seconds:
            last_comment = db.scalar(
                select(Comment)
                .where(Comment.user_id == user.id)
                .order_by(Comment.created_at.desc())
                .limit(1)
            )
            if last_comment and last_comment.created_at:
                delta = (now - last_comment.created_at).total_seconds()
                if delta < limits.min_interval_seconds:
                    return JSONResponse(
                        status_code=429,
                        content={"error": "Please wait before posting another comment"},
                    )

        if limits.rate_window_seconds:
            window_start = now - timedelta(seconds=limits.rate_window_seconds)
            if limits.max_per_window_user:
                user_count = db.scalar(
                    select(func.count())
                    .select_from(Comment)
                    .where(Comment.user_id == user.id, Comment.created_at >= window_start)
                )
                if user_count and user_count >= limits.max_per_window_user:
                    return JSONResponse(
                        status_code=429,
                        content={"error": "Too many comments in a short period"},
                    )

            if client_ip and limits.max_per_window_ip:
                ip_count = db.scalar(
                    select(func.count())
                    .select_from(Comment)
                    .where(Comment.ip_address == client_ip, Comment.created_at >= window_start)
                )
                if ip_count and ip_count >= limits.max_per_window_ip:
                    return JSONResponse(
                        status_code=429,
                        content={"error": "Too many comments from this IP"},
                    )

        if limits.duplicate_window_seconds:
            window_start = now - timedelta(seconds=limits.duplicate_window_seconds)
            duplicate = db.scalar(
                select(func.count())
                .select_from(Comment)
                .where(
                    and_(
                        Comment.user_id == user.id,
                        Comment.message == message,
                        Comment.created_at >= window_start,
                    )
                )
            )
            if duplicate and duplicate > 0:
                return JSONResponse(
                    status_code=400,
                    content={"error": "Duplicate comment detected"},
                )

        if _contains_censored_phrase(db, message):
            return JSONResponse(
                status_code=400,
                content={"error": "Message contains a censored phrase"},
            )

    try:
        target_id = sanitize_target(payload.target_id)
    except ValueError:
        return JSONResponse(status_code=400, content={"error": "Invalid targetId"})

    created_at = datetime.now(timezone.utc)
    new_comment = Comment(
        id=uuid4(),
        target_id=target_id,
        user_id=user.id,
        display_name=user.display_name or "User",
        message=message,
        created_at=created_at,
        ip_address=client_ip or None,
    )
    db.add(new_comment)
    db.commit()

    return {
        "comment": {
            "id": str(new_comment.id),
            "userId": str(new_comment.user_id),
            "displayName": new_comment.display_name,
            "message": new_comment.message,
            "createdAt": _iso_z(created_at),
        }
    }
