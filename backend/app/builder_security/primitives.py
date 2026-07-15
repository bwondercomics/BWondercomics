"""Scalar coercion, clamping, and token/color/focus sanitizers."""

from __future__ import annotations

import copy
import re
from typing import Any

PAGE_SLUG_RE = re.compile(r"[^a-z0-9_-]+")


ANCHOR_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_:\-\.]*$")


CLASS_TOKEN_RE = re.compile(r"[^A-Za-z0-9_-]+")


ID_TOKEN_RE = re.compile(r"[^A-Za-z0-9_:\-\.]+")


FOCUS_RE = re.compile(
    r"^(center|top|bottom|left|right|top left|left top|top right|right top|"
    r"bottom left|left bottom|bottom right|right bottom|"
    r"(?:\d{1,3}%\s+\d{1,3}%))$",
    re.IGNORECASE,
)


HEX_COLOR_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")


FUNCTION_COLOR_RE = re.compile(
    r"^(?:rgb|rgba|hsl|hsla)\(\s*[-\d.%\s,]+\s*\)$",
    re.IGNORECASE,
)


NAMED_COLOR_RE = re.compile(r"^[a-zA-Z]+$")


def _deepcopy(value: Any) -> Any:
    return copy.deepcopy(value)


def _coerce_string(value: Any, fallback: str = "", max_length: int = 5000) -> str:
    text = str(value or "").strip()
    if not text:
        return fallback
    return text[:max_length]


def _coerce_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, str):
        raw = value.strip().lower()
        if raw in {"true", "1", "yes", "on"}:
            return True
        if raw in {"false", "0", "no", "off"}:
            return False
    return bool(value)


def _clamp_int(value: Any, default: int, minimum: int = 0, maximum: int = 10_000) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, number))


def _clamp_float(value: Any, default: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, number))


def _sanitize_slug(value: Any) -> str:
    raw = str(value or "").strip().lower()
    cleaned = PAGE_SLUG_RE.sub("-", raw).strip("-")
    return cleaned[:100]


def sanitize_anchor(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    anchor = raw[1:] if raw.startswith("#") else raw
    anchor = anchor.strip()
    if not ANCHOR_RE.fullmatch(anchor):
        return ""
    return f"#{anchor}"


def _sanitize_class_value(value: Any) -> str:
    tokens = []
    for token in str(value or "").split():
        cleaned = CLASS_TOKEN_RE.sub("", token)
        if cleaned:
            tokens.append(cleaned)
    return " ".join(tokens[:12])


def _sanitize_id_like(value: Any) -> str:
    cleaned = ID_TOKEN_RE.sub("", str(value or "").strip())
    return cleaned[:120]


def sanitize_color(value: Any, fallback: str = "") -> str:
    raw = str(value or "").strip()
    if not raw:
        return fallback
    if raw.lower() == "transparent":
        return "transparent"
    if (
        HEX_COLOR_RE.fullmatch(raw)
        or FUNCTION_COLOR_RE.fullmatch(raw)
        or NAMED_COLOR_RE.fullmatch(raw)
    ):
        return raw
    return fallback


def sanitize_focus(value: Any, fallback: str = "center") -> str:
    raw = str(value or "").strip()
    if not raw:
        return fallback
    if not FOCUS_RE.fullmatch(raw):
        return fallback
    return raw.lower() if "%" not in raw else raw


def _sanitize_optional_clamped_int(
    source: dict[str, Any], key: str, minimum: int, maximum: int
) -> int | None:
    if key not in source:
        return None
    try:
        number = int(source.get(key))
    except (TypeError, ValueError):
        return None
    return max(minimum, min(maximum, number))


def _sanitize_optional_clamped_float(
    source: dict[str, Any], key: str, minimum: float, maximum: float
) -> float | None:
    if key not in source:
        return None
    try:
        number = float(source.get(key))
    except (TypeError, ValueError):
        return None
    return max(minimum, min(maximum, number))


def _prune_empty_dicts(value: Any) -> Any:
    if isinstance(value, list):
        items = [_prune_empty_dicts(item) for item in value]
        return [item for item in items if item not in ({}, [])]
    if not isinstance(value, dict):
        return value
    pruned = {
        key: pruned_value
        for key, item in value.items()
        if (pruned_value := _prune_empty_dicts(item)) not in ({}, [])
    }
    return pruned
