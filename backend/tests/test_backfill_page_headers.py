from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-route-tests.db")

from backend.app.backfill_page_headers import backfill_series_page_headers
from backend.app.models import BuilderPage
from backend.tests.helpers import BackendRouteTestCase


class BackfillPageHeadersTests(BackendRouteTestCase):
    def test_clean_v3_pages_are_noop_in_dry_run_and_write_mode(self):
        self.seed_page_config()
        seeded = self.seed_builder_page("builderPage")

        dry_run = backfill_series_page_headers(self.db, "battle-bros", write=False)
        write_run = backfill_series_page_headers(self.db, "battle-bros", write=True)

        for summary in (dry_run, write_run):
            self.assertEqual(summary["scannedPages"], 1)
            self.assertEqual(summary["pagesNeedingChanges"], 0)
            self.assertEqual(summary["updatedPages"], 0)
            self.assertEqual(summary["changedPageIds"], [])
            self.assertEqual(summary["updatedPageIds"], [])
            self.assertEqual(summary["pageReports"], [])
            self.assertEqual(summary["blockingBucketSummary"], {})
            self.assertTrue(summary["removalReadiness"]["canRemoveLegacyReaderFallback"])

        unchanged = self.db.get(BuilderPage, seeded["page"].id)
        self.assertEqual(unchanged.meta["header"]["version"], 3)
        self.assertNotIn("headerOverrides", unchanged.meta)

    def test_readiness_blocks_when_series_has_no_published_reader_page(self):
        self.seed_page_config()
        seeded = self.seed_builder_page("builderPage")
        page = seeded["page"]
        page.slug = "about"
        page.is_homepage = False
        self.db.commit()

        summary = backfill_series_page_headers(self.db, "battle-bros", write=False)

        self.assertEqual(summary["pagesNeedingChanges"], 0)
        self.assertEqual(summary["updatedPages"], 0)
        self.assertEqual(summary["blockingBucketSummary"]["missingPublishedReaderPage"]["count"], 1)
        self.assertEqual(
            summary["blockingBucketSummary"]["missingPublishedReaderPage"]["pageIds"],
            [],
        )
        self.assertFalse(summary["removalReadiness"]["hasPublishedReaderPage"])
        self.assertFalse(summary["removalReadiness"]["canRemoveLegacyReaderFallback"])

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
        self.assertEqual(len(summary["pageReports"]), 1)

        report = summary["pageReports"][0]
        self.assertEqual(
            set(report.keys()),
            {
                "pageId",
                "slug",
                "beforeHeaderVersion",
                "afterHeaderVersion",
                "overridesCleared",
                "navItemCount",
                "navStyles",
                "disabledBlocks",
                "regions",
                "hasAppearance",
                "hasNavItemAppearance",
            },
        )
        self.assertEqual(report["pageId"], str(seeded["page"].id))
        self.assertEqual(report["slug"], "about")
        self.assertIsNone(report["beforeHeaderVersion"])
        self.assertEqual(report["afterHeaderVersion"], 3)
        self.assertTrue(report["overridesCleared"])
        self.assertEqual(report["navItemCount"], 1)
        self.assertEqual(report["navStyles"], ["primary"])
        self.assertEqual(report["disabledBlocks"], ["status"])
        self.assertEqual(
            report["regions"],
            {
                "left": ["brand"],
                "center": ["patron", "status"],
                "right": ["entryControls", "nav"],
            },
        )
        self.assertFalse(report["hasAppearance"])
        self.assertFalse(report["hasNavItemAppearance"])

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
        self.assertFalse(updated.meta["header"]["blocks"]["status"]["enabled"])
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

    def test_write_mode_preserves_stale_header_appearance_payloads(self):
        self.seed_page_config()
        seeded = self.seed_builder_page("builderPage")
        page = seeded["page"]
        page.meta = {
            "header": {
                "version": 2,
                "copy": {
                    "title": "Styled Legacy Header",
                    "subtitle": "Styled Subtitle",
                },
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
                "appearance": {
                    "top": {
                        "background": {
                            "type": "gradient",
                            "color": "#112233",
                            "secondaryColor": "#334455",
                            "angle": 400,
                            "opacity": 1.5,
                        },
                        "border": {
                            "radius": 14,
                        },
                    },
                    "scrolled": {
                        "border": {
                            "width": 0,
                            "color": "#00d9ff",
                        },
                    },
                    "navItemDefaults": {
                        "text": {
                            "color": "#ffffff",
                        },
                    },
                },
                "nav": {
                    "items": [
                        {
                            "id": "styled-nav",
                            "label": "Styled Nav",
                            "enabled": True,
                            "style": "secondary",
                            "appearance": {
                                "background": {
                                    "type": "solid",
                                    "color": "#445566",
                                },
                                "border": {
                                    "width": 2,
                                    "style": "dotted",
                                    "color": "#abcdef",
                                    "radius": 12,
                                },
                            },
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
        self.assertEqual(summary["pageReports"][0]["hasAppearance"], True)
        self.assertEqual(summary["pageReports"][0]["hasNavItemAppearance"], True)
        updated = self.db.get(BuilderPage, page.id)
        header = updated.meta["header"]
        self.assertEqual(header["version"], 3)
        self.assertEqual(header["copy"]["title"], "Styled Legacy Header")
        self.assertEqual(header["appearance"]["top"]["background"]["type"], "gradient")
        self.assertEqual(header["appearance"]["top"]["background"]["color"], "#112233")
        self.assertEqual(header["appearance"]["top"]["background"]["secondaryColor"], "#334455")
        self.assertEqual(header["appearance"]["top"]["background"]["angle"], 360)
        self.assertEqual(header["appearance"]["top"]["background"]["opacity"], 1.0)
        self.assertEqual(header["appearance"]["top"]["border"]["radius"], 14)
        self.assertEqual(header["appearance"]["scrolled"]["border"]["width"], 0)
        self.assertEqual(header["appearance"]["scrolled"]["border"]["color"], "#00d9ff")
        self.assertEqual(header["appearance"]["navItemDefaults"]["text"]["color"], "#ffffff")

        nav_item = header["nav"]["items"][0]
        self.assertEqual(nav_item["style"], "secondary")
        self.assertEqual(nav_item["appearance"]["background"]["type"], "solid")
        self.assertEqual(nav_item["appearance"]["background"]["color"], "#445566")
        self.assertEqual(nav_item["appearance"]["border"]["width"], 2)
        self.assertEqual(nav_item["appearance"]["border"]["style"], "dotted")
        self.assertEqual(nav_item["appearance"]["border"]["color"], "#abcdef")
        self.assertEqual(nav_item["appearance"]["border"]["radius"], 12)


if __name__ == "__main__":
    import unittest

    unittest.main()
