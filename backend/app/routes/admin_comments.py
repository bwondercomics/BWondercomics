from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Comment, User
from .admin_utils import iso_z, require_admin


router = APIRouter()


def _shape_comment(comment: Comment, user_email: str | None) -> dict:
    return {
        "id": str(comment.id),
        "targetId": comment.target_id,
        "userId": str(comment.user_id),
        "userEmail": user_email or "",
        "displayName": comment.display_name or "User",
        "message": comment.message or "",
        "createdAt": iso_z(comment.created_at),
        "hidden": bool(comment.hidden),
        "hiddenBy": str(comment.hidden_by) if comment.hidden_by else None,
        "hiddenAt": iso_z(comment.hidden_at),
        "ipAddress": comment.ip_address or "",
    }


@router.get("/api/admin/comments")
def admin_list_comments(
    request: Request,
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    target_id: str | None = Query(default=None, alias="targetId"),
    include_hidden: bool = Query(default=True, alias="includeHidden"),
):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    stmt = select(Comment)
    if target_id:
        stmt = stmt.where(Comment.target_id == target_id)
    if not include_hidden:
        stmt = stmt.where(Comment.hidden.is_(False))

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    comments = db.scalars(
        stmt.order_by(Comment.created_at.desc()).offset(offset).limit(limit)
    ).all()

    user_ids = {c.user_id for c in comments if c.user_id}
    user_email_map = {}
    if user_ids:
        for user in db.scalars(select(User).where(User.id.in_(user_ids))).all():
            user_email_map[user.id] = user.email

    shaped = [_shape_comment(c, user_email_map.get(c.user_id)) for c in comments]
    return {"comments": shaped, "total": int(total)}


@router.get("/api/admin/comments/recent")
def admin_recent_comments(
    request: Request,
    db: Session = Depends(get_db),
    limit: int = Query(10, ge=1, le=50),
):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    comments = db.scalars(select(Comment).order_by(Comment.created_at.desc()).limit(limit)).all()
    user_ids = {c.user_id for c in comments if c.user_id}
    user_email_map = {}
    if user_ids:
        for user in db.scalars(select(User).where(User.id.in_(user_ids))).all():
            user_email_map[user.id] = user.email

    shaped = [_shape_comment(c, user_email_map.get(c.user_id)) for c in comments]
    return {"comments": shaped, "generatedAt": iso_z(datetime.now(timezone.utc))}
