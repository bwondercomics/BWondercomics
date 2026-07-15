"""Page header meta (blocks, rows/regions, nav, copy) and page.meta composition."""

from __future__ import annotations

from typing import Any

from .appearance import (
    sanitize_appearance,
    sanitize_header_shell_appearance,
    sanitize_panel_backgrounds,
    sanitize_panel_spacing,
    sanitize_theme_meta,
)
from .links import sanitize_asset_url, sanitize_link_target
from .primitives import _coerce_bool, _coerce_string, _deepcopy, _sanitize_id_like
from .responsive import sanitize_page_responsive

HEADER_BLOCK_IDS = {"brand", "patron", "status", "entryControls", "nav"}


HEADER_REGIONS = ("left", "center", "right")


HEADER_ROWS = ("top", "middle", "bottom")


HEADER_DEFAULT_ROW_PLACEMENTS = {
    "brand": ("top", "left"),
    "patron": ("top", "center"),
    "status": ("top", "center"),
    "entryControls": ("top", "right"),
    "nav": ("top", "right"),
}


def _sanitize_header_blocks(blocks: Any) -> dict[str, dict[str, Any]]:
    source = blocks if isinstance(blocks, dict) else {}
    sanitized: dict[str, dict[str, Any]] = {}
    for block_id in HEADER_BLOCK_IDS:
        raw_block = source.get(block_id) or {}
        block_payload: dict[str, Any] = {
            "enabled": _coerce_bool(raw_block.get("enabled"), True),
        }
        # Sparse per-block styling (Phase 5): shared appearance schema.
        appearance = sanitize_appearance(
            raw_block.get("appearance") if isinstance(raw_block, dict) else None
        )
        if appearance is not None:
            block_payload["appearance"] = appearance
        sanitized[block_id] = block_payload
    return sanitized


def _sanitize_header_brand(raw_brand: Any) -> dict[str, Any] | None:
    """Brand block content (Phase 5): logo letters, image, styling. Sparse."""
    brand = raw_brand if isinstance(raw_brand, dict) else {}
    logo_text = _coerce_string(brand.get("logoText"), "", 24)
    logo_image = sanitize_asset_url(brand.get("logoImage"))
    logo_appearance = sanitize_appearance(brand.get("logoAppearance"))
    payload: dict[str, Any] = {}
    if logo_text:
        payload["logoText"] = logo_text
    if logo_image:
        payload["logoImage"] = logo_image
    if logo_appearance is not None:
        payload["logoAppearance"] = logo_appearance
    return payload or None


def _sanitize_header_layout_rows(layout_rows: Any, regions: dict[str, list[str]]) -> dict:
    """Sanitize the 3-row placement grid, mirroring the client's normalizeLayoutRows.

    Every block lands exactly once; unknown ids are dropped; blocks missing from the
    payload fall back to their default cell. When no layoutRows are provided, the
    already-sanitized flat regions populate the top row (legacy shape).
    """
    source = layout_rows if isinstance(layout_rows, dict) else None
    rows: dict[str, dict[str, list[str]]] = {
        row_id: {region: [] for region in HEADER_REGIONS} for row_id in HEADER_ROWS
    }
    seen: set[str] = set()

    if source is not None:
        for row_id in HEADER_ROWS:
            raw_row = source.get(row_id) if isinstance(source.get(row_id), dict) else {}
            for region in HEADER_REGIONS:
                items = raw_row.get(region)
                if not isinstance(items, list):
                    continue
                for item in items:
                    block_id = str(item or "").strip()
                    if block_id in HEADER_BLOCK_IDS and block_id not in seen:
                        rows[row_id][region].append(block_id)
                        seen.add(block_id)
    else:
        for region in HEADER_REGIONS:
            for block_id in regions.get(region, []):
                if block_id not in seen:
                    rows["top"][region].append(block_id)
                    seen.add(block_id)

    for block_id in ("brand", "patron", "status", "entryControls", "nav"):
        if block_id in seen:
            continue
        row_id, region = HEADER_DEFAULT_ROW_PLACEMENTS[block_id]
        rows[row_id][region].append(block_id)

    return rows


def _flatten_header_layout_rows(layout_rows: dict) -> dict[str, list[str]]:
    regions: dict[str, list[str]] = {region: [] for region in HEADER_REGIONS}
    for row_id in HEADER_ROWS:
        for region in HEADER_REGIONS:
            regions[region].extend(layout_rows.get(row_id, {}).get(region, []))
    return regions


