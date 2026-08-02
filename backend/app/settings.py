from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "y", "on"}


def _in_docker() -> bool:
    try:
        return Path("/.dockerenv").exists()
    except Exception:
        return False


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(str(raw).strip())
    except ValueError:
        return default


def _split_csv(raw: str | None) -> tuple[str, ...]:
    if not raw:
        return tuple()
    parts = [item.strip() for item in re.split(r"[\s,]+", str(raw).strip())]
    return tuple(item for item in parts if item)


@dataclass(frozen=True)
class Settings:
    base_dir: Path
    host: str
    port: int
    app_secret: str
    session_cookie_name: str
    session_ttl_seconds: int
    registration_mode: str
    invite_code: str
    cookie_secure: bool
    admin_commands_enabled: bool
    ops_allowed_ips: tuple[str, ...]
    host_automation_token: str
    backup_diagnostics_mode: str
    database_url: str
    umami_website_id: str
    umami_base_url: str
    umami_proxy_path: str
    umami_upstream: str
    umami_port: int
    umami_api_token: str
    umami_api_username: str
    umami_api_password: str
    umami_database_url: str
    oidc_issuer: str
    oidc_signing_key_pem: str
    oidc_signing_kid: str
    oidc_auth_code_ttl_seconds: int
    oidc_id_token_ttl_seconds: int
    oidc_access_token_ttl_seconds: int
    oidc_client_stoat_id: str
    oidc_client_stoat_secret: str
    oidc_client_stoat_redirect_uris: tuple[str, ...]
    oidc_client_stoat_scopes: tuple[str, ...]
    oidc_login_path: str
    chat_public_url: str
    chat_login_url: str
    chat_api_internal_url: str
    chat_events_internal_url: str
    chat_sso_cookie_name: str
    chat_sso_cookie_ttl_seconds: int
    chat_sso_device_name: str
    chat_sso_password_secret: str
    chat_official_invite_code: str


