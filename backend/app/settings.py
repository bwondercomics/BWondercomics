from __future__ import annotations

import os
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


def load_settings() -> Settings:
    base_dir = Path(__file__).resolve().parents[2]
    host = os.environ.get("HOST", "")
    try:
        port = int(os.environ.get("PORT", "8000"))
    except ValueError:
        port = 8000

    app_secret = os.environ.get("APP_SECRET") or os.environ.get("REMARK_SECRET") or "change-me"
    session_cookie_name = "bb_session"
    session_ttl_seconds = 60 * 60 * 24 * 7

    registration_mode = (os.environ.get("REGISTRATION_MODE") or "open").strip().lower()
    invite_code = (os.environ.get("INVITE_CODE") or "").strip()
    cookie_secure = _env_bool("COOKIE_SECURE", default=False)
    admin_commands_enabled = _env_bool("ADMIN_COMMANDS_ENABLED", default=False)

    database_url = (os.environ.get("DATABASE_URL") or "").strip()
    if not database_url:
        db_user = (os.environ.get("BWC_DB_USER") or "bwondercomics").strip()
        db_password = (os.environ.get("BWC_DB_PASSWORD") or "").strip()
        db_name = (os.environ.get("BWC_DB_NAME") or "bwondercomics").strip()
        db_host = (os.environ.get("BWC_DB_HOST") or "127.0.0.1").strip()
        try:
            db_port = int(os.environ.get("BWC_DB_PORT") or "5433")
        except ValueError:
            db_port = 5433
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
    try:
        umami_port = int(os.environ.get("UMAMI_PORT") or "3000")
    except ValueError:
        umami_port = 3000
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
    )


settings = load_settings()
