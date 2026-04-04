from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit
from uuid import UUID, uuid4

from authlib.jose import jwt
from authlib.jose.errors import JoseError
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import OIDCAuthorizationCode, OIDCClient, User
from ..security import get_current_user
from ..settings import settings

router = APIRouter()


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _append_query(url: str, params: dict[str, str]) -> str:
    parsed = urlsplit(url)
    current = dict(parse_qsl(parsed.query, keep_blank_values=True))
    current.update({k: v for k, v in params.items() if v is not None})
    updated_query = urlencode(current)
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, updated_query, parsed.fragment))


def _oauth_error(
    error: str,
    description: str,
    status_code: int = 400,
    authenticate: bool = False,
) -> JSONResponse:
    headers = {}
    if authenticate:
        headers["WWW-Authenticate"] = 'Basic realm="oidc", error="invalid_client"'
    return JSONResponse(
        status_code=status_code,
        headers=headers,
        content={"error": error, "error_description": description},
    )


def _redirect_oauth_error(
    redirect_uri: str,
    state: str | None,
    error: str,
    description: str,
) -> RedirectResponse:
    params = {"error": error, "error_description": description}
    if state:
        params["state"] = state
    return RedirectResponse(url=_append_query(redirect_uri, params), status_code=302)


def _resolve_issuer(request: Request) -> str:
    if settings.oidc_issuer:
        return settings.oidc_issuer

    forwarded_proto = (request.headers.get("X-Forwarded-Proto") or "").split(",")[0].strip().lower()
    proto = (
        forwarded_proto if forwarded_proto in {"http", "https"} else request.url.scheme or "http"
    )
    host = (request.headers.get("X-Forwarded-Host") or request.headers.get("Host") or "").strip()
    host = host.split(",")[0].strip() if host else request.url.netloc
    return f"{proto}://{host}".rstrip("/")


def _scopes_from_raw(raw: str) -> tuple[str, ...]:
    values = [part.strip() for part in str(raw or "").split() if part.strip()]
    if not values:
        return tuple()
    # Preserve order while removing duplicates.
    deduped: list[str] = []
    seen: set[str] = set()
    for scope in values:
        if scope in seen:
            continue
        seen.add(scope)
        deduped.append(scope)
    return tuple(deduped)


def _scopes_to_string(scopes: tuple[str, ...]) -> str:
    return " ".join(scopes)


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_uint(value: int) -> str:
    length = max(1, (value.bit_length() + 7) // 8)
    return _b64url(value.to_bytes(length, "big"))


def _pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("utf-8")).digest()
    return _b64url(digest)


def _client_redirect_uris(client: OIDCClient) -> tuple[str, ...]:
    values = client.redirect_uris if isinstance(client.redirect_uris, list) else []
    cleaned = [str(uri).strip() for uri in values if str(uri).strip()]
    return tuple(cleaned)


def _client_scopes(client: OIDCClient) -> set[str]:
    values = client.scopes if isinstance(client.scopes, list) else []
    if not values:
        return {"openid", "profile", "email"}
    return {str(scope).strip() for scope in values if str(scope).strip()}


def _upsert_stoat_client(db: Session) -> OIDCClient | None:
    client_id = settings.oidc_client_stoat_id
    if not client_id:
        return None

    client = db.scalar(select(OIDCClient).where(OIDCClient.client_id == client_id))
    redirect_uris = list(settings.oidc_client_stoat_redirect_uris)
    scopes = list(settings.oidc_client_stoat_scopes) or ["openid", "profile", "email"]

    if not client:
        client = OIDCClient(
            id=uuid4(),
            client_id=client_id,
            name="Stoat Chat",
            redirect_uris=redirect_uris,
            scopes=scopes,
            active=True,
        )
        db.add(client)
        db.commit()
        db.refresh(client)
        return client

    changed = False
    if redirect_uris and client.redirect_uris != redirect_uris:
        client.redirect_uris = redirect_uris
        changed = True
    if scopes and client.scopes != scopes:
        client.scopes = scopes
        changed = True
    if changed:
        db.add(client)
        db.commit()
        db.refresh(client)
    return client


def _get_client(db: Session, client_id: str) -> OIDCClient | None:
    if client_id == settings.oidc_client_stoat_id:
        return _upsert_stoat_client(db)
    return db.scalar(select(OIDCClient).where(OIDCClient.client_id == client_id))


