from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Comment
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

    message = (payload.message or "").strip()
    if not message or len(message) > 2000:
        return JSONResponse(
            status_code=400,
            content={"error": "Message must be between 1 and 2000 characters"},
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
