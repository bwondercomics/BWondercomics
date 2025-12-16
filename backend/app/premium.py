from __future__ import annotations

import json
import os
import re
from urllib.parse import unquote, urlparse

from .settings import settings


DEFAULT_SERIES_ID = "battle-bros"


def sanitize_series_id(value: str | None) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9_-]+", "-", value).strip("-")
    return value[:64]


_premium_prefix_cache: dict[str, dict] = {}
_series_index_cache: dict[str, dict] = {}


def _infer_folder_from_pages(pages):
    for path in pages or []:
        if not isinstance(path, str):
            continue
        norm = path.strip().strip("/")
        if "/" not in norm:
            continue
        return norm.rsplit("/", 1)[0]
    return None


def _get_series_data_path(series_id: str) -> str:
    series_id = sanitize_series_id(series_id) or DEFAULT_SERIES_ID
    if series_id == DEFAULT_SERIES_ID:
        return str(settings.base_dir / "admin" / "data.json")
    return str(settings.base_dir / "admin" / "series" / series_id / "data.json")


def _load_series_index() -> dict:
    path = settings.base_dir / "admin" / "series.json"
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return {}

    cached = _series_index_cache.get("value")
    if cached and cached.get("mtime") == mtime:
        return cached.get("data") or {}

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            data = {}
    except Exception:
        data = {}

    _series_index_cache["value"] = {"mtime": mtime, "data": data}
    return data


def _is_series_premium_only(series_id: str) -> bool:
    series_id = sanitize_series_id(series_id) or DEFAULT_SERIES_ID
    data = _load_series_index()
    series = data.get("series") if isinstance(data, dict) else None
    if not isinstance(series, list):
        return False
    for item in series:
        if not isinstance(item, dict):
            continue
        if sanitize_series_id(item.get("id")) != series_id:
            continue
        return bool(item.get("premiumOnly"))
    return False


def _compute_premium_prefixes(series_id: str) -> set[str]:
    data_path = _get_series_data_path(series_id)
    try:
        mtime = os.path.getmtime(data_path)
    except OSError:
        return set()

    series_mtime = None
    try:
        series_mtime = os.path.getmtime(str(settings.base_dir / "admin" / "series.json"))
    except OSError:
        series_mtime = None

    series_id = sanitize_series_id(series_id) or DEFAULT_SERIES_ID
    cached = _premium_prefix_cache.get(series_id)
    if cached and cached.get("mtime") == mtime and cached.get("series_mtime") == series_mtime:
        return cached.get("prefixes", set())

    try:
        with open(data_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        prefixes: set[str] = set()
        _premium_prefix_cache[series_id] = {"mtime": mtime, "series_mtime": series_mtime, "prefixes": prefixes}
        return prefixes

    chapters = data.get("chapters") if isinstance(data, dict) else {}
    chapter_folders = data.get("chapterFolders") if isinstance(data, dict) else {}
    chapter_meta = data.get("chapterMeta") if isinstance(data, dict) else {}
    if not isinstance(chapters, dict):
        chapters = {}
    if not isinstance(chapter_folders, dict):
        chapter_folders = {}
    if not isinstance(chapter_meta, dict):
        chapter_meta = {}

    prefixes: set[str] = set()
    if _is_series_premium_only(series_id):
        if series_id == DEFAULT_SERIES_ID:
            prefixes.add("/chapters/")
        else:
            prefixes.add(f"/comics/{series_id}/chapters/")

    for chapter_name, meta in chapter_meta.items():
        if not isinstance(meta, dict):
            continue
        if not meta.get("premium"):
            continue

        folder = chapter_folders.get(chapter_name)
        if not folder and chapter_name in chapters:
            folder = _infer_folder_from_pages(chapters.get(chapter_name) or [])
        if not folder:
            continue
        folder = str(folder).strip().strip("/")
        if not folder:
            continue
        prefixes.add(f"/{folder}/")

    _premium_prefix_cache[series_id] = {"mtime": mtime, "series_mtime": series_mtime, "prefixes": prefixes}
    return prefixes


def _series_id_from_request_path(path: str) -> str:
    path = (path or "").lstrip("/")
    if path.startswith("chapters/"):
        return DEFAULT_SERIES_ID
    if path.startswith("comics/"):
        parts = path.split("/", 3)
        if len(parts) >= 2:
            return sanitize_series_id(parts[1]) or DEFAULT_SERIES_ID
    return DEFAULT_SERIES_ID


def is_premium_request_path(path: str) -> bool:
    parsed = urlparse(path)
    clean_path = unquote(parsed.path or "")
    series_id = _series_id_from_request_path(clean_path)
    prefixes = _compute_premium_prefixes(series_id)
    return any(clean_path.startswith(prefix) for prefix in prefixes)
