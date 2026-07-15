"""Theme meta, panel background/spacing, and sparse appearance sanitizers."""

from __future__ import annotations

from typing import Any

from .links import sanitize_asset_url
from .primitives import (
    _clamp_float,
    _clamp_int,
    _coerce_bool,
    _sanitize_optional_clamped_float,
    _sanitize_optional_clamped_int,
    sanitize_color,
    sanitize_focus,
)


def sanitize_theme_meta(raw_theme: Any) -> dict[str, str]:
    theme = raw_theme if isinstance(raw_theme, dict) else {}
    sanitized: dict[str, str] = {}
    for key, value in theme.items():
        clean = sanitize_color(value)
        if clean:
            sanitized[str(key)] = clean
    return sanitized


def _sanitize_panel_background(current: Any) -> dict[str, Any] | None:
    """Sanitize a single panel background config (path/fit/focus/opacity/hideEmptyText).

    Shared by the legacy per-side ``page.meta.panelBackgrounds`` shape and the
    column-level ``panelBackground`` field. Returns ``None`` when there is nothing
    worth persisting (no art and empty text not hidden).
    """
    if not isinstance(current, dict):
        return None
    path = sanitize_asset_url(current.get("path"))
    panel = {
        "opacity": _clamp_float(current.get("opacity"), 0.18),
        "fit": "contain" if str(current.get("fit") or "").strip().lower() == "contain" else "cover",
        "focus": sanitize_focus(current.get("focus"), "center"),
        "hideEmptyText": _coerce_bool(current.get("hideEmptyText"), False),
    }
    if path:
        panel["path"] = path
    if path or panel["hideEmptyText"]:
        return panel
    return None


def sanitize_panel_backgrounds(raw_backgrounds: Any) -> dict[str, Any]:
    backgrounds = raw_backgrounds if isinstance(raw_backgrounds, dict) else {}
    sanitized: dict[str, Any] = {}
    for side in ("left", "right"):
        panel = _sanitize_panel_background(backgrounds.get(side))
        if panel is not None:
            sanitized[side] = panel
    return sanitized


def sanitize_panel_spacing(raw_spacing: Any) -> dict[str, int]:
    spacing = raw_spacing if isinstance(raw_spacing, dict) else {}
    sanitized: dict[str, int] = {}
    for side in ("left", "right"):
        value = spacing.get(side)
        if value in (None, ""):
            continue
        sanitized[side] = _clamp_int(value, 0, 0, 240)
    return sanitized


def sanitize_appearance(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None

    background = raw.get("background") if isinstance(raw.get("background"), dict) else {}
    text = raw.get("text") if isinstance(raw.get("text"), dict) else {}
    border = raw.get("border") if isinstance(raw.get("border"), dict) else {}

    background_type = None
    if "type" in background:
        current = str(background.get("type") or "").strip().lower()
        background_type = current if current in {"solid", "gradient"} else None

    border_style = None
    if "style" in border:
        current = str(border.get("style") or "").strip().lower()
        border_style = current if current in {"solid", "dashed", "dotted"} else None

    result = {
        "background": {
            "type": background_type,
            "color": sanitize_color(background.get("color")) or None
            if "color" in background
            else None,
            "secondaryColor": sanitize_color(background.get("secondaryColor")) or None
            if "secondaryColor" in background
            else None,
            "angle": _sanitize_optional_clamped_int(background, "angle", 0, 360),
            "opacity": _sanitize_optional_clamped_float(background, "opacity", 0.0, 1.0),
        },
        "text": {
            "color": sanitize_color(text.get("color")) or None if "color" in text else None,
            # Phase 3 typography extension: optional font tokens.
            "size": _sanitize_optional_clamped_int(text, "size", 8, 72),
            "weight": (
                str(text.get("weight") or "").strip()
                if str(text.get("weight") or "").strip()
                in {"400", "500", "600", "700", "800", "900"}
                else None
            ),
            "transform": (
                str(text.get("transform") or "").strip().lower()
                if str(text.get("transform") or "").strip().lower()
                in {"none", "uppercase", "lowercase", "capitalize"}
                else None
            ),
        },
        "border": {
            "width": _sanitize_optional_clamped_int(border, "width", 0, 20),
            "style": border_style,
            "color": sanitize_color(border.get("color")) or None if "color" in border else None,
            "opacity": _sanitize_optional_clamped_float(border, "opacity", 0.0, 1.0),
            "radius": _sanitize_optional_clamped_int(border, "radius", 0, 200),
        },
    }

    has_values = any(
        value is not None
        for value in (
            result["background"]["type"],
            result["background"]["color"],
            result["background"]["secondaryColor"],
            result["background"]["angle"],
            result["background"]["opacity"],
            result["text"]["color"],
            result["text"]["size"],
            result["text"]["weight"],
            result["text"]["transform"],
            result["border"]["width"],
            result["border"]["style"],
            result["border"]["color"],
            result["border"]["opacity"],
            result["border"]["radius"],
        )
    )
    return result if has_values else None


def sanitize_header_shell_appearance(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    result = {
        "top": sanitize_appearance(raw.get("top")),
        "scrolled": sanitize_appearance(raw.get("scrolled")),
        "navItemDefaults": sanitize_appearance(raw.get("navItemDefaults")),
    }
    if not any(result.values()):
        return None
    return result
