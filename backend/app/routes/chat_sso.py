from __future__ import annotations

import asyncio
import contextlib
import hashlib
import hmac
import json
import re
import secrets
import time
import urllib.error
import urllib.request
from typing import Any
from urllib.parse import quote, unquote, urlsplit
from uuid import UUID

import websockets
from fastapi import APIRouter, Depends, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from starlette.websockets import WebSocketState

from ..db import get_db
from ..models import User
from ..security import cookie_secure_for_request, get_current_user, sign_payload, verify_token
from ..settings import settings
from ..validation import is_admin_role

router = APIRouter()

_CHAT_BOOTSTRAP_PATH = "/sso/bootstrap"
_CHAT_READY_COOKIE_NAME = "bb_chat_ready"
_CHAT_READY_COOKIE_VALUE = "1"
_CHAT_READY_COOKIE_MAX_AGE_SECONDS = 3600
_CHAT_ADMIN_BRIDGE_COOKIE_NAME = "bb_chat_admin_bridge"
_CHAT_ADMIN_BRIDGE_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60


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


def _chat_login_fallback_url() -> str:
    if settings.chat_login_url:
        return settings.chat_login_url
    if settings.chat_public_url:
        return f"{settings.chat_public_url.rstrip('/')}/login"
    return "/"


def _is_ip_host(host: str) -> bool:
    host = (host or "").strip()
    if not host:
        return False
    if ":" in host:
        return True
    parts = host.split(".")
    if len(parts) != 4:
        return False
    try:
        return all(0 <= int(part) <= 255 for part in parts)
    except Exception:
        return False


def _chat_cookie_domain() -> str | None:
    issuer_host = (urlsplit(settings.oidc_issuer).hostname or "").strip().lower()
    chat_host = (urlsplit(settings.chat_public_url).hostname or "").strip().lower()

    candidate = issuer_host
    if not candidate and chat_host and "." in chat_host:
        labels = chat_host.split(".")
        if len(labels) >= 2:
            candidate = ".".join(labels[-2:])

    if not candidate or candidate == "localhost" or _is_ip_host(candidate):
        return None
    if chat_host and chat_host != candidate and not chat_host.endswith(f".{candidate}"):
        return None
    return candidate


def _set_chat_sso_cookie(response: RedirectResponse, value: str, secure: bool) -> None:
    domain = _chat_cookie_domain()
    cookie_args: dict[str, Any] = {
        "key": settings.chat_sso_cookie_name,
        "value": value,
        "max_age": settings.chat_sso_cookie_ttl_seconds,
        "httponly": True,
        "samesite": "lax",
        "secure": secure,
        "path": "/",
    }
    if domain:
        cookie_args["domain"] = domain
    response.set_cookie(**cookie_args)


def _clear_chat_sso_cookie(response: RedirectResponse | HTMLResponse) -> None:
    domain = _chat_cookie_domain()
    cookie_args: dict[str, Any] = {
        "key": settings.chat_sso_cookie_name,
        "path": "/",
    }
    if domain:
        cookie_args["domain"] = domain
    response.delete_cookie(**cookie_args)


def _set_chat_admin_bridge_cookie(response: RedirectResponse, value: str, secure: bool) -> None:
    domain = _chat_cookie_domain()
    cookie_args: dict[str, Any] = {
        "key": _CHAT_ADMIN_BRIDGE_COOKIE_NAME,
        "value": value,
        "max_age": _CHAT_ADMIN_BRIDGE_COOKIE_MAX_AGE_SECONDS,
        "httponly": True,
        "samesite": "lax",
        "secure": secure,
        "path": "/",
    }
    if domain:
        cookie_args["domain"] = domain
    response.set_cookie(**cookie_args)


def _clear_chat_admin_bridge_cookie(response: RedirectResponse | HTMLResponse) -> None:
    domain = _chat_cookie_domain()
    cookie_args: dict[str, Any] = {
        "key": _CHAT_ADMIN_BRIDGE_COOKIE_NAME,
        "path": "/",
    }
    if domain:
        cookie_args["domain"] = domain
    response.delete_cookie(**cookie_args)