def _parse_basic_auth(value: str | None) -> tuple[str | None, str | None]:
    if not value:
        return None, None
    if not value.lower().startswith("basic "):
        return None, None
    token = value[6:].strip()
    try:
        decoded = base64.b64decode(token).decode("utf-8")
    except Exception:
        return None, None
    if ":" not in decoded:
        return None, None
    client_id, client_secret = decoded.split(":", 1)
    return client_id, client_secret


def _validate_client_secret(client_id: str, client_secret: str) -> bool:
    expected_id = settings.oidc_client_stoat_id
    expected_secret = settings.oidc_client_stoat_secret
    if not expected_id or not expected_secret:
        return False
    if client_id != expected_id:
        return False
    return hmac.compare_digest(client_secret, expected_secret)


def _issue_signed_token(payload: dict[str, Any]) -> str:
    header = {"alg": "RS256", "kid": settings.oidc_signing_kid, "typ": "JWT"}
    encoded = jwt.encode(header, payload, settings.oidc_signing_key_pem)
    if isinstance(encoded, bytes):
        return encoded.decode("ascii")
    return str(encoded)


@lru_cache(maxsize=1)
def _public_jwk() -> dict[str, str]:
    if not settings.oidc_signing_key_pem:
        raise RuntimeError("OIDC_SIGNING_KEY_PEM is not configured")
    private_key = serialization.load_pem_private_key(
        settings.oidc_signing_key_pem.encode("utf-8"),
        password=None,
    )
    if not isinstance(private_key, rsa.RSAPrivateKey):
        raise RuntimeError("OIDC signing key must be RSA")
    public_numbers = private_key.public_key().public_numbers()
    return {
        "kty": "RSA",
        "use": "sig",
        "alg": "RS256",
        "kid": settings.oidc_signing_kid,
        "n": _b64url_uint(public_numbers.n),
        "e": _b64url_uint(public_numbers.e),
    }


def _provider_enabled() -> bool:
    return bool(settings.oidc_client_stoat_id and settings.oidc_signing_key_pem)


def _build_login_redirect(request: Request) -> str:
    path = settings.oidc_login_path or "/?openComments=1"
    if (
        not path.startswith("http://")
        and not path.startswith("https://")
        and not path.startswith("/")
    ):
        path = "/" + path
    next_target = request.url.path
    if request.url.query:
        next_target = f"{next_target}?{request.url.query}"
    separator = "&" if "?" in path else "?"
    return f"{path}{separator}next={quote(next_target, safe='')}"


def _id_token_claims(user: User, issuer: str, client_id: str, nonce: str | None) -> dict[str, Any]:
    now = int(time.time())
    claims: dict[str, Any] = {
        "iss": issuer,
        "sub": str(user.id),
        "aud": client_id,
        "iat": now,
        "exp": now + settings.oidc_id_token_ttl_seconds,
        "email": user.email,
        "email_verified": True,
        "name": user.display_name,
        "preferred_username": user.display_name,
    }
    if nonce:
        claims["nonce"] = nonce
    return claims


def _access_token_claims(user: User, issuer: str, client_id: str, scope: str) -> dict[str, Any]:
    now = int(time.time())
    return {
        "iss": issuer,
        "sub": str(user.id),
        "aud": client_id,
        "iat": now,
        "exp": now + settings.oidc_access_token_ttl_seconds,
        "scope": scope,
        "token_use": "access",
    }


@router.get("/.well-known/openid-configuration")
def openid_configuration(request: Request):
    if not _provider_enabled():
        return JSONResponse(status_code=404, content={"error": "OIDC provider is not configured"})

    issuer = _resolve_issuer(request)
    return {
        "issuer": issuer,
        "authorization_endpoint": f"{issuer}/oidc/authorize",
        "token_endpoint": f"{issuer}/oidc/token",
        "userinfo_endpoint": f"{issuer}/oidc/userinfo",
        "jwks_uri": f"{issuer}/.well-known/jwks.json",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code"],
        "subject_types_supported": ["public"],
        "id_token_signing_alg_values_supported": ["RS256"],
        "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post"],
        "code_challenge_methods_supported": ["S256"],
        "scopes_supported": ["openid", "profile", "email"],
        "claims_supported": [
            "sub",
            "iss",
            "aud",
            "exp",
            "iat",
            "nonce",
            "email",
            "email_verified",
            "name",
            "preferred_username",
        ],
    }


