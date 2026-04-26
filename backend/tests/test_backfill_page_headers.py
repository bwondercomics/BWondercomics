from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-route-tests.db")

from backend.app.backfill_page_headers import backfill_series_page_headers
from backend.app.models import BuilderPage
from backend.tests.helpers import BackendRouteTestCase


class BackfillPageHeadersTests(BackendRouteTestCase):
    def test_dry_run_reports_projected_cleanup_without_mutating_db(self):
        self.seed_page_config()
        self.seed_builder_page("builderPage")
        seeded = self.seed_builder_page("builderPageDraft")

        summary = backfill_series_page_headers(self.db, "battle-bros", write=False)

        self.assertTrue(summary["dryRun"])
        self.assertEqual(summary["pagesNeedingChanges"], 1)
        self.assertEqual(summary["updatedPages"], 0)
        self.assertEqual(summary["changedPageIds"], [str(seeded["page"].id)])
        self.assertEqual(summary["blockingBucketSummary"], {})
        self.assertTrue(summary["removalReadiness"]["canRemoveLegacyReaderFallback"])

        unchanged = self.db.get(BuilderPage, seeded["page"].id)
        self.assertNotIn("header", unchanged.meta)
        self.assertIn("headerOverrides", unchanged.meta)

    def test_write_mode_persists_v3_header_and_clears_overrides(self):
        self.seed_page_config()
        self.seed_builder_page("builderPage")
        seeded = self.seed_builder_page("builderPageDraft")

        summary = backfill_series_page_headers(self.db, "battle-bros", write=True)

        self.assertFalse(summary["dryRun"])
        self.assertEqual(summary["pagesNeedingChanges"], 1)
        self.assertEqual(summary["updatedPages"], 1)
        self.assertEqual(summary["updatedPageIds"], [str(seeded["page"].id)])
        self.assertEqual(summary["blockingBucketSummary"], {})
        self.assertTrue(summary["removalReadiness"]["canRemoveLegacyReaderFallback"])

        updated = self.db.get(BuilderPage, seeded["page"].id)
        self.assertEqual(updated.meta["header"]["version"], 3)
        self.assertEqual(updated.meta["header"]["copy"]["title"], "About")
        self.assertEqual(updated.meta["header"]["nav"]["items"][0]["style"], "primary")
        self.assertNotIn("headerOverrides", updated.meta)

    def test_write_mode_backfills_stale_v2_pages_from_legacy_copy(self):
        self.seed_page_config()
        seeded = self.seed_builder_page("builderPage")
        page = seeded["page"]
        page.meta = {
            "header": {
                "version": 2,
                "regions": {
                    "left": ["brand"],
                    "center": ["nav"],
                    "right": ["entryControls", "status", "patron"],
                },
                "blocks": {
                    "brand": {"enabled": True},
                    "patron": {"enabled": True},
                    "status": {"enabled": True},
                    "entryControls": {"enabled": True},
                    "nav": {"enabled": True},
                },
                "nav": {
                    "items": [
                        {
                            "id": "legacy-nav",
                            "label": "Legacy Nav",
                            "enabled": True,
                            "style": "secondary",
                            "link": {
                                "kind": "url",
                                "url": "comics.html",
                                "openInNewTab": False,
                            },
                        }
                    ]
                },
            }
        }
        self.db.commit()

        summary = backfill_series_page_headers(self.db, "battle-bros", write=True)

        self.assertEqual(summary["updatedPages"], 1)
        updated = self.db.get(BuilderPage, page.id)
        self.assertEqual(updated.meta["header"]["version"], 3)
        self.assertEqual(updated.meta["header"]["copy"]["title"], "Battle Bros")
        self.assertEqual(updated.meta["header"]["copy"]["subtitle"], "Hero Time")
        self.assertEqual(
            updated.meta["header"]["copy"]["subtitles"],
            ["Hero Time", "Lunch Break Justice"],
        )
        self.assertEqual(updated.meta["header"]["nav"]["items"][0]["style"], "secondary")


if __name__ == "__main__":
    import unittest

    unittest.main()