def _sanitize_header_regions(regions: Any) -> dict[str, list[str]]:
    source = regions if isinstance(regions, dict) else {}
    remaining = set(HEADER_BLOCK_IDS)
    normalized: dict[str, list[str]] = {region: [] for region in HEADER_REGIONS}

    for region in HEADER_REGIONS:
        items = source.get(region)
        if not isinstance(items, list):
            continue
        for item in items:
            block_id = str(item or "").strip()
            if block_id in remaining:
                normalized[region].append(block_id)
                remaining.remove(block_id)

    for block_id in ("brand", "patron", "status", "entryControls", "nav"):
        if block_id not in remaining:
            continue
        fallback = (
            "left"
            if block_id == "brand"
            else "center"
            if block_id in {"patron", "status"}
            else "right"
        )
        normalized[fallback].append(block_id)
        remaining.remove(block_id)

    return normalized


def sanitize_header_meta(raw_header: Any) -> dict[str, Any]:
    header = raw_header if isinstance(raw_header, dict) else {}
    copy_block = header.get("copy") if isinstance(header.get("copy"), dict) else {}
    subtitles = copy_block.get("subtitles")
    sanitized = {
        "version": 3,
        "copy": {
            "title": _coerce_string(copy_block.get("title"), "Page Title", 200),
            "subtitle": _coerce_string(copy_block.get("subtitle"), "", 300),
            "subtitles": [
                _coerce_string(item, max_length=200)
                for item in (subtitles if isinstance(subtitles, list) else [])
                if _coerce_string(item, max_length=200)
            ][:10],
        },
        "regions": _sanitize_header_regions(header.get("regions")),
        "blocks": _sanitize_header_blocks(header.get("blocks")),
        "nav": {
            "items": sanitize_header_nav_items((header.get("nav") or {}).get("items")),
        },
    }
    # Persist the 3-row placement grid and keep the flat regions in sync with it.
    # (layoutRows used to be silently dropped here, collapsing multi-row headers
    # back to the top row on every save.)
    layout_rows = _sanitize_header_layout_rows(header.get("layoutRows"), sanitized["regions"])
    sanitized["layoutRows"] = layout_rows
    sanitized["regions"] = _flatten_header_layout_rows(layout_rows)
    brand = _sanitize_header_brand(header.get("brand"))
    if brand is not None:
        sanitized["brand"] = brand
    appearance = sanitize_header_shell_appearance(header.get("appearance"))
    if appearance is not None:
        sanitized["appearance"] = appearance
    return sanitized


def sanitize_header_nav_items(items: Any) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []
    normalized: list[dict[str, Any]] = []
    for item in items[:20]:
        entry = item if isinstance(item, dict) else {}
        style = str(entry.get("style") or "primary").strip()
        appearance = sanitize_appearance(entry.get("appearance"))
        item_payload = {
            "id": _sanitize_id_like(entry.get("id")) or "nav",
            "label": _coerce_string(entry.get("label") or entry.get("text"), "Link", 120),
            "enabled": _coerce_bool(entry.get("enabled"), True),
            "style": style if style in {"primary", "secondary"} else "primary",
            "link": sanitize_link_target(entry.get("link"), entry.get("url")),
        }
        if appearance is not None:
            item_payload["appearance"] = appearance
        normalized.append(item_payload)
    return normalized


def sanitize_header_overrides(raw_overrides: Any) -> dict[str, Any]:
    overrides = raw_overrides if isinstance(raw_overrides, dict) else {}
    hidden = overrides.get("hiddenBlockIds")
    hidden_block_ids = []
    if isinstance(hidden, list):
        for item in hidden:
            block_id = str(item or "").strip()
            if block_id in HEADER_BLOCK_IDS and block_id not in hidden_block_ids:
                hidden_block_ids.append(block_id)
    return {"hiddenBlockIds": hidden_block_ids}


def sanitize_page_meta(raw_meta: Any) -> dict[str, Any]:
    meta = raw_meta if isinstance(raw_meta, dict) else {}
    sanitized = {
        key: _deepcopy(value)
        for key, value in meta.items()
        if key
        not in {
            "header",
            "headerOverrides",
            "theme",
            "panelBackgrounds",
            "panelSpacing",
            "responsive",
        }
    }
    if "header" in meta:
        sanitized["header"] = sanitize_header_meta(meta.get("header"))
    if "headerOverrides" in meta:
        sanitized["headerOverrides"] = sanitize_header_overrides(meta.get("headerOverrides"))
    if "theme" in meta:
        sanitized["theme"] = sanitize_theme_meta(meta.get("theme"))
    if "panelBackgrounds" in meta:
        sanitized["panelBackgrounds"] = sanitize_panel_backgrounds(meta.get("panelBackgrounds"))
    if "panelSpacing" in meta:
        sanitized["panelSpacing"] = sanitize_panel_spacing(meta.get("panelSpacing"))
    responsive = sanitize_page_responsive(meta.get("responsive"))
    if responsive:
        sanitized["responsive"] = responsive
    return sanitized