def _set_chat_ready_cookie(response: HTMLResponse, request: Request) -> None:
    domain = _chat_cookie_domain()
    cookie_args: dict[str, Any] = {
        "key": _CHAT_READY_COOKIE_NAME,
        "value": _CHAT_READY_COOKIE_VALUE,
        "max_age": _CHAT_READY_COOKIE_MAX_AGE_SECONDS,
        "httponly": False,
        "samesite": "lax",
        "secure": cookie_secure_for_request(request),
        "path": "/",
    }
    if domain:
        cookie_args["domain"] = domain
    response.set_cookie(**cookie_args)


def _chat_password_for_user(user: User) -> str:
    material = f"{user.id}:{user.email.strip().lower()}".encode("utf-8")
    digest = hmac.new(
        settings.chat_sso_password_secret.encode("utf-8"),
        material,
        hashlib.sha256,
    ).hexdigest()
    return f"BWC-{digest}-Aa1!"


def _chat_api_request(
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
    session_token: str | None = None,
    timeout_seconds: float = 8,
) -> tuple[int, dict[str, Any]]:
    base = settings.chat_api_internal_url.rstrip("/")
    url = f"{base}{path}"
    normalized = method.upper().strip()
    body: bytes | None = None
    if payload is not None and normalized in {"POST", "PUT", "PATCH"}:
        body = json.dumps(payload).encode("utf-8")
    headers = {
        "Accept": "application/json",
        "User-Agent": "bwondercomics-chat-sso/1.0",
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
    if session_token:
        headers["X-Session-Token"] = session_token
    req = urllib.request.Request(
        url=url,
        data=body,
        method=normalized,
        headers=headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
            raw = (resp.read() or b"").decode("utf-8", errors="replace").strip()
            if not raw:
                return resp.status, {}
            try:
                data = json.loads(raw)
                return resp.status, data if isinstance(data, dict) else {}
            except Exception:
                return resp.status, {"raw": raw}
    except urllib.error.HTTPError as exc:
        raw = (exc.read() or b"").decode("utf-8", errors="replace").strip()
        if raw:
            try:
                data = json.loads(raw)
                if isinstance(data, dict):
                    return exc.code, data
            except Exception:
                pass
        return exc.code, {"error": f"http_{exc.code}"}
    except Exception as exc:
        return 0, {"error": "request_failed", "detail": str(exc)}


def _chat_api_post(
    path: str,
    payload: dict[str, Any],
    session_token: str | None = None,
) -> tuple[int, dict[str, Any]]:
    return _chat_api_request("POST", path, payload, session_token=session_token)


def _normalize_channel_create_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Normalize legacy client payload shapes for server channel creation."""
    normalized = dict(payload)

    channel_type = normalized.get("type")
    if channel_type is None and "channel_type" in normalized:
        channel_type = normalized.get("channel_type")
        normalized["type"] = channel_type

    if isinstance(channel_type, str):
        lowered = channel_type.strip().lower()
        if lowered in {"voice", "voicechannel"}:
            normalized["type"] = "Voice"
        elif lowered in {"text", "textchannel"}:
            normalized["type"] = "Text"

    # Handle alternate voice toggles seen across client revisions.
    if normalized.get("is_voice") is True or normalized.get("voice_channel") is True:
        normalized["type"] = "Voice"

    if normalized.get("voice") is True:
        normalized["voice"] = {}

    # Some clients send only the type toggle; Stoat expects voice metadata
    # to mark a TextChannel as voice-enabled internally.
    if normalized.get("type") == "Voice" and "voice" not in normalized:
        normalized["voice"] = {}

    return normalized


def _normalize_legacy_voice_channels(value: Any) -> Any:
    """Map TextChannel+voice payloads to VoiceChannel for legacy web bundles."""
    if isinstance(value, dict):
        normalized = {k: _normalize_legacy_voice_channels(v) for k, v in value.items()}
        if normalized.get("channel_type") == "TextChannel" and isinstance(
            normalized.get("voice"), dict
        ):
            normalized["channel_type"] = "VoiceChannel"
        return normalized
    if isinstance(value, list):
        return [_normalize_legacy_voice_channels(item) for item in value]
    return value


def _normalize_ws_payload(raw: str) -> str:
    text = raw.lstrip()
    if not text or text[0] not in "{[":
        return raw
    try:
        parsed = json.loads(raw)
    except Exception:
        return raw
    normalized = _normalize_legacy_voice_channels(parsed)
    if normalized == parsed:
        return raw
    try:
        return json.dumps(normalized, separators=(",", ":"))
    except Exception:
        return raw


def _extract_chat_session(payload: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    token = str(payload.get("token") or "").strip()
    user_id = str(payload.get("user_id") or "").strip()
    session_id = str(payload.get("_id") or "").strip()
    if not token or not user_id or not session_id:
        return None
    name = (
        str(payload.get("name") or settings.chat_sso_device_name).strip()
        or settings.chat_sso_device_name
    )

    # Keep the full payload shape from Stoat to remain compatible with
    # client revisions that expect extra session fields.
    session: dict[str, Any] = dict(payload)
    session["user_id"] = user_id
    session["token"] = token
    session["_id"] = session_id
    session["name"] = name
    return session


def _username_candidates(user: User) -> list[str]:
    raw = (user.display_name or user.email.split("@")[0]).strip().lower()
    cleaned = re.sub(r"[^a-z0-9_]", "", raw)
    if len(cleaned) < 2:
        cleaned = "bwonder"
    if len(cleaned) > 26:
        cleaned = cleaned[:26]

    suffix_seed = str(user.id).replace("-", "").lower()
    candidates: list[str] = []
    primary = cleaned[:32]
    if len(primary) >= 2:
        candidates.append(primary)
    for span in (4, 6, 8, 10):
        suffix = suffix_seed[:span]
        if not suffix:
            continue
        head = cleaned[: max(2, 31 - len(suffix))]
        candidate = f"{head}_{suffix}"[:32]
        if len(candidate) < 2 or candidate in candidates:
            continue
        candidates.append(candidate)
    fallback = f"bw_{suffix_seed[:10]}".strip("_")[:32]
    if fallback and fallback not in candidates:
        candidates.append(fallback)
    return candidates


def _read_onboarding_state(token: str) -> tuple[bool | None, str | None]:
    # Read both route styles because Stoat/Revolt releases may expose either.
    states: list[bool] = []
    for path in ("/onboard/hello", "/0.8/onboard/hello"):
        status, payload = _chat_api_request("GET", path, session_token=token)
        if status != 200:
            return None, "Unable to verify chat onboarding status."
        states.append(bool(payload.get("onboarding")))
    return any(states), None


def _ensure_chat_onboarding(user: User, chat_session: dict[str, Any]) -> str | None:
    token = str(chat_session.get("token") or "").strip()
    if not token:
        return "Missing chat session token."

    onboarding, onboarding_error = _read_onboarding_state(token)
    if onboarding_error:
        return onboarding_error
    if not onboarding:
        return None

    for candidate in _username_candidates(user):
        for path in ("/onboard/complete", "/0.8/onboard/complete"):
            status, payload = _chat_api_post(
                path,
                {"username": candidate},
                session_token=token,
            )
            # 403 AlreadyOnboarded is effectively success.
            if status == 403 and str(payload.get("type") or "") == "AlreadyOnboarded":
                return None
        onboarding, onboarding_error = _read_onboarding_state(token)
        if onboarding_error:
            return onboarding_error
        if not onboarding:
            return None

    return "Unable to finish chat account onboarding."


def _is_already_server_member(payload: dict[str, Any]) -> bool:
    error_type = str(payload.get("type") or payload.get("error") or "").strip()
    if error_type in {"AlreadyInServer", "AlreadyMember", "AlreadyJoined"}:
        return True
    detail = str(payload.get("message") or payload.get("detail") or "").strip().lower()
    return bool(detail) and "already" in detail and ("server" in detail or "member" in detail)


def _ensure_official_server_membership(chat_session: dict[str, Any]) -> str | None:
    invite_code = settings.chat_official_invite_code.strip()
    if not invite_code:
        return None

    token = str(chat_session.get("token") or "").strip()
    if not token:
        return "Missing chat session token."

    safe_code = quote(invite_code, safe="")
    last_status = 0
    for path in (f"/invites/{safe_code}", f"/0.8/invites/{safe_code}"):
        status, payload = _chat_api_request(
            "POST",
            path,
            payload=None,
            session_token=token,
        )
        last_status = status
        if status in {200, 201, 204}:
            return None
        if status in {400, 403, 409} and _is_already_server_member(payload):
            return None
        if status in {404, 405}:
            continue

    if last_status:
        return f"Unable to join official chat server automatically (status {last_status})."
    return "Unable to join official chat server automatically."


def _try_login(payload: dict[str, Any]) -> tuple[dict[str, Any] | None, int, dict[str, Any]]:
    for path in ("/auth/session/login", "/0.8/auth/session/login"):
        status, data = _chat_api_post(path, payload)
        session = _extract_chat_session(data)
        if status == 200 and session:
            return session, status, data
    return None, status, data


def _try_create(payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    last_status = 0
    last_data: dict[str, Any] = {}
    for path in ("/auth/account/create", "/0.8/auth/account/create"):
        status, data = _chat_api_post(path, payload)
        last_status = status
        last_data = data
        if status in {200, 204, 409}:
            return status, data
    return last_status, last_data


def _ensure_chat_session(user: User) -> tuple[dict[str, Any] | None, str | None]:
    email = user.email.strip().lower()
    password = _chat_password_for_user(user)

    login_payload = {
        "email": email,
        "password": password,
        "friendly_name": settings.chat_sso_device_name,
    }
    session, _login_status, _login_data = _try_login(login_payload)
    if session:
        onboarding_error = _ensure_chat_onboarding(user, session)
        if onboarding_error:
            return None, onboarding_error
        membership_error = _ensure_official_server_membership(session)
        if membership_error:
            return None, membership_error
        return session, None

    create_payload = {
        "email": email,
        "password": password,
        "friendly_name": settings.chat_sso_device_name,
        "captcha": "",
        "invite": "",
    }
    create_status, _create_data = _try_create(create_payload)
    if create_status not in {200, 204, 409}:
        return None, "Unable to create chat account automatically."

    session, _login_status, _login_data = _try_login(login_payload)
    if session:
        onboarding_error = _ensure_chat_onboarding(user, session)
        if onboarding_error:
            return None, onboarding_error
        membership_error = _ensure_official_server_membership(session)
        if membership_error:
            return None, membership_error
        return session, None

    return None, "Unable to sign in to chat automatically."


def _make_bootstrap_cookie(user_id: UUID, chat_session: dict[str, Any]) -> str:
    return sign_payload(
        {
            "kind": "chat_sso_bootstrap",
            "uid": str(user_id),
            "chat": chat_session,
            "nonce": secrets.token_urlsafe(12),
            "exp": int(time.time()) + settings.chat_sso_cookie_ttl_seconds,
        }
    )


def _make_chat_admin_bridge_cookie(user_id: UUID, chat_user_id: str) -> str:
    return sign_payload(
        {
            "kind": "chat_admin_bridge",
            "uid": str(user_id),
            "chat_uid": chat_user_id,
            "nonce": secrets.token_urlsafe(12),
            "exp": int(time.time()) + _CHAT_ADMIN_BRIDGE_COOKIE_MAX_AGE_SECONDS,
        }
    )


def _get_chat_admin_bridge_identity(
    request: Request, db: Session
) -> tuple[User | None, str | None]:
    token = request.cookies.get(_CHAT_ADMIN_BRIDGE_COOKIE_NAME)
    payload = verify_token(token)
    if not payload or payload.get("kind") != "chat_admin_bridge":
        return None, None

    raw_uid = str(payload.get("uid") or "").strip()
    chat_uid = str(payload.get("chat_uid") or "").strip()
    if not raw_uid or not chat_uid:
        return None, None

    try:
        user_id = UUID(raw_uid)
    except Exception:
        return None, None

    user = db.get(User, user_id)
    if not user or not is_admin_role(user.role):
        return None, None
    return user, chat_uid


def _build_auth_state(chat_session: dict[str, Any]) -> dict[str, Any]:
    user_id = str(chat_session.get("user_id") or chat_session.get("userId") or "").strip()
    token = str(chat_session.get("token") or "").strip()
    session_id = str(chat_session.get("_id") or "").strip()

    # for-web expects the auth store to contain exactly one session object.
    # Keep this minimal shape to avoid login crashes across client revisions.
    return {
        "session": {
            "_id": session_id,
            "token": token,
            "userId": user_id,
            "valid": True,
        }
    }


def _bootstrap_html(auth_state: dict[str, Any], fallback_login_url: str) -> str:
    auth_json = json.dumps(auth_state, separators=(",", ":"))
    fallback_json = json.dumps(fallback_login_url)
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Signing in to chat...</title>
    <meta http-equiv="Cache-Control" content="no-store, max-age=0" />
  </head>
  <body style="font-family: system-ui, sans-serif; margin: 2rem;">
    <p>Signing you in to chat...</p>
    <script>
      (function () {{
        "use strict";
        const AUTH_STATE = {auth_json};
        const FALLBACK = {fallback_json};
        const DB_NAME = "localforage";
        const STORE_NAME = "keyvaluepairs";
        const IDB_KEYS = ["auth", "localforage/auth"];
        const STORAGE_KEYS = ["auth", "localforage/auth"];

        function putIndexedDB(value) {{
          return new Promise(function (resolve, reject) {{
            if (!window.indexedDB) {{
              reject(new Error("indexeddb_unavailable"));
              return;
            }}

            const openReq = window.indexedDB.open(DB_NAME);
            openReq.onupgradeneeded = function () {{
              const db = openReq.result;
              if (!db.objectStoreNames.contains(STORE_NAME)) {{
                db.createObjectStore(STORE_NAME);
              }}
            }};
            openReq.onerror = function () {{
              reject(openReq.error || new Error("indexeddb_open_failed"));
            }};
            openReq.onsuccess = function () {{
              const db = openReq.result;
              let tx;
              try {{
                tx = db.transaction(STORE_NAME, "readwrite");
              }} catch (err) {{
                db.close();
                reject(err);
                return;
              }}

              const store = tx.objectStore(STORE_NAME);
              let failed = false;
              function putFailed(event) {{
                if (failed) return;
                failed = true;
                db.close();
                const target = event && event.target ? event.target : null;
                reject((target && target.error) || new Error("indexeddb_put_failed"));
              }}
              for (const key of IDB_KEYS) {{
                const putReq = store.put(value, key);
                putReq.onerror = putFailed;
              }}
              tx.onabort = function () {{
                db.close();
                reject(tx.error || new Error("indexeddb_tx_aborted"));
              }};
              tx.onerror = function () {{
                db.close();
                reject(tx.error || new Error("indexeddb_tx_failed"));
              }};
              tx.oncomplete = function () {{
                db.close();
                resolve();
              }};
            }};
          }});
        }}

        function writeFallbackStorage(value) {{
          const serial = JSON.stringify(value);
          for (const key of STORAGE_KEYS) {{
            window.localStorage.setItem(key, serial);
          }}
          try {{
            for (const key of STORAGE_KEYS) {{
              window.sessionStorage.setItem(key, serial);
            }}
          }} catch (_ignored) {{}}
        }}

        async function clearServiceWorkerAndCaches() {{
          try {{
            if ("serviceWorker" in navigator) {{
              const regs = await navigator.serviceWorker.getRegistrations();
              for (const reg of regs) {{
                try {{
                  await reg.unregister();
                }} catch (_ignored) {{}}
              }}
            }}
          }} catch (_ignored) {{}}

          try {{
            if ("caches" in window) {{
              const keys = await caches.keys();
              await Promise.all(
                keys.map(function (key) {{
                  try {{
                    return caches.delete(key);
                  }} catch (_ignored) {{
                    return Promise.resolve(false);
                  }}
                }})
              );
            }}
          }} catch (_ignored) {{}}
        }}

        async function bootstrap() {{
          await clearServiceWorkerAndCaches();
          try {{
            await putIndexedDB(AUTH_STATE);
          }} catch (err) {{
            try {{
              writeFallbackStorage(AUTH_STATE);
            }} catch (_ignored) {{
              window.location.replace(FALLBACK);
              return;
            }}
          }}

          try {{
            writeFallbackStorage(AUTH_STATE);
          }} catch (_ignored) {{}}
          window.location.replace("/");
        }}

        bootstrap();
      }})();
    </script>
  </body>
</html>
"""


@router.get("/api/chat/sso/start")
def chat_sso_start(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(db, request)
    if not user:
        return RedirectResponse(url=_build_login_redirect(request), status_code=307)

    target_base = settings.chat_public_url or settings.chat_login_url
    if not target_base:
        return JSONResponse(
            status_code=503,
            content={"error": "Chat is not configured. Set CHAT_PUBLIC_URL or CHAT_LOGIN_URL."},
        )

    chat_session, error = _ensure_chat_session(user)
    if not chat_session:
        return JSONResponse(
            status_code=502,
            content={
                "error": error or "Chat SSO bridge failed.",
            },
        )

    signed = _make_bootstrap_cookie(user.id, chat_session)
    bootstrap_url = f"{target_base.rstrip('/')}{_CHAT_BOOTSTRAP_PATH}"
    response = RedirectResponse(url=bootstrap_url, status_code=302)
    _set_chat_sso_cookie(response, signed, secure=cookie_secure_for_request(request))
    if is_admin_role(user.role):
        chat_user_id = str(chat_session.get("user_id") or "").strip()
        if chat_user_id:
            bridge = _make_chat_admin_bridge_cookie(user.id, chat_user_id)
            _set_chat_admin_bridge_cookie(
                response, bridge, secure=cookie_secure_for_request(request)
            )
        else:
            _clear_chat_admin_bridge_cookie(response)
    else:
        _clear_chat_admin_bridge_cookie(response)
    return response


@router.post("/servers/create")
@router.post("/servers/create/")
@router.post("/0.8/servers/create")
@router.post("/0.8/servers/create/")
@router.post("/api/servers/create")
@router.post("/api/servers/create/")
@router.post("/api/0.8/servers/create")
@router.post("/api/0.8/servers/create/")
async def chat_proxy_create_server(request: Request, db: Session = Depends(get_db)) -> JSONResponse:
    session_token = (request.headers.get("x-session-token") or "").strip()
    if not session_token:
        return JSONResponse(status_code=401, content={"error": "Missing chat session token"})

    _admin, expected_chat_uid = _get_chat_admin_bridge_identity(request, db)
    if not expected_chat_uid:
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    me_status, me_payload = await run_in_threadpool(
        _chat_api_request,
        "GET",
        "/users/@me",
        None,
        session_token,
        10,
    )
    if me_status != 200:
        return JSONResponse(status_code=401, content={"error": "Invalid chat session token"})
    actual_chat_uid = str(me_payload.get("_id") or "").strip()
    if not actual_chat_uid or actual_chat_uid != expected_chat_uid:
        return JSONResponse(status_code=403, content={"error": "Admin identity mismatch"})

    payload: dict[str, Any] = {}
    try:
        incoming = await request.json()
        if not isinstance(incoming, dict):
            return JSONResponse(status_code=400, content={"error": "Invalid request"})
        payload = incoming
    except Exception:
        payload = {}

    upstream_path = request.url.path
    if upstream_path.startswith("/api/"):
        upstream_path = upstream_path[4:]
    if upstream_path.endswith("/"):
        upstream_path = upstream_path[:-1]

    status, resp_payload = await run_in_threadpool(
        _chat_api_request,
        "POST",
        upstream_path,
        payload,
        session_token,
        30,
    )
    if not status:
        return JSONResponse(status_code=502, content={"error": "Upstream unavailable"})
    return JSONResponse(status_code=status, content=resp_payload)


@router.post("/servers/{server_id}/channels")
@router.post("/servers/{server_id}/channels/")
@router.post("/0.8/servers/{server_id}/channels")
@router.post("/0.8/servers/{server_id}/channels/")
@router.post("/api/servers/{server_id}/channels")
@router.post("/api/servers/{server_id}/channels/")
@router.post("/api/0.8/servers/{server_id}/channels")
@router.post("/api/0.8/servers/{server_id}/channels/")
async def chat_proxy_create_server_channel(server_id: str, request: Request) -> JSONResponse:
    _ = server_id

    try:
        incoming = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid request"})

    if not isinstance(incoming, dict):
        return JSONResponse(status_code=400, content={"error": "Invalid request"})

    payload = _normalize_channel_create_payload(incoming)
    upstream_path = request.url.path
    if upstream_path.startswith("/api/"):
        upstream_path = upstream_path[4:]

    status, resp_payload = await run_in_threadpool(
        _chat_api_request,
        "POST",
        upstream_path,
        payload,
        (request.headers.get("x-session-token") or "").strip() or None,
        30,
    )
    if not status:
        return JSONResponse(status_code=502, content={"error": "Upstream unavailable"})
    return JSONResponse(status_code=status, content=_normalize_legacy_voice_channels(resp_payload))


@router.post("/channels/{channel_id}/join_call")
@router.post("/channels/{channel_id}/join_call/")
@router.post("/0.8/channels/{channel_id}/join_call")
@router.post("/0.8/channels/{channel_id}/join_call/")
@router.post("/api/channels/{channel_id}/join_call")
@router.post("/api/channels/{channel_id}/join_call/")
@router.post("/api/0.8/channels/{channel_id}/join_call")
@router.post("/api/0.8/channels/{channel_id}/join_call/")
async def chat_proxy_join_call(channel_id: str, request: Request) -> JSONResponse:
    _ = channel_id

    payload: dict[str, Any]
    try:
        incoming = await request.json()
        payload = incoming if isinstance(incoming, dict) else {}
    except Exception:
        payload = {}
    # Single-node normalization: some clients send "worldwide" (or omit node),
    # but this deployment only has the "main" LiveKit node configured.
    payload["node"] = "main"

    upstream_path = request.url.path
    if upstream_path.startswith("/api/"):
        upstream_path = upstream_path[4:]

    status, resp_payload = await run_in_threadpool(
        _chat_api_request,
        "POST",
        upstream_path,
        payload,
        (request.headers.get("x-session-token") or "").strip() or None,
        30,
    )
    if not status:
        return JSONResponse(
            status_code=502,
            content={
                "error": "Upstream unavailable",
                "upstream_detail": resp_payload.get("detail"),
            },
        )
    return JSONResponse(status_code=status, content=resp_payload)


@router.websocket("/ws")
async def chat_proxy_events_ws(request_ws: WebSocket) -> None:
    upstream_url = settings.chat_events_internal_url.strip()
    if not upstream_url:
        await request_ws.close(code=1011, reason="events_unconfigured")
        return

    if request_ws.url.query:
        separator = "&" if "?" in upstream_url else "?"
        upstream_url = f"{upstream_url}{separator}{request_ws.url.query}"

    requested_protocols = (request_ws.headers.get("sec-websocket-protocol") or "").strip()
    subprotocols = [item.strip() for item in requested_protocols.split(",") if item.strip()]

    try:
        async with websockets.connect(
            upstream_url,
            subprotocols=subprotocols or None,
            max_size=None,
            open_timeout=10,
            ping_interval=20,
            ping_timeout=20,
        ) as upstream_ws:
            await request_ws.accept(subprotocol=upstream_ws.subprotocol)

            async def client_to_upstream() -> None:
                while True:
                    try:
                        message = await request_ws.receive()
                    except WebSocketDisconnect:
                        break
                    msg_type = message.get("type")
                    if msg_type == "websocket.disconnect":
                        break
                    text = message.get("text")
                    if text is not None:
                        await upstream_ws.send(text)
                        continue
                    binary = message.get("bytes")
                    if binary is not None:
                        await upstream_ws.send(binary)

            async def upstream_to_client() -> None:
                async for message in upstream_ws:
                    if isinstance(message, str):
                        await request_ws.send_text(_normalize_ws_payload(message))
                    else:
                        await request_ws.send_bytes(message)

            tasks = [
                asyncio.create_task(client_to_upstream()),
                asyncio.create_task(upstream_to_client()),
            ]
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
            for task in pending:
                with contextlib.suppress(asyncio.CancelledError):
                    await task
            for task in done:
                exc = task.exception()
                if exc and not isinstance(exc, WebSocketDisconnect):
                    raise exc
    except Exception:
        if request_ws.client_state == WebSocketState.CONNECTED:
            with contextlib.suppress(Exception):
                await request_ws.close(code=1011)


@router.post("/livekit-twirp/{tail:path}")
@router.post("/livekit-twirp")
async def livekit_twirp_proxy(request: Request, tail: str = "") -> Response:
    # Stoat 20250930-2 constructs a malformed Twirp path segment such as
    # "/%2Ftwirp%2Flivekit.RoomService%2FCreateRoom". Decode and normalize it.
    raw_tail = tail.strip()
    decoded_tail = unquote(raw_tail)
    if decoded_tail.startswith("/"):
        decoded_tail = decoded_tail[1:]
    if not decoded_tail:
        # Fallback to raw ASGI path when route tail is empty.
        raw_path = request.scope.get("raw_path", b"")
        if isinstance(raw_path, (bytes, bytearray)):
            path_str = raw_path.decode("utf-8", errors="ignore")
            marker = "/livekit-twirp/"
            if marker in path_str:
                decoded_tail = unquote(path_str.split(marker, 1)[1].lstrip("/"))

    if not decoded_tail:
        return Response(status_code=400, content=b"invalid_twirp_path")

    upstream_url = f"http://stoat-livekit:7880/{decoded_tail}"
    body = await request.body()
    content_type = (request.headers.get("content-type") or "application/protobuf").strip()
    auth = (request.headers.get("authorization") or "").strip()

    headers = {
        "Content-Type": content_type,
        "Accept": request.headers.get("accept") or "*/*",
        "User-Agent": "bwondercomics-livekit-twirp-proxy/1.0",
    }
    if auth:
        headers["Authorization"] = auth

    req = urllib.request.Request(
        url=upstream_url,
        data=body,
        method="POST",
        headers=headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp_body = resp.read() or b""
            resp_type = resp.headers.get("content-type") or "application/octet-stream"
            return Response(content=resp_body, status_code=resp.status, media_type=resp_type)
    except urllib.error.HTTPError as exc:
        resp_body = exc.read() or b""
        resp_type = exc.headers.get("content-type") if exc.headers else None
        return Response(
            content=resp_body,
            status_code=exc.code,
            media_type=resp_type or "application/octet-stream",
        )
    except Exception:
        return Response(status_code=502, content=b"livekit_unavailable")


@router.get("/sso/bootstrap")
def chat_sso_bootstrap(request: Request, db: Session = Depends(get_db)):
    fallback = _chat_login_fallback_url()
    token = request.cookies.get(settings.chat_sso_cookie_name)
    payload = verify_token(token)
    if not payload or payload.get("kind") != "chat_sso_bootstrap":
        response = RedirectResponse(url=fallback, status_code=302)
        _clear_chat_sso_cookie(response)
        return response

    raw_uid = str(payload.get("uid") or "").strip()
    chat_session = payload.get("chat")
    if not raw_uid or not isinstance(chat_session, dict):
        response = RedirectResponse(url=fallback, status_code=302)
        _clear_chat_sso_cookie(response)
        return response
    if not str(chat_session.get("token") or "").strip():
        response = RedirectResponse(url=fallback, status_code=302)
        _clear_chat_sso_cookie(response)
        return response
    if not str(chat_session.get("user_id") or "").strip():
        response = RedirectResponse(url=fallback, status_code=302)
        _clear_chat_sso_cookie(response)
        return response
    if not str(chat_session.get("_id") or "").strip():
        response = RedirectResponse(url=fallback, status_code=302)
        _clear_chat_sso_cookie(response)
        return response

    try:
        user_id = UUID(raw_uid)
    except Exception:
        response = RedirectResponse(url=fallback, status_code=302)
        _clear_chat_sso_cookie(response)
        return response

    if not db.get(User, user_id):
        response = RedirectResponse(url=fallback, status_code=302)
        _clear_chat_sso_cookie(response)
        return response

    auth_state = _build_auth_state(chat_session)
    response = HTMLResponse(
        content=_bootstrap_html(auth_state, fallback),
        status_code=200,
        headers={"Cache-Control": "no-store"},
    )
    _clear_chat_sso_cookie(response)
    _set_chat_ready_cookie(response, request)
    return response
