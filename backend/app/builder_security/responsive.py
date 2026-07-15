"""Builder responsive contract constants and page/buttons responsive branches."""

from __future__ import annotations

from typing import Any

from .appearance import sanitize_appearance, sanitize_header_shell_appearance
from .primitives import _prune_empty_dicts, _sanitize_id_like

BUILDER_DEVICE_IDS = ("desktop", "tablet", "mobile")


BUILDER_RESPONSIVE_CONTRACT_VERSION = 1


BUILDER_RESPONSIVE_CAPABILITIES = (
    "responsive-module-round-trip",
    "responsive-feed-layout",
    "responsive-reader-controls",
    "responsive-public-media-css",
)


SECTION_RESPONSIVE_FIELDS = {
    "layout",
    "moduleGap",
    "columnGap",
    "sectionGap",
    "paddingTop",
    "paddingBottom",
    "backgroundColor",
}


def sanitize_page_responsive(raw: Any) -> dict[str, Any]:
    responsive = raw if isinstance(raw, dict) else {}
    sanitized: dict[str, Any] = {}
    for device_id in BUILDER_DEVICE_IDS:
        branch = responsive.get(device_id)
        if not isinstance(branch, dict):
            continue
        branch_payload: dict[str, Any] = {}
        header = branch.get("header")
        if isinstance(header, dict):
            appearance = sanitize_header_shell_appearance(header.get("appearance"))
            if appearance is not None:
                branch_payload["header"] = {"appearance": appearance}
        branch_payload = _prune_empty_dicts(branch_payload)
        if branch_payload:
            sanitized[device_id] = branch_payload
    return sanitized


def sanitize_buttons_responsive_branch(branch: dict[str, Any]) -> dict[str, Any]:
    branch_payload: dict[str, Any] = {}
    defaults = branch.get("defaults") if isinstance(branch.get("defaults"), dict) else {}
    defaults_appearance = sanitize_appearance(defaults.get("appearance"))
    if defaults_appearance is not None:
        branch_payload["defaults"] = {"appearance": defaults_appearance}

    raw_buttons = branch.get("buttons") if isinstance(branch.get("buttons"), list) else []
    buttons = []
    for item in raw_buttons[:20]:
        current = item if isinstance(item, dict) else {}
        appearance = sanitize_appearance(current.get("appearance"))
        button_payload: dict[str, Any] = {}
        button_id = _sanitize_id_like(current.get("id"))
        if button_id:
            button_payload["id"] = button_id
        if appearance is not None:
            button_payload["appearance"] = appearance
        if button_payload:
            buttons.append(button_payload)
    if buttons:
        branch_payload["buttons"] = buttons
    return _prune_empty_dicts(branch_payload)
