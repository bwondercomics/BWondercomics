from __future__ import annotations

import hmac
from ipaddress import ip_address, ip_network
from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy.orm import Session

from ..models import User
from ..security import get_current_user
from ..settings import settings
from ..validation import is_admin_role


def require_admin(request: Request, db: Session) -> User | None:
    user = get_current_user(db, request)
    if not user or not is_admin_role(user.role):
        return None
    return user


def iso_z(dt: datetime | None) -> str | None:
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def client_ip(request: Request) -> str:
    forwarded_for = (request.headers.get("X-Forwarded-For") or "").strip()
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    real_ip = (request.headers.get("X-Real-IP") or "").strip()
    if real_ip:
        return real_ip
    if request.client and request.client.host:
        return request.client.host
    return ""


def ip_in_allowlist(ip: str, allowlist: tuple[str, ...]) -> bool:
    if not ip or not allowlist:
        return False
    try:
        client = ip_address(ip)
    except ValueError:
        return False

    for raw in allowlist:
        entry = str(raw or "").strip()
        if not entry:
            continue
        try:
            if "/" in entry:
                if client in ip_network(entry, strict=False):
                    return True
            elif client == ip_address(entry):
                return True
        except ValueError:
            continue
    return False


def require_ops_access(request: Request, db: Session) -> tuple[User | None, str | None]:
    admin = require_admin(request, db)
    if not admin:
        return None, "Admin access required"
    if not settings.ops_allowed_ips:
        return None, "Ops access disabled: OPS_ALLOWED_IPS is not configured"
    caller_ip = client_ip(request)
    if not ip_in_allowlist(caller_ip, settings.ops_allowed_ips):
        label = caller_ip or "unknown IP"
        return None, f"Ops access denied for {label}"
    return admin, None


def require_host_automation(request: Request) -> bool:
    expected = settings.host_automation_token
    if not expected:
        return False

    auth = (request.headers.get("Authorization") or "").strip()
    token = ""
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
    if not token:
        token = (request.headers.get("X-Host-Automation-Token") or "").strip()
    return bool(token) and hmac.compare_digest(token, expected)
