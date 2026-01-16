from __future__ import annotations

import os
import re
import shutil
import uuid
from pathlib import Path

from .settings import settings


ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}


def safe_path(rel_path: str) -> Path:
    rel_path = (rel_path or "").replace("/", os.sep)
    base_dir = settings.base_dir.resolve()
    normalized = (base_dir / rel_path).resolve()
    if not normalized.is_relative_to(base_dir):
        raise ValueError("Invalid path")
    return normalized


def extract_numbers(filename: str) -> int:
    match = re.search(r"(\d+)", filename)
    return int(match.group(1)) if match else -1


def renumber_files(chapter_folder: str, order: list[str]) -> list[str]:
    chapter_folder = (chapter_folder or "").strip().strip("/")
    if not chapter_folder or not order:
        raise ValueError("entryFolder and non-empty order are required")

    target_dir = safe_path(chapter_folder)
    target_dir.mkdir(parents=True, exist_ok=True)

    moves: list[tuple[Path, Path, str]] = []
    for idx, rel_path in enumerate(order):
        rel_path = (rel_path or "").strip().strip("/")
        abs_src = safe_path(rel_path)
        if not abs_src.exists():
            raise FileNotFoundError(f"File not found: {rel_path}")

        ext = abs_src.suffix.lower()
        if ext not in ALLOWED_IMAGE_EXTENSIONS:
            raise ValueError(f"Unsupported file type for {rel_path}")

        new_name = f"{idx + 1:02d}{ext}"
        new_rel = f"{chapter_folder}/{new_name}"
        abs_dest = safe_path(new_rel)
        moves.append((abs_src, abs_dest, new_rel))

    temp_moves: list[Path] = []
    for abs_src, _, _ in moves:
        temp_name = abs_src.with_name(abs_src.name + f".tmp-{uuid.uuid4().hex}")
        shutil.move(str(abs_src), str(temp_name))
        temp_moves.append(temp_name)

    new_paths: list[str] = []
    for temp_src, (_, abs_dest, new_rel) in zip(temp_moves, moves):
        abs_dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(temp_src), str(abs_dest))
        new_paths.append(new_rel)

    return new_paths
