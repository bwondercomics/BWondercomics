from __future__ import annotations

import base64
import json
import os
import re
import shutil
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..content_store import (
    apply_media_items_save,
    get_page_config,
    list_media_items,
    save_page_config,
)
from ..db import get_db
from ..file_ops import ALLOWED_IMAGE_EXTENSIONS, extract_numbers, renumber_files, safe_path
from ..models import Entry, EntryPage, MediaItem, PremiumCode, PremiumCodeRedemption, Series, User
from ..security import get_current_user
from ..series_store import apply_series_data_save, apply_series_index_save, sanitize_series_id
from ..settings import settings
from ..validation import is_admin_role, is_premium_role

router = APIRouter()


def _safe_rel_path(raw: str) -> Path | None:
    rel = (raw or "").strip().lstrip("/")
    if not rel:
        return None
    rel_path = Path(rel)
    if ".." in rel_path.parts:
        return None
    return rel_path


def _candidate_file(root: Path, rel_path: Path) -> Path | None:
    root = root.resolve()
    candidate = (root / rel_path).resolve()
    if not candidate.is_relative_to(root):
        return None
    if candidate.is_file():
        return candidate
    return None


@router.get("/assets/{asset_path:path}")
def legacy_assets(asset_path: str):
    rel_path = _safe_rel_path(asset_path)
    if rel_path is None:
        return JSONResponse(status_code=404, content={"error": "Asset not found"})

    dist_dir = settings.base_dir / "dist"
    candidates = [
        _candidate_file(dist_dir / "assets", rel_path),
        _candidate_file(dist_dir, rel_path),
        _candidate_file(settings.base_dir / "assets", rel_path),
    ]
    for match in candidates:
        if match:
            return FileResponse(match)

    return JSONResponse(status_code=404, content={"error": "Asset not found"})


@router.get("/admin/page-config.json")
def legacy_page_config(db: Session = Depends(get_db)):
    data = get_page_config(db, None)
    if data is None:
        return JSONResponse(status_code=404, content={"error": "page-config.json not found"})
    return JSONResponse(content=data)


@router.get("/admin/series/{series_id}/page-config.json")
def legacy_series_page_config(series_id: str, db: Session = Depends(get_db)):
    sid = sanitize_series_id(series_id)
    data = get_page_config(db, sid)
    if data is None:
        return JSONResponse(status_code=404, content={"error": "page-config.json not found"})
    return JSONResponse(content=data)


@router.get("/api/admin/page-config")
@router.get("/api/admin/page-config.json")
def api_page_config(db: Session = Depends(get_db)):
    data = get_page_config(db, None)
    if data is None:
        return JSONResponse(status_code=404, content={"error": "page-config.json not found"})
    return JSONResponse(content=data)


@router.get("/api/admin/series/{series_id}/page-config")
@router.get("/api/admin/series/{series_id}/page-config.json")
def api_series_page_config(series_id: str, db: Session = Depends(get_db)):
    sid = sanitize_series_id(series_id)
    data = get_page_config(db, sid)
    if data is None:
        return JSONResponse(status_code=404, content={"error": "page-config.json not found"})
    return JSONResponse(content=data)


@router.get("/page-config.json")
def public_page_config(db: Session = Depends(get_db)):
    data = get_page_config(db, None)
    if data is None:
        return JSONResponse(status_code=404, content={"error": "page-config.json not found"})
    return JSONResponse(content=data)


@router.get("/series/{series_id}/page-config.json")
def public_series_page_config(series_id: str, db: Session = Depends(get_db)):
    sid = sanitize_series_id(series_id)
    data = get_page_config(db, sid)
    if data is None:
        return JSONResponse(status_code=404, content={"error": "page-config.json not found"})
    return JSONResponse(content=data)


@router.get("/media.json")
def legacy_media_index(db: Session = Depends(get_db)):
    return JSONResponse(content=list_media_items(db), headers={"Cache-Control": "no-store"})


def _require_admin(request: Request, db: Session) -> User | None:
    user = get_current_user(db, request)
    if not user or not is_admin_role(user.role):
        return None
    return user


