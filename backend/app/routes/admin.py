from __future__ import annotations

from datetime import datetime, timezone
import time
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, distinct, func, select, text, update
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    AdminTodo,
    BannedIP,
    CensoredWord,
    Comment,
    CommentLimit,
    EmailSubscriber,
    PremiumCode,
    PremiumCodeRedemption,
    User,
    VisitorSession,
)
from ..security import get_current_user, public_user
from ..settings import settings
from ..umami_api import UmamiAPIError, fetch_umami_stats, fetch_umami_metrics
from ..validation import is_admin_role, sanitize_target
from .admin_utils import iso_z


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
    payload = []
    for user in users:
        info = public_user(user)
        info["emailOptIn"] = bool(user.email_opt_in)
        info["emailOptInAt"] = iso_z(user.email_opt_in_at)
        payload.append(info)
    return {"users": payload}


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


class AdminTodoCreateRequest(BaseModel):
    body: str


@router.delete("/api/admin/users/{user_id}")
def admin_delete_user(user_id: str, request: Request, db: Session = Depends(get_db)):
    admin = _require_admin(request, db)
    if not admin:
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    user_id_raw = (user_id or "").strip()
    if not user_id_raw:
        return JSONResponse(status_code=400, content={"error": "userId is required"})

    try:
        target_id = UUID(user_id_raw)
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid userId"})

    if admin.id == target_id:
        return JSONResponse(status_code=400, content={"error": "You cannot delete your own account"})

    target = db.get(User, target_id)
    if not target:
        return JSONResponse(status_code=404, content={"error": "User not found"})

    if target.role == "admin":
        admin_count = db.scalar(select(func.count()).select_from(User).where(User.role == "admin")) or 0
        if admin_count <= 1:
            return JSONResponse(status_code=400, content={"error": "Cannot delete the last admin"})

    db.execute(delete(Comment).where(Comment.user_id == target.id))
    db.execute(
        update(Comment)
        .where(Comment.hidden_by == target.id)
        .values(hidden_by=None, hidden_at=None)
    )
    db.execute(delete(PremiumCodeRedemption).where(PremiumCodeRedemption.user_id == target.id))
    db.execute(
        update(PremiumCode)
        .where(PremiumCode.redeemed_by == target.id)
        .values(redeemed_by=None, redeemed_at=None, redeemed_ip=None, active=True)
    )
    db.execute(
        update(PremiumCode)
        .where(PremiumCode.created_by == target.id)
        .values(created_by=None)
    )
    db.execute(
        update(BannedIP)
        .where(BannedIP.banned_by == target.id)
        .values(banned_by=None)
    )
    db.execute(
        update(CensoredWord)
        .where(CensoredWord.created_by == target.id)
        .values(created_by=None)
    )
    db.execute(
        update(CommentLimit)
        .where(CommentLimit.updated_by == target.id)
        .values(updated_by=None)
    )
    db.execute(
        update(VisitorSession)
        .where(VisitorSession.user_id == target.id)
        .values(user_id=None)
    )
    db.execute(
        update(AdminTodo)
        .where(AdminTodo.created_by == target.id)
        .values(created_by=None)
    )
    db.execute(text("DELETE FROM personal_feed_items WHERE user_id = :uid"), {"uid": target.id})
    db.execute(delete(EmailSubscriber).where(EmailSubscriber.email == target.email))

    db.delete(target)
    db.commit()

    return {"status": "ok"}


@router.get("/api/admin/todos")
def admin_list_todos(
    request: Request,
    db: Session = Depends(get_db),
    limit: int = Query(30, ge=1, le=200),
):
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    rows = db.execute(
        select(AdminTodo, User.email, User.display_name)
        .outerjoin(User, AdminTodo.created_by == User.id)
        .order_by(AdminTodo.created_at.desc())
        .limit(limit)
    ).all()

    todos = []
    for todo, email, display_name in rows:
        todos.append(
            {
                "id": str(todo.id),
                "body": todo.body,
                "createdAt": iso_z(todo.created_at),
                "createdByEmail": email or "",
                "createdByName": display_name or "",
            }
        )

    return {"todos": todos}


@router.post("/api/admin/todos")
def admin_create_todo(
    payload: AdminTodoCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = _require_admin(request, db)
    if not admin:
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    body = (payload.body or "").strip()
    if not body:
        return JSONResponse(status_code=400, content={"error": "Todo text is required"})
    if len(body) > 500:
        body = body[:500]

    todo = AdminTodo(
        body=body,
        created_by=admin.id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(todo)
    db.commit()
    db.refresh(todo)

    return {
        "todo": {
            "id": str(todo.id),
            "body": todo.body,
            "createdAt": iso_z(todo.created_at),
            "createdByEmail": admin.email,
            "createdByName": admin.display_name,
        }
    }


@router.delete("/api/admin/todos/{todo_id}")
def admin_delete_todo(todo_id: str, request: Request, db: Session = Depends(get_db)):
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    raw = (todo_id or "").strip()
    if not raw:
        return JSONResponse(status_code=400, content={"error": "todoId is required"})
    try:
        todo_uuid = UUID(raw)
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid todoId"})

    todo = db.get(AdminTodo, todo_uuid)
    if not todo:
        return JSONResponse(status_code=404, content={"error": "Todo not found"})

    db.delete(todo)
    db.commit()

    return {"status": "ok"}


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

    referrers = []
    events = []
    stats = {}

    try:
        stats = fetch_umami_stats(ranges)

        # Fetch referrers and events for the 7-day window
        start_7d, end_7d = ranges["last7d"]
        referrers_data = fetch_umami_metrics(start_7d, end_7d, metric_type="referrer", limit=10)
        events_data = fetch_umami_metrics(start_7d, end_7d, metric_type="event", limit=10)

        # Transform to frontend format: [{x: "label", y: count}, ...]
        referrers = [{"x": item.get("x", ""), "y": item.get("y", 0)} for item in referrers_data if item.get("x")]
        events = [{"x": item.get("x", ""), "y": item.get("y", 0)} for item in events_data if item.get("x")]

    except UmamiAPIError as exc:
        return JSONResponse(status_code=502, content={"error": f"Umami API error: {exc}"})

    return {
        "source": "umami",
        "websiteId": settings.umami_website_id,
        "ranges": {
            name: {**(stats.get(name, {}) or {}), "start": start, "end": end}
            for name, (start, end) in ranges.items()
        },
        "referrers": referrers,
        "events": events,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
