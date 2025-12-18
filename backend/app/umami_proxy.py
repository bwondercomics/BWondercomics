from __future__ import annotations

import http.client
import re
from typing import Iterable
from urllib.parse import urlparse

from .settings import settings


def _normalize_proxy_path(path: str) -> str:
    value = (path or "").strip()
    if value and not value.startswith("/"):
        value = "/" + value
    return value.rstrip("/")


def _strip_prefix(text: str, prefix: str) -> str:
    if prefix and text.startswith(prefix):
        rest = text[len(prefix) :] or "/"
        return rest if rest.startswith("/") else "/" + rest
    return text


def _rewrite_umami_response_body(body: bytes, content_type: str, prefix_path: str) -> bytes:
    if not prefix_path or not body or not content_type:
        return body

    ct = content_type.split(";", 1)[0].strip().lower()
    if ct not in (
        "text/html",
        "application/javascript",
        "text/css",
        "application/json",
        "text/plain",
    ):
        return body

    try:
        text = body.decode("utf-8")
    except Exception:
        return body

    for q in ('"', "'", "`"):
        text = text.replace(f"{q}/api/", f"{q}{prefix_path}/api/")
        text = text.replace(f"{q}/_next/", f"{q}{prefix_path}/_next/")
        text = text.replace(f"{q}/script.js", f"{q}{prefix_path}/script.js")

    prefix_re = re.escape(prefix_path.lstrip("/"))

    if ct != "text/html":
        # Umami's Next.js app uses absolute paths for client-side routes like "/websites".
        # Prefix quoted absolute paths so navigation stays within the proxy path.
        #
        # NOTE: Avoid rewriting HTML self-closing tags like `..."/>` by requiring a
        # path segment start after the slash.
        text = re.sub(
            rf'(["\'`])/(?!/)(?!{prefix_re}(?:/|$))(?=[A-Za-z0-9_])',
            rf"\1{prefix_path}/",
            text,
        )

        if ct == "text/css":
            # Handle CSS url(/...) references (with or without quotes).
            text = re.sub(
                rf'(?i)\burl\((["\']?)/(?!/)(?!{prefix_re}(?:/|$))(?=[A-Za-z0-9_])',
                rf"url(\1{prefix_path}/",
                text,
            )

    if ct == "text/html":
        text = re.sub(
            rf'\b(href|src|action)=(["\'])/(?!/)(?!{prefix_re}(?:/|$))',
            rf"\1=\2{prefix_path}/",
            text,
        )
    return text.encode("utf-8")


