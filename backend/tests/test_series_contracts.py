from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-route-tests.db")

from sqlalchemy import select

from backend.app.models import Entry, EntryPage, Series
from backend.app.routes import series_json
from backend.app.series_store import apply_series_data_save

from backend.tests.helpers import BackendRouteTestCase, json_body, parse_iso_z


class SeriesContractTests(BackendRouteTestCase):
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
        admin_response = series_json.admin_series_data_api("battle-bros", self.db)

        self.assertEqual(json_body(public_response), self.contracts["seriesData"])
        self.assertEqual(json_body(admin_response), self.contracts["seriesData"])

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
