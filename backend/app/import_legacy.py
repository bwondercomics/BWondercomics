from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from sqlalchemy import select

from .db import SessionLocal
from .models import Comment, User
from .security import hash_password
from .settings import settings


def _parse_dt(raw: str | None) -> datetime | None:
    if not raw:
        return None
    value = raw.strip()
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def _load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default
    except Exception:
        return default


def _legacy_paths() -> tuple[Path, Path]:
    data_root = (os.environ.get("DATA_ROOT") or "").strip()
    if data_root:
        data_dir = Path(data_root).expanduser().resolve()
        comments_dir = data_dir / "comments"
    else:
        data_dir = (settings.base_dir / "data").resolve()
        comments_dir = (settings.base_dir / "comments").resolve()
    return data_dir, comments_dir


def import_users_and_comments() -> None:
    data_dir, comments_dir = _legacy_paths()
    users_file = data_dir / "users.json"

    payload = _load_json(users_file, {"users": []})
    users = payload.get("users", []) if isinstance(payload, dict) else []
    if not isinstance(users, list):
        users = []

    db = SessionLocal()
    try:
        imported_users = 0
        imported_comments = 0

        for raw in users:
            if not isinstance(raw, dict):
                continue
            email = (raw.get("email") or "").strip().lower()
            if not email:
                continue
            exists = db.scalar(select(User).where(User.email == email))
            if exists:
                continue

            try:
                user_id = UUID(str(raw.get("id")))
            except Exception:
                continue

            created_at = _parse_dt(raw.get("createdAt")) or datetime.now(timezone.utc)
            user = User(
                id=user_id,
                email=email[:120],
                display_name=(raw.get("displayName") or email.split("@")[0])[:60],
                password_hash=str(raw.get("password") or hash_password(os.urandom(12).hex())),
                role=(raw.get("role") or "user"),
                created_at=created_at,
            )
            db.add(user)
            imported_users += 1

        db.commit()

        if comments_dir.exists():
            for path in sorted(comments_dir.glob("*.json")):
                target_id = path.stem
                raw_comments = _load_json(path, [])
                if not isinstance(raw_comments, list):
                    continue
                for raw in raw_comments:
                    if not isinstance(raw, dict):
                        continue
                    try:
                        comment_id = UUID(str(raw.get("id")))
                        user_id = UUID(str(raw.get("userId")))
                    except Exception:
                        continue

                    exists = db.get(Comment, comment_id)
                    if exists:
                        continue

                    user = db.get(User, user_id)
                    if not user:
                        placeholder = User(
                            id=user_id,
                            email=f"deleted+{user_id}@local.invalid",
                            display_name=(raw.get("displayName") or "User")[:60],
                            password_hash=hash_password(os.urandom(12).hex()),
                            role="user",
                            created_at=datetime.now(timezone.utc),
                        )
                        db.add(placeholder)
                        db.flush()

                    created_at = _parse_dt(raw.get("createdAt")) or datetime.now(timezone.utc)
                    hidden = bool(raw.get("hidden"))
                    hidden_by = None
                    hidden_at = None
                    if raw.get("hiddenBy"):
                        try:
                            hidden_by = UUID(str(raw.get("hiddenBy")))
                        except Exception:
                            hidden_by = None
                    if raw.get("hiddenAt"):
                        hidden_at = _parse_dt(raw.get("hiddenAt"))

                    comment = Comment(
                        id=comment_id,
                        target_id=target_id[:120],
                        user_id=user_id,
                        display_name=(raw.get("displayName") or "User")[:60],
                        message=(raw.get("message") or ""),
                        created_at=created_at,
                        hidden=hidden,
                        hidden_by=hidden_by,
                        hidden_at=hidden_at,
                    )
                    db.add(comment)
                    imported_comments += 1

        db.commit()
    finally:
        db.close()

    print(f"Imported users: {imported_users}")
    print(f"Imported comments: {imported_comments}")


if __name__ == "__main__":
    import_users_and_comments()

