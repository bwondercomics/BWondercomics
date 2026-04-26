from __future__ import annotations

import re

TARGET_RE = re.compile(r"^[A-Za-z0-9._:-]+$")


def sanitize_target(target_id: str | None) -> str:
    value = (target_id or "").strip()
    if not value or len(value) > 120 or not TARGET_RE.match(value):
        raise ValueError("Invalid targetId")
    return value


def normalize_role(role: str | None) -> str:
    return str(role or "").strip().lower()


def is_admin_role(role: str | None) -> bool:
    return normalize_role(role) == "admin"


def is_premium_role(role: str | None) -> bool:
    return normalize_role(role) in {"admin", "premium"}