@router.get("/.well-known/jwks.json")
def jwks():
    if not _provider_enabled():
        return JSONResponse(status_code=404, content={"error": "OIDC provider is not configured"})
    try:
        return {"keys": [_public_jwk()]}
    except Exception:
        return JSONResponse(status_code=500, content={"error": "OIDC key configuration is invalid"})


@router.get("/oidc/authorize")
def authorize(
    request: Request,
    response_type: str = Query(default=""),
    client_id: str = Query(default=""),
    redirect_uri: str = Query(default=""),
    scope: str = Query(default="openid"),
    state: str | None = Query(default=None),
    nonce: str | None = Query(default=None),
    code_challenge: str | None = Query(default=None),
    code_challenge_method: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    if not _provider_enabled():
        return JSONResponse(status_code=404, content={"error": "OIDC provider is not configured"})

    client = _get_client(db, client_id)
    if not client or not client.active:
        return _oauth_error("invalid_client", "Unknown or inactive client.", status_code=401)

    allowed_redirects = _client_redirect_uris(client)
    if not redirect_uri or redirect_uri not in allowed_redirects:
        return _oauth_error(
            "invalid_request",
            "redirect_uri is missing or not registered for this client.",
        )

    if response_type != "code":
        return _redirect_oauth_error(
            redirect_uri,
            state,
            "unsupported_response_type",
            "Only response_type=code is supported.",
        )

    requested_scopes = _scopes_from_raw(scope)
    if "openid" not in requested_scopes:
        return _redirect_oauth_error(
            redirect_uri,
            state,
            "invalid_scope",
            "openid scope is required.",
        )

    supported_scopes = _client_scopes(client)
    if any(item not in supported_scopes for item in requested_scopes):
        return _redirect_oauth_error(
            redirect_uri,
            state,
            "invalid_scope",
            "One or more requested scopes are not allowed.",
        )

    if not code_challenge:
        return _redirect_oauth_error(
            redirect_uri,
            state,
            "invalid_request",
            "PKCE code_challenge is required.",
        )
    if (code_challenge_method or "S256").upper() != "S256":
        return _redirect_oauth_error(
            redirect_uri,
            state,
            "invalid_request",
            "Only code_challenge_method=S256 is supported.",
        )

    user = get_current_user(db, request)
    if not user:
        return RedirectResponse(url=_build_login_redirect(request), status_code=307)

    code = secrets.token_urlsafe(48)
    db.add(
        OIDCAuthorizationCode(
            code=code,
            client_id=client.client_id,
            user_id=user.id,
            redirect_uri=redirect_uri,
            scope=_scopes_to_string(requested_scopes),
            nonce=(nonce or "").strip() or None,
            code_challenge=code_challenge.strip(),
            code_challenge_method="S256",
            expires_at=_now_utc() + timedelta(seconds=settings.oidc_auth_code_ttl_seconds),
        )
    )
    db.commit()

    redirect_params = {"code": code}
    if state:
        redirect_params["state"] = state
    return RedirectResponse(url=_append_query(redirect_uri, redirect_params), status_code=302)


@router.post("/oidc/token")
async def token(request: Request, db: Session = Depends(get_db)):
    if not _provider_enabled():
        return JSONResponse(status_code=404, content={"error": "OIDC provider is not configured"})

    try:
        form = dict(parse_qsl((await request.body()).decode("utf-8"), keep_blank_values=True))
    except Exception:
        form = {}

    grant_type = (form.get("grant_type") or "").strip()
    if grant_type != "authorization_code":
        return _oauth_error(
            "unsupported_grant_type",
            "Only authorization_code grant type is supported.",
        )

    body_client_id = (form.get("client_id") or "").strip()
    body_client_secret = form.get("client_secret") or ""
    basic_client_id, basic_client_secret = _parse_basic_auth(request.headers.get("Authorization"))

    client_id = basic_client_id or body_client_id
    client_secret = basic_client_secret if basic_client_id else body_client_secret

    if basic_client_id and body_client_id and basic_client_id != body_client_id:
        return _oauth_error(
            "invalid_client",
            "Conflicting client_id values in Authorization header and request body.",
            status_code=401,
            authenticate=True,
        )
    if not client_id or not client_secret:
        return _oauth_error(
            "invalid_client",
            "Client authentication is required.",
            status_code=401,
            authenticate=True,
        )
    if not _validate_client_secret(client_id, client_secret):
        return _oauth_error(
            "invalid_client",
            "Client authentication failed.",
            status_code=401,
            authenticate=True,
        )
    client = _get_client(db, client_id)
    if not client or not client.active:
        return _oauth_error(
            "invalid_client",
            "Unknown or inactive client.",
            status_code=401,
            authenticate=True,
        )

    code_value = (form.get("code") or "").strip()
    redirect_uri = (form.get("redirect_uri") or "").strip()
    code_verifier = (form.get("code_verifier") or "").strip()
    if not code_value or not redirect_uri or not code_verifier:
        return _oauth_error(
            "invalid_request",
            "code, redirect_uri, and code_verifier are required.",
        )

    auth_code = db.get(OIDCAuthorizationCode, code_value)
    if not auth_code:
        return _oauth_error("invalid_grant", "Invalid authorization code.")
    if auth_code.used_at is not None:
        return _oauth_error("invalid_grant", "Authorization code has already been used.")
    if auth_code.expires_at < _now_utc():
        return _oauth_error("invalid_grant", "Authorization code has expired.")
    if auth_code.client_id != client_id:
        return _oauth_error("invalid_grant", "Authorization code client mismatch.")
    if auth_code.redirect_uri != redirect_uri:
        return _oauth_error("invalid_grant", "redirect_uri mismatch.")
    if redirect_uri not in _client_redirect_uris(client):
        return _oauth_error("invalid_grant", "redirect_uri is not registered.")
    if auth_code.code_challenge_method != "S256":
        return _oauth_error("invalid_grant", "Unsupported PKCE method.")
    expected_challenge = _pkce_challenge(code_verifier)
    if not hmac.compare_digest(expected_challenge, auth_code.code_challenge):
        return _oauth_error("invalid_grant", "Invalid code_verifier.")

    user = db.get(User, auth_code.user_id)
    if not user:
        return _oauth_error("invalid_grant", "User no longer exists.")

    issuer = _resolve_issuer(request)
    id_token = _issue_signed_token(
        _id_token_claims(user, issuer, client_id, auth_code.nonce),
    )
    access_token = _issue_signed_token(
        _access_token_claims(user, issuer, client_id, auth_code.scope),
    )

    auth_code.used_at = _now_utc()
    db.add(auth_code)
    db.commit()

    return {
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": settings.oidc_access_token_ttl_seconds,
        "id_token": id_token,
        "scope": auth_code.scope,
    }


@router.get("/oidc/userinfo")
def userinfo(request: Request, db: Session = Depends(get_db)):
    if not _provider_enabled():
        return JSONResponse(status_code=404, content={"error": "OIDC provider is not configured"})

    authorization = request.headers.get("Authorization") or ""
    if not authorization.lower().startswith("bearer "):
        return _oauth_error("invalid_token", "Bearer token is required.", status_code=401)
    token = authorization[7:].strip()
    if not token:
        return _oauth_error("invalid_token", "Bearer token is required.", status_code=401)

    try:
        claims = jwt.decode(token, settings.oidc_signing_key_pem)
        claims.validate()
    except JoseError:
        return _oauth_error("invalid_token", "Token validation failed.", status_code=401)
    except Exception:
        return _oauth_error("invalid_token", "Token validation failed.", status_code=401)

    if claims.get("token_use") != "access":
        return _oauth_error("invalid_token", "Token is not an access token.", status_code=401)

    raw_sub = str(claims.get("sub") or "").strip()
    if not raw_sub:
        return _oauth_error("invalid_token", "Missing subject claim.", status_code=401)
    try:
        user_id = UUID(raw_sub)
    except Exception:
        return _oauth_error("invalid_token", "Invalid subject claim.", status_code=401)

    user = db.get(User, user_id)
    if not user:
        return _oauth_error("invalid_token", "User not found.", status_code=401)

    return {
        "sub": str(user.id),
        "email": user.email,
        "email_verified": True,
        "name": user.display_name,
        "preferred_username": user.display_name,
    }
