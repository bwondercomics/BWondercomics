from __future__ import annotations

from datetime import datetime, timezone
import time
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Comment, User
from ..security import get_current_user, public_user
from ..settings import settings
from ..umami_api import UmamiAPIError, fetch_umami_stats
from ..validation import is_admin_role, sanitize_target


router = APIRouter()


def _require_admin(request: Request, db: Session) -> User | None:
    user = get_current_user(db, request)
    if not user or not is_admin_role(user.role):
        return None
    return user


@router.get("/api/admin/users")
def admin_list_users(request: Request, db: Session = Depends(get_db)):
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})
    users = db.scalars(select(User).order_by(User.created_at.asc())).all()
    return {"users": [public_user(u) for u in users]}


class SetUserRoleRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: str = Field(alias="userId")
    role: str


@router.post("/api/admin/users/role")
def admin_set_user_role(payload: SetUserRoleRequest, request: Request, db: Session = Depends(get_db)):
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    user_id_raw = (payload.user_id or "").strip()
    role = (payload.role or "").strip().lower()

    if not user_id_raw:
        return JSONResponse(status_code=400, content={"error": "userId is required"})
    if role not in {"user", "premium", "admin"}:
        return JSONResponse(status_code=400, content={"error": "Invalid role"})

    try:
        user_id = UUID(user_id_raw)
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid userId"})

    target = db.get(User, user_id)
    if not target:
        return JSONResponse(status_code=404, content={"error": "User not found"})

    target.role = role
    db.add(target)
    db.commit()
    db.refresh(target)
    return {"user": public_user(target)}


class ModerateCommentRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    action: str
    comment_id: str = Field(alias="commentId")
    target_id: str = Field(alias="targetId")


@router.post("/api/admin/comments")
def admin_moderate_comment(payload: ModerateCommentRequest, request: Request, db: Session = Depends(get_db)):
    admin = _require_admin(request, db)
    if not admin:
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    action = (payload.action or "").strip().lower()
    comment_id_raw = (payload.comment_id or "").strip()

    if action not in {"delete", "hide", "unhide"}:
        return JSONResponse(status_code=400, content={"error": "Invalid action"})
    if not comment_id_raw:
        return JSONResponse(status_code=400, content={"error": "commentId is required"})

    try:
        target_id = sanitize_target(payload.target_id)
    except ValueError:
        return JSONResponse(status_code=400, content={"error": "targetId is required"})

    try:
        comment_id = UUID(comment_id_raw)
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid commentId"})

    comment = db.scalar(select(Comment).where(Comment.id == comment_id))
    if not comment or comment.target_id != target_id:
        return JSONResponse(status_code=404, content={"error": "Comment not found"})

    if action == "delete":
        db.delete(comment)
        db.commit()
        return {"status": "ok"}

    now = datetime.now(timezone.utc)
    if action == "hide":
        comment.hidden = True
        comment.hidden_by = admin.id
        comment.hidden_at = now
    elif action == "unhide":
        comment.hidden = False
        comment.hidden_by = None
        comment.hidden_at = None

    db.add(comment)
    db.commit()
    return {"status": "ok"}


@router.get("/api/admin/analytics/summary")
def admin_analytics_summary(request: Request, db: Session = Depends(get_db)):
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    now_ms = int(time.time() * 1000)
    ranges = {
        "last24h": (now_ms - 24 * 60 * 60 * 1000, now_ms),
        "last7d": (now_ms - 7 * 24 * 60 * 60 * 1000, now_ms),
    }

    try:
        stats = fetch_umami_stats(ranges)
    except UmamiAPIError as exc:
        status = exc.status or 502
        return JSONResponse(status_code=status, content={"error": str(exc)})

    return {
        "source": "umami",
        "websiteId": settings.umami_website_id,
        "ranges": {
            name: {**(stats.get(name, {}) or {}), "start": start, "end": end}
            for name, (start, end) in ranges.items()
        },
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
