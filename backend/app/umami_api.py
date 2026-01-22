from __future__ import annotations

import http.client
import json
from typing import Any, Tuple
from urllib.parse import urlencode, urlparse

from .settings import settings


class UmamiAPIError(Exception):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def _parse_upstream() -> Tuple[str, str, int, str]:
    upstream_raw = (settings.umami_upstream or "").strip().rstrip("/")
    if not upstream_raw:
        raise UmamiAPIError("Umami upstream not configured", status=502)

    upstream = urlparse(upstream_raw)
    scheme = (upstream.scheme or "http").lower()
    host = upstream.hostname or "127.0.0.1"
    port = upstream.port or (443 if scheme == "https" else 80)
    prefix = (upstream.path or "").rstrip("/")
    return scheme, host, port, prefix


def _http_request(
    method: str, path: str, headers: dict[str, str] | None = None, body: bytes | None = None
):
    scheme, host, port, prefix = _parse_upstream()
    target = (prefix + path) if prefix else path
    conn_cls = http.client.HTTPSConnection if scheme == "https" else http.client.HTTPConnection

    conn = conn_cls(host, port, timeout=20)
    try:
        conn.request(method, target, body=body, headers=headers or {})
        resp = conn.getresponse()
        status = resp.status
        resp_headers = dict(resp.getheaders())
        resp_body = resp.read()
    except UmamiAPIError:
        raise
    except Exception as exc:
        raise UmamiAPIError(f"Umami request failed: {exc}", status=502) from exc
    finally:
        try:
            conn.close()
        except Exception:
            pass

    return status, resp_headers, resp_body


def _parse_json(body: bytes) -> dict[str, Any]:
    try:
        return json.loads(body.decode("utf-8"))
    except Exception as exc:
        raise UmamiAPIError("Invalid JSON response from Umami", status=502) from exc


def _coerce_int(value: Any) -> int | None:
    if isinstance(value, dict):
        if "value" in value:
            value = value.get("value")
        elif "count" in value:
            value = value.get("count")
    try:
        return int(value)
    except Exception:
        return None


def _extract_error_message(body: bytes) -> str:
    try:
        data = json.loads(body.decode("utf-8"))
    except Exception:
        return ""
    if isinstance(data, dict):
        return str(data.get("message") or data.get("error") or "")
    return ""


def _fetch_stats_once(
    website_id: str, start_ms: int, end_ms: int, token: str
) -> dict[str, int | None]:
    query = urlencode({"startAt": int(start_ms), "endAt": int(end_ms)})
    status, _headers, body = _http_request(
        "GET",
        f"/api/websites/{website_id}/stats?{query}",
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )

    if status != 200:
        detail = _extract_error_message(body)
        message = f"Umami stats request failed (status {status})"
        if detail:
            message = f"{message}: {detail}"
        raise UmamiAPIError(message, status=status)

    data = _parse_json(body)
    return {
        "pageviews": _coerce_int(data.get("pageviews")),
        "visitors": _coerce_int(data.get("visitors")),
        "sessions": _coerce_int(data.get("sessions")),
        "bounces": _coerce_int(data.get("bounces")),
        "totaltime": _coerce_int(data.get("totaltime")),
    }


def _login_for_token() -> str:
    username = (settings.umami_api_username or "").strip()
    password = (settings.umami_api_password or "").strip()
    if not username or not password:
        raise UmamiAPIError(
            "Set UMAMI_API_USERNAME and UMAMI_API_PASSWORD (or UMAMI_API_TOKEN) to fetch Umami analytics.",
            status=503,
        )

    payload = json.dumps({"username": username, "password": password}).encode("utf-8")
    status, _headers, body = _http_request(
        "POST",
        "/api/auth/login",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        body=payload,
    )

    if status != 200:
        detail = _extract_error_message(body)
        message = f"Umami login failed (status {status})"
        if detail:
            message = f"{message}: {detail}"
        raise UmamiAPIError(message, status=status)

    data = _parse_json(body)
    token = data.get("token")
    if not token:
        raise UmamiAPIError("Umami login did not return a token", status=502)
    return str(token)


def fetch_umami_stats(ranges_ms: dict[str, tuple[int, int]]) -> dict[str, dict[str, int | None]]:
    website_id = (settings.umami_website_id or "").strip()
    if not website_id:
        raise UmamiAPIError("UMAMI_WEBSITE_ID is not configured", status=503)

    token = (settings.umami_api_token or "").strip()
    allow_login = bool(settings.umami_api_username and settings.umami_api_password)
    if not token and not allow_login:
        raise UmamiAPIError(
            "Umami API credentials are not configured. Set UMAMI_API_TOKEN or UMAMI_API_USERNAME and UMAMI_API_PASSWORD.",
            status=503,
        )

    stats: dict[str, dict[str, int | None]] = {}
    current_token = token or _login_for_token()

    for key, (start_ms, end_ms) in ranges_ms.items():
        try:
            stats[key] = _fetch_stats_once(website_id, start_ms, end_ms, current_token)
        except UmamiAPIError as exc:
            if exc.status == 401 and allow_login:
                current_token = _login_for_token()
                stats[key] = _fetch_stats_once(website_id, start_ms, end_ms, current_token)
            else:
                raise

    return stats


def _fetch_metrics_once(
    website_id: str, start_ms: int, end_ms: int, metric_type: str, token: str, limit: int = 10
) -> list[dict]:
    query = urlencode(
        {
            "startAt": int(start_ms),
            "endAt": int(end_ms),
            "type": metric_type,
            "limit": limit,
        }
    )
    status, _headers, body = _http_request(
        "GET",
        f"/api/websites/{website_id}/metrics?{query}",
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )

    if status != 200:
        detail = _extract_error_message(body)
        message = f"Umami metrics request failed (status {status})"
        if detail:
            message = f"{message}: {detail}"
        raise UmamiAPIError(message, status=status)

    data = _parse_json(body)
    if not isinstance(data, list):
        return []

    return data


def fetch_umami_metrics(
    start_ms: int, end_ms: int, metric_type: str = "referrer", limit: int = 10
) -> list[dict]:
    website_id = (settings.umami_website_id or "").strip()
    if not website_id:
        raise UmamiAPIError("UMAMI_WEBSITE_ID is not configured", status=503)

    token = (settings.umami_api_token or "").strip()
    allow_login = bool(settings.umami_api_username and settings.umami_api_password)
    if not token and not allow_login:
        raise UmamiAPIError(
            "Umami API credentials are not configured. Set UMAMI_API_TOKEN or UMAMI_API_USERNAME and UMAMI_API_PASSWORD.",
            status=503,
        )

    current_token = token or _login_for_token()

    try:
        return _fetch_metrics_once(website_id, start_ms, end_ms, metric_type, current_token, limit)
    except UmamiAPIError as exc:
        if exc.status == 401 and allow_login:
            current_token = _login_for_token()
            return _fetch_metrics_once(
                website_id, start_ms, end_ms, metric_type, current_token, limit
            )
        else:
            raise