def proxy_to_umami(
    method: str,
    incoming_path: str,
    incoming_query: str,
    incoming_headers: Iterable[tuple[str, str]],
    client_ip: str,
    body: bytes | None,
) -> tuple[int, str, list[tuple[str, str]], bytes]:
    """
    Minimal Umami reverse proxy that keeps Umami scoped under UMAMI_PROXY_PATH
    and rewrites paths so it can be embedded at /umami inside the admin panel.
    """

    prefix_path = _normalize_proxy_path(settings.umami_proxy_path)
    upstream_raw = (settings.umami_upstream or "").strip().rstrip("/")
    if not upstream_raw:
        return 502, "Bad Gateway", [("Content-Type", "text/plain; charset=utf-8")], b"Umami upstream not configured.\n"

    upstream = urlparse(upstream_raw)
    scheme = (upstream.scheme or "http").lower()
    host = upstream.hostname or "127.0.0.1"
    port = upstream.port or (443 if scheme == "https" else 80)
    upstream_prefix = (upstream.path or "").rstrip("/")

    request_path = _strip_prefix(incoming_path or "/", prefix_path) if prefix_path else (incoming_path or "/")
    request_target = request_path + (incoming_query or "")
    target = (upstream_prefix + request_target) if upstream_prefix else request_target

    hop_by_hop = {
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
    }

    forward_headers: dict[str, str] = {}
    host_header = ""
    forwarded_proto = "http"
    for name, value in incoming_headers:
        lname = name.lower()
        if lname == "host":
            host_header = value
            continue
        if lname in hop_by_hop:
            continue
        if lname == "x-forwarded-proto" and value:
            forwarded_proto = value.split(",")[0].strip().lower()
        if lname == "accept-encoding":
            continue
        forward_headers[name] = value

    # Disable upstream compression so we can safely rewrite HTML/JS paths.
    forward_headers["Accept-Encoding"] = "identity"

    forward_headers["X-Forwarded-Host"] = host_header
    existing_xff = forward_headers.get("X-Forwarded-For", "")
    forward_headers["X-Forwarded-For"] = (existing_xff + ", " + client_ip).strip(", ") if existing_xff else client_ip
    forward_headers["X-Forwarded-Proto"] = forwarded_proto if forwarded_proto in ("http", "https") else "http"

    if prefix_path:
        forward_headers["X-Forwarded-Prefix"] = prefix_path
        forward_headers["X-Forwarded-Uri"] = (incoming_path or "/") + (incoming_query or "")

    conn_cls = http.client.HTTPSConnection if scheme == "https" else http.client.HTTPConnection
    try:
        conn = conn_cls(host, port, timeout=30)
        conn.request(method, target, body=body, headers=forward_headers)
        resp = conn.getresponse()
        resp_body = resp.read()
        resp_status = resp.status
        resp_reason = resp.reason
        resp_headers = resp.getheaders()
    except Exception as exc:
        return (
            502,
            "Bad Gateway",
            [("Content-Type", "text/plain; charset=utf-8")],
            f"Umami proxy error: {exc}\n".encode("utf-8"),
        )
    finally:
        try:
            conn.close()
        except Exception:
            pass

    out_headers: list[tuple[str, str]] = []
    content_type = ""
    sent_xfo = False

    for name, value in resp_headers:
        lname = name.lower()
        if lname in hop_by_hop or lname == "content-length":
            continue
        if lname == "content-type":
            content_type = value or ""

        if lname == "x-frame-options":
            out_headers.append(("X-Frame-Options", "SAMEORIGIN"))
            sent_xfo = True
            continue

        if lname == "content-security-policy":
            csp = value or ""
            if "frame-ancestors" in csp:
                csp = re.sub(r"frame-ancestors[^;]*", "frame-ancestors 'self'", csp)
            else:
                csp = (csp.rstrip("; ") + "; frame-ancestors 'self'").lstrip("; ")
            out_headers.append((name, csp))
            continue

        if lname == "location":
            try:
                loc = urlparse(value)
                loc_path = loc.path or ""
                loc_query = ("?" + loc.query) if loc.query else ""
                loc_frag = ("#" + loc.fragment) if loc.fragment else ""

                if loc.scheme and loc.netloc and loc.hostname == host and (loc.port or (443 if loc.scheme == "https" else 80)) == port:
                    value = loc_path + loc_query + loc_frag

                if prefix_path and value.startswith("/"):
                    if upstream_prefix and loc_path and (loc_path == upstream_prefix or loc_path.startswith(upstream_prefix + "/")):
                        loc_path = loc_path[len(upstream_prefix) :] or "/"
                        value = loc_path + loc_query + loc_frag
                    if not (loc_path == prefix_path or loc_path.startswith(prefix_path + "/")):
                        loc_path = prefix_path + loc_path
                        value = loc_path + loc_query + loc_frag
            except Exception:
                pass
            out_headers.append((name, value))
            continue

        if lname == "set-cookie" and prefix_path and isinstance(value, str):
            value = re.sub(r"(?i)(^|;\\s*)path=/($|;)", r"\\1Path=" + prefix_path + r"\\2", value)
            out_headers.append((name, value))
            continue

        out_headers.append((name, value))

    if not sent_xfo:
        out_headers.append(("X-Frame-Options", "SAMEORIGIN"))

    resp_body = _rewrite_umami_response_body(resp_body, content_type, prefix_path)
    out_headers.append(("Content-Length", "0" if method.upper() == "HEAD" else str(len(resp_body))))

    if method.upper() == "HEAD":
        resp_body = b""

    return resp_status, resp_reason or "", out_headers, resp_body
