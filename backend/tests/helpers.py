from __future__ import annotations

import json
import os
import tempfile
import unittest
from contextlib import ExitStack
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import UUID, uuid4

from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-route-tests.db")

from backend.app.db import Base, get_db
from backend.app.models import (
    BuilderModule,
    BuilderPage,
    BuilderSection,
    CommentLimit,
    Comment,
    EmailSubscriber,
    Entry,
    EntryLabel,
    EntryPage,
    MediaItem,
    PageConfig,
    Post,
    PremiumCode,
    Series,
    User,
    VisitorSession,
)
from backend.app.security import hash_password, issue_session_token
from backend.app.settings import settings as app_settings


FIXTURE_PATH = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "contract-fixtures.json"

SETTINGS_PATCH_TARGETS = (
    "backend.app.file_ops.settings",
    "backend.app.security.settings",
    "backend.app.routes.auth.settings",
    "backend.app.routes.files.settings",
    "backend.app.routes.user.settings",
)


def load_contract_fixtures() -> dict:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def parse_iso_z(raw: str | None) -> datetime | None:
    if not raw:
        return None
    return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))


def build_request(
    path: str = "/",
    method: str = "GET",
    headers: list[tuple[bytes, bytes]] | None = None,
    cookie: str | None = None,
    client: tuple[str, int] = ("127.0.0.1", 1234),
) -> Request:
    header_list = list(headers or [])
    if cookie:
        header_list.append((b"cookie", cookie.encode("utf-8")))
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("utf-8"),
        "query_string": b"",
        "headers": header_list,
        "client": client,
        "server": ("127.0.0.1", 8000),
    }
    return Request(scope)


def json_body(response) -> dict:
    return json.loads(response.body.decode("utf-8"))


class BackendRouteTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_dir = Path(self.temp_dir.name)
        self.contracts = load_contract_fixtures()

        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.db.execute(
            text(
                "CREATE TABLE IF NOT EXISTS personal_feed_items ("
                "id TEXT PRIMARY KEY, user_id TEXT)"
            )
        )
        self.db.execute(
            text(
                "CREATE TABLE IF NOT EXISTS visitor_events ("
                "id TEXT PRIMARY KEY, user_id TEXT)"
            )
        )
        self.db.commit()

        self.patches = ExitStack()
        self.test_settings = replace(
            app_settings,
            base_dir=self.base_dir,
            app_secret="test-app-secret",
            cookie_secure=False,
            registration_mode="open",
            invite_code="",
        )
        for target in SETTINGS_PATCH_TARGETS:
            self.patches.enter_context(patch(target, self.test_settings))

    def tearDown(self):
        self.patches.close()
        self.db.close()
        self.engine.dispose()
        self.temp_dir.cleanup()

    def create_client(self, *routers):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        app = FastAPI()
        for router in routers:
            app.include_router(router)

        def override_get_db():
            yield self.db

        app.dependency_overrides[get_db] = override_get_db
        client = TestClient(app)
        self.addCleanup(client.close)
        self.addCleanup(app.dependency_overrides.clear)
        return client

    def create_user(
        self,
        kind: str = "user",
        *,
        role: str | None = None,
        email: str | None = None,
        display_name: str | None = None,
        password: str = "password123",
        banned_at: datetime | None = None,
        email_opt_in: bool = False,
    ) -> User:
        template = self.contracts["session"].get(kind, {}).get("user") or {}
        user = User(
            id=UUID(str(template.get("id") or "ffffffff-ffff-4fff-8fff-ffffffffff99")),
            email=email or template.get("email") or f"{kind}@example.com",
            display_name=display_name or template.get("displayName") or kind.title(),
            password_hash=hash_password(password),
            role=role or template.get("role") or "user",
            banned_at=banned_at,
            email_opt_in=email_opt_in,
            email_opt_in_at=parse_iso_z(template.get("createdAt")) if email_opt_in else None,
            created_at=parse_iso_z(template.get("createdAt")) or datetime.now(timezone.utc),
        )
        self.db.add(user)
        self.db.commit()
        return user

    def auth_cookie(self, user: User) -> str:
        token = issue_session_token(user.id)
        return f"{self.test_settings.session_cookie_name}={token}"

    def seed_contract_series(self, *, series_id: str = "battle-bros") -> dict:
        series_contract = next(
            (item for item in self.contracts["seriesIndex"]["series"] if item["id"] == series_id),
            self.contracts["seriesIndex"]["series"][0],
        )
        series_data = self.contracts["seriesData"]

        series = Series(
            id=series_id,
            title=series_contract["title"],
            description=series_contract["description"],
            cover_image=series_contract.get("coverImage"),
            premium_only=bool(series_contract.get("premiumOnly")),
            status_message=series_data["statusMessage"],
            unit_label_singular=series_data["unitLabelSingular"],
            unit_label_plural=series_data["unitLabelPlural"],
            active=True,
            created_at=parse_iso_z(series_data["lastUpdated"]) or datetime.now(timezone.utc),
            updated_at=parse_iso_z(series_data["lastUpdated"]) or datetime.now(timezone.utc),
        )
        self.db.add(series)

        label_payload = series_data["entryLabels"][0]
        label = EntryLabel(
            id=UUID(label_payload["id"]),
            series_id=series_id,
            slug=label_payload["slug"],
            singular=label_payload["singular"],
            plural=label_payload["plural"],
            sort_index=int(label_payload["sortIndex"]),
            is_default=bool(label_payload["isDefault"]),
            created_at=parse_iso_z(series_data["lastUpdated"]) or datetime.now(timezone.utc),
            updated_at=parse_iso_z(series_data["lastUpdated"]) or datetime.now(timezone.utc),
        )
        self.db.add(label)

        seeded_entries: dict[str, Entry] = {}
        for sort_index, title in enumerate(series_data["entries"].keys()):
            meta = series_data["entryMeta"][title]
            entry = Entry(
                id=UUID(meta["entryId"]),
                series_id=series_id,
                title=title,
                display_number=meta.get("displayNumber"),
                entry_label_id=UUID(meta["entryLabelId"]),
                folder_path=series_data["entryFolders"].get(title, ""),
                premium_only=bool(meta.get("premium")),
                show_in_dropdown=bool(meta.get("showInDropdown", True)),
                show_in_gallery=bool(meta.get("showInGallery", True)),
                release_type=meta.get("releaseType", "digital"),
                store_url=meta.get("storeUrl") or None,
                cover_image=meta.get("coverImage") or None,
                cover_thumb_path=meta.get("coverThumbPath") or None,
                status=meta.get("status", "published"),
                publish_at=parse_iso_z(series_data["lastUpdated"]) or datetime.now(timezone.utc),
                sort_index=sort_index,
                created_at=parse_iso_z(series_data["lastUpdated"]) or datetime.now(timezone.utc),
                updated_at=parse_iso_z(series_data["lastUpdated"]) or datetime.now(timezone.utc),
            )
            self.db.add(entry)
            seeded_entries[title] = entry

            for page_index, path in enumerate(series_data["entries"][title]):
                self.db.add(
                    EntryPage(
                        entry_id=entry.id,
                        sort_index=page_index,
                        path=path,
                        created_at=parse_iso_z(series_data["lastUpdated"]) or datetime.now(timezone.utc),
                        updated_at=parse_iso_z(series_data["lastUpdated"]) or datetime.now(timezone.utc),
                    )
                )

        self.db.commit()
        return {"series": series, "label": label, "entries": seeded_entries}

    def seed_page_config(self, *, series_id: str = "battle-bros") -> PageConfig:
        record = PageConfig(
            series_id=series_id,
            content=self.contracts["pageConfig"],
            created_at=parse_iso_z(self.contracts["seriesData"]["lastUpdated"]) or datetime.now(timezone.utc),
            updated_at=parse_iso_z(self.contracts["seriesData"]["lastUpdated"]) or datetime.now(timezone.utc),
        )
        self.db.add(record)
        self.db.commit()
        return record

    def seed_builder_page(self, fixture_key: str = "builderPage") -> dict:
        payload = self.contracts[fixture_key]
        series_id = payload.get("seriesId") or "battle-bros"
        if not self.db.get(Series, series_id):
            self.seed_contract_series(series_id=series_id)

        now = parse_iso_z(self.contracts["seriesData"]["lastUpdated"]) or datetime.now(timezone.utc)
        page = BuilderPage(
            id=UUID(payload["id"]),
            series_id=series_id,
            slug=payload["slug"],
            title=payload["title"],
            page_type=payload.get("pageType", "custom"),
            is_published=bool(payload.get("isPublished")),
            is_homepage=bool(payload.get("isHomepage")),
            sort_index=int(payload.get("sortIndex", 0)),
            meta=payload.get("meta") or {},
            created_at=now,
            updated_at=now,
        )
        self.db.add(page)

        sections: list[BuilderSection] = []
        modules: list[BuilderModule] = []
        for section_payload in payload.get("sections") or []:
            section = BuilderSection(
                id=UUID(section_payload["id"]),
                page_id=page.id,
                section_type=section_payload.get("sectionType", "row"),
                layout=section_payload.get("layout", "1"),
                sort_index=int(section_payload.get("sortIndex", 0)),
                settings=section_payload.get("settings") or {},
                created_at=now,
            )
            self.db.add(section)
            sections.append(section)

            for module_payload in section_payload.get("modules") or []:
                module = BuilderModule(
                    id=UUID(module_payload["id"]),
                    section_id=section.id,
                    module_type=module_payload["moduleType"],
                    column_index=int(module_payload.get("columnIndex", 0)),
                    sort_index=int(module_payload.get("sortIndex", 0)),
                    config=module_payload.get("config") or {},
                    created_at=now,
                    updated_at=now,
                )
                self.db.add(module)
                modules.append(module)

        self.db.commit()
        return {"page": page, "sections": sections, "modules": modules}

    def seed_media_items(self) -> list[MediaItem]:
        items: list[MediaItem] = []
        now = parse_iso_z(self.contracts["seriesData"]["lastUpdated"]) or datetime.now(timezone.utc)
        for payload in self.contracts["mediaItems"]:
            item = MediaItem(
                id=payload["id"],
                path=payload["path"],
                tags=list(payload.get("tags") or []),
                public=bool(payload.get("public")),
                access=payload["access"],
                premium_visibility=payload["premiumVisibility"],
                thumb_path=payload.get("thumbPath") or None,
                preview_path=payload.get("previewPath") or None,
                created_at=now,
                updated_at=now,
            )
            self.db.add(item)
            items.append(item)
        self.db.commit()
        return items

    def seed_posts(self) -> dict[str, Post]:
        now = datetime.now(timezone.utc)
        seeded: dict[str, Post] = {}
        for key, payload in self.contracts["posts"].items():
            post = Post(
                id=UUID(payload["id"]),
                title=payload["title"],
                content=payload["content"],
                image=payload["image"],
                media_id=None,
                image_tags=list(payload.get("imageTags") or []),
                image_fit=payload.get("imageFit", "cover"),
                image_focus=payload.get("imageFocus", "center"),
                share=bool(payload.get("share")),
                share_bluesky=bool(payload.get("shareBluesky")),
                status=payload["status"],
                publish_at=parse_iso_z(payload["date"]) or now,
                created_at=now,
                updated_at=now,
            )
            self.db.add(post)
            seeded[key] = post
        self.db.commit()
        return seeded

    def seed_user_comments(self, user: User, comments: list[dict] | None = None) -> list[Comment]:
        payloads = comments or self.contracts["userFixtures"]["comments"]
        seeded: list[Comment] = []
        for payload in payloads:
            comment = Comment(
                id=uuid4(),
                target_id=payload["targetId"],
                user_id=user.id,
                display_name=user.display_name,
                message=payload["message"],
                hidden=bool(payload.get("hidden")),
                created_at=parse_iso_z(payload.get("createdAt")) or datetime.now(timezone.utc),
                ip_address="198.51.100.25",
            )
            self.db.add(comment)
            seeded.append(comment)
        self.db.commit()
        return seeded

    def seed_premium_code(self, *, code: str | None = None, active: bool = True) -> PremiumCode:
        payload = self.contracts["userFixtures"]["premiumCode"]
        now = parse_iso_z(self.contracts["seriesData"]["lastUpdated"]) or datetime.now(timezone.utc)
        record = PremiumCode(
            code=code or payload["code"],
            note=payload.get("note"),
            active=active,
            created_at=now,
        )
        self.db.add(record)
        self.db.commit()
        return record

    def list_visitor_sessions(self) -> list[VisitorSession]:
        return self.db.scalars(select(VisitorSession).order_by(VisitorSession.visitor_id.asc())).all()

    def seed_comment_limits(self, **overrides) -> CommentLimit:
        limits = CommentLimit(
            min_interval_seconds=overrides.get("min_interval_seconds", 0),
            rate_window_seconds=overrides.get("rate_window_seconds", 60),
            max_per_window_user=overrides.get("max_per_window_user", 10),
            max_per_window_ip=overrides.get("max_per_window_ip", 25),
            duplicate_window_seconds=overrides.get("duplicate_window_seconds", 30),
        )
        self.db.add(limits)
        self.db.commit()
        return limits

    def list_email_subscribers(self) -> list[EmailSubscriber]:
        return self.db.scalars(select(EmailSubscriber).order_by(EmailSubscriber.email.asc())).all()
