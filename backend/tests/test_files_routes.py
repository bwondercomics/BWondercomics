from __future__ import annotations

import os
from pathlib import Path

from fastapi.responses import FileResponse

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-route-tests.db")

from backend.app.routes import files

from backend.tests.helpers import BackendRouteTestCase, build_request, json_body


class FilesRouteTests(BackendRouteTestCase):
    def test_page_config_and_media_index_match_the_shared_contract_fixtures(self):
        self.seed_page_config()
        self.seed_media_items()

        page_config_response = files.public_page_config(self.db)
        media_response = files.legacy_media_index(self.db)

        self.assertEqual(json_body(page_config_response), self.contracts["pageConfig"])
        self.assertEqual(json_body(media_response), self.contracts["mediaItems"])

    def test_protected_media_and_entry_assets_enforce_entitlement(self):
        self.seed_media_items()
        self.seed_contract_series()
        premium_user = self.create_user(kind="premium", role="premium")

        premium_media_path = self.base_dir / "protected" / "media" / "gallery" / "teaser.png"
        premium_media_path.parent.mkdir(parents=True, exist_ok=True)
        premium_media_path.write_bytes(b"premium-media")

        premium_entry_path = (
            self.base_dir / "protected" / "comics" / "battle-bros" / "issue-11" / "01.png"
        )
        premium_entry_path.parent.mkdir(parents=True, exist_ok=True)
        premium_entry_path.write_bytes(b"premium-entry")

        guest_request = build_request("/api/protected/media/gallery/teaser.png")
        guest_response = files.protected_assets("media/gallery/teaser.png", guest_request, self.db)
        self.assertEqual(guest_response.status_code, 403)
        self.assertEqual(json_body(guest_response)["error"], "Premium media")

        premium_request = build_request(
            "/api/protected/media/gallery/teaser.png",
            cookie=self.auth_cookie(premium_user),
        )
        premium_response = files.protected_assets(
            "media/gallery/teaser.png",
            premium_request,
            self.db,
        )
        self.assertIsInstance(premium_response, FileResponse)
        self.assertEqual(Path(premium_response.path), premium_media_path)

        guest_entry_request = build_request("/api/protected/comics/battle-bros/issue-11/01.png")
        guest_entry_response = files.protected_assets(
            "comics/battle-bros/issue-11/01.png",
            guest_entry_request,
            self.db,
        )
        self.assertEqual(guest_entry_response.status_code, 403)
        self.assertEqual(json_body(guest_entry_response)["error"], "Premium content")

        premium_entry_request = build_request(
            "/api/protected/comics/battle-bros/issue-11/01.png",
            cookie=self.auth_cookie(premium_user),
        )
        premium_entry_response = files.protected_assets(
            "comics/battle-bros/issue-11/01.png",
            premium_entry_request,
            self.db,
        )
        self.assertIsInstance(premium_entry_response, FileResponse)
        self.assertEqual(Path(premium_entry_response.path), premium_entry_path)

    def test_save_file_validates_admin_access_and_persists_virtual_page_config(self):
        admin = self.create_user(kind="admin", role="admin")
        unauthorized_request = build_request("/api/save", method="POST")
        unauthorized_response = files.save_file(
            files.SaveRequest(filename="admin/page-config.json", content={"site": {}}),
            unauthorized_request,
            self.db,
        )
        self.assertEqual(unauthorized_response.status_code, 403)

        admin_request = build_request(
            "/api/save",
            method="POST",
            cookie=self.auth_cookie(admin),
        )
        invalid_response = files.save_file(
            files.SaveRequest(filename="../secrets.json", content={"bad": True}),
            admin_request,
            self.db,
        )
        self.assertEqual(invalid_response.status_code, 403)
        self.assertEqual(json_body(invalid_response)["error"], "Invalid filename")

        next_config = {"site": {"ogImagePath": "media/site/new-og.png"}}
        save_response = files.save_file(
            files.SaveRequest(filename="admin/page-config.json", content=next_config),
            admin_request,
            self.db,
        )
        self.assertEqual(save_response["status"], "success")
        self.assertEqual(json_body(files.public_page_config(self.db)), next_config)


if __name__ == "__main__":
    import unittest

    unittest.main()