def _has_premium_access(db: Session, user: User | None) -> bool:
    if not user:
        return False
    if is_premium_role(user.role):
        return True
    redeemed = db.scalar(
        select(func.count())
        .select_from(PremiumCodeRedemption)
        .where(PremiumCodeRedemption.user_id == user.id)
    )
    if redeemed:
        return True
    fallback = db.scalar(
        select(func.count()).select_from(PremiumCode).where(PremiumCode.redeemed_by == user.id)
    )
    return bool(fallback)


def _protected_rel_path(asset_path: str) -> tuple[Path, str] | None:
    rel_path = _safe_rel_path(asset_path)
    if rel_path is None:
        return None
    protected_rel = Path("protected") / rel_path
    return protected_rel, str(rel_path)


def _resolve_media_access(item: MediaItem | None) -> str:
    if not item:
        return "private"
    if item.access in {"public", "premium", "private"}:
        return item.access
    return "public" if item.public else "private"


@router.get("/api/protected/{asset_path:path}")
def protected_assets(asset_path: str, request: Request, db: Session = Depends(get_db)):
    resolved = _protected_rel_path(asset_path)
    if resolved is None:
        return JSONResponse(status_code=404, content={"error": "Asset not found"})

    protected_rel, raw_rel = resolved
    try:
        abs_path = safe_path(str(protected_rel))
    except ValueError:
        return JSONResponse(status_code=404, content={"error": "Asset not found"})

    if not abs_path.is_file():
        return JSONResponse(status_code=404, content={"error": "Asset not found"})

    user = get_current_user(db, request)
    rel_parts = Path(raw_rel).parts
    if rel_parts and rel_parts[0] == "media":
        item = db.scalar(select(MediaItem).where(MediaItem.path == str(protected_rel)))
        if not item:
            item = db.scalar(select(MediaItem).where(MediaItem.path == raw_rel))
        access = _resolve_media_access(item)
        if access == "private" and not is_admin_role(user.role if user else None):
            return JSONResponse(status_code=403, content={"error": "Private media"})
        if access == "premium" and not _has_premium_access(db, user):
            return JSONResponse(status_code=403, content={"error": "Premium media"})
        if access == "private" and not item:
            return JSONResponse(status_code=404, content={"error": "Asset not found"})
        return FileResponse(abs_path)

    entry_page = db.scalar(select(EntryPage).where(EntryPage.path == str(protected_rel)))
    if not entry_page:
        if is_admin_role(user.role if user else None):
            return FileResponse(abs_path)
        return JSONResponse(status_code=404, content={"error": "Asset not found"})

    entry = db.get(Entry, entry_page.entry_id)
    if not entry:
        return JSONResponse(status_code=404, content={"error": "Asset not found"})
    series = db.get(Series, entry.series_id)
    requires_premium = bool(entry.premium_only or (series and series.premium_only))
    if requires_premium and not _has_premium_access(db, user):
        return JSONResponse(status_code=403, content={"error": "Premium content"})

    return FileResponse(abs_path)


class SaveRequest(BaseModel):
    filename: str
    content: Any


