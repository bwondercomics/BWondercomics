from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-site-branding-tests.db")

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

from backend.app.db import Base
from backend.app.models import MediaItem, PageConfig
from backend.app.site_branding import (
    DEFAULT_FAVICON_PATH,
    DEFAULT_OG_IMAGE_PATH,
    ICON_BLOCK_END,
    ICON_BLOCK_START,
    SOCIAL_BLOCK_END,
    SOCIAL_BLOCK_START,
    apply_html_branding,
    apply_manifest_branding,
    build_absolute_asset_url,
    get_site_branding,
)


def build_request(path: str = "/") -> Request:
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [
            (b"host", b"bwondercomics.com"),
            (b"x-forwarded-host", b"bwondercomics.com"),
            (b"x-forwarded-proto", b"https"),
        ],
        "client": ("127.0.0.1", 1234),
        "server": ("127.0.0.1", 8000),
    }
    return Request(scope)


class SiteBrandingTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_dir = Path(self.temp_dir.name)
        (self.base_dir / "media").mkdir(parents=True, exist_ok=True)
        (self.base_dir / "assets").mkdir(parents=True, exist_ok=True)
        (self.base_dir / "media" / "hero.png").write_bytes(b"hero")
        (self.base_dir / "media" / "icon.png").write_bytes(b"icon")
        (self.base_dir / "assets" / "banner1.png").write_bytes(b"default-og")
        (self.base_dir / "assets" / "boywondericon.png").write_bytes(b"default-icon")

        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(
            self.engine,
            tables=[MediaItem.__table__, PageConfig.__table__],
        )
        self.db = Session(self.engine)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        self.temp_dir.cleanup()

    def test_build_absolute_asset_url_uses_forwarded_headers(self):
        request = build_request("/")
        absolute_url = build_absolute_asset_url(request, "media/hero.png")
        self.assertEqual(absolute_url, "https://bwondercomics.com/media/hero.png")

    def test_get_site_branding_uses_custom_public_media_paths(self):
        self.db.add(
            MediaItem(
                id="hero",
                path="media/hero.png",
                tags=[],
                public=True,
                access="public",
                premium_visibility="blur",
            )
        )
        self.db.add(
            MediaItem(
                id="icon",
                path="media/icon.png",
                tags=[],
                public=True,
                access="public",
                premium_visibility="blur",
            )
        )
        self.db.add(
            PageConfig(
                series_id="battle-bros",
                content={
                    "site": {
                        "ogImagePath": "media/hero.png",
                        "faviconPath": "media/icon.png",
                    }
                },
            )
        )
        self.db.commit()

        branding = get_site_branding(self.db, base_dir=self.base_dir)
        self.assertEqual(branding["ogImagePath"], "media/hero.png")
        self.assertEqual(branding["faviconPath"], "media/icon.png")
        self.assertEqual(branding["customFaviconPath"], "media/icon.png")

    def test_get_site_branding_falls_back_when_config_missing_or_invalid(self):
        branding = get_site_branding(self.db, base_dir=self.base_dir)
        self.assertEqual(branding["ogImagePath"], DEFAULT_OG_IMAGE_PATH)
        self.assertEqual(branding["faviconPath"], DEFAULT_FAVICON_PATH)

        self.db.add(
            MediaItem(
                id="hero",
                path="media/hero.png",
                tags=[],
                public=False,
                access="private",
                premium_visibility="blur",
            )
        )
        self.db.add(
            PageConfig(
                series_id="battle-bros",
                content={
                    "site": {
                        "ogImagePath": "media/hero.png",
                        "faviconPath": "protected/media/icon.png",
                    }
                },
            )
        )
        self.db.commit()

        branding = get_site_branding(self.db, base_dir=self.base_dir)
        self.assertEqual(branding["ogImagePath"], DEFAULT_OG_IMAGE_PATH)
        self.assertEqual(branding["faviconPath"], DEFAULT_FAVICON_PATH)
        self.assertIsNone(branding["customOgImagePath"])

    def test_apply_html_branding_replaces_icon_and_social_blocks(self):
        template = "\n".join(
            [
                "<head>",
                ICON_BLOCK_START,
                "  <link rel=\"icon\" href=\"/assets/old.png\" />",
                ICON_BLOCK_END,
                SOCIAL_BLOCK_START,
                "  <meta property=\"og:image\" content=\"https://old.example/old.png\" />",
                SOCIAL_BLOCK_END,
                "</head>",
            ]
        )

        branded = apply_html_branding(
            template,
            build_request("/"),
            favicon_path="media/icon.png",
            og_image_path="media/hero.png",
        )
        self.assertIn('href="/media/icon.png"', branded)
        self.assertIn(
            'content="https://bwondercomics.com/media/hero.png"',
            branded,
        )

        no_social = apply_html_branding(
            template,
            build_request("/feed.html"),
            favicon_path="media/icon.png",
        )
        self.assertIn('href="/media/icon.png"', no_social)
        self.assertIn(
            'content="https://old.example/old.png"',
            no_social,
        )

    def test_apply_manifest_branding_overrides_manifest_icons(self):
        content = json.dumps(
            {
                "name": "Battle Bros",
                "icons": [
                    {
                        "src": "assets/panel.png",
                        "sizes": "any",
                        "type": "image/png",
                    }
                ],
            }
        )

        branded = apply_manifest_branding(content, "media/icon.png")
        payload = json.loads(branded)
        self.assertEqual(payload["icons"][0]["src"], "/media/icon.png")
        self.assertEqual(payload["icons"][0]["type"], "image/png")


if __name__ == "__main__":
    unittest.main()
