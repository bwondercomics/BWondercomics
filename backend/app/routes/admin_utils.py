from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy.orm import Session

from ..models import User
from ..security import get_current_user
from ..validation import is_admin_role


def require_admin(request: Request, db: Session) -> User | None:
    user = get_current_user(db, request)
    if not user or not is_admin_role(user.role):
        return None
    return user


def iso_z(dt: datetime | None) -> str | None:
    if not dt:
        return None
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def client_ip(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return ""