@router.post("/api/save")
def save_file(payload: SaveRequest, request: Request, db: Session = Depends(get_db)):
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    filename = payload.filename
    content = payload.content

    if not filename or content is None:
        return JSONResponse(status_code=400, content={"error": "Missing filename or content"})

    if ".." in filename or filename.startswith(("/", "\\")):
        return JSONResponse(status_code=403, content={"error": "Invalid filename"})

    if filename == "posts.json":
        return JSONResponse(
            status_code=400,
            content={"error": "posts.json is no longer supported. Use /api/admin/posts instead."},
        )

    # Virtual JSON endpoints backed by Postgres (hard cut; no disk writes).
    if filename == "admin/series.json":
        try:
            apply_series_index_save(db, content)
        except ValueError as exc:
            return JSONResponse(status_code=400, content={"error": str(exc)})
        return {"status": "success", "message": "Saved admin/series.json (database)"}

    if filename == "admin/data.json":
        try:
            apply_series_data_save(db, "battle-bros", content)
        except ValueError as exc:
            return JSONResponse(status_code=400, content={"error": str(exc)})
        return {"status": "success", "message": "Saved admin/data.json (database)"}

    if filename.startswith("admin/series/") and filename.endswith("/data.json"):
        parts = filename.split("/")
        if len(parts) >= 4:
            series_id = parts[2]
            try:
                apply_series_data_save(db, series_id, content)
            except ValueError as exc:
                return JSONResponse(status_code=400, content={"error": str(exc)})
            return {"status": "success", "message": f"Saved {filename} (database)"}

    if filename == "admin/page-config.json":
        try:
            save_page_config(db, None, content)
        except ValueError as exc:
            return JSONResponse(status_code=400, content={"error": str(exc)})
        return {"status": "success", "message": "Saved admin/page-config.json (database)"}

    if filename.startswith("admin/series/") and filename.endswith("/page-config.json"):
        parts = filename.split("/")
        if len(parts) >= 4:
            series_id = parts[2]
            try:
                save_page_config(db, series_id, content)
            except ValueError as exc:
                return JSONResponse(status_code=400, content={"error": str(exc)})
            return {"status": "success", "message": f"Saved {filename} (database)"}

    if filename == "media.json":
        try:
            apply_media_items_save(db, content)
        except ValueError as exc:
            return JSONResponse(status_code=400, content={"error": str(exc)})
        return {"status": "success", "message": "Saved media.json (database)"}

    try:
        file_path = safe_path(filename)
    except ValueError:
        return JSONResponse(status_code=403, content={"error": "Invalid path"})

    file_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        if filename.endswith(".json"):
            file_path.write_text(json.dumps(content, indent=2), encoding="utf-8")
        else:
            file_path.write_text(str(content), encoding="utf-8")
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})

    return {"status": "success", "message": f"Saved {filename}"}


class CreateEntryRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    entry_folder: str = Field(alias="entryFolder")


@router.post("/api/create-entry")
def create_entry(payload: CreateEntryRequest, request: Request, db: Session = Depends(get_db)):
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    entry_folder = (payload.entry_folder or "").strip().strip("/")
    if not entry_folder:
        return JSONResponse(status_code=400, content={"error": "entryFolder is required"})

    try:
        dest_dir = safe_path(entry_folder)
        dest_dir.mkdir(parents=True, exist_ok=True)
    except ValueError:
        return JSONResponse(status_code=400, content={"error": "Invalid entry path"})
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})

    return {"status": "ok", "folder": entry_folder}


class ListEntryImagesRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    entry_folder: str = Field(alias="entryFolder")


@router.post("/api/list-entry-images")
def list_entry_images(
    payload: ListEntryImagesRequest, request: Request, db: Session = Depends(get_db)
):
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    entry_folder = (payload.entry_folder or "").strip().strip("/")
    if not entry_folder:
        return JSONResponse(status_code=400, content={"error": "entryFolder is required"})

    try:
        target_dir = safe_path(entry_folder)
    except ValueError:
        return JSONResponse(status_code=400, content={"error": "Invalid entry path"})

    if not target_dir.exists():
        return {"paths": []}

    files: list[str] = []
    for name in os.listdir(target_dir):
        ext = os.path.splitext(name)[1].lower()
        if ext in ALLOWED_IMAGE_EXTENSIONS:
            files.append(name)
    files.sort(key=lambda n: (extract_numbers(n), n))
    return {"paths": [f"{entry_folder}/{name}" for name in files]}


class UploadImageFile(BaseModel):
    name: str
    data: str


class UploadEntryImagesRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    entry_folder: str = Field(alias="entryFolder")
    files: list[UploadImageFile]