def load_settings() -> Settings:
    base_dir = Path(__file__).resolve().parents[2]
    host = os.environ.get("HOST", "")
    port = _env_int("PORT", 8000)

    app_secret = os.environ.get("APP_SECRET") or os.environ.get("REMARK_SECRET") or "change-me"
    session_cookie_name = "bb_session"
    session_ttl_seconds = 60 * 60 * 24 * 7

    registration_mode = (os.environ.get("REGISTRATION_MODE") or "open").strip().lower()
    invite_code = (os.environ.get("INVITE_CODE") or "").strip()
    cookie_secure = _env_bool("COOKIE_SECURE", default=False)
    admin_commands_enabled = _env_bool("ADMIN_COMMANDS_ENABLED", default=False)
    ops_allowed_ips = _split_csv(os.environ.get("OPS_ALLOWED_IPS"))
    host_automation_token = (os.environ.get("HOST_AUTOMATION_TOKEN") or "").strip()
    backup_diagnostics_mode = (
        (os.environ.get("BWC_BACKUP_DIAGNOSTICS_MODE") or "local").strip().lower()
    )
    if backup_diagnostics_mode not in {"production", "local"}:
        raise ValueError("BWC_BACKUP_DIAGNOSTICS_MODE must be either 'production' or 'local'")

    database_url = (os.environ.get("DATABASE_URL") or "").strip()
    if not database_url:
        db_user = (os.environ.get("BWC_DB_USER") or "bwondercomics").strip()
        db_password = (os.environ.get("BWC_DB_PASSWORD") or "").strip()
        db_name = (os.environ.get("BWC_DB_NAME") or "bwondercomics").strip()
        db_host = (os.environ.get("BWC_DB_HOST") or "127.0.0.1").strip()
        db_port = _env_int("BWC_DB_PORT", 5433)
        if db_password:
            database_url = (
                f"postgresql+psycopg://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
            )

    umami_website_id = (os.environ.get("UMAMI_WEBSITE_ID") or "").strip()
    umami_base_url = (os.environ.get("UMAMI_BASE_URL") or "").strip()
    umami_proxy_path = (os.environ.get("UMAMI_PROXY_PATH") or "/umami").strip()
    if umami_proxy_path and not umami_proxy_path.startswith("/"):
        umami_proxy_path = "/" + umami_proxy_path
    umami_proxy_path = (umami_proxy_path or "").rstrip("/")
    default_umami_upstream = "http://umami:3000" if _in_docker() else "http://127.0.0.1:3000"
    umami_upstream = (
        (os.environ.get("UMAMI_UPSTREAM") or default_umami_upstream).strip().rstrip("/")
    )
    umami_port = _env_int("UMAMI_PORT", 3000)
    umami_api_token = (os.environ.get("UMAMI_API_TOKEN") or "").strip()
    umami_api_username = (os.environ.get("UMAMI_API_USERNAME") or "").strip()
    umami_api_password = (os.environ.get("UMAMI_API_PASSWORD") or "").strip()

    # Umami database connection for direct queries
    umami_database_url = (os.environ.get("UMAMI_DATABASE_URL") or "").strip()
    if not umami_database_url:
        umami_db_user = (os.environ.get("UMAMI_DB_USER") or "umami").strip()
        umami_db_password = (os.environ.get("UMAMI_DB_PASSWORD") or "").strip()
        umami_db_name = (os.environ.get("UMAMI_DB_NAME") or "umami").strip()
        umami_db_host = "umami-db" if _in_docker() else "127.0.0.1"
        umami_db_host = (os.environ.get("UMAMI_DB_HOST") or umami_db_host).strip()
        umami_db_port = (os.environ.get("UMAMI_DB_PORT") or "5432").strip()
        if umami_db_password:
            umami_database_url = f"postgresql+psycopg://{umami_db_user}:{umami_db_password}@{umami_db_host}:{umami_db_port}/{umami_db_name}"

    oidc_issuer = (os.environ.get("OIDC_ISSUER") or "").strip().rstrip("/")
    oidc_signing_key_pem = (os.environ.get("OIDC_SIGNING_KEY_PEM") or "").strip()
    # Allow PEM to be supplied via escaped newlines in .env
    if "\\n" in oidc_signing_key_pem:
        oidc_signing_key_pem = oidc_signing_key_pem.replace("\\n", "\n")
    oidc_signing_kid = (os.environ.get("OIDC_SIGNING_KID") or "main").strip() or "main"
    oidc_auth_code_ttl_seconds = max(60, _env_int("OIDC_AUTH_CODE_TTL_SECONDS", 300))
    oidc_id_token_ttl_seconds = max(60, _env_int("OIDC_ID_TOKEN_TTL_SECONDS", 600))
    oidc_access_token_ttl_seconds = max(60, _env_int("OIDC_ACCESS_TOKEN_TTL_SECONDS", 600))
    oidc_client_stoat_id = (os.environ.get("OIDC_CLIENT_STOAT_ID") or "").strip()
    oidc_client_stoat_secret = (os.environ.get("OIDC_CLIENT_STOAT_SECRET") or "").strip()
    oidc_client_stoat_redirect_uris = _split_csv(os.environ.get("OIDC_CLIENT_STOAT_REDIRECT_URIS"))
    oidc_client_stoat_scopes = _split_csv(
        os.environ.get("OIDC_CLIENT_STOAT_SCOPES") or "openid,profile,email"
    )
    oidc_login_path = (
        os.environ.get("OIDC_LOGIN_PATH") or "/?openComments=1"
    ).strip() or "/?openComments=1"

    chat_public_url = (os.environ.get("CHAT_PUBLIC_URL") or "").strip().rstrip("/")
    chat_login_url = (os.environ.get("CHAT_LOGIN_URL") or chat_public_url).strip()
    stoat_api_internal_port = _env_int("STOAT_API_INTERNAL_PORT", 14702)
    stoat_events_internal_port = _env_int("STOAT_EVENTS_INTERNAL_PORT", 14703)
    chat_api_internal_url = (
        (os.environ.get("CHAT_API_INTERNAL_URL") or f"http://stoat-api:{stoat_api_internal_port}")
        .strip()
        .rstrip("/")
    )
    chat_events_internal_url = (
        os.environ.get("CHAT_EVENTS_INTERNAL_URL")
        or f"ws://stoat-events:{stoat_events_internal_port}/ws"
    ).strip()
    chat_sso_cookie_name = (os.environ.get("CHAT_SSO_COOKIE_NAME") or "bb_chat_sso").strip()
    chat_sso_cookie_ttl_seconds = max(30, _env_int("CHAT_SSO_COOKIE_TTL_SECONDS", 120))
    chat_sso_device_name = (os.environ.get("CHAT_SSO_DEVICE_NAME") or "BWonderComics SSO").strip()
    if not chat_sso_device_name:
        chat_sso_device_name = "BWonderComics SSO"
    chat_sso_password_secret = (
        os.environ.get("CHAT_SSO_PASSWORD_SECRET") or app_secret or "change-me"
    ).strip()
    chat_official_invite_code = (os.environ.get("CHAT_OFFICIAL_INVITE_CODE") or "").strip()

    return Settings(
        base_dir=base_dir,
        host=host,
        port=port,
        app_secret=app_secret,
        session_cookie_name=session_cookie_name,
        session_ttl_seconds=session_ttl_seconds,
        registration_mode=registration_mode,
        invite_code=invite_code,
        cookie_secure=cookie_secure,
        admin_commands_enabled=admin_commands_enabled,
        ops_allowed_ips=ops_allowed_ips,
        host_automation_token=host_automation_token,
        backup_diagnostics_mode=backup_diagnostics_mode,
        database_url=database_url,
        umami_website_id=umami_website_id,
        umami_base_url=umami_base_url,
        umami_proxy_path=umami_proxy_path,
        umami_upstream=umami_upstream,
        umami_port=umami_port,
        umami_api_token=umami_api_token,
        umami_api_username=umami_api_username,
        umami_api_password=umami_api_password,
        umami_database_url=umami_database_url,
        oidc_issuer=oidc_issuer,
        oidc_signing_key_pem=oidc_signing_key_pem,
        oidc_signing_kid=oidc_signing_kid,
        oidc_auth_code_ttl_seconds=oidc_auth_code_ttl_seconds,
        oidc_id_token_ttl_seconds=oidc_id_token_ttl_seconds,
        oidc_access_token_ttl_seconds=oidc_access_token_ttl_seconds,
        oidc_client_stoat_id=oidc_client_stoat_id,
        oidc_client_stoat_secret=oidc_client_stoat_secret,
        oidc_client_stoat_redirect_uris=oidc_client_stoat_redirect_uris,
        oidc_client_stoat_scopes=oidc_client_stoat_scopes,
        oidc_login_path=oidc_login_path,
        chat_public_url=chat_public_url,
        chat_login_url=chat_login_url,
        chat_api_internal_url=chat_api_internal_url,
        chat_events_internal_url=chat_events_internal_url,
        chat_sso_cookie_name=chat_sso_cookie_name,
        chat_sso_cookie_ttl_seconds=chat_sso_cookie_ttl_seconds,
        chat_sso_device_name=chat_sso_device_name,
        chat_sso_password_secret=chat_sso_password_secret,
        chat_official_invite_code=chat_official_invite_code,
    )


settings = load_settings()
