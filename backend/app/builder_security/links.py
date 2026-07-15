"""URL, hyperlink, asset, video, icon, and link-target sanitizers."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse, urlunparse

from .primitives import _sanitize_slug, sanitize_anchor

URL_UNSAFE_RE = re.compile(r"[\x00-\x1f\x7f\s\"'<>`\\]")


YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "www.youtu.be",
}


VIMEO_HOSTS = {"vimeo.com", "www.vimeo.com", "player.vimeo.com"}


def sanitize_simple_url(
    value: Any,
    *,
    allowed_schemes: set[str],
    allow_root_relative: bool = True,
    allow_relative: bool = True,
    allow_anchor: bool = False,
) -> str:
    raw = str(value or "").strip()
    if not raw or URL_UNSAFE_RE.search(raw):
        return ""
    if raw.startswith("//"):
        return ""
    if allow_anchor and raw.startswith("#"):
        return sanitize_anchor(raw)
    if raw.startswith("/"):
        return raw if allow_root_relative else ""

    parsed = urlparse(raw)
    if parsed.scheme:
        scheme = parsed.scheme.lower()
        if scheme not in allowed_schemes:
            return ""
        if scheme in {"mailto", "tel"}:
            return raw
        if not parsed.netloc:
            return ""
        return urlunparse(
            (
                scheme,
                parsed.netloc,
                parsed.path or "",
                "",
                parsed.query or "",
                parsed.fragment or "",
            )
        )

    if parsed.netloc:
        return ""
    if not allow_relative:
        return ""
    return raw


def sanitize_hyperlink(value: Any) -> str:
    return sanitize_simple_url(
        value,
        allowed_schemes={"http", "https", "mailto", "tel"},
        allow_root_relative=True,
        allow_relative=True,
        allow_anchor=True,
    )


def sanitize_asset_url(value: Any) -> str:
    return sanitize_simple_url(
        value,
        allowed_schemes={"http", "https"},
        allow_root_relative=True,
        allow_relative=True,
        allow_anchor=False,
    )


def sanitize_video_url(value: Any) -> str:
    candidate = sanitize_simple_url(
        value,
        allowed_schemes={"https"},
        allow_root_relative=False,
        allow_relative=False,
        allow_anchor=False,
    )
    if not candidate:
        return ""
    parsed = urlparse(candidate)
    host = (parsed.netloc or "").lower()
    if host in YOUTUBE_HOSTS or host in VIMEO_HOSTS:
        return candidate
    return ""


def sanitize_icon_value(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if any(ch in raw for ch in ("/", ".")) or raw.startswith("http"):
        return sanitize_asset_url(raw)
    return raw[:120]


def sanitize_link_target(raw_target: Any, legacy_url: Any = "") -> dict[str, Any]:
    target = raw_target if isinstance(raw_target, dict) else {}
    fallback_url = str(legacy_url or target.get("url") or "").strip()
    raw_kind = target.get("kind") or ("anchor" if fallback_url.startswith("#") else "url")
    kind = raw_kind if raw_kind in {"builder-page", "url", "anchor"} else "url"

    page_slug = _sanitize_slug(target.get("pageSlug")) if kind == "builder-page" else ""
    url = sanitize_hyperlink(target.get("url") or fallback_url) if kind == "url" else ""
    anchor = sanitize_anchor(target.get("hash") or fallback_url) if kind == "anchor" else ""
    open_in_new_tab = bool(
        kind == "url"
        and target.get("openInNewTab") is True
        and url.startswith(("http://", "https://"))
    )

    if kind == "builder-page" and not page_slug:
        kind = "url"

    if kind == "builder-page":
        return {
            "kind": "builder-page",
            "pageSlug": page_slug,
            "url": "",
            "hash": "",
            "openInNewTab": False,
        }
    if kind == "anchor":
        return {
            "kind": "anchor",
            "pageSlug": "",
            "url": "",
            "hash": anchor or "#",
            "openInNewTab": False,
        }
    return {
        "kind": "url",
        "pageSlug": "",
        "url": url or "#",
        "hash": "",
        "openInNewTab": open_in_new_tab,
    }