@router.post("/api/upload-entry-images")
def upload_entry_images(
    payload: UploadEntryImagesRequest, request: Request, db: Session = Depends(get_db)
):
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    entry_folder = (payload.entry_folder or "").strip().strip("/")
    files = payload.files or []

    if not entry_folder or not isinstance(files, list):
        return JSONResponse(
            status_code=400, content={"error": "entryFolder and files are required"}
        )

    try:
        dest_dir = safe_path(entry_folder)
    except ValueError:
        return JSONResponse(status_code=400, content={"error": "Invalid entry path"})

    dest_dir.mkdir(parents=True, exist_ok=True)

    existing_numbers: list[int] = []
    for name in os.listdir(dest_dir):
        if os.path.splitext(name)[1].lower() in ALLOWED_IMAGE_EXTENSIONS:
            num = extract_numbers(name)
            if num >= 1:
                existing_numbers.append(num)
    next_number = max(existing_numbers) + 1 if existing_numbers else 1

    stored_paths: list[str] = []
    errors: list[dict[str, str]] = []

    for idx, file_info in enumerate(files):
        name = (file_info.name or f"file_{idx}").strip()
        ext = os.path.splitext(name)[1].lower()
        if ext not in ALLOWED_IMAGE_EXTENSIONS:
            errors.append({"file": name, "error": "Unsupported file type"})
            continue

        b64_data = file_info.data
        if not b64_data:
            errors.append({"file": name, "error": "Missing data"})
            continue

        try:
            raw = base64.b64decode(b64_data)
        except Exception:
            errors.append({"file": name, "error": "Invalid base64 data"})
            continue

        new_name = f"{next_number:02d}{ext}"
        next_number += 1

        try:
            (dest_dir / new_name).write_bytes(raw)
            stored_paths.append(f"{entry_folder}/{new_name}")
        except Exception as exc:
            errors.append({"file": name, "error": str(exc)})

    status = 200 if stored_paths else 400
    return JSONResponse(status_code=status, content={"paths": stored_paths, "errors": errors})


class DeleteImageRequest(BaseModel):
    path: str


@router.post("/api/delete-image")
def delete_image(payload: DeleteImageRequest, request: Request, db: Session = Depends(get_db)):
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    rel_path = (payload.path or "").strip().strip("/")
    if not rel_path:
        return JSONResponse(status_code=400, content={"error": "path is required"})

    try:
        abs_path = safe_path(rel_path)
    except ValueError:
        return JSONResponse(status_code=400, content={"error": "Invalid path"})

    if not abs_path.exists():
        return JSONResponse(status_code=404, content={"error": "File not found"})

    try:
        abs_path.unlink()
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})

    return {"status": "deleted", "path": rel_path}


class RenameImageRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    src: str = Field(alias="from")
    dest: str = Field(alias="to")


@router.post("/api/rename-image")
def rename_image(payload: RenameImageRequest, request: Request, db: Session = Depends(get_db)):
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    src = (payload.src or "").strip().strip("/")
    dest = (payload.dest or "").strip().strip("/")
    if not src or not dest:
        return JSONResponse(status_code=400, content={"error": "from and to are required"})

    try:
        abs_src = safe_path(src)
        abs_dest = safe_path(dest)
    except ValueError:
        return JSONResponse(status_code=400, content={"error": "Invalid path"})

    if not abs_src.exists():
        return JSONResponse(status_code=404, content={"error": "Source file not found"})
    if abs_dest.exists():
        return JSONResponse(status_code=409, content={"error": "Destination already exists"})

    abs_dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.replace(abs_src, abs_dest)
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})

    return {"status": "renamed", "from": src, "to": dest}


class MovePathRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    src: str = Field(alias="from")
    dest: str = Field(alias="to")


@router.post("/api/move-path")
def move_path(payload: MovePathRequest, request: Request, db: Session = Depends(get_db)):
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    src = (payload.src or "").strip().strip("/")
    dest = (payload.dest or "").strip().strip("/")
    if not src or not dest:
        return JSONResponse(status_code=400, content={"error": "from and to are required"})

    try:
        abs_src = safe_path(src)
        abs_dest = safe_path(dest)
    except ValueError:
        return JSONResponse(status_code=400, content={"error": "Invalid path"})

    if not abs_src.exists():
        return JSONResponse(status_code=404, content={"error": "Source path not found"})
    if abs_dest.exists():
        return JSONResponse(status_code=409, content={"error": "Destination already exists"})

    abs_dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        shutil.move(str(abs_src), str(abs_dest))
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})

    return {"status": "moved", "from": src, "to": dest}


class CopyPathRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    src: str = Field(alias="from")
    dest: str = Field(alias="to")
    cleanup_stem: bool = Field(default=False, alias="cleanupStem")


@router.post("/api/copy-path")
def copy_path(payload: CopyPathRequest, request: Request, db: Session = Depends(get_db)):
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    src = (payload.src or "").strip().strip("/")
    dest = (payload.dest or "").strip().strip("/")
    if not src or not dest:
        return JSONResponse(status_code=400, content={"error": "from and to are required"})

    try:
        abs_src = safe_path(src)
        abs_dest = safe_path(dest)
    except ValueError:
        return JSONResponse(status_code=400, content={"error": "Invalid path"})

    if not abs_src.exists():
        return JSONResponse(status_code=404, content={"error": "Source path not found"})

    abs_dest.parent.mkdir(parents=True, exist_ok=True)

    if payload.cleanup_stem:
        for candidate in abs_dest.parent.glob(f"{abs_dest.stem}.*"):
            if candidate == abs_dest:
                continue
            if candidate.is_file():
                try:
                    candidate.unlink()
                except Exception:
                    continue

    try:
        shutil.copy2(str(abs_src), str(abs_dest))
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})

    return {"status": "copied", "from": src, "to": dest}


class RenumberEntryRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    entry_folder: str = Field(alias="entryFolder")
    order: list[str]


@router.post("/api/renumber-entry")
def renumber_entry(payload: RenumberEntryRequest, request: Request, db: Session = Depends(get_db)):
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    entry_folder = (payload.entry_folder or "").strip().strip("/")
    order = payload.order or []
    if not entry_folder or not isinstance(order, list) or not order:
        return JSONResponse(
            status_code=400,
            content={"error": "entryFolder and non-empty order are required"},
        )

    try:
        new_paths = renumber_files(entry_folder, order)
    except FileNotFoundError as exc:
        return JSONResponse(status_code=404, content={"error": str(exc)})
    except ValueError as exc:
        message = str(exc)
        if message.startswith("Unsupported file type"):
            return JSONResponse(status_code=400, content={"error": message})
        return JSONResponse(status_code=400, content={"error": message})
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})

    return {"status": "renumbered", "paths": new_paths}


class UploadMediaRequest(BaseModel):
    file: UploadImageFile


@router.post("/api/upload-media")
def upload_media(payload: UploadMediaRequest, request: Request, db: Session = Depends(get_db)):
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    file_info = payload.file or UploadImageFile(name="", data="")
    name = (file_info.name or "").strip()
    b64_data = file_info.data
    if not name or not b64_data:
        return JSONResponse(status_code=400, content={"error": "file (name, data) is required"})

    ext = os.path.splitext(name)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        return JSONResponse(status_code=400, content={"error": "Unsupported file type"})

    try:
        raw = base64.b64decode(b64_data)
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid base64 data"})

    dest_dir = safe_path("media")
    dest_dir.mkdir(parents=True, exist_ok=True)

    base_name = re.sub(r"[^a-zA-Z0-9_-]", "_", os.path.splitext(name)[0]) or "media"
    candidate = f"{base_name}{ext}"
    counter = 1
    while (dest_dir / candidate).exists():
        candidate = f"{base_name}_{counter}{ext}"
        counter += 1

    dest_path = dest_dir / candidate
    try:
        dest_path.write_bytes(raw)
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})

    return {"path": f"media/{candidate}"}


@router.post("/api/list-media")
def list_media(request: Request, db: Session = Depends(get_db)):
    if not _require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    media_dir = safe_path("media")
    if not media_dir.exists():
        return {"paths": []}

    base_dir = safe_path("").resolve()
    paths: list[str] = []
    for root, _dirs, files in os.walk(media_dir):
        for name in files:
            ext = os.path.splitext(name)[1].lower()
            if ext in ALLOWED_IMAGE_EXTENSIONS:
                rel = os.path.join(root, name)
                rel_path = os.path.relpath(rel, base_dir).replace(os.sep, "/")
                if rel_path.startswith("media/post-assets/") or rel_path.startswith(
                    "media/previews/"
                ):
                    continue
                paths.append(rel_path)

    paths.sort()
    return {"paths": paths}
