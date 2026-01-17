from __future__ import annotations

import logging
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

from .file_ops import safe_path

logger = logging.getLogger(__name__)

PREVIEW_ROOT = "media/previews"
MEDIA_THUMB_DIR = f"{PREVIEW_ROOT}/thumbs"
MEDIA_BLUR_DIR = f"{PREVIEW_ROOT}/blurred"
ENTRY_COVER_DIR = f"{PREVIEW_ROOT}/covers"
PREVIEW_EXT = ".jpg"

THUMB_MAX_SIZE = (640, 640)
THUMB_QUALITY = 70
BLUR_RADIUS = 40


def media_thumb_rel_path(media_id: str) -> str:
    return f"{MEDIA_THUMB_DIR}/{media_id}{PREVIEW_EXT}"


def media_blur_rel_path(media_id: str) -> str:
    return f"{MEDIA_BLUR_DIR}/{media_id}{PREVIEW_EXT}"


def entry_cover_thumb_rel_path(entry_id: str) -> str:
    return f"{ENTRY_COVER_DIR}/entry-{entry_id}{PREVIEW_EXT}"


def resolve_source_path(path: str) -> Path | None:
    if not path:
        return None
    clean = str(path).strip().lstrip("/")
    if not clean or clean.startswith("http://") or clean.startswith("https://"):
        return None
    candidates = [clean]
    if clean.startswith("protected/"):
        candidates.append(clean.replace("protected/", "", 1))
    else:
        candidates.append(f"protected/{clean}")
    for candidate in candidates:
        try:
            abs_path = safe_path(candidate)
        except ValueError:
            continue
        if abs_path.is_file():
            return abs_path
    return None


def _prepare_thumbnail(source: Path) -> Image.Image:
    with Image.open(source) as img:
        img = ImageOps.exif_transpose(img)
        thumb = img.convert("RGB")
        thumb.thumbnail(THUMB_MAX_SIZE, Image.LANCZOS)
        return thumb


def generate_thumbnail(source: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    thumb = _prepare_thumbnail(source)
    thumb.save(dest, format="JPEG", quality=THUMB_QUALITY, optimize=True, progressive=True)


def generate_blurred_preview(source: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    thumb = _prepare_thumbnail(source)
    blurred = thumb.filter(ImageFilter.GaussianBlur(radius=BLUR_RADIUS))
    blurred.save(dest, format="JPEG", quality=THUMB_QUALITY, optimize=True, progressive=True)


def delete_preview_file(rel_path: str) -> None:
    if not rel_path:
        return
    try:
        abs_path = safe_path(rel_path)
    except ValueError:
        return
    if abs_path.exists():
        try:
            abs_path.unlink()
        except Exception as exc:
            logger.warning("Failed to remove preview %s: %s", rel_path, exc)
