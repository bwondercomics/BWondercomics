"""Section layout/ratio validation, section settings, and column settings."""

from __future__ import annotations

from typing import Any

from .appearance import _sanitize_panel_background, sanitize_appearance
from .primitives import (
    _clamp_int,
    _coerce_bool,
    _prune_empty_dicts,
    _sanitize_optional_clamped_int,
    sanitize_color,
)
from .responsive import BUILDER_DEVICE_IDS

# Legacy preset layouts. These remain a strict subset of the generalized ratio-string
# contract (1-6 dash-separated positive-integer ratio segments) so existing pages render
# identically. Validation accepts any well-formed ratio string, not just these presets.
ALLOWED_LAYOUTS = {"1", "1-1", "1-2", "2-1", "1-1-1", "1-3-1"}


LAYOUT_COLUMN_COUNTS = {layout: len(layout.split("-")) for layout in ALLOWED_LAYOUTS}


MAX_COLUMNS = 6


# 100 so percent-style weight strings (e.g. "20-60-20") are valid; legacy small
# ratios like "1-3-1" remain a strict subset. Mirrors shared/page-builder/layout-utils.js.
MAX_COLUMN_RATIO = 100


COLUMN_ALIGNMENTS = {"stretch", "start", "center", "end"}


ALLOWED_SECTION_TYPES = {"row"}


def sanitize_section_responsive(raw: Any, *, max_columns: int = MAX_COLUMNS) -> dict[str, Any]:
    responsive = raw if isinstance(raw, dict) else {}
    sanitized: dict[str, Any] = {}
    for device_id in BUILDER_DEVICE_IDS:
        branch = responsive.get(device_id)
        if not isinstance(branch, dict):
            continue
        branch_payload: dict[str, Any] = {}
        layout = str(branch.get("layout") or "").strip()
        if layout:
            try:
                ratios = parse_layout_ratios(layout)[: max(1, min(MAX_COLUMNS, max_columns))]
                branch_payload["layout"] = "-".join(str(ratio) for ratio in ratios)
            except ValueError:
                pass
        background_color = sanitize_color(branch.get("backgroundColor"))
        if background_color:
            branch_payload["backgroundColor"] = background_color
        for key in ("paddingTop", "paddingBottom", "moduleGap", "columnGap", "sectionGap"):
            if key in branch:
                branch_payload[key] = _clamp_int(branch.get(key), 0, 0, 600)
        if "minHeight" in branch and branch.get("minHeight") not in (None, ""):
            branch_payload["minHeight"] = _clamp_int(branch.get("minHeight"), 0, 0, 2000)
        # Per-device column count/ratio rides the layout field above. Per-device column
        # *styling* lives on each column's own responsive branch (columns[i].responsive),
        # so it is not duplicated here.
        branch_payload = _prune_empty_dicts(branch_payload)
        if branch_payload:
            sanitized[device_id] = branch_payload
    return sanitized


def _sanitize_column_padding(raw: Any) -> dict[str, int] | None:
    if not isinstance(raw, dict):
        return None
    padding: dict[str, int] = {}
    for side in ("top", "right", "bottom", "left"):
        if side in raw:
            padding[side] = _clamp_int(raw.get(side), 0, 0, 600)
    return padding or None


def sanitize_column_settings(
    raw: Any, *, include_responsive: bool = True, preserve_responsive_defaults: bool = False
) -> dict[str, Any]:
    """Sanitize per-column styling. Reuses the appearance contract; no style strings.

    Sparse: only present/non-default fields are emitted. Column width/ratio rides the
    section ``layout`` string, not this payload.
    """
    column = raw if isinstance(raw, dict) else {}
    result: dict[str, Any] = {}

    appearance = sanitize_appearance(column.get("appearance"))
    if appearance is not None:
        result["appearance"] = appearance

    padding = _sanitize_column_padding(column.get("padding"))
    if padding is not None:
        result["padding"] = padding

    alignment = str(column.get("alignment") or "").strip()
    if alignment in COLUMN_ALIGNMENTS and (preserve_responsive_defaults or alignment != "stretch"):
        result["alignment"] = alignment

    min_height = _sanitize_optional_clamped_int(column, "minHeight", 0, 2000)
    if min_height is not None:
        result["minHeight"] = min_height

    if preserve_responsive_defaults and "hidden" in column:
        result["hidden"] = _coerce_bool(column.get("hidden"), False)
    elif _coerce_bool(column.get("hidden"), False):
        result["hidden"] = True

    if include_responsive:
        # Panel-only fields live on the base column entry and are intentionally
        # non-responsive for now, so they are gated here (responsive branches call
        # with include_responsive=False).
        panel_background = _sanitize_panel_background(column.get("panelBackground"))
        if panel_background is not None:
            result["panelBackground"] = panel_background
        panel_gap = _sanitize_optional_clamped_int(column, "panelGap", 0, 240)
        if panel_gap is not None:
            result["panelGap"] = panel_gap
        responsive = sanitize_column_responsive(column.get("responsive"))
        if responsive:
            result["responsive"] = responsive

    return result


