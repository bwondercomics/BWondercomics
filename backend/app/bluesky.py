from __future__ import annotations

import http.client
import json
import mimetypes
from dataclasses import dataclass
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Post, SocialAccount
from .settings import settings

DEFAULT_PDS_URL = "https://bsky.social"


class BlueskyError(Exception):
    pass


def _parse_pds_url(raw: str | None) -> tuple[str, str, int, str]:
    value = (raw or "").strip().rstrip("/")
    if not value:
        value = DEFAULT_PDS_URL
    parsed = urlparse(value)
    scheme = (parsed.scheme or "https").lower()
    host = parsed.hostname or "bsky.social"
    port = parsed.port or (443 if scheme == "https" else 80)
    prefix = (parsed.path or "").rstrip("/")
    return scheme, host, port, prefix


def _http_json(
    method: str,
    pds_url: str,
    path: str,
    *,
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
) -> tuple[int, dict[str, Any]]:
    scheme, host, port, prefix = _parse_pds_url(pds_url)
    target = (prefix + path) if prefix else path
    conn_cls = http.client.HTTPSConnection if scheme == "https" else http.client.HTTPConnection
    conn = conn_cls(host, port, timeout=20)
    try:
        conn.request(method, target, body=body, headers=headers or {})
        resp = conn.getresponse()
        status = resp.status
        raw = resp.read()
    except Exception as exc:
        raise BlueskyError(f"Bluesky request failed: {exc}") from exc
    finally:
        try:
            conn.close()
        except Exception:
            pass

    if not raw:
        return status, {}
    try:
        return status, json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise BlueskyError("Invalid JSON response from Bluesky") from exc


def _strip_html(raw: str) -> str:
    text = unescape(raw or "")
    out: list[str] = []
    in_tag = False
    for ch in text:
        if ch == "<":
            in_tag = True
            continue
        if ch == ">":
            in_tag = False
            continue
        if not in_tag:
            out.append(ch)
    return " ".join("".join(out).split())


def _resolve_image_path(image: str | None) -> Path | None:
    value = (image or "").strip()
    if not value:
        return None
    if value.startswith("http://") or value.startswith("https://"):
        return None
    rel = value.lstrip("/")
    candidate = (settings.base_dir / rel).resolve()
    if candidate.exists() and candidate.is_file():
        return candidate
    return None


def _guess_mime(path: Path) -> str:
    mime, _ = mimetypes.guess_type(str(path))
    return mime or "application/octet-stream"


@dataclass
class BlueskyPost:
    text: str
    image_path: Path | None = None
    image_alt: str | None = None

    @classmethod
    def from_post(cls, post: Post) -> "BlueskyPost":
        title = (post.title or "").strip()
        content = _strip_html(post.content or "")
        parts = [p for p in (title, content) if p]
        text = "\n\n".join(parts).strip()
        if len(text) > 300:
            text = text[:297].rstrip() + "..."
        if not text:
            raise BlueskyError("Bluesky post text is empty")
        image_path = _resolve_image_path(post.image)
        return cls(text=text, image_path=image_path, image_alt=title or "Post image")

    def publish(self, db: Session) -> None:
        client = BlueskyClient.from_db(db)
        client.create_post(db, self)


