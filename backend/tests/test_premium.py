from __future__ import annotations

import os
from datetime import datetime, timezone

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-route-tests.db")

from backend.app import premium
from backend.app.models import Entry, Series

from backend.tests.helpers import BackendRouteTestCase


class PremiumPathTests(BackendRouteTestCase):
    def test_series_premium_prefixes_cover_canonical_and_legacy_non_default_paths(self):
        now = datetime.now(timezone.utc)
        self.db.add(
            Series(
                id="02",
                title="PYRE",
                description="",
                cover_image=None,
                premium_only=True,
                status_message="",
                unit_label_singular="Chapter",
                unit_label_plural="Chapters",
                active=True,
                created_at=now,
                updated_at=now,
            )
        )
        self.db.commit()
        premium._cache.clear()

        self.assertTrue(
            premium.is_premium_request_path(
                self.db, "/comics/02/entries/chapters/01/01.png"
            )
        )
        self.assertTrue(
            premium.is_premium_request_path(self.db, "/comics/02/chapters/01/01.png")
        )

    def test_public_series_entry_premium_prefixes_only_that_entry_folder(self):
        now = datetime.now(timezone.utc)
        series = Series(
            id="02",
            title="PYRE",
            description="",
            cover_image=None,
            premium_only=False,
            status_message="",
            unit_label_singular="Chapter",
            unit_label_plural="Chapters",
            active=True,
            created_at=now,
            updated_at=now,
        )
        self.db.add(series)
        self.db.add(
            Entry(
                series_id="02",
                title="Chapter 1",
                display_number=1,
                entry_label_id=None,
                folder_path="comics/02/entries/chapters/01",
                premium_only=True,
                show_in_dropdown=True,
                show_in_gallery=True,
                release_type="digital",
                store_url=None,
                cover_image=None,
                cover_thumb_path=None,
                status="published",
                publish_at=now,
                sort_index=1,
                created_at=now,
                updated_at=now,
            )
        )
        self.db.commit()
        premium._cache.clear()

        self.assertTrue(
            premium.is_premium_request_path(
                self.db, "/comics/02/entries/chapters/01/01.png"
            )
        )
        self.assertFalse(
            premium.is_premium_request_path(
                self.db, "/comics/02/entries/chapters/02/01.png"
            )
        )


if __name__ == "__main__":
    import unittest

    unittest.main()