def sanitize_column_responsive(raw: Any) -> dict[str, Any]:
    responsive = raw if isinstance(raw, dict) else {}
    sanitized: dict[str, Any] = {}
    for device_id in BUILDER_DEVICE_IDS:
        branch = responsive.get(device_id)
        if not isinstance(branch, dict):
            continue
        branch_payload = sanitize_column_settings(
            branch,
            include_responsive=False,
            preserve_responsive_defaults=True,
        )
        if branch_payload:
            sanitized[device_id] = branch_payload
    return sanitized


def _sanitize_column_list(
    raw_list: Any, column_count: int, *, include_responsive: bool = True
) -> list[dict[str, Any]]:
    """Sanitize a sparse list of per-column styling entries keyed by ``index``.

    Entries whose index falls outside the effective column count are dropped, and
    only columns carrying real styling are kept.
    """
    if not isinstance(raw_list, list):
        return []
    columns: dict[int, dict[str, Any]] = {}
    for position, item in enumerate(raw_list[:MAX_COLUMNS]):
        if not isinstance(item, dict):
            continue
        try:
            index = int(item.get("index"))
        except (TypeError, ValueError):
            index = position
        if not 0 <= index < column_count or index in columns:
            continue
        sanitized = sanitize_column_settings(item, include_responsive=include_responsive)
        if sanitized:
            columns[index] = {"index": index, **sanitized}
    return [columns[index] for index in sorted(columns)]


def sanitize_section_settings(raw_settings: Any, layout: Any = "1") -> dict[str, Any]:
    settings = raw_settings if isinstance(raw_settings, dict) else {}
    sanitized: dict[str, Any] = {}
    column_count = layout_column_count(layout)

    background_color = sanitize_color(settings.get("backgroundColor"))
    if background_color:
        sanitized["backgroundColor"] = background_color

    for key in ("paddingTop", "paddingBottom", "moduleGap", "columnGap", "sectionGap"):
        if key in settings:
            sanitized[key] = _clamp_int(settings.get(key), 0, 0, 600)

    if "minHeight" in settings and settings.get("minHeight") not in (None, ""):
        sanitized["minHeight"] = _clamp_int(settings.get("minHeight"), 0, 0, 2000)

    columns = _sanitize_column_list(settings.get("columns"), column_count)
    if columns:
        sanitized["columns"] = columns

    panel_enabled = settings.get("panelEnabled")
    if isinstance(panel_enabled, dict):
        sanitized["panelEnabled"] = {
            "left": _coerce_bool(panel_enabled.get("left"), True),
            "right": _coerce_bool(panel_enabled.get("right"), True),
        }

    responsive = sanitize_section_responsive(
        settings.get("responsive"),
        max_columns=column_count,
    )
    if responsive:
        sanitized["responsive"] = responsive

    return sanitized


def validate_section_type(section_type: Any) -> str:
    value = str(section_type or "row").strip()
    if value not in ALLOWED_SECTION_TYPES:
        raise ValueError(f"Unsupported section type '{value}'")
    return value


def parse_layout_ratios(layout: Any) -> list[int]:
    """Parse a layout ratio string into a list of positive integer ratios.

    A valid layout is 1-6 dash-separated segments, each a positive integer ratio
    (clamped to 1..MAX_COLUMN_RATIO). Raises ValueError for malformed input. Legacy
    presets such as "1-3-1" parse to [1, 3, 1] and remain valid.
    """
    value = str(layout or "1").strip()
    segments = value.split("-")
    if not 1 <= len(segments) <= MAX_COLUMNS:
        raise ValueError(f"Unsupported section layout '{value}'")
    ratios: list[int] = []
    for segment in segments:
        try:
            ratio = int(segment)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Unsupported section layout '{value}'") from exc
        if not 1 <= ratio <= MAX_COLUMN_RATIO:
            raise ValueError(f"Unsupported section layout '{value}'")
        ratios.append(ratio)
    return ratios


def layout_column_count(layout: Any) -> int:
    """Return the number of columns for a layout string, defaulting to 1."""
    try:
        return len(parse_layout_ratios(layout))
    except ValueError:
        return 1


def validate_layout(layout: Any) -> str:
    value = str(layout or "1").strip()
    # Raises ValueError for malformed input; legacy presets remain valid.
    parse_layout_ratios(value)
    return value


def validate_sort_index(value: Any) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("sortIndex must be an integer") from exc
    if number < 0:
        raise ValueError("sortIndex must be non-negative")
    return number


def validate_column_index(column_index: Any, layout: str | None = None) -> int:
    try:
        number = int(column_index)
    except (TypeError, ValueError) as exc:
        raise ValueError("columnIndex must be an integer") from exc
    if number < 0:
        raise ValueError("columnIndex must be non-negative")
    if layout and number >= layout_column_count(layout):
        raise ValueError(f"columnIndex {number} is out of range for layout '{layout}'")
    return number