class BlueskyClient:
    def __init__(self, account: SocialAccount):
        self.account = account
        self.pds_url = account.pds_url or DEFAULT_PDS_URL

    @classmethod
    def from_db(cls, db: Session) -> "BlueskyClient":
        account = db.scalar(select(SocialAccount).where(SocialAccount.provider == "bluesky"))
        if not account or not account.access_token or not account.refresh_token:
            raise BlueskyError("Bluesky account is not connected")
        return cls(account)

    @staticmethod
    def create_session(handle: str, app_password: str) -> dict[str, Any]:
        payload = json.dumps({"identifier": handle, "password": app_password}).encode("utf-8")
        status, data = _http_json(
            "POST",
            DEFAULT_PDS_URL,
            "/xrpc/com.atproto.server.createSession",
            headers={"Content-Type": "application/json"},
            body=payload,
        )
        if status != 200:
            raise BlueskyError(
                data.get("message") or data.get("error") or "Failed to connect to Bluesky"
            )
        return data

    def _refresh(self, db: Session) -> None:
        status, data = _http_json(
            "POST",
            self.pds_url,
            "/xrpc/com.atproto.server.refreshSession",
            headers={"Authorization": f"Bearer {self.account.refresh_token}"},
        )
        if status != 200:
            raise BlueskyError(
                data.get("message") or data.get("error") or "Failed to refresh Bluesky session"
            )

        self.account.access_token = data.get("accessJwt") or self.account.access_token
        self.account.refresh_token = data.get("refreshJwt") or self.account.refresh_token
        self.account.handle = data.get("handle") or self.account.handle
        self.account.did = data.get("did") or self.account.did
        self.account.updated_at = datetime.now(timezone.utc)
        db.add(self.account)
        db.commit()
        self.pds_url = self.account.pds_url or self.pds_url

    def _request(
        self,
        db: Session,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        body: Any | None = None,
    ) -> dict[str, Any]:
        query = f"?{urlencode(params)}" if params else ""
        payload = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.account.access_token}",
        }
        if payload is not None:
            headers["Content-Type"] = "application/json"

        status, data = _http_json(
            method, self.pds_url, f"{path}{query}", headers=headers, body=payload
        )
        if status == 401 and self.account.refresh_token:
            self._refresh(db)
            headers["Authorization"] = f"Bearer {self.account.access_token}"
            status, data = _http_json(
                method, self.pds_url, f"{path}{query}", headers=headers, body=payload
            )

        if status >= 400:
            raise BlueskyError(
                data.get("message") or data.get("error") or f"Bluesky error ({status})"
            )
        return data

    def get_profile(self, db: Session) -> dict[str, Any]:
        actor = self.account.handle or self.account.did
        if not actor:
            raise BlueskyError("Bluesky handle not available")
        return self._request(db, "GET", "/xrpc/app.bsky.actor.getProfile", params={"actor": actor})

    def list_notifications(self, db: Session, limit: int = 60) -> dict[str, Any]:
        return self._request(
            db,
            "GET",
            "/xrpc/app.bsky.notification.listNotifications",
            params={"limit": str(max(1, min(limit, 60)))},
        )

    def upload_blob(self, db: Session, path: Path) -> dict[str, Any]:
        mime = _guess_mime(path)
        data = path.read_bytes()
        headers = {"Content-Type": mime, "Authorization": f"Bearer {self.account.access_token}"}
        status, payload = _http_json(
            "POST",
            self.pds_url,
            "/xrpc/com.atproto.repo.uploadBlob",
            headers=headers,
            body=data,
        )
        if status == 401 and self.account.refresh_token:
            self._refresh(db)
            headers["Authorization"] = f"Bearer {self.account.access_token}"
            status, payload = _http_json(
                "POST",
                self.pds_url,
                "/xrpc/com.atproto.repo.uploadBlob",
                headers=headers,
                body=data,
            )
        if status >= 400:
            raise BlueskyError(
                payload.get("message") or payload.get("error") or f"Upload failed ({status})"
            )
        return payload.get("blob") or payload

    def create_post(self, db: Session, payload: BlueskyPost) -> None:
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        record: dict[str, Any] = {
            "$type": "app.bsky.feed.post",
            "text": payload.text,
            "createdAt": now,
        }
        if payload.image_path and db is not None:
            blob = self.upload_blob(db, payload.image_path)
            record["embed"] = {
                "$type": "app.bsky.embed.images",
                "images": [
                    {
                        "alt": payload.image_alt or "",
                        "image": blob,
                    }
                ],
            }

        body = {
            "repo": self.account.did,
            "collection": "app.bsky.feed.post",
            "record": record,
        }
        if not self.account.did:
            raise BlueskyError("Bluesky DID not available")
        self._request(db, "POST", "/xrpc/com.atproto.repo.createRecord", body=body)
