from __future__ import annotations

import json
from pathlib import Path

from .settings import settings


def catalog_path() -> Path:
    return settings.base_dir / "deploy" / "ops" / "command-catalog.json"


def load_ops_catalog() -> list[dict]:
    path = catalog_path()
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("Ops command catalog must be a list")

    commands = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        command_id = str(item.get("id") or "").strip()
        argv = item.get("argv")
        if not command_id or not isinstance(argv, list) or not argv:
            continue
        commands.append(
            {
                "id": command_id,
                "label": str(item.get("label") or command_id),
                "group": str(item.get("group") or "Other"),
                "description": str(item.get("description") or ""),
                "argv": [str(part) for part in argv],
                "terminal": str(item.get("terminal") or " ".join(str(part) for part in argv)),
                "disruptsApi": bool(item.get("disruptsApi")),
                "requiresConfirm": bool(item.get("requiresConfirm") or item.get("disruptsApi")),
            }
        )
    return commands


def get_ops_command(command_id: str) -> dict | None:
    command_key = str(command_id or "").strip()
    for item in load_ops_catalog():
        if item["id"] == command_key:
            return item
    return None
