from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .content_store import get_page_config
from .models import MediaItem
from .settings import settings

DEFAULT_OG_IMAGE_PATH = "assets/banner1.png"
DEFAULT_FAVICON_PATH = "assets/boywondericon.png"

ICON_BLOCK_START = "<!-- SITE_BRANDING_ICONS_START -->"
ICON_BLOCK_END = "<!-- SITE_BRANDING_ICONS_END -->"
SOCIAL_BLOCK_START = "<!-- SITE_BRANDING_SOCIAL_IMAGE_START -->"
SOCIAL_BLOCK_END = "<!-- SITE_BRANDING_SOCIAL_IMAGE_END -->"


def normalize_branding_path(raw: Any) -> str | None:
    value = str(raw or "").strip()
    if not value:
        return None
    lowered = value.lower()
    if lowered.startswith(("http://", "https://", "//", "data:", "javascript:")):
        return None
    normalized = value.lstrip("/").replace("\\", "/")
    if not normalized:
        return None
    rel_path = Path(normalized)
    if ".." in rel_path.parts:
        return None
    return normalized


def public_asset_url(path: str) -> str:
    normalized = normalize_branding_path(path)
    if not normalized:
        return "/"
    return f"/{normalized}"


def build_absolute_asset_url(request: Request, path: str) -> str:
    forwarded_proto = (
        (request.headers.get("X-Forwarded-Proto") or "").split(",")[0].strip().lower()
    )
    scheme = forwarded_proto if forwarded_proto in {"http", "https"} else request.url.scheme
    host = (
        (request.headers.get("X-Forwarded-Host") or request.headers.get("Host") or "")
        .split(",")[0]
        .strip()
    ) or request.url.netloc
    return f"{scheme}://{host}{public_asset_url(path)}"


def _asset_exists(base_dir: Path, path: str) -> bool:
    normalized = normalize_branding_path(path)
    if not normalized:
        return False
    candidates = [base_dir / normalized, base_dir / "dist" / normalized]
    return any(candidate.is_file() for candidate in candidates)


def _is_public_media_item(db: Session, path: str) -> bool:
    record = db.scalar(select(MediaItem).where(MediaItem.path == path))
    return bool(record and record.access == "public")


def resolve_configured_branding_path(
    db: Session,
    configured_path: Any,
    *,
    base_dir: Path | None = None,
) -> str | None:
    root = base_dir or settings.base_dir
    normalized = normalize_branding_path(configured_path)
    if not normalized:
        return None
    if normalized.startswith("protected/"):
        return None
    if normalized.startswith("media/") and not _is_public_media_item(db, normalized):
        return None
    if not _asset_exists(root, normalized):
        return None
    return normalized


def get_site_branding(db: Session, *, base_dir: Path | None = None) -> dict[str, str | None]:
    root = base_dir or settings.base_dir
    config = get_page_config(db, None) or {}
    site = config.get("site") if isinstance(config, dict) else {}
    if not isinstance(site, dict):
        site = {}

    custom_og = resolve_configured_branding_path(db, site.get("ogImagePath"), base_dir=root)
    custom_favicon = resolve_configured_branding_path(
        db,
        site.get("faviconPath"),
        base_dir=root,
    )

    return {
        "ogImagePath": custom_og or DEFAULT_OG_IMAGE_PATH,
        "faviconPath": custom_favicon or DEFAULT_FAVICON_PATH,
        "customOgImagePath": custom_og,
        "customFaviconPath": custom_favicon,
    }


def render_icon_block(favicon_path: str) -> str:
    href = public_asset_url(favicon_path)
    return "\n".join(
        [
            ICON_BLOCK_START,
            f'  <link rel="icon" type="image/png" sizes="32x32" href="{href}" />',
            f'  <link rel="apple-touch-icon" href="{href}" />',
            '  <link rel="manifest" href="/manifest.json" />',
            ICON_BLOCK_END,
        ]
    )


def render_social_image_block(request: Request, og_image_path: str) -> str:
    absolute_url = build_absolute_asset_url(request, og_image_path)
    return "\n".join(
        [
            SOCIAL_BLOCK_START,
            f'  <meta property="og:image" content="{absolute_url}" />',
            f'  <meta property="twitter:image" content="{absolute_url}" />',
            SOCIAL_BLOCK_END,
        ]
    )


def replace_placeholder_block(
    content: str,
    start_marker: str,
    end_marker: str,
    replacement: str,
) -> str:
    start = content.find(start_marker)
    end = content.find(end_marker)
    if start == -1 or end == -1 or end < start:
        return content
    end += len(end_marker)
    return content[:start] + replacement + content[end:]


def apply_html_branding(
    content: str,
    request: Request,
    *,
    favicon_path: str,
    og_image_path: str | None = None,
) -> str:
    branded = replace_placeholder_block(
        content,
        ICON_BLOCK_START,
        ICON_BLOCK_END,
        render_icon_block(favicon_path),
    )
    if og_image_path:
        branded = replace_placeholder_block(
            branded,
            SOCIAL_BLOCK_START,
            SOCIAL_BLOCK_END,
            render_social_image_block(request, og_image_path),
        )
    return branded


def manifest_icon_payload(favicon_path: str) -> dict[str, Any]:
    suffix = Path(favicon_path).suffix.lower()
    icon_type = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
    }.get(suffix, "image/png")
    return {
        "src": public_asset_url(favicon_path),
        "sizes": "any",
        "type": icon_type,
        "purpose": "any maskable",
    }


def apply_manifest_branding(content: str, favicon_path: str) -> str:
    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        return content
    if not isinstance(payload, dict):
        return content
    payload["icons"] = [manifest_icon_payload(favicon_path)]
    return json.dumps(payload, indent=2) + "\n"
