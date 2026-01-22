from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import timezone
from typing import Any
from uuid import UUID

from fastapi import Request
from sqlalchemy.orm import Session

from .models import User
from .settings import settings


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        120_000,
    ).hex()
    return f"{salt}${derived}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, derived = stored.split("$", 1)
    except ValueError:
        return False
    check = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        120_000,
    ).hex()
    return hmac.compare_digest(check, derived)


def sign_payload(payload: dict[str, Any]) -> str:
    body = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).decode("ascii")
    signature = hmac.new(
        settings.app_secret.encode("utf-8"),
        body.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    return f"{body}.{signature}"


def verify_token(token: str | None) -> dict[str, Any] | None:
    if not token or "." not in token:
        return None
    try:
        body, signature = token.split(".", 1)
        expected = hmac.new(
            settings.app_secret.encode("utf-8"),
            body.encode("ascii"),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, signature):
            return None
        payload = json.loads(base64.urlsafe_b64decode(body.encode("ascii")).decode("utf-8"))
        if payload.get("exp", 0) < int(time.time()):
            return None
        return payload if isinstance(payload, dict) else None
    except Exception:
        return None


def issue_session_token(user_id: UUID) -> str:
    return sign_payload(
        {
            "uid": str(user_id),
            "exp": int(time.time()) + settings.session_ttl_seconds,
            "nonce": secrets.token_hex(8),
        }
    )


def cookie_secure_for_request(request: Request) -> bool:
    if settings.cookie_secure:
        return True
    forwarded_proto = (request.headers.get("X-Forwarded-Proto") or "").split(",")[0].strip().lower()
    return forwarded_proto == "https"


def get_current_user(db: Session, request: Request) -> User | None:
    token = request.cookies.get(settings.session_cookie_name)
    payload = verify_token(token)
    if not payload:
        return None
    uid = payload.get("uid")
    if not uid:
        return None
    try:
        user_id = UUID(str(uid))
    except Exception:
        return None
    return db.get(User, user_id)


def public_user(user: User) -> dict[str, Any]:
    created = user.created_at
    created_at = (
        created.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if created else None
    )
    return {
        "id": str(user.id),
        "email": user.email,
        "displayName": user.display_name,
        "role": user.role,
        "createdAt": created_at,
    }
