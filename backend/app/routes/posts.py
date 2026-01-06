from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, select, update
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Post, User
from ..rss import build_rss_xml
from ..security import get_current_user
from ..validation import is_admin_role


router = APIRouter()


def _iso_z(dt: datetime | None) -> str | None:
    if not dt:
        return None
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_dt(raw: str | None) -> datetime | None:
    if not raw:
        return None
    value = raw.strip()
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _normalize_tags(raw: Any) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        tags: list[str] = []
        for item in raw:
            val = str(item or "").strip()
            if val:
                tags.append(val)
        return tags[:50]
    if isinstance(raw, str):
        return [t for t in (x.strip() for x in raw.split(",")) if t][:50]
    return []


def _require_admin(request: Request, db: Session) -> User | None:
    user = get_current_user(db, request)
    if not user or not is_admin_role(user.role):
        return None
    return user


def _post_to_dict(post: Post) -> dict[str, Any]:
    return {
        "id": str(post.id),
        "title": post.title,
        "image": post.image or "",
        "imageTags": list(post.image_tags or []),
        "imageFocus": post.image_focus or "center",
        "content": post.content,
        "date": _iso_z(post.publish_at),
        "share": bool(post.share),
        "status": post.status,
        "updatedAt": _iso_z(post.updated_at),
    }


def _promote_due_scheduled(db: Session, now: datetime) -> None:
    result = db.execute(
        update(Post)
        .where(and_(Post.status == "scheduled", Post.publish_at <= now))
        .values(status="published", updated_at=now)
    )
    if getattr(result, "rowcount", 0):
        db.commit()


@router.get("/api/posts")
def list_public_posts(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    _promote_due_scheduled(db, now)

    stmt = (
        select(Post)
        .where(Post.status == "published")
        .order_by(Post.publish_at.desc())
        .offset(offset)
        .limit(limit)
    )
    posts = db.scalars(stmt).all()
    return {"posts": [_post_to_dict(p) for p in posts]}


@router.get("/api/posts/latest")
def latest_public_post(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    _promote_due_scheduled(db, now)

    post = db.scalar(select(Post).where(Post.status == "published").order_by(Post.publish_at.desc()).limit(1))
    return {"post": _post_to_dict(post) if post else None}


@router.get("/rss.xml")
def rss_xml(request: Request, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    _promote_due_scheduled(db, now)

    posts = db.scalars(
        select(Post)
        .where(and_(Post.status == "published", Post.share.is_(True)))
        .order_by(Post.publish_at.desc())
        .limit(50)
    ).all()

    forwarded_proto = (request.headers.get("X-Forwarded-Proto") or "").split(",")[0].strip().lower()
    proto = forwarded_proto if forwarded_proto in ("http", "https") else "http"
    host = (request.headers.get("X-Forwarded-Host") or request.headers.get("Host") or "").split(",")[0].strip()
    base_url = f"{proto}://{host}".rstrip("/") if host else ""

    shaped = [
        {
            "id": str(p.id),
            "title": p.title,
            "content": p.content,
            "image": p.image or "",
            "date": _iso_z(p.publish_at) or "",
            "share": bool(p.share),
        }
        for p in posts
    ]
    xml_str = build_rss_xml(shaped, base_url=base_url)

    return Response(
        content=xml_str,
        media_type="application/rss+xml; charset=utf-8",
        headers={"Cache-Control": "no-store"},
    )


@router.get("/api/admin/posts")
def admin_list_posts(request: Request, db: Session = Depends(get_db)):
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    now = datetime.now(timezone.utc)
    _promote_due_scheduled(db, now)

    posts = db.scalars(select(Post).order_by(Post.publish_at.desc())).all()
    return {"posts": [_post_to_dict(p) for p in posts]}


class PostUpsertRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str
    content: str
    image: str | None = None
    image_tags: list[str] | str | None = Field(default=None, alias="imageTags")
    image_focus: str | None = Field(default=None, alias="imageFocus")
    share: bool = True
    status: str | None = None
    date: str | None = None


def _normalize_status(raw: str | None) -> str:
    value = (raw or "published").strip().lower()
    if value not in {"draft", "scheduled", "published"}:
        return "published"
    return value


def _coerce_status(status: str, publish_at: datetime | None, now: datetime, *, require_date_for_scheduled: bool) -> tuple[str, datetime]:
    if status == "scheduled" and publish_at is None:
        if require_date_for_scheduled:
            raise ValueError("date is required for scheduled posts")
        publish_at = now

    publish_at = publish_at or now
    if status == "published" and publish_at > now:
        status = "scheduled"
    if status == "scheduled" and publish_at <= now:
        status = "published"
    return status, publish_at


@router.post("/api/admin/posts")
def admin_create_post(payload: PostUpsertRequest, request: Request, db: Session = Depends(get_db)):
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    title = (payload.title or "").strip()
    content = (payload.content or "").strip()
    if not title or not content:
        return JSONResponse(status_code=400, content={"error": "title and content are required"})

    now = datetime.now(timezone.utc)
    status = _normalize_status(payload.status)
    publish_at = _parse_dt(payload.date)
    try:
        status, publish_at = _coerce_status(status, publish_at, now, require_date_for_scheduled=True)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})

    image = (payload.image or "").strip() or None
    image_focus = (payload.image_focus or "center").strip() or "center"
    image_tags = _normalize_tags(payload.image_tags)
    share = bool(payload.share)
    if status == "draft":
        share = False

    post = Post(
        id=uuid4(),
        title=title[:200],
        content=content,
        image=image,
        image_tags=image_tags,
        image_focus=image_focus[:20],
        share=share,
        status=status,
        publish_at=publish_at,
        created_at=now,
        updated_at=now,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return {"post": _post_to_dict(post)}


@router.put("/api/admin/posts/{post_id}")
def admin_update_post(post_id: str, payload: PostUpsertRequest, request: Request, db: Session = Depends(get_db)):
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    try:
        uid = UUID(post_id)
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid post id"})

    post = db.get(Post, uid)
    if not post:
        return JSONResponse(status_code=404, content={"error": "Post not found"})

    title = (payload.title or "").strip()
    content = (payload.content or "").strip()
    if not title or not content:
        return JSONResponse(status_code=400, content={"error": "title and content are required"})

    now = datetime.now(timezone.utc)
    status = _normalize_status(payload.status or post.status)
    publish_at = _parse_dt(payload.date) if payload.date is not None else post.publish_at
    try:
        status, publish_at = _coerce_status(status, publish_at, now, require_date_for_scheduled=False)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})

    image = (payload.image or "").strip() or None
    image_focus = (payload.image_focus or post.image_focus or "center").strip() or "center"
    image_tags = _normalize_tags(payload.image_tags) if payload.image_tags is not None else list(post.image_tags or [])
    share = bool(payload.share)
    if status == "draft":
        share = False

    post.title = title[:200]
    post.content = content
    post.image = image
    post.image_tags = image_tags
    post.image_focus = image_focus[:20]
    post.share = share
    post.status = status
    post.publish_at = publish_at
    post.updated_at = now

    db.add(post)
    db.commit()
    db.refresh(post)
    return {"post": _post_to_dict(post)}


@router.delete("/api/admin/posts/{post_id}")
def admin_delete_post(post_id: str, request: Request, db: Session = Depends(get_db)):
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    try:
        uid = UUID(post_id)
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid post id"})

    post = db.get(Post, uid)
    if not post:
        return JSONResponse(status_code=404, content={"error": "Post not found"})

    db.delete(post)
    db.commit()
    return {"status": "ok"}
