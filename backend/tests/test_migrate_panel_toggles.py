from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-route-tests.db")

import uuid
from datetime import datetime, timezone
from unittest.mock import patch

from sqlalchemy import select

from backend.app.builder_history import PAGE_UPDATED
from backend.app.migrate_panel_toggles_to_ratio import migrate_series_panel_toggles
from backend.app.models import (
    BuilderModule,
    BuilderPage,
    BuilderPageSnapshot,
    BuilderSection,
    Series,
)
from backend.tests.helpers import BackendRouteTestCase


class MigratePanelTogglesTests(BackendRouteTestCase):
    def _seed_reader_page(
        self,
        *,
        layout="1-1",
        settings=None,
        reader_column=0,
        reader_config=None,
        extra_modules=None,
        slug="reader",
    ):
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
            meta={},
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
                column_index=reader_column,
                sort_index=0,
                config=reader_config or {"source": {"mode": "active-page-series"}},
                created_at=now,
                updated_at=now,
            )
        )
        for spec in extra_modules or []:
            self.db.add(
                BuilderModule(
                    id=uuid.uuid4(),
                    section_id=section.id,
                    module_type=spec.get("module_type", "text"),
                    column_index=spec["column_index"],
                    sort_index=spec.get("sort_index", 0),
                    config=spec.get("config", {"content": "<p>x</p>"}),
                    created_at=now,
                    updated_at=now,
                )
            )
        self.db.commit()
        return page, section

    def test_collapses_1_3_1_disabled_empty_right_to_single_column(self):
        _page, section = self._seed_reader_page(
            layout="1-3-1",
            reader_column=1,
            settings={"panelEnabled": {"left": True, "right": False}},
            extra_modules=[
                {"module_type": "text", "column_index": 0, "config": {"content": "<p>Left</p>"}}
            ],
        )
        reader_id = next(m.id for m in section.modules if m.module_type == "reader")

        summary = migrate_series_panel_toggles(self.db, "battle-bros", write=True)
        self.db.refresh(section)

        self.assertEqual(summary["pagesChanged"], 1)
        self.assertEqual(summary["pagesFlagged"], 0)
        # The section collapses to a single column so the right panel no longer exists.
        self.assertEqual(section.layout, "1")
        # The reader module is relocated to column 0 (it renders to the viewport, not a panel);
        # the left-panel text stays in column 0.
        reader = next(m for m in section.modules if m.id == reader_id)
        self.assertEqual(reader.column_index, 0)
        for module in section.modules:
            self.assertEqual(module.column_index, 0)
        # The inert toggle is cleared.
        self.assertNotIn("panelEnabled", section.settings)
        snapshot = self.db.scalar(
            select(BuilderPageSnapshot).where(BuilderPageSnapshot.page_id == section.page_id)
        )
        self.assertEqual(snapshot.action, PAGE_UPDATED)
        self.assertIsNone(snapshot.created_by_user_id)
        self.assertEqual(snapshot.payload["page"]["sections"][0]["layout"], "1-3-1")

    def test_write_snapshot_failure_rolls_back_all_projected_changes(self):
        _page, section = self._seed_reader_page(
            layout="1-1",
            settings={"panelEnabled": {"right": False}},
        )
        with (
            patch(
                "backend.app.migrate_panel_toggles_to_ratio.capture_page_snapshot",
                side_effect=RuntimeError("forced toggle snapshot failure"),
            ),
            self.assertRaisesRegex(RuntimeError, "forced toggle snapshot failure"),
        ):
            migrate_series_panel_toggles(self.db, "battle-bros", write=True)

        self.db.refresh(section)
        self.assertEqual(section.layout, "1-1")
        self.assertEqual(section.settings, {"panelEnabled": {"right": False}})
        self.assertEqual(
            self.db.scalars(select(BuilderPageSnapshot)).all(),
            [],
        )

    def test_collapses_two_column_disabled_via_reader_config(self):
        # The disable signal comes from the reader module's config.panels this time.
        _page, section = self._seed_reader_page(
            layout="1-1",
            reader_column=0,
            reader_config={
                "source": {"mode": "active-page-series"},
                "panels": {"left": {"enabled": True}, "right": {"enabled": False}},
            },
        )

        summary = migrate_series_panel_toggles(self.db, "battle-bros", write=True)
        self.db.refresh(section)

        self.assertEqual(summary["pagesChanged"], 1)
        self.assertEqual(section.layout, "1")
        reader = next(m for m in section.modules if m.module_type == "reader")
        self.assertNotIn("panels", reader.config)

    def test_show_panels_fallback_disables_missing_panel_side_when_panels_exist(self):
        _page, section = self._seed_reader_page(
            layout="1-1",
            reader_column=0,
            reader_config={
                "source": {"mode": "active-page-series"},
                "showPanels": False,
                "panels": {"left": {"enabled": True}},
            },
        )

        summary = migrate_series_panel_toggles(self.db, "battle-bros", write=True)
        self.db.refresh(section)

        self.assertEqual(summary["pagesChanged"], 1)
        self.assertEqual(summary["pagesFlagged"], 0)
        self.assertEqual(section.layout, "1")
        reader = next(m for m in section.modules if m.module_type == "reader")
        self.assertFalse(reader.config["showPanels"])
        self.assertNotIn("panels", reader.config)

    def test_show_panels_fallback_disables_panel_side_with_missing_enabled(self):
        _page, section = self._seed_reader_page(
            layout="1-1",
            reader_column=0,
            reader_config={
                "source": {"mode": "active-page-series"},
                "showPanels": "false",
                "panels": {"left": {"enabled": True}, "right": {}},
            },
        )

        summary = migrate_series_panel_toggles(self.db, "battle-bros", write=True)
        self.db.refresh(section)

        self.assertEqual(summary["pagesChanged"], 1)
        self.assertEqual(section.layout, "1")
        reader = next(m for m in section.modules if m.module_type == "reader")
        self.assertEqual(reader.config["showPanels"], "false")
        self.assertNotIn("panels", reader.config)

    def test_show_panels_without_panels_object_is_skipped_as_tolerated_dead_data(self):
        _page, section = self._seed_reader_page(
            layout="1-1",
            reader_column=0,
            reader_config={
                "source": {"mode": "active-page-series"},
                "showPanels": False,
            },
        )

        summary = migrate_series_panel_toggles(self.db, "battle-bros", write=True)
        self.db.refresh(section)

        self.assertEqual(summary["pagesChanged"], 0)
        self.assertEqual(summary["pagesFlagged"], 0)
        self.assertEqual(section.layout, "1-1")
        reader = next(m for m in section.modules if m.module_type == "reader")
        self.assertFalse(reader.config["showPanels"])
        self.assertNotIn("panels", reader.config)

    def test_disabled_right_with_authored_content_is_flagged_and_untouched(self):
        _page, section = self._seed_reader_page(
            layout="1-3-1",
            reader_column=1,
            settings={"panelEnabled": {"right": False}},
            extra_modules=[
                {
                    "module_type": "text",
                    "column_index": 2,
                    "config": {"content": "<p>Right content</p>"},
                }
            ],
        )

        summary = migrate_series_panel_toggles(self.db, "battle-bros", write=True)
        self.db.refresh(section)

        self.assertEqual(summary["pagesChanged"], 0)
        self.assertEqual(summary["pagesFlagged"], 1)
        # Nothing is moved or dropped: layout, module placement, and toggle all survive.
        self.assertEqual(section.layout, "1-3-1")
        self.assertEqual(section.settings["panelEnabled"], {"right": False})
        right = next(m for m in section.modules if m.module_type == "text")
        self.assertEqual(right.column_index, 2)
        report = summary["pageReports"][0]
        self.assertEqual(report["action"], "flagged")
        self.assertIn("right.disabled-with-content(manual-review)", report["flags"])

    def test_disabled_left_drops_toggle_and_flags_without_structural_change(self):
        _page, section = self._seed_reader_page(
            layout="1",
            reader_column=0,
            reader_config={
                "source": {"mode": "active-page-series"},
                "panels": {"left": {"enabled": False}},
            },
        )

        summary = migrate_series_panel_toggles(self.db, "battle-bros", write=True)
        self.db.refresh(section)

        # The page is changed (toggle cleared) and also flagged (the left panel becomes visible).
        self.assertEqual(summary["pagesChanged"], 1)
        self.assertEqual(summary["pagesFlagged"], 1)
        # The left panel always exists now, so the layout is unchanged.
        self.assertEqual(section.layout, "1")
        reader = next(m for m in section.modules if m.module_type == "reader")
        self.assertNotIn("panels", reader.config)
        report = summary["pageReports"][0]
        self.assertIn("left.disabled-now-visible(review)", report["flags"])

    def test_dry_run_reports_without_mutating(self):
        _page, section = self._seed_reader_page(
            layout="1-1",
            reader_column=0,
            settings={"panelEnabled": {"right": False}},
        )

        summary = migrate_series_panel_toggles(self.db, "battle-bros", write=False)
        self.db.refresh(section)

        self.assertTrue(summary["dryRun"])
        self.assertEqual(summary["pagesChanged"], 1)
        # Nothing persisted.
        self.assertEqual(section.layout, "1-1")
        self.assertEqual(section.settings["panelEnabled"], {"right": False})

    def test_idempotent_second_write_is_noop(self):
        self._seed_reader_page(
            layout="1-1",
            reader_column=0,
            settings={"panelEnabled": {"right": False}},
        )

        first = migrate_series_panel_toggles(self.db, "battle-bros", write=True)
        self.assertEqual(first["pagesChanged"], 1)

        second = migrate_series_panel_toggles(self.db, "battle-bros", write=True)
        self.assertEqual(second["pagesChanged"], 0)
        self.assertEqual(second["pagesFlagged"], 0)
        self.assertEqual(second["changedPageIds"], [])

    def test_enabled_panels_are_skipped_as_tolerated_dead_data(self):
        _page, section = self._seed_reader_page(
            layout="1-1",
            reader_column=0,
            settings={"panelEnabled": {"left": True, "right": True}},
        )

        summary = migrate_series_panel_toggles(self.db, "battle-bros", write=True)
        self.db.refresh(section)

        self.assertEqual(summary["pagesChanged"], 0)
        self.assertEqual(summary["pagesFlagged"], 0)
        # The enabled toggle is left in place (tolerated dead data, not reconciled).
        self.assertEqual(section.settings["panelEnabled"], {"left": True, "right": True})

    def test_no_reader_section_is_skipped(self):
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
            meta={},
            created_at=now,
            updated_at=now,
        )
        self.db.add(page)
        section = BuilderSection(
            id=uuid.uuid4(),
            page_id=page.id,
            section_type="row",
            layout="1-1",
            sort_index=0,
            settings={"panelEnabled": {"right": False}},
            created_at=now,
        )
        self.db.add(section)
        self.db.commit()

        summary = migrate_series_panel_toggles(self.db, "battle-bros", write=True)
        self.assertEqual(summary["pagesChanged"], 0)
        self.assertEqual(summary["pagesFlagged"], 0)


if __name__ == "__main__":
    import unittest

    unittest.main()
