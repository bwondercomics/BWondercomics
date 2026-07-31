from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-route-tests.db")

import uuid
from datetime import datetime, timezone
from unittest.mock import patch

from sqlalchemy import select

from backend.app.builder_history import PAGE_UPDATED
from backend.app.migrate_panel_settings_to_columns import migrate_series_panel_settings
from backend.app.models import (
    BuilderModule,
    BuilderPage,
    BuilderPageSnapshot,
    BuilderSection,
    Series,
)
from backend.tests.helpers import BackendRouteTestCase


class MigratePanelSettingsTests(BackendRouteTestCase):
    def _seed_reader_page(self, *, meta, layout="1-1", settings=None, slug="reader"):
        if not self.db.get(Series, "battle-bros"):
            self.seed_contract_series()
        now = datetime.now(timezone.utc)
        page = BuilderPage(
            id=uuid.uuid4(),
            scope="series",
            series_id="battle-bros",
            slug=slug,
            title="Reader",
            page_type="reader",
            is_published=True,
            is_homepage=False,
            sort_index=0,
            meta=meta,
            created_at=now,
            updated_at=now,
        )
        self.db.add(page)
        section = BuilderSection(
            id=uuid.uuid4(),
            page_id=page.id,
            section_type="row",
            layout=layout,
            sort_index=0,
            settings=settings or {},
            created_at=now,
        )
        self.db.add(section)
        self.db.add(
            BuilderModule(
                id=uuid.uuid4(),
                section_id=section.id,
                module_type="reader",
                column_index=0,
                sort_index=0,
                config={"source": {"mode": "active-page-series"}},
                created_at=now,
                updated_at=now,
            )
        )
        self.db.commit()
        return page, section

    def test_dry_run_reports_without_mutating(self):
        page, section = self._seed_reader_page(
            meta={
                "panelBackgrounds": {"left": {"path": "assets/uploads/left.png"}},
                "panelSpacing": {"left": 20, "right": 8},
            },
        )

        summary = migrate_series_panel_settings(self.db, "battle-bros", write=False)

        self.assertTrue(summary["dryRun"])
        self.assertEqual(summary["scannedPages"], 1)
        self.assertEqual(summary["pagesNeedingChanges"], 1)
        self.assertEqual(summary["changedPageIds"], [str(page.id)])
        # Nothing was written: meta keeps its panel keys, the column has no styling.
        self.assertIn("panelBackgrounds", page.meta)
        self.assertNotIn("columns", section.settings)

    def test_write_moves_meta_to_columns_and_clears(self):
        page, section = self._seed_reader_page(
            meta={
                "panelBackgrounds": {"left": {"path": "assets/uploads/left.png", "opacity": 0.4}},
                "panelSpacing": {"left": 20, "right": 8},
            },
        )

        migrate_series_panel_settings(self.db, "battle-bros", write=True)
        self.db.refresh(page)
        self.db.refresh(section)

        cols = {col["index"]: col for col in section.settings["columns"]}
        self.assertIn("path", cols[0]["panelBackground"])
        self.assertEqual(cols[0]["panelBackground"]["opacity"], 0.4)
        self.assertEqual(cols[0]["panelGap"], 20)  # left gap -> column 0
        self.assertEqual(cols[1]["panelGap"], 8)  # right gap -> last column (index 1)
        # Legacy meta keys fully migrated, so both are cleared.
        self.assertNotIn("panelBackgrounds", page.meta)
        self.assertNotIn("panelSpacing", page.meta)
        snapshot = self.db.scalar(
            select(BuilderPageSnapshot).where(BuilderPageSnapshot.page_id == page.id)
        )
        self.assertEqual(snapshot.action, PAGE_UPDATED)
        self.assertIsNone(snapshot.created_by_user_id)
        self.assertIn("panelBackgrounds", snapshot.payload["page"]["meta"])

    def test_write_snapshot_failure_rolls_back_all_projected_changes(self):
        page, section = self._seed_reader_page(
            meta={"panelSpacing": {"left": 20}},
        )
        with (
            patch(
                "backend.app.migrate_panel_settings_to_columns.capture_page_snapshot",
                side_effect=RuntimeError("forced panel snapshot failure"),
            ),
            self.assertRaisesRegex(RuntimeError, "forced panel snapshot failure"),
        ):
            migrate_series_panel_settings(self.db, "battle-bros", write=True)

        self.db.refresh(page)
        self.db.refresh(section)
        self.assertEqual(page.meta, {"panelSpacing": {"left": 20}})
        self.assertEqual(section.settings, {})
        self.assertEqual(
            self.db.scalars(select(BuilderPageSnapshot)).all(),
            [],
        )

    def test_existing_column_field_preserved_and_partial_migrates_the_rest(self):
        page, section = self._seed_reader_page(
            meta={
                "panelBackgrounds": {"left": {"path": "assets/uploads/legacy.png"}},
                "panelSpacing": {"left": 14},
            },
            settings={
                "columns": [
                    {"index": 0, "panelBackground": {"path": "assets/uploads/authored.png"}}
                ]
            },
        )

        migrate_series_panel_settings(self.db, "battle-bros", write=True)
        self.db.refresh(page)
        self.db.refresh(section)

        cols = {col["index"]: col for col in section.settings["columns"]}
        # The authored column value wins; the legacy meta value never overwrites it.
        self.assertIn("authored.png", cols[0]["panelBackground"]["path"])
        # The missing field (gap) is migrated from meta.
        self.assertEqual(cols[0]["panelGap"], 14)
        # Both legacy keys are cleared: bg satisfied by the existing column, gap by the copy.
        self.assertNotIn("panelBackgrounds", page.meta)
        self.assertNotIn("panelSpacing", page.meta)

    def test_invalid_existing_column_fields_do_not_clear_valid_legacy_meta(self):
        page, section = self._seed_reader_page(
            meta={
                "panelBackgrounds": {"left": {"path": "assets/uploads/legacy.png"}},
                "panelSpacing": {"left": 18},
            },
            settings={
                "columns": [
                    {
                        "index": 0,
                        # Sanitizer drops this: no asset and empty text is not hidden.
                        "panelBackground": {"opacity": 0.5},
                        # Sanitizer drops this instead of coercing to a default.
                        "panelGap": "wide",
                    }
                ]
            },
        )

        migrate_series_panel_settings(self.db, "battle-bros", write=True)
        self.db.refresh(page)
        self.db.refresh(section)

        cols = {col["index"]: col for col in section.settings["columns"]}
        self.assertEqual(cols[0]["panelBackground"]["path"], "assets/uploads/legacy.png")
        self.assertEqual(cols[0]["panelGap"], 18)
        self.assertNotIn("panelBackgrounds", page.meta)
        self.assertNotIn("panelSpacing", page.meta)

    def test_right_side_meta_left_intact_on_single_column_reader(self):
        page, section = self._seed_reader_page(
            layout="1",
            meta={
                "panelBackgrounds": {
                    "left": {"path": "assets/uploads/left.png"},
                    "right": {"path": "assets/uploads/right.png"},
                },
                "panelSpacing": {"left": 10, "right": 12},
            },
        )

        migrate_series_panel_settings(self.db, "battle-bros", write=True)
        self.db.refresh(page)
        self.db.refresh(section)

        cols = {col["index"]: col for col in section.settings["columns"]}
        self.assertIn("path", cols[0]["panelBackground"])
        self.assertEqual(cols[0]["panelGap"], 10)
        # The right panel has no column to receive it, so its meta is preserved, not dropped.
        self.assertIn("right", page.meta["panelBackgrounds"])
        self.assertNotIn("left", page.meta["panelBackgrounds"])
        self.assertEqual(page.meta["panelSpacing"], {"right": 12})

    def test_idempotent_second_write_is_noop(self):
        self._seed_reader_page(meta={"panelSpacing": {"left": 16}})

        first = migrate_series_panel_settings(self.db, "battle-bros", write=True)
        self.assertEqual(first["pagesNeedingChanges"], 1)

        second = migrate_series_panel_settings(self.db, "battle-bros", write=True)
        self.assertEqual(second["pagesNeedingChanges"], 0)
        self.assertEqual(second["changedPageIds"], [])

    def test_no_reader_section_leaves_meta_untouched(self):
        if not self.db.get(Series, "battle-bros"):
            self.seed_contract_series()
        now = datetime.now(timezone.utc)
        page = BuilderPage(
            id=uuid.uuid4(),
            scope="series",
            series_id="battle-bros",
            slug="about",
            title="About",
            page_type="custom",
            is_published=True,
            is_homepage=False,
            sort_index=0,
            meta={"panelSpacing": {"left": 16}},
            created_at=now,
            updated_at=now,
        )
        self.db.add(page)
        self.db.commit()

        summary = migrate_series_panel_settings(self.db, "battle-bros", write=True)
        self.assertEqual(summary["pagesNeedingChanges"], 0)
        self.db.refresh(page)
        self.assertEqual(page.meta["panelSpacing"], {"left": 16})


if __name__ == "__main__":
    import unittest

    unittest.main()
