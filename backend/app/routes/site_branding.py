from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, Response
from sqlalchemy.orm import Session

from ..db import get_db
from ..settings import settings
from ..site_branding import (
    ICON_BLOCK_END,
    ICON_BLOCK_START,
    SOCIAL_BLOCK_END,
    SOCIAL_BLOCK_START,
    apply_html_branding,
    apply_manifest_branding,
    get_site_branding,
)

router = APIRouter()

NO_STORE_HEADERS = {"Cache-Control": "no-store"}


def _candidate_files(filename: str) -> list[Path]:
    return [settings.base_dir / "dist" / filename, settings.base_dir / filename]


def _read_text_file(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def _load_html_template(filename: str, *, needs_social: bool = False) -> str | None:
    required_markers = [ICON_BLOCK_START, ICON_BLOCK_END]
    if needs_social:
        required_markers.extend([SOCIAL_BLOCK_START, SOCIAL_BLOCK_END])

    first_existing: Path | None = None
    for candidate in _candidate_files(filename):
        if not candidate.is_file():
            continue
        if first_existing is None:
            first_existing = candidate
        content = _read_text_file(candidate)
        if all(marker in content for marker in required_markers):
            return content

    if first_existing is not None:
        return _read_text_file(first_existing)
    return None


def _load_public_file(filename: str) -> str | None:
    for candidate in _candidate_files(filename):
        if candidate.is_file():
            return _read_text_file(candidate)
    return None


def _render_public_html(
    filename: str,
    request: Request,
    db: Session,
    *,
    include_social: bool = False,
) -> Response:
    template = _load_html_template(filename, needs_social=include_social)
    if template is None:
        return Response(status_code=404, content="Not found")

    branding = get_site_branding(db)
    content = apply_html_branding(
        template,
        request,
        favicon_path=str(branding["faviconPath"]),
        og_image_path=str(branding["ogImagePath"]) if include_social else None,
    )
    return HTMLResponse(content=content, headers=NO_STORE_HEADERS)


@router.get("/")
def branded_root(request: Request, db: Session = Depends(get_db)):
    return _render_public_html("index.html", request, db, include_social=True)


@router.get("/index.html")
def branded_index(request: Request, db: Session = Depends(get_db)):
    return _render_public_html("index.html", request, db, include_social=True)


@router.get("/feed.html")
def branded_feed(request: Request, db: Session = Depends(get_db)):
    return _render_public_html("feed.html", request, db)


@router.get("/comics.html")
def branded_comics(request: Request, db: Session = Depends(get_db)):
    return _render_public_html("comics.html", request, db)


@router.get("/media.html")
def branded_media(request: Request, db: Session = Depends(get_db)):
    return _render_public_html("media.html", request, db)


@router.get("/manifest.json")
def branded_manifest(db: Session = Depends(get_db)):
    content = _load_public_file("manifest.json")
    if content is None:
        return Response(status_code=404, content="Not found")

    branding = get_site_branding(db)
    custom_favicon = branding.get("customFaviconPath")
    if custom_favicon:
        content = apply_manifest_branding(content, str(custom_favicon))

    return Response(
        content=content,
        media_type="application/manifest+json",
        headers=NO_STORE_HEADERS,
    )
