from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.sql import func
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User
from ..security import (
    cookie_secure_for_request,
    hash_password,
    issue_session_token,
    public_user,
    verify_password,
)
from ..settings import settings
from ..validation import is_admin_role


router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    email: str
    password: str
    display_name: str | None = Field(default=None, alias="displayName")
    invite_code: str | None = Field(default=None, alias="inviteCode")


def _set_session_cookie(response: JSONResponse, token: str, secure: bool) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_ttl_seconds,
        httponly=True,
        samesite="lax",
        secure=secure,
        path="/",
    )


def _clear_session_cookie(response: JSONResponse) -> None:
    response.delete_cookie(key=settings.session_cookie_name, path="/")


@router.get("/api/session")
def session(request: Request, db: Session = Depends(get_db)):
    from ..security import get_current_user

    user = get_current_user(db, request)
    return {"user": public_user(user) if user else None}


@router.post("/api/login")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    email = (payload.email or "").strip().lower()
    password = payload.password or ""

    if not email or not password:
        return JSONResponse(status_code=400, content={"error": "Email and password are required"})

    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(password, user.password_hash):
        return JSONResponse(status_code=401, content={"error": "Invalid credentials"})

    token = issue_session_token(user.id)
    resp = JSONResponse(status_code=200, content={"user": public_user(user)})
    _set_session_cookie(resp, token, secure=cookie_secure_for_request(request))
    return resp


@router.post("/api/register")
def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    email = (payload.email or "").strip().lower()
    password = payload.password or ""
    display_name = (payload.display_name or "").strip() or (email.split("@")[0] if "@" in email else "User")
    invite_code = (payload.invite_code or "").strip()

    if not email or "@" not in email or len(email) > 120:
        return JSONResponse(status_code=400, content={"error": "Valid email is required"})
    if len(password) < 8 or len(password) > 128:
        return JSONResponse(status_code=400, content={"error": "Password must be between 8 and 128 characters"})

    if settings.registration_mode not in {"open", "invite", "closed"}:
        return JSONResponse(
            status_code=500,
            content={"error": "Server misconfigured: invalid REGISTRATION_MODE"},
        )
    if settings.registration_mode == "closed":
        return JSONResponse(status_code=403, content={"error": "Registration is closed"})
    if settings.registration_mode == "invite":
        if not settings.invite_code:
            return JSONResponse(
                status_code=500,
                content={"error": "Server misconfigured: INVITE_CODE is required for invite mode"},
            )
        if invite_code != settings.invite_code:
            return JSONResponse(status_code=403, content={"error": "Invalid invite code"})

    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        return JSONResponse(status_code=409, content={"error": "Email already registered"})

    user_count = db.scalar(select(func.count()).select_from(User)) or 0
    role = "admin" if (user_count or 0) == 0 else "user"

    user = User(
        email=email,
        display_name=display_name[:60],
        password_hash=hash_password(password),
        role=role,
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = issue_session_token(user.id)
    resp = JSONResponse(status_code=200, content={"user": public_user(user)})
    _set_session_cookie(resp, token, secure=cookie_secure_for_request(request))
    return resp


@router.post("/api/logout")
def logout():
    resp = JSONResponse(status_code=200, content={"status": "ok"})
    _clear_session_cookie(resp)
    return resp


def require_admin_user(request: Request, db: Session) -> User | None:
    from ..security import get_current_user

    user = get_current_user(db, request)
    if not user or not is_admin_role(user.role):
        return None
    return user
