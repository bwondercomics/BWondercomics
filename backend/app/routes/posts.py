from __future__ import annotations

from datetime import datetime, timezone
import os
import re
import shutil
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, func, select, update
from sqlalchemy.orm import Session

from ..bluesky import BlueskyError, BlueskyPost
from ..db import get_db
from ..models import MediaItem, Post, User
from ..file_ops import safe_path
from ..rss import build_rss_xml
from ..security import get_current_user
from ..validation import is_admin_role


router = APIRouter()
POST_ASSET_ROOT = "media/post-assets"
POST_ASSET_PREFIX = f"{POST_ASSET_ROOT}/"


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


def _normalize_image_path(raw: str | None) -> str | None:
    value = (raw or "").strip()
    if not value:
        return None
    if value.startswith("http://") or value.startswith("https://"):
        return value
    if value.startswith("/api/protected/"):
        value = f"protected/{value[len('/api/protected/'):]}"
    return value.lstrip("/")


def _is_post_asset_path(path: str) -> bool:
    return path.startswith(POST_ASSET_PREFIX)


def _resolve_media_access(item: MediaItem | None) -> str:
    if not item:
        return "private"
    if item.access in {"public", "premium", "private"}:
        return item.access
    return "public" if item.public else "private"


def _media_id_from_path(path: str) -> str:
    filename = path.split("/")[-1]
    base = re.sub(r"\.[^.]+$", "", filename)
    base = re.sub(r"[^a-zA-Z0-9]+", "-", base).strip("-").lower() or "media"
    h = 2166136261
    for ch in path:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return f"{base}-{h:08x}"


def _post_asset_path(source_path: str, item: MediaItem | None) -> str:
    ext = os.path.splitext(source_path)[1].lower() or ".png"
    stem = item.id if item else _media_id_from_path(source_path)
    return f"{POST_ASSET_ROOT}/{stem}{ext}"


def _find_media_item(db: Session, path: str) -> MediaItem | None:
    if not path or _is_post_asset_path(path):
        return None
    candidates = {path}
    if path.startswith("protected/"):
        candidates.add(path.replace("protected/", "", 1))
    else:
        candidates.add(f"protected/{path}")
    return db.scalar(select(MediaItem).where(MediaItem.path.in_(candidates)))


def _resolve_source_path(path: str, item: MediaItem | None) -> str | None:
    candidates: list[str] = []
    if path:
        candidates.append(path)
    if item and item.path and item.path not in candidates:
        candidates.append(item.path)
    if path and not path.startswith("protected/"):
        candidates.append(f"protected/{path}")

    for candidate in candidates:
        if candidate.startswith("http://") or candidate.startswith("https://"):
            continue
        try:
            abs_path = safe_path(candidate)
        except ValueError:
            continue
        if abs_path.exists() and abs_path.is_file():
            return candidate
    return None


def _prepare_post_image(db: Session, image: str | None) -> str | None:
    if not image:
        return None
    normalized = _normalize_image_path(image)
    if not normalized or normalized.startswith("http://") or normalized.startswith("https://"):
        return normalized
    if _is_post_asset_path(normalized):
        return normalized

    item = _find_media_item(db, normalized)
    requires_copy = normalized.startswith("protected/")
    if not requires_copy and item and _resolve_media_access(item) != "public":
        requires_copy = True
    if not requires_copy:
        return normalized

    source_path = _resolve_source_path(normalized, item)
    if not source_path:
        raise ValueError("Unable to locate image file to copy for post")

    dest_path = _post_asset_path(source_path, item)
    try:
        abs_src = safe_path(source_path)
        abs_dest = safe_path(dest_path)
    except ValueError as exc:
        raise ValueError("Invalid image path") from exc

    abs_dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        shutil.copy2(str(abs_src), str(abs_dest))
    except Exception as exc:
        raise ValueError("Unable to copy image for post") from exc

    return dest_path


def _cleanup_post_asset_if_unused(db: Session, path: str | None) -> None:
    if not path:
        return
    normalized = _normalize_image_path(path)
    if not normalized or not _is_post_asset_path(normalized):
        return
    stem = os.path.splitext(normalized)[0]
    count = db.scalar(
        select(func.count()).select_from(Post).where(Post.image.like(f"{stem}.%"))
    ) or 0
    if count > 0:
        return
    try:
        abs_base = safe_path(stem)
    except ValueError:
        return
    parent = abs_base.parent
    if not parent.exists():
        return
    for candidate in parent.glob(f"{abs_base.name}.*"):
        if candidate.is_file():
            try:
                candidate.unlink()
            except Exception:
                continue


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
        "shareBluesky": bool(post.share_bluesky),
        "blueskyError": post.bluesky_error or "",
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

    _maybe_share_due_bluesky(db, now)


def _maybe_share_due_bluesky(db: Session, now: datetime) -> None:
    candidates = db.scalars(
        select(Post).where(
            Post.status == "published",
            Post.share.is_(True),
            Post.share_bluesky.is_(True),
            Post.publish_at <= now,
            Post.bluesky_posted_at.is_(None),
        )
    ).all()

    if not candidates:
        return

    for post in candidates:
        _share_post_to_bluesky(db, post)

    db.commit()


def _share_post_to_bluesky(db: Session, post: Post) -> None:
    if not post.share or not post.share_bluesky or post.status != "published":
        post.bluesky_error = None
        return

    if post.bluesky_posted_at:
        return

    try:
        payload = BlueskyPost.from_post(post)
        payload.publish(db)
        post.bluesky_error = None
        post.bluesky_posted_at = datetime.now(timezone.utc)
    except BlueskyError as exc:
        post.bluesky_error = str(exc)


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
    share_bluesky: bool | None = Field(default=None, alias="shareBluesky")
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

    try:
        image = _prepare_post_image(db, payload.image)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})
    image_focus = (payload.image_focus or "center").strip() or "center"
    image_tags = _normalize_tags(payload.image_tags)
    share = bool(payload.share)
    share_bluesky = bool(payload.share_bluesky)
    if status == "draft":
        share = False
        share_bluesky = False
    if not share:
        share_bluesky = False

    post = Post(
        id=uuid4(),
        title=title[:200],
        content=content,
        image=image,
        image_tags=image_tags,
        image_focus=image_focus[:20],
        share=share,
        share_bluesky=share_bluesky,
        status=status,
        publish_at=publish_at,
        created_at=now,
        updated_at=now,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    _share_post_to_bluesky(db, post)
    db.commit()
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

    old_image = post.image
    try:
        image = _prepare_post_image(db, payload.image)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})
    image_focus = (payload.image_focus or post.image_focus or "center").strip() or "center"
    image_tags = _normalize_tags(payload.image_tags) if payload.image_tags is not None else list(post.image_tags or [])
    share = bool(payload.share)
    share_bluesky = bool(payload.share_bluesky) if payload.share_bluesky is not None else post.share_bluesky
    if status == "draft":
        share = False
        share_bluesky = False
    if not share:
        share_bluesky = False

    post.title = title[:200]
    post.content = content
    post.image = image
    post.image_tags = image_tags
    post.image_focus = image_focus[:20]
    post.share = share
    post.share_bluesky = share_bluesky
    post.status = status
    post.publish_at = publish_at
    post.updated_at = now

    db.add(post)
    db.commit()
    if old_image and old_image != image:
        _cleanup_post_asset_if_unused(db, old_image)
    db.refresh(post)
    _share_post_to_bluesky(db, post)
    db.commit()
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

    old_image = post.image
    db.delete(post)
    db.commit()
    _cleanup_post_asset_if_unused(db, old_image)
    return {"status": "ok"}
