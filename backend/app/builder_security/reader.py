"""Reader module controls, stage, panels, and reader responsive branch."""

from __future__ import annotations

from typing import Any

from .appearance import sanitize_appearance
from .primitives import _clamp_int, _coerce_bool, _coerce_string, _prune_empty_dicts

READER_DISPLAY_MODES = {"paged", "vertical-scroll"}


READER_CONTROLS_PLACEMENTS = {"above", "below", "overlay", "hidden"}


READER_CONTROLS_SIZES = {"compact", "medium", "large"}


READER_STAGE_FITS = {"dynamic-frame", "width", "height", "natural"}


READER_STAGE_MAX_WIDTH_MIN = 320


READER_STAGE_MAX_WIDTH_MAX = 2400


def _sanitize_reader_keyword(value: Any, allowed: set[str], default: str) -> str:
    current = str(value or "").strip()
    return current if current in allowed else default


def _sanitize_reader_stage_max_width(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        # Invalid (non-integer) input falls back to Auto, matching the client.
        return None
    return max(READER_STAGE_MAX_WIDTH_MIN, min(READER_STAGE_MAX_WIDTH_MAX, number))


READER_CONTROL_LABEL_KEYS = (
    "prev",
    "next",
    "help",
    "fit",
    "zoomIn",
    "zoomOut",
    "fullscreen",
)


def sanitize_reader_controls_style(raw: Any) -> dict[str, Any]:
    style = raw if isinstance(raw, dict) else {}
    result: dict[str, Any] = {}
    for key in ("defaults", "primary", "bar"):
        branch = style.get(key) if isinstance(style.get(key), dict) else {}
        branch_payload: dict[str, Any] = {}
        appearance = sanitize_appearance(branch.get("appearance"))
        if appearance is not None:
            branch_payload["appearance"] = appearance
        if key == "defaults" and branch.get("padding") not in (None, ""):
            # Horizontal button padding in px (Phase 3); sparse.
            branch_payload["padding"] = _clamp_int(branch.get("padding"), 0, 0, 48)
        if branch_payload:
            result[key] = branch_payload
    if style.get("glow") is False:
        result["glow"] = False
    return result


def _sanitize_reader_controls_labels(raw: Any) -> dict[str, str]:
    """Custom reader-button labels (Phase 3): sparse, length-capped."""
    labels = raw if isinstance(raw, dict) else {}
    sanitized: dict[str, str] = {}
    for key in READER_CONTROL_LABEL_KEYS:
        value = _coerce_string(labels.get(key), "", 24)
        if value:
            sanitized[key] = value
    return sanitized


def sanitize_reader_controls(raw: Any) -> dict[str, Any]:
    controls = raw if isinstance(raw, dict) else {}
    sanitized = {
        "placement": _sanitize_reader_keyword(
            controls.get("placement"), READER_CONTROLS_PLACEMENTS, "below"
        ),
        "size": _sanitize_reader_keyword(controls.get("size"), READER_CONTROLS_SIZES, "medium"),
        "style": sanitize_reader_controls_style(controls.get("style")),
    }
    labels = _sanitize_reader_controls_labels(controls.get("labels"))
    if labels:
        sanitized["labels"] = labels
    return sanitized


def _sanitize_reader_end_of_entry(raw: Any) -> dict[str, Any]:
    """End-of-entry completion popup: on by default; optional title/body copy overrides."""
    end = raw if isinstance(raw, dict) else {}
    return {
        "enabled": _coerce_bool(end.get("enabled"), True),
        "title": _coerce_string(end.get("title"), "", 120),
        "body": _coerce_string(end.get("body"), "", 300),
    }


def sanitize_reader_stage(raw: Any) -> dict[str, Any]:
    stage = raw if isinstance(raw, dict) else {}
    return {
        "fit": _sanitize_reader_keyword(stage.get("fit"), READER_STAGE_FITS, "dynamic-frame"),
        "frameFill": _sanitize_reader_keyword(stage.get("frameFill"), {"hug", "fill"}, "hug"),
        "pageGap": _clamp_int(stage.get("pageGap"), 8, 0, 64),
        "frameBorder": _coerce_bool(stage.get("frameBorder"), True),
        "maxWidth": _sanitize_reader_stage_max_width(stage.get("maxWidth")),
    }


def sanitize_reader_panels(raw: Any, *, show_panels: bool = True) -> dict[str, Any]:
    panels = raw if isinstance(raw, dict) else {}
    left = panels.get("left") if isinstance(panels.get("left"), dict) else {}
    right = panels.get("right") if isinstance(panels.get("right"), dict) else {}
    return {
        "left": {"enabled": _coerce_bool(left.get("enabled"), show_panels)},
        "right": {"enabled": _coerce_bool(right.get("enabled"), show_panels)},
    }


def sanitize_reader_responsive_branch(branch: dict[str, Any]) -> dict[str, Any]:
    # Mirrors the client's normalizeReaderResponsiveBranch: a reader device branch keeps
    # only control styling (the public runtime emits it as root-device-scoped CSS vars).
    # displayMode, controls placement/size, stage, comments, and the legacy panel toggles
    # are global-only — they apply at mount and cannot vary per device, so persisting them
    # here would let the builder preview settings the published page ignores.
    branch_payload: dict[str, Any] = {}
    controls = branch.get("controls") if isinstance(branch.get("controls"), dict) else {}
    style = controls.get("style") if isinstance(controls.get("style"), dict) else {}
    if style:
        style_payload: dict[str, Any] = {}
        defaults = style.get("defaults") if isinstance(style.get("defaults"), dict) else {}
        if defaults:
            defaults_payload: dict[str, Any] = {}
            if "appearance" in defaults:
                appearance = sanitize_appearance(defaults.get("appearance"))
                if appearance:
                    defaults_payload["appearance"] = appearance
            if "padding" in defaults:
                defaults_payload["padding"] = _clamp_int(defaults.get("padding"), 0, 0, 48)
            if defaults_payload:
                style_payload["defaults"] = defaults_payload
        for key in ("primary", "bar"):
            candidate = style.get(key) if isinstance(style.get(key), dict) else {}
            if "appearance" not in candidate:
                continue
            appearance = sanitize_appearance(candidate.get("appearance"))
            if appearance:
                style_payload[key] = {"appearance": appearance}
        if style_payload:
            branch_payload["controls"] = {"style": style_payload}
    return _prune_empty_dicts(branch_payload)
