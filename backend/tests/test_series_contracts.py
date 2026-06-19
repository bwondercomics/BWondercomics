from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-route-tests.db")

from sqlalchemy import select

from backend.app.models import Entry, EntryPage, Series
from backend.app.routes import series_json
from backend.app.series_store import apply_series_data_save, series_data_payload

from backend.tests.helpers import BackendRouteTestCase, build_request, json_body, parse_iso_z


class SeriesContractTests(BackendRouteTestCase):
    def admin_request(self, path: str):
        admin = self.create_user("admin")
        return build_request(path, cookie=self.auth_cookie(admin))

    def test_public_series_index_matches_the_shared_contract(self):
        self.seed_contract_series()
        stealth = self.contracts["seriesIndex"]["series"][1]
        self.db.add(
            Series(
                id=stealth["id"],
                title=stealth["title"],
                description=stealth["description"],
                cover_image=stealth.get("coverImage"),
                premium_only=bool(stealth.get("premiumOnly")),
                status_message="",
                unit_label_singular=stealth["unitLabelSingular"],
                unit_label_plural=stealth["unitLabelPlural"],
                active=True,
                created_at=parse_iso_z(self.contracts["seriesData"]["lastUpdated"])
                + timedelta(seconds=1)
                if parse_iso_z(self.contracts["seriesData"]["lastUpdated"])
                else datetime.now(timezone.utc),
                updated_at=parse_iso_z(self.contracts["seriesData"]["lastUpdated"])
                + timedelta(seconds=1)
                if parse_iso_z(self.contracts["seriesData"]["lastUpdated"])
                else datetime.now(timezone.utc),
            )
        )
        self.db.commit()

        response = series_json.public_series_index(self.db)

        self.assertEqual(json_body(response), self.contracts["seriesIndex"])

    def test_public_and_admin_series_data_match_the_seeded_contract(self):
        self.seed_contract_series()

        public_response = series_json.public_default_series_data(self.db)
        admin_response = series_json.admin_series_data_api(
            "battle-bros",
            self.admin_request("/api/admin/series/battle-bros/data"),
            self.db,
        )

        self.assertEqual(json_body(public_response), self.contracts["seriesData"])
        admin_payload = json_body(admin_response)
        self.assertEqual(admin_payload["entries"], self.contracts["seriesData"]["entries"])
        for meta in admin_payload["entryMeta"].values():
            self.assertEqual(meta["status"], "published")
            self.assertTrue(meta["publishAt"])

    def test_admin_series_data_aliases_require_admin_and_disable_caching(self):
        self.seed_contract_series()
        user = self.create_user("user")
        admin = self.create_user("admin")
        paths = {
            "/admin/series.json",
            "/admin/data.json",
            "/admin/series/{series_id}/data.json",
            "/api/admin/series/{series_id}/data",
            "/api/admin/series/{series_id}/data.json",
            "/api/admin/series.json",
            "/api/admin/data.json",
        }
        routes = {
            route.path: route.endpoint
            for route in series_json.router.routes
            if route.path.startswith(("/admin/", "/api/admin/"))
        }
        self.assertEqual(set(routes), paths)

        def call(path: str, request):
            endpoint = routes[path]
            if "{series_id}" in path:
                return endpoint("battle-bros", request, self.db)
            return endpoint(request, self.db)

        for path in paths:
            with self.subTest(path=path, actor="guest"):
                response = call(path, build_request(path))
                self.assertEqual(response.status_code, 403)
            with self.subTest(path=path, actor="user"):
                response = call(
                    path,
                    build_request(path, cookie=self.auth_cookie(user)),
                )
                self.assertEqual(response.status_code, 403)
            with self.subTest(path=path, actor="admin"):
                response = call(
                    path,
                    build_request(path, cookie=self.auth_cookie(admin)),
                )
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.headers.get("cache-control"), "no-store")

    def test_series_data_save_rejects_premium_entries_with_public_paths(self):
        payload = {
            "premiumOnly": True,
            "entries": {
                "Chapter 1": ["comics/02/entries/chapters/01/01.png"],
            },
            "entryFolders": {"Chapter 1": "comics/02/entries/chapters/01"},
            "entryMeta": {"Chapter 1": {"premium": False}},
        }

        with self.assertRaisesRegex(ValueError, "Premium entry 'Chapter 1'"):
            apply_series_data_save(self.db, "02", payload)

    def test_series_data_save_allows_premium_entry_in_public_series(self):
        payload = {
            "premiumOnly": False,
            "entries": {
                "Chapter 1": ["protected/comics/02/entries/chapters/01/01.png"],
            },
            "entryFolders": {"Chapter 1": "protected/comics/02/entries/chapters/01"},
            "entryMeta": {"Chapter 1": {"premium": True}},
        }

        apply_series_data_save(self.db, "02", payload)

        series = self.db.get(Series, "02")
        entry = self.db.scalar(select(Entry).where(Entry.series_id == "02"))
        page = self.db.scalar(select(EntryPage).where(EntryPage.entry_id == entry.id))

        self.assertFalse(series.premium_only)
        self.assertTrue(entry.premium_only)
        self.assertEqual(entry.folder_path, "protected/comics/02/entries/chapters/01")
        self.assertEqual(page.path, "protected/comics/02/entries/chapters/01/01.png")

    def test_public_payload_hides_drafts_and_advertises_scheduled_entries(self):
        seeded = self.seed_contract_series()
        label_id = seeded["label"].id
        now = datetime.now(timezone.utc)

        def add_entry(title: str, status: str, publish_at: datetime, *, sort_index: int) -> Entry:
            entry = Entry(
                series_id="battle-bros",
                title=title,
                entry_label_id=label_id,
                folder_path=f"comics/01/{title}",
                status=status,
                publish_at=publish_at,
                sort_index=sort_index,
                created_at=now,
                updated_at=now,
            )
            self.db.add(entry)
            self.db.flush()
            self.db.add(
                EntryPage(
                    entry_id=entry.id,
                    sort_index=0,
                    path=f"comics/01/{title}/01.png",
                    created_at=now,
                    updated_at=now,
                )
            )
            return entry

        add_entry("Draft Chapter", "draft", now - timedelta(days=1), sort_index=100)
        add_entry("Scheduled Chapter", "scheduled", now + timedelta(days=7), sort_index=101)
        add_entry("Future Chapter", "published", now + timedelta(days=7), sort_index=102)
        due = add_entry("Due Chapter", "scheduled", now - timedelta(minutes=1), sort_index=103)
        self.db.commit()

        public = json_body(series_json.public_default_series_data(self.db))
        admin = json_body(
            series_json.admin_series_data_api(
                "battle-bros",
                self.admin_request("/api/admin/series/battle-bros/data"),
                self.db,
            )
        )

        # Public: drafts are removed entirely so they never leak before release.
        self.assertNotIn("Draft Chapter", public["entries"])
        self.assertNotIn("Draft Chapter", public["entryMeta"])

        # Public: scheduled entries (explicit status or a future publish_at) are
        # advertised with status + publishAt, but their page images are withheld.
        for title in ("Scheduled Chapter", "Future Chapter"):
            self.assertIn(title, public["entryMeta"])
            self.assertEqual(public["entryMeta"][title]["status"], "scheduled")
            self.assertIn("publishAt", public["entryMeta"][title])
            self.assertEqual(public["entries"][title], [])

        # Public: an ordinary published entry keeps its pages and carries no
        # explicit status (published is the implicit default).
        self.assertIn("Issue 2", public["entries"])
        self.assertNotIn("status", public["entryMeta"]["Issue 2"])
        self.assertEqual(public["entries"]["Due Chapter"], ["comics/01/Due Chapter/01.png"])
        self.assertNotIn("status", public["entryMeta"]["Due Chapter"])
        self.db.refresh(due)
        self.assertEqual(due.status, "published")

        # Admin: every entry is visible with its raw status and full page list so
        # the entry editor can manage drafts/scheduled without data loss on save.
        self.assertEqual(admin["entryMeta"]["Draft Chapter"]["status"], "draft")
        self.assertEqual(admin["entries"]["Draft Chapter"], ["comics/01/Draft Chapter/01.png"])
        self.assertEqual(admin["entryMeta"]["Scheduled Chapter"]["status"], "scheduled")
        self.assertEqual(
            admin["entries"]["Scheduled Chapter"],
            ["comics/01/Scheduled Chapter/01.png"],
        )
        self.assertEqual(admin["entryMeta"]["Due Chapter"]["status"], "published")

    def test_series_data_save_persists_and_normalizes_entry_publication(self):
        now = datetime.now(timezone.utc)
        future = now + timedelta(days=7)
        past = now - timedelta(days=1)
        cases = (
            ("draft", "", "draft"),
            ("scheduled", future.isoformat(), "scheduled"),
            ("published", future.isoformat(), "scheduled"),
            ("scheduled", past.isoformat(), "published"),
            ("published", "", "published"),
        )

        for requested_status, publish_at, expected_status in cases:
            with self.subTest(
                requested_status=requested_status,
                publish_at=publish_at,
                expected_status=expected_status,
            ):
                apply_series_data_save(
                    self.db,
                    "publication-test",
                    {
                        "entries": {"Chapter 1": ["comics/01/chapter-1/01.png"]},
                        "entryFolders": {"Chapter 1": "comics/01/chapter-1"},
                        "entryMeta": {
                            "Chapter 1": {
                                "status": requested_status,
                                "publishAt": publish_at,
                            }
                        },
                    },
                )
                entry = self.db.scalar(
                    select(Entry).where(
                        Entry.series_id == "publication-test",
                        Entry.title == "Chapter 1",
                    )
                )
                self.assertEqual(entry.status, expected_status)
                self.assertIsNotNone(entry.publish_at)

        admin_payload = series_data_payload(self.db, "publication-test", include_unpublished=True)
        self.assertEqual(admin_payload["entryMeta"]["Chapter 1"]["status"], "published")
        self.assertTrue(admin_payload["entryMeta"]["Chapter 1"]["publishAt"])

    def test_series_data_save_rejects_invalid_entry_publication(self):
        base_payload = {
            "entries": {"Chapter 1": ["comics/01/chapter-1/01.png"]},
            "entryFolders": {"Chapter 1": "comics/01/chapter-1"},
        }
        invalid_cases = (
            ({"status": "private"}, "invalid status"),
            ({"status": "scheduled"}, "requires publishAt"),
            ({"status": "scheduled", "publishAt": "not-a-date"}, "invalid publishAt"),
        )

        for meta, message in invalid_cases:
            with self.subTest(meta=meta):
                with self.assertRaisesRegex(ValueError, message):
                    apply_series_data_save(
                        self.db,
                        "publication-test",
                        {
                            **base_payload,
                            "entryMeta": {"Chapter 1": meta},
                        },
                    )

    def test_series_data_save_rejects_public_entries_with_protected_paths(self):
        payload = {
            "premiumOnly": False,
            "entries": {
                "Chapter 1": ["protected/comics/02/entries/chapters/01/01.png"],
            },
            "entryFolders": {"Chapter 1": "protected/comics/02/entries/chapters/01"},
            "entryMeta": {"Chapter 1": {"premium": False}},
        }

        with self.assertRaisesRegex(ValueError, "Public entry 'Chapter 1'"):
            apply_series_data_save(self.db, "02", payload)


if __name__ == "__main__":
    import unittest

    unittest.main()
