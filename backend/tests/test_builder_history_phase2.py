from __future__ import annotations

import asyncio
import os
from contextlib import ExitStack
from copy import deepcopy
from datetime import datetime, timezone
from unittest.mock import patch
from uuid import UUID, uuid4

from sqlalchemy import select
from starlette.requests import Request

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-route-tests.db")

from backend.app import builder_history, page_store
from backend.app.builder_history import (
    BINDINGS_UPDATED,
    MODULE_ADDED,
    MODULE_DELETED,
    MODULE_MOVED,
    MODULE_PLACEMENTS_SAVED,
    MODULE_UPDATED,
    MODULES_REORDERED,
    PAGE_CREATED,
    PAGE_DELETED,
    PAGE_REORDERED,
    PAGE_UPDATED,
    PRE_RESTORE,
    SECTION_ADDED,
    SECTION_DELETED,
    SECTION_UPDATED,
    SECTIONS_REORDERED,
    BuilderSnapshotError,
    RecoveryDocument,
    RecoverySerializationError,
    capture_page_snapshot,
    get_snapshot_detail,
    hash_recovery_payload,
    list_deleted_page_candidates,
    restore_page_snapshot,
    serialize_builder_page_recovery,
    validate_snapshot_payload,
)
from backend.app.models import (
    BuilderModule,
    BuilderPage,
    BuilderPageBinding,
    BuilderPageSnapshot,
    BuilderSection,
    Series,
)
from backend.app.routes import page_builder
from backend.tests.helpers import BackendRouteTestCase, build_request, json_body


class BuilderHistoryPhase2Tests(BackendRouteTestCase):
    def _request_with_body(
        self,
        path: str,
        *,
        cookie: str,
        body: bytes = b"",
    ) -> Request:
        base = build_request(path, method="POST", cookie=cookie)
        delivered = False

        async def receive():
            nonlocal delivered
            if delivered:
                return {"type": "http.disconnect"}
            delivered = True
            return {"type": "http.request", "body": body, "more_body": False}

        return Request(base.scope, receive)

    def _make_page(
        self,
        slug: str,
        *,
        title: str | None = None,
        sort_index: int = 0,
        published: bool = False,
        homepage: bool = False,
    ) -> tuple[BuilderPage, BuilderSection, BuilderSection, BuilderModule, BuilderModule]:
        page = BuilderPage(
            id=uuid4(),
            scope="series",
            series_id="battle-bros",
            slug=slug,
            title=title or slug.title(),
            page_type="custom",
            is_published=published,
            is_homepage=homepage,
            sort_index=sort_index,
            meta={},
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        first = BuilderSection(
            id=uuid4(),
            page=page,
            section_type="row",
            layout="1",
            sort_index=0,
            settings={},
        )
        second = BuilderSection(
            id=uuid4(),
            page=page,
            section_type="row",
            layout="1",
            sort_index=1,
            settings={},
        )
        first_module = BuilderModule(
            id=uuid4(),
            section=first,
            module_type="text",
            column_index=0,
            sort_index=0,
            config={"content": "<p>First</p>", "alignment": "left"},
        )
        second_module = BuilderModule(
            id=uuid4(),
            section=first,
            module_type="text",
            column_index=0,
            sort_index=1,
            config={"content": "<p>Second</p>", "alignment": "left"},
        )
        self.db.add(page)
        self.db.commit()
        return page, first, second, first_module, second_module

    def _snapshots(self, page_id: UUID) -> list[BuilderPageSnapshot]:
        return list(
            self.db.scalars(
                select(BuilderPageSnapshot)
                .where(BuilderPageSnapshot.page_id == page_id)
                .order_by(
                    BuilderPageSnapshot.created_at.asc(),
                    BuilderPageSnapshot.id.asc(),
                )
            ).all()
        )

    def _assert_latest(
        self,
        page_id: UUID,
        action: str,
        actor_id: UUID,
        expected: tuple[dict, int] | None = None,
    ) -> BuilderPageSnapshot:
        snapshots = self._snapshots(page_id)
        snapshot = snapshots[-1]
        self.assertEqual(snapshot.action, action)
        self.assertEqual(snapshot.created_by_user_id, actor_id)
        if expected is not None:
            payload, previous_count = expected
            self.assertEqual(len(snapshots), previous_count + 1)
            self.assertEqual(snapshot.payload, payload)
            self.assertEqual(snapshot.payload_hash, hash_recovery_payload(payload))
        return snapshot

    def _snapshot_expectation(self, page: BuilderPage) -> tuple[dict, int]:
        return serialize_builder_page_recovery(self.db, page), len(self._snapshots(page.id))

    def test_mutation_matrix_captures_exact_actor_attributed_pre_states(self):
        self.seed_contract_series()
        actor = self.create_user(kind="admin", role="admin")
        page, first, second, first_module, second_module = self._make_page("matrix")
        unaffected, *_ = self._make_page("matrix-unaffected", sort_index=1)

        expected = self._snapshot_expectation(page)
        original_title = page.title
        updated = page_store.update_page(
            self.db, str(page.id), {"title": "Changed"}, actor_user_id=actor.id
        )
        self.assertEqual(updated["title"], "Changed")
        self.assertEqual(
            self._assert_latest(page.id, PAGE_UPDATED, actor.id, expected).payload["page"]["title"],
            original_title,
        )

        expected = self._snapshot_expectation(page)
        section = page_store.update_section(
            self.db,
            str(first.id),
            {"settings": {"paddingTop": 12}},
            actor_user_id=actor.id,
        )
        self.assertEqual(section["settings"], {"paddingTop": 12})
        self._assert_latest(page.id, SECTION_UPDATED, actor.id, expected)

        expected = self._snapshot_expectation(page)
        added_section = page_store.add_section(
            self.db, str(page.id), {"layout": "1"}, actor_user_id=actor.id
        )
        self.assertEqual(
            set(added_section), {"id", "sectionType", "layout", "sortIndex", "settings", "modules"}
        )
        self._assert_latest(page.id, SECTION_ADDED, actor.id, expected)

        expected = self._snapshot_expectation(page)
        added_module = page_store.add_module(
            self.db,
            str(second.id),
            {"moduleType": "text", "config": {"content": "<p>Third</p>"}},
            actor_user_id=actor.id,
        )
        self.assertEqual(added_module["moduleType"], "text")
        added_module_id = UUID(added_module["id"])
        self._assert_latest(page.id, MODULE_ADDED, actor.id, expected)

        expected = self._snapshot_expectation(page)
        module = page_store.update_module(
            self.db,
            str(first_module.id),
            {"config": {"content": "<p>Updated</p>"}},
            actor_user_id=actor.id,
        )
        self.assertEqual(module["config"]["content"], "<p>Updated</p>")
        self._assert_latest(page.id, MODULE_UPDATED, actor.id, expected)

        expected = self._snapshot_expectation(page)
        moved = page_store.move_module(
            self.db,
            str(first_module.id),
            str(second.id),
            0,
            0,
            actor_user_id=actor.id,
        )
        self.assertEqual(moved["id"], str(first_module.id))
        self._assert_latest(page.id, MODULE_MOVED, actor.id, expected)

        expected = self._snapshot_expectation(page)
        self.assertTrue(
            page_store.reorder_modules(
                self.db,
                str(first.id),
                0,
                [str(second_module.id)],
                actor_user_id=actor.id,
            )
        )
        self._assert_latest(page.id, MODULES_REORDERED, actor.id, expected)

        placements = [
            {
                "moduleId": str(second_module.id),
                "sectionId": str(first.id),
                "columnIndex": 0,
                "sortIndex": 0,
            },
            {
                "moduleId": str(first_module.id),
                "sectionId": str(second.id),
                "columnIndex": 0,
                "sortIndex": 1,
            },
            {
                "moduleId": str(added_module_id),
                "sectionId": str(second.id),
                "columnIndex": 0,
                "sortIndex": 0,
            },
        ]
        expected = self._snapshot_expectation(page)
        saved = page_store.save_module_placements(
            self.db, str(page.id), placements, actor_user_id=actor.id
        )
        self.assertEqual(saved["id"], str(page.id))
        self._assert_latest(page.id, MODULE_PLACEMENTS_SAVED, actor.id, expected)

        section_ids = [str(second.id), str(first.id), added_section["id"]]
        expected = self._snapshot_expectation(page)
        self.assertTrue(
            page_store.reorder_sections(self.db, str(page.id), section_ids, actor_user_id=actor.id)
        )
        self._assert_latest(page.id, SECTIONS_REORDERED, actor.id, expected)

        expected = self._snapshot_expectation(page)
        self.assertTrue(
            page_store.delete_module(self.db, str(added_module_id), actor_user_id=actor.id)
        )
        self._assert_latest(page.id, MODULE_DELETED, actor.id, expected)
        expected = self._snapshot_expectation(page)
        self.assertTrue(
            page_store.delete_section(self.db, added_section["id"], actor_user_id=actor.id)
        )
        self._assert_latest(page.id, SECTION_DELETED, actor.id, expected)

        expected = self._snapshot_expectation(page)
        bindings = page_store.update_page_bindings(
            self.db,
            "battle-bros",
            {"feed": str(page.id)},
            actor_user_id=actor.id,
        )
        self.assertEqual(bindings["bindings"]["feed"]["pageId"], str(page.id))
        self._assert_latest(page.id, BINDINGS_UPDATED, actor.id, expected)
        self.assertEqual(self._snapshots(unaffected.id), [])

        other, *_ = self._make_page("matrix-other", sort_index=9)
        page_expected = self._snapshot_expectation(page)
        unaffected_expected = self._snapshot_expectation(unaffected)
        other_expected = self._snapshot_expectation(other)
        self.assertTrue(
            page_store.reorder_scoped_pages(
                self.db,
                "series",
                "battle-bros",
                [str(other.id), str(page.id), str(unaffected.id)],
                actor_user_id=actor.id,
            )
        )
        self._assert_latest(page.id, PAGE_REORDERED, actor.id, page_expected)
        self._assert_latest(unaffected.id, PAGE_REORDERED, actor.id, unaffected_expected)
        self._assert_latest(other.id, PAGE_REORDERED, actor.id, other_expected)

        expected = self._snapshot_expectation(page)
        self.assertTrue(page_store.delete_page(self.db, str(page.id), actor_user_id=actor.id))
        deleted = self._assert_latest(page.id, PAGE_DELETED, actor.id, expected)
        self.assertEqual(len(deleted.payload["page"]["sections"]), 2)
        self.assertEqual(deleted.payload["bindings"][0]["role"], "feed")

    def test_semantic_noops_leave_history_and_timestamps_unchanged(self):
        self.seed_contract_series()
        actor = self.create_user(kind="admin", role="admin")
        page, first, _, first_module, second_module = self._make_page("noops")
        capture_page_snapshot(self.db, page.id, PAGE_CREATED, actor.id)
        self.db.commit()
        original_page_updated = page.updated_at
        original_module_updated = first_module.updated_at

        def assert_unchanged() -> None:
            self.db.refresh(page)
            self.db.refresh(first_module)
            self.assertEqual(page.updated_at, original_page_updated)
            self.assertEqual(first_module.updated_at, original_module_updated)
            self.assertEqual(len(self._snapshots(page.id)), 1)

        page_store.update_page(self.db, str(page.id), {"title": page.title}, actor_user_id=actor.id)
        assert_unchanged()
        page_store.update_section(
            self.db,
            str(first.id),
            {
                "sectionType": "row",
                "layout": "1",
                "sortIndex": 0,
                "settings": {},
            },
            actor_user_id=actor.id,
        )
        assert_unchanged()
        page_store.update_module(
            self.db,
            str(first_module.id),
            {
                "moduleType": "text",
                "columnIndex": 0,
                "sortIndex": 0,
                "config": {"content": "<p>First</p>"},
            },
            actor_user_id=actor.id,
        )
        assert_unchanged()
        page_store.move_module(
            self.db,
            str(first_module.id),
            str(first.id),
            0,
            0,
            actor_user_id=actor.id,
        )
        assert_unchanged()

        # The exact-order no-op requests use the complete current memberships.
        page_store.reorder_sections(
            self.db,
            str(page.id),
            [
                str(section.id)
                for section in sorted(page.sections, key=lambda item: item.sort_index)
            ],
            actor_user_id=actor.id,
        )
        assert_unchanged()
        page_store.reorder_modules(
            self.db,
            str(first.id),
            0,
            [str(first_module.id), str(second_module.id)],
            actor_user_id=actor.id,
        )
        assert_unchanged()
        page_store.save_module_placements(
            self.db,
            str(page.id),
            [
                {
                    "moduleId": str(module.id),
                    "sectionId": str(section.id),
                    "columnIndex": module.column_index,
                    "sortIndex": module.sort_index,
                }
                for section in page.sections
                for module in section.modules
            ],
            actor_user_id=actor.id,
        )
        assert_unchanged()
        page_store.reorder_scoped_pages(
            self.db,
            "series",
            "battle-bros",
            [str(page.id)],
            actor_user_id=actor.id,
        )
        assert_unchanged()
        page_store.update_page_bindings(self.db, "battle-bros", {}, actor_user_id=actor.id)

        assert_unchanged()

    def test_strict_reorders_and_page_local_moves_reject_without_history(self):
        self.seed_contract_series()
        page, first, second, first_module, second_module = self._make_page("strict")
        other, _, other_section, *_ = self._make_page("strict-other", sort_index=1)

        invalid_calls = [
            lambda: page_store.reorder_sections(self.db, str(page.id), [str(first.id)]),
            lambda: page_store.reorder_sections(
                self.db, str(page.id), [str(first.id), str(first.id)]
            ),
            lambda: page_store.reorder_modules(self.db, str(first.id), 0, [str(first_module.id)]),
            lambda: page_store.reorder_modules(
                self.db,
                str(first.id),
                0,
                [str(first_module.id), str(first_module.id)],
            ),
            lambda: page_store.move_module(
                self.db, str(second_module.id), str(other_section.id), 0, 0
            ),
        ]
        for call in invalid_calls:
            with self.subTest(call=call), self.assertRaises(ValueError):
                call()
        self.assertEqual(self._snapshots(page.id), [])
        self.assertEqual(self._snapshots(other.id), [])
        self.assertEqual(first_module.section_id, first.id)
        self.assertEqual(second_module.section_id, first.id)
        self.assertEqual(second.page_id, page.id)

    def test_commit_failure_rolls_back_mutation_snapshot_and_retention_pruning(self):
        self.seed_contract_series()
        page, *_ = self._make_page("rollback")
        for index in range(30):
            page.title = f"Retained {index}"
            capture_page_snapshot(self.db, page.id, PAGE_UPDATED)
        self.db.commit()
        retained_ids = {snapshot.id for snapshot in self._snapshots(page.id)}
        original_title = page.title

        with (
            patch.object(self.db, "commit", side_effect=RuntimeError("forced commit failure")),
            self.assertRaisesRegex(RuntimeError, "forced commit failure"),
        ):
            page_store.update_page(
                self.db,
                str(page.id),
                {"title": "Must roll back"},
            )

        self.db.expire_all()
        self.assertEqual(self.db.get(BuilderPage, page.id).title, original_title)
        self.assertEqual(
            {snapshot.id for snapshot in self._snapshots(page.id)},
            retained_ids,
        )

    def test_homepage_displacement_and_binding_union_snapshot_each_changed_page(self):
        self.seed_contract_series()
        actor = self.create_user(kind="admin", role="admin")
        old_home, *_ = self._make_page("old-home", homepage=True)
        new_home, *_ = self._make_page("new-home", sort_index=1)

        page_store.update_page(
            self.db, str(new_home.id), {"isHomepage": True}, actor_user_id=actor.id
        )
        self.assertFalse(self.db.get(BuilderPage, old_home.id).is_homepage)
        self.assertEqual(
            self._assert_latest(old_home.id, PAGE_UPDATED, actor.id).payload["page"]["isHomepage"],
            True,
        )
        self.assertEqual(
            self._assert_latest(new_home.id, PAGE_UPDATED, actor.id).payload["page"]["isHomepage"],
            False,
        )

        self.db.add(
            BuilderPageBinding(
                id=uuid4(),
                series_id="battle-bros",
                role="feed",
                page_id=old_home.id,
            )
        )
        self.db.commit()
        page_store.update_page_bindings(
            self.db,
            "battle-bros",
            {"feed": str(new_home.id)},
            actor_user_id=actor.id,
        )
        old_snapshot = self._assert_latest(old_home.id, BINDINGS_UPDATED, actor.id)
        new_snapshot = self._assert_latest(new_home.id, BINDINGS_UPDATED, actor.id)
        self.assertEqual(old_snapshot.payload["bindings"][0]["role"], "feed")
        self.assertEqual(new_snapshot.payload["bindings"], [])

    def test_global_homepage_creation_failure_rolls_back_displacement_and_history(self):
        old_home = page_store.create_scoped_page(
            self.db,
            "global",
            None,
            {"slug": "old-global-home", "title": "Old Global Home", "isHomepage": True},
        )
        old_id = UUID(old_home["id"])
        retained_ids = {snapshot.id for snapshot in self._snapshots(old_id)}

        with (
            patch.object(self.db, "commit", side_effect=RuntimeError("forced global commit")),
            self.assertRaisesRegex(RuntimeError, "forced global commit"),
        ):
            page_store.create_scoped_page(
                self.db,
                "global",
                None,
                {"slug": "new-global-home", "title": "New Global Home", "isHomepage": True},
            )

        self.db.expire_all()
        self.assertTrue(self.db.get(BuilderPage, old_id).is_homepage)
        self.assertIsNone(
            self.db.scalar(select(BuilderPage).where(BuilderPage.slug == "new-global-home"))
        )
        self.assertEqual(
            {snapshot.id for snapshot in self._snapshots(old_id)},
            retained_ids,
        )

    def test_current_restore_preserves_routing_and_supports_pre_restore_undo(self):
        self.seed_contract_series()
        actor = self.create_user(kind="admin", role="admin")
        page, first, _, first_module, _ = self._make_page(
            "restore-current", title="Original", published=True, homepage=True
        )
        original_section_id = first.id
        original_module_id = first_module.id
        selected = capture_page_snapshot(self.db, page.id, PAGE_CREATED, actor.id)
        self.db.commit()

        page.title = "Before restore"
        page.slug = "current-route"
        page.is_published = False
        page.is_homepage = False
        page.sort_index = 8
        first.settings = {"paddingTop": 20}
        first_module.config = {"content": "<p>Current</p>"}
        self.db.commit()

        restored_id = restore_page_snapshot(self.db, selected.id, actor.id)
        restored = page_store.get_page(self.db, str(restored_id))
        self.assertEqual(restored["title"], "Original")
        self.assertEqual(restored["slug"], "current-route")
        self.assertFalse(restored["isPublished"])
        self.assertFalse(restored["isHomepage"])
        self.assertEqual(restored["sortIndex"], 8)
        self.assertEqual(UUID(restored["sections"][0]["id"]), original_section_id)
        self.assertEqual(UUID(restored["sections"][0]["modules"][0]["id"]), original_module_id)

        pre_restore = self.db.scalar(
            select(BuilderPageSnapshot)
            .where(
                BuilderPageSnapshot.page_id == page.id,
                BuilderPageSnapshot.action == PRE_RESTORE,
            )
            .order_by(BuilderPageSnapshot.created_at.desc())
        )
        self.assertIsNotNone(pre_restore)
        restore_page_snapshot(self.db, pre_restore.id, actor.id)
        undone = page_store.get_page(self.db, str(page.id))
        self.assertEqual(undone["title"], "Before restore")
        self.assertEqual(
            undone["sections"][0]["modules"][0]["config"]["content"],
            "<p>Current</p>",
        )

    def test_current_restore_noop_and_validation_failures_are_atomic(self):
        self.seed_contract_series()
        page, first, _, first_module, _ = self._make_page("restore-validation")
        selected = capture_page_snapshot(self.db, page.id, PAGE_CREATED)
        self.db.commit()
        original_updated = page.updated_at

        restore_page_snapshot(self.db, selected.id, None)
        self.db.refresh(page)
        self.assertEqual(page.updated_at, original_updated)
        self.assertEqual(
            self.db.scalars(
                select(BuilderPageSnapshot).where(BuilderPageSnapshot.page_id == page.id)
            ).all(),
            [selected],
        )

        selected.payload_hash = "0" * 64
        self.db.commit()
        with self.assertRaises(BuilderSnapshotError) as raised:
            restore_page_snapshot(self.db, selected.id, None)
        self.assertEqual(raised.exception.code, "snapshot_validation_failed")
        self.assertEqual(first.settings, {})
        self.assertEqual(first_module.config["content"], "<p>First</p>")

        drifted_payload = deepcopy(selected.payload)
        drifted_payload["page"]["sections"][0]["modules"][0]["config"]["future"] = True
        selected.payload = drifted_payload
        selected.payload_hash = hash_recovery_payload(drifted_payload)
        self.db.commit()
        with self.assertRaises(BuilderSnapshotError) as raised:
            restore_page_snapshot(self.db, selected.id, None)
        self.assertEqual(raised.exception.code, "snapshot_incompatible")
        self.assertEqual(
            raised.exception.path,
            "page.sections[0].modules[0].config.future",
        )

    def test_current_restore_rejects_reader_binding_breakage_and_rolls_back_replacement(self):
        self.seed_contract_series()
        page, _, second, _, _ = self._make_page("reader-restore")
        selected = capture_page_snapshot(self.db, page.id, PAGE_CREATED)
        reader_module = BuilderModule(
            id=uuid4(),
            section=second,
            module_type="reader",
            column_index=0,
            sort_index=0,
            config={"source": {"mode": "active-page-series"}},
        )
        self.db.add(reader_module)
        self.db.add(
            BuilderPageBinding(
                id=uuid4(),
                series_id="battle-bros",
                role="reader",
                page_id=page.id,
            )
        )
        self.db.commit()

        with self.assertRaises(BuilderSnapshotError) as raised:
            restore_page_snapshot(self.db, selected.id, None)
        self.assertEqual(raised.exception.code, "snapshot_incompatible")
        self.assertEqual(raised.exception.path, "page.sections")
        self.assertIsNotNone(self.db.get(BuilderModule, reader_module.id))
        self.assertEqual(
            self.db.scalars(
                select(BuilderPageSnapshot).where(
                    BuilderPageSnapshot.page_id == page.id,
                    BuilderPageSnapshot.action == PRE_RESTORE,
                )
            ).all(),
            [],
        )

    def test_restore_commit_failure_rolls_back_graph_and_pre_restore_history(self):
        self.seed_contract_series()
        page, first, _, first_module, _ = self._make_page("restore-rollback")
        selected = capture_page_snapshot(self.db, page.id, PAGE_CREATED)
        self.db.commit()
        page.title = "Current title"
        first.settings = {"paddingTop": 33}
        first_module.config = {
            "content": "<p>Current graph</p>",
            "alignment": "left",
        }
        self.db.commit()

        with (
            patch.object(self.db, "commit", side_effect=RuntimeError("forced restore commit")),
            self.assertRaisesRegex(RuntimeError, "forced restore commit"),
        ):
            restore_page_snapshot(self.db, selected.id, None)

        self.db.expire_all()
        current = page_store.get_page(self.db, str(page.id))
        self.assertEqual(current["title"], "Current title")
        self.assertEqual(current["sections"][0]["settings"], {"paddingTop": 33})
        self.assertEqual(
            current["sections"][0]["modules"][0]["config"]["content"],
            "<p>Current graph</p>",
        )
        self.assertEqual(
            self.db.scalars(
                select(BuilderPageSnapshot).where(
                    BuilderPageSnapshot.page_id == page.id,
                    BuilderPageSnapshot.action == PRE_RESTORE,
                )
            ).all(),
            [],
        )

    def test_deleted_restore_flush_and_commit_failures_leave_page_deleted(self):
        self.seed_contract_series()
        page, *_ = self._make_page("deleted-rollback")
        selected = capture_page_snapshot(self.db, page.id, PAGE_CREATED)
        self.db.commit()
        self.assertTrue(page_store.delete_page(self.db, str(page.id)))

        with (
            patch.object(self.db, "flush", side_effect=RuntimeError("forced deleted flush")),
            self.assertRaisesRegex(RuntimeError, "forced deleted flush"),
        ):
            restore_page_snapshot(self.db, selected.id, None)
        self.assertIsNone(self.db.get(BuilderPage, page.id))

        with (
            patch.object(self.db, "commit", side_effect=RuntimeError("forced deleted commit")),
            self.assertRaisesRegex(RuntimeError, "forced deleted commit"),
        ):
            restore_page_snapshot(self.db, selected.id, None)
        self.assertIsNone(self.db.get(BuilderPage, page.id))

    def test_retention_pruning_failure_rolls_back_new_event_and_mutation(self):
        self.seed_contract_series()
        page, *_ = self._make_page("prune-rollback")
        for index in range(30):
            page.title = f"Retained {index}"
            capture_page_snapshot(self.db, page.id, PAGE_UPDATED)
        self.db.commit()
        retained_ids = {snapshot.id for snapshot in self._snapshots(page.id)}
        original_title = page.title

        with (
            patch.object(self.db, "execute", side_effect=RuntimeError("forced prune failure")),
            self.assertRaisesRegex(RuntimeError, "forced prune failure"),
        ):
            page_store.update_page(self.db, str(page.id), {"title": "Must not persist"})

        self.db.expire_all()
        self.assertEqual(self.db.get(BuilderPage, page.id).title, original_title)
        self.assertEqual(
            {snapshot.id for snapshot in self._snapshots(page.id)},
            retained_ids,
        )

    def test_deleted_restore_recreates_original_ids_as_appended_unbound_draft(self):
        self.seed_contract_series()
        actor = self.create_user(kind="admin", role="admin")
        existing, *_ = self._make_page("existing", sort_index=4)
        page, first, _, first_module, _ = self._make_page(
            "deleted", sort_index=1, published=True, homepage=True
        )
        self.db.add(
            BuilderPageBinding(
                id=uuid4(),
                series_id="battle-bros",
                role="feed",
                page_id=page.id,
            )
        )
        self.db.commit()
        selected = capture_page_snapshot(self.db, page.id, PAGE_CREATED, actor.id)
        self.db.commit()
        self.assertTrue(page_store.delete_page(self.db, str(page.id), actor_user_id=actor.id))

        candidates = list_deleted_page_candidates(self.db, "series", "battle-bros")
        self.assertEqual(candidates[0]["pageId"], str(page.id))
        restored_id = restore_page_snapshot(self.db, selected.id, actor.id)
        restored = page_store.get_page(self.db, str(restored_id))
        self.assertEqual(restored["id"], str(page.id))
        self.assertEqual(restored["sections"][0]["id"], str(first.id))
        self.assertEqual(restored["sections"][0]["modules"][0]["id"], str(first_module.id))
        self.assertFalse(restored["isPublished"])
        self.assertFalse(restored["isHomepage"])
        self.assertGreater(restored["sortIndex"], existing.sort_index)
        self.assertEqual(
            self.db.scalars(
                select(BuilderPageBinding).where(BuilderPageBinding.page_id == restored_id)
            ).all(),
            [],
        )
        self.assertEqual(
            self.db.scalars(
                select(BuilderPageSnapshot).where(
                    BuilderPageSnapshot.page_id == restored_id,
                    BuilderPageSnapshot.action == PRE_RESTORE,
                )
            ).all(),
            [],
        )

    def test_deleted_global_page_restore_keeps_global_scope(self):
        created = page_store.create_scoped_page(
            self.db,
            "global",
            None,
            {
                "slug": "global-recovery",
                "title": "Global Recovery",
                "isPublished": True,
                "isHomepage": True,
            },
        )
        section = page_store.add_section(
            self.db,
            created["id"],
            {"layout": "1"},
        )
        module = page_store.add_module(
            self.db,
            section["id"],
            {"moduleType": "text", "config": {"content": "<p>Global</p>"}},
        )
        page_id = UUID(created["id"])
        section_id = UUID(section["id"])
        module_id = UUID(module["id"])
        page_store.delete_page(self.db, created["id"])
        selected = self._snapshots(page_id)[-1]

        candidates = list_deleted_page_candidates(self.db, "global", None)
        self.assertEqual(candidates[0]["scope"], "global")
        restore_page_snapshot(self.db, selected.id, None)
        restored = page_store.get_page(self.db, str(page_id))
        self.assertEqual(restored["scope"], "global")
        self.assertIsNone(restored["seriesId"])
        self.assertEqual(UUID(restored["sections"][0]["id"]), section_id)
        self.assertEqual(UUID(restored["sections"][0]["modules"][0]["id"]), module_id)
        self.assertFalse(restored["isPublished"])
        self.assertFalse(restored["isHomepage"])

    def test_deleted_restore_reports_series_slug_and_identity_conflicts(self):
        self.seed_contract_series()
        page, first, _, _, _ = self._make_page("conflicts")
        selected = capture_page_snapshot(self.db, page.id, PAGE_CREATED)
        self.db.commit()
        page_store.delete_page(self.db, str(page.id))

        conflict, *_ = self._make_page("conflicts")
        with self.assertRaises(BuilderSnapshotError) as raised:
            restore_page_snapshot(self.db, selected.id, None)
        self.assertEqual(raised.exception.code, "snapshot_slug_conflict")
        page_store.delete_page(self.db, str(conflict.id))

        identity_page, identity_section, *_ = self._make_page("identity")
        identity_section.id = first.id
        self.db.commit()
        with self.assertRaises(BuilderSnapshotError) as raised:
            restore_page_snapshot(self.db, selected.id, None)
        self.assertEqual(raised.exception.code, "snapshot_identity_conflict")
        self.assertIsNotNone(identity_page)

    def test_deleted_restore_reports_missing_series_and_supports_repeated_recovery(self):
        self.seed_contract_series()
        page, *_ = self._make_page("repeat-recovery")
        selected = capture_page_snapshot(self.db, page.id, PAGE_CREATED)
        self.db.commit()
        page_store.delete_page(self.db, str(page.id))
        series = self.db.get(Series, "battle-bros")
        self.assertIsNotNone(series)

        self.db.delete(series)
        self.db.commit()
        with self.assertRaises(BuilderSnapshotError) as raised:
            restore_page_snapshot(self.db, selected.id, None)
        self.assertEqual(raised.exception.code, "snapshot_series_missing")

        self.seed_contract_series()
        restore_page_snapshot(self.db, selected.id, None)
        page_store.delete_page(self.db, str(page.id))
        latest = self._snapshots(page.id)[-1]
        restore_page_snapshot(self.db, latest.id, None)
        recovered = page_store.get_page(self.db, str(page.id))
        self.assertIsNotNone(recovered)
        self.assertFalse(recovered["isPublished"])

    def test_strict_typed_validation_round_trips_and_reports_exact_paths(self):
        self.seed_contract_series()
        page, *_ = self._make_page("typed-validation")
        snapshot = capture_page_snapshot(self.db, page.id, PAGE_CREATED)
        self.db.commit()
        original_payload = deepcopy(snapshot.payload)
        original_slug = snapshot.slug

        recovery = validate_snapshot_payload(snapshot)
        self.assertIsInstance(recovery, RecoveryDocument)
        self.assertIsInstance(recovery.page.id, UUID)
        self.assertIsInstance(recovery.page.sections, tuple)
        self.assertIsInstance(recovery.page.sections[0].modules, tuple)
        self.assertEqual(recovery.to_document(), original_payload)
        with self.assertRaises(TypeError):
            recovery.page.meta["forbidden"] = True

        cases = [
            (
                lambda payload: payload["page"].__setitem__("isPublished", 1),
                "snapshot_validation_failed",
                "page.isPublished",
            ),
            (
                lambda payload: payload["page"].__setitem__("sortIndex", True),
                "snapshot_validation_failed",
                "page.sortIndex",
            ),
            (
                lambda payload: payload["page"].__setitem__(
                    "id", "{" + payload["page"]["id"] + "}"
                ),
                "snapshot_validation_failed",
                "page.id",
            ),
            (
                lambda payload: payload["page"]["sections"][0]["modules"][0].__setitem__(
                    "moduleType", "retired-widget"
                ),
                "snapshot_incompatible",
                "page.sections[0].modules[0].moduleType",
            ),
        ]
        for mutate, code, path in cases:
            with self.subTest(path=path):
                payload = deepcopy(original_payload)
                mutate(payload)
                snapshot.payload = payload
                snapshot.payload_hash = hash_recovery_payload(payload)
                snapshot.payload_version = 1
                snapshot.slug = original_slug
                self.db.commit()
                with self.assertRaises(BuilderSnapshotError) as raised:
                    validate_snapshot_payload(snapshot)
                self.assertEqual(raised.exception.code, code)
                self.assertEqual(raised.exception.path, path)

        snapshot.payload = deepcopy(original_payload)
        snapshot.payload_hash = hash_recovery_payload(original_payload)
        snapshot.payload_version = 1
        snapshot.slug = "copied-metadata-mismatch"
        self.db.commit()
        with self.assertRaises(BuilderSnapshotError) as raised:
            validate_snapshot_payload(snapshot)
        self.assertEqual(raised.exception.code, "snapshot_validation_failed")
        self.assertEqual(raised.exception.path, "page.slug")

        payload = deepcopy(original_payload)
        payload["snapshotVersion"] = 2
        snapshot.payload = payload
        snapshot.payload_hash = hash_recovery_payload(payload)
        snapshot.payload_version = 2
        snapshot.slug = original_slug
        self.db.commit()
        with self.assertRaises(BuilderSnapshotError) as raised:
            validate_snapshot_payload(snapshot)
        self.assertEqual(raised.exception.code, "snapshot_incompatible")
        self.assertEqual(raised.exception.path, "snapshotVersion")

    def test_live_graph_serialization_failure_is_structured_for_restore_and_route(self):
        self.seed_contract_series()
        admin = self.create_user(kind="admin", role="admin")
        page, *_ = self._make_page("live-incompatible")
        snapshot = capture_page_snapshot(self.db, page.id, PAGE_CREATED)
        self.db.commit()
        page.title = "Changed"
        self.db.commit()
        failure = RecoverySerializationError(
            "bad live sort index",
            path="page.sortIndex",
        )

        with patch.object(
            builder_history,
            "serialize_builder_page_recovery",
            side_effect=failure,
        ):
            with self.assertRaises(BuilderSnapshotError) as raised:
                restore_page_snapshot(self.db, snapshot.id, admin.id)
        self.assertEqual(raised.exception.code, "current_page_incompatible")
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(raised.exception.path, "page.sortIndex")

        with patch.object(
            builder_history,
            "serialize_builder_page_recovery",
            side_effect=failure,
        ):
            response = asyncio.run(
                page_builder.api_restore_page_snapshot(
                    str(snapshot.id),
                    self._request_with_body(
                        f"/api/admin/page-snapshots/{snapshot.id}/restore",
                        cookie=self.auth_cookie(admin),
                    ),
                    self.db,
                )
            )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(
            json_body(response),
            {
                "error": "Current page cannot be serialized safely",
                "code": "current_page_incompatible",
                "path": "page.sortIndex",
            },
        )

    def test_mutation_routes_propagate_actor_and_reject_before_service_invocation(self):
        self.seed_contract_series()
        admin = self.create_user(kind="admin", role="admin")
        user = self.create_user(kind="user", role="user")
        cookie = self.auth_cookie(admin)
        page_id = str(uuid4())
        section_id = str(uuid4())
        module_id = str(uuid4())

        returns = {
            "update_page": {"id": page_id},
            "delete_page": True,
            "reorder_scoped_pages": True,
            "update_page_bindings": {},
            "add_section": {"id": section_id},
            "update_section": {"id": section_id},
            "delete_section": True,
            "reorder_sections": True,
            "add_module": {"id": module_id},
            "update_module": {"id": module_id},
            "delete_module": True,
            "move_module": {"id": module_id},
            "reorder_modules": True,
            "save_module_placements": {"id": page_id},
        }
        with ExitStack() as stack:
            services = {
                name: stack.enter_context(patch.object(page_builder, name, return_value=result))
                for name, result in returns.items()
            }
            page_builder.api_update_page(
                page_id,
                page_builder.UpdatePageRequest(title="Changed"),
                build_request(f"/api/admin/pages/{page_id}", method="PUT", cookie=cookie),
                self.db,
            )
            page_builder.api_delete_page(
                page_id,
                build_request(f"/api/admin/pages/{page_id}", method="DELETE", cookie=cookie),
                self.db,
            )
            page_builder.api_reorder_series_pages(
                "battle-bros",
                page_builder.ReorderPagesRequest(pageIds=[page_id]),
                build_request(
                    "/api/admin/pages/series/battle-bros/reorder",
                    method="POST",
                    cookie=cookie,
                ),
                self.db,
            )
            page_builder.api_update_page_bindings(
                "battle-bros",
                page_builder.PageBindingsRequest(bindings={"feed": page_id}),
                build_request("/api/admin/page-bindings/battle-bros", method="PUT", cookie=cookie),
                self.db,
            )
            page_builder.api_add_section(
                page_id,
                page_builder.CreateSectionRequest(layout="1"),
                build_request(f"/api/admin/pages/{page_id}/sections", method="POST", cookie=cookie),
                self.db,
            )
            page_builder.api_update_section(
                section_id,
                page_builder.UpdateSectionRequest(layout="1"),
                build_request(f"/api/admin/sections/{section_id}", method="PUT", cookie=cookie),
                self.db,
            )
            page_builder.api_delete_section(
                section_id,
                build_request(f"/api/admin/sections/{section_id}", method="DELETE", cookie=cookie),
                self.db,
            )
            page_builder.api_reorder_sections(
                page_id,
                page_builder.ReorderSectionsRequest(sectionIds=[section_id]),
                build_request(
                    f"/api/admin/pages/{page_id}/sections/reorder",
                    method="POST",
                    cookie=cookie,
                ),
                self.db,
            )
            page_builder.api_add_module(
                section_id,
                page_builder.CreateModuleRequest(moduleType="text"),
                build_request(
                    f"/api/admin/sections/{section_id}/modules",
                    method="POST",
                    cookie=cookie,
                ),
                self.db,
            )
            page_builder.api_update_module(
                module_id,
                page_builder.UpdateModuleRequest(config={}),
                build_request(f"/api/admin/modules/{module_id}", method="PUT", cookie=cookie),
                self.db,
            )
            page_builder.api_delete_module(
                module_id,
                build_request(f"/api/admin/modules/{module_id}", method="DELETE", cookie=cookie),
                self.db,
            )
            page_builder.api_move_module(
                module_id,
                page_builder.MoveModuleRequest(
                    targetSectionId=section_id,
                    columnIndex=0,
                    sortIndex=0,
                ),
                build_request(f"/api/admin/modules/{module_id}/move", method="POST", cookie=cookie),
                self.db,
            )
            page_builder.api_reorder_modules(
                section_id,
                page_builder.ReorderModulesRequest(columnIndex=0, moduleIds=[module_id]),
                build_request(
                    f"/api/admin/sections/{section_id}/modules/reorder",
                    method="POST",
                    cookie=cookie,
                ),
                self.db,
            )
            page_builder.api_save_module_placements(
                page_id,
                page_builder.SaveModulePlacementsRequest(
                    placements=[
                        page_builder.ModulePlacementRequest(
                            moduleId=module_id,
                            sectionId=section_id,
                            columnIndex=0,
                            sortIndex=0,
                        )
                    ]
                ),
                build_request(
                    f"/api/admin/pages/{page_id}/modules/placements",
                    method="POST",
                    cookie=cookie,
                ),
                self.db,
            )

            for service in services.values():
                self.assertEqual(service.call_args.kwargs["actor_user_id"], admin.id)

            guarded_calls = [
                lambda request: page_builder.api_update_page(
                    page_id,
                    page_builder.UpdatePageRequest(title="Blocked"),
                    request,
                    self.db,
                ),
                lambda request: page_builder.api_update_page_bindings(
                    "battle-bros",
                    page_builder.PageBindingsRequest(bindings={}),
                    request,
                    self.db,
                ),
                lambda request: page_builder.api_add_section(
                    page_id,
                    page_builder.CreateSectionRequest(layout="1"),
                    request,
                    self.db,
                ),
                lambda request: page_builder.api_update_module(
                    module_id,
                    page_builder.UpdateModuleRequest(config={}),
                    request,
                    self.db,
                ),
            ]
            guarded_services = [
                services["update_page"],
                services["update_page_bindings"],
                services["add_section"],
                services["update_module"],
            ]
            for guarded_call, service in zip(guarded_calls, guarded_services, strict=True):
                expected_calls = service.call_count
                for request in (
                    build_request("/api/admin/blocked", method="POST"),
                    build_request(
                        "/api/admin/blocked",
                        method="POST",
                        cookie=self.auth_cookie(user),
                    ),
                ):
                    response = guarded_call(request)
                    self.assertEqual(response.status_code, 403)
                self.assertEqual(service.call_count, expected_calls)

    def test_admin_snapshot_api_shapes_access_headers_and_body_rejection(self):
        self.seed_contract_series()
        admin = self.create_user(
            kind="admin",
            role="admin",
            email="snapshot-admin@example.com",
            display_name="Snapshot Admin",
        )
        page, *_ = self._make_page("api-history")
        snapshot = capture_page_snapshot(self.db, page.id, PAGE_CREATED, admin.id)
        self.db.commit()
        cookie = self.auth_cookie(admin)

        summary_response = page_builder.api_list_page_snapshots(
            str(page.id),
            build_request(
                f"/api/admin/pages/{page.id}/snapshots",
                cookie=cookie,
            ),
            self.db,
        )
        self.assertEqual(summary_response.status_code, 200)
        self.assertEqual(summary_response.headers["cache-control"], "no-store")
        summary = json_body(summary_response)["snapshots"][0]
        self.assertEqual(
            set(summary),
            {
                "id",
                "pageId",
                "scope",
                "seriesId",
                "slug",
                "action",
                "createdAt",
                "createdByDisplayName",
            },
        )
        self.assertEqual(summary["createdByDisplayName"], "Snapshot Admin")

        detail_response = page_builder.api_get_page_snapshot(
            str(snapshot.id),
            build_request(
                f"/api/admin/page-snapshots/{snapshot.id}",
                cookie=cookie,
            ),
            self.db,
        )
        self.assertEqual(detail_response.status_code, 200)
        detail = json_body(detail_response)["snapshot"]
        self.assertIn("payload", detail)
        self.assertNotIn("payloadHash", detail)
        self.assertNotIn("email", detail)

        page.title = "Changed before API restore"
        self.db.commit()
        restore_response = asyncio.run(
            page_builder.api_restore_page_snapshot(
                str(snapshot.id),
                self._request_with_body(
                    f"/api/admin/page-snapshots/{snapshot.id}/restore",
                    cookie=cookie,
                ),
                self.db,
            ),
        )
        self.assertEqual(restore_response.status_code, 200)
        self.assertEqual(restore_response.headers["cache-control"], "no-store")
        restored_body = json_body(restore_response)
        self.assertEqual(set(restored_body), {"page"})
        self.assertEqual(restored_body["page"]["title"], "Api-History")

        body_response = asyncio.run(
            page_builder.api_restore_page_snapshot(
                str(snapshot.id),
                self._request_with_body(
                    f"/api/admin/page-snapshots/{snapshot.id}/restore",
                    cookie=cookie,
                    body=b'{"page":{"title":"client controlled"}}',
                ),
                self.db,
            ),
        )
        self.assertEqual(body_response.status_code, 400)
        self.assertEqual(body_response.headers["cache-control"], "no-store")
        self.assertEqual(json_body(body_response)["code"], "snapshot_validation_failed")

        missing_id = uuid4()
        missing_response = page_builder.api_get_page_snapshot(
            str(missing_id),
            build_request(
                f"/api/admin/page-snapshots/{missing_id}",
                cookie=cookie,
            ),
            self.db,
        )
        self.assertEqual(missing_response.status_code, 404)
        self.assertEqual(missing_response.headers["cache-control"], "no-store")
        self.assertEqual(json_body(missing_response)["code"], "snapshot_not_found")

        deleted_route = page_builder.api_list_deleted_page_snapshots(
            build_request(
                "/api/admin/page-snapshots/deleted?scope=series&series_id=battle-bros",
                cookie=cookie,
            ),
            "series",
            "battle-bros",
            self.db,
        )
        self.assertEqual(deleted_route.status_code, 200)
        self.assertEqual(json_body(deleted_route), {"pages": []})

        anonymous = page_builder.api_get_page_snapshot(
            str(snapshot.id),
            build_request(f"/api/admin/page-snapshots/{snapshot.id}"),
            self.db,
        )
        self.assertEqual(anonymous.status_code, 403)
        self.assertEqual(anonymous.headers["cache-control"], "no-store")
        self.assertEqual(json_body(anonymous)["code"], "admin_access_required")
        anonymous_missing = page_builder.api_get_page_snapshot(
            str(uuid4()),
            build_request("/api/admin/page-snapshots/missing"),
            self.db,
        )
        self.assertEqual(json_body(anonymous_missing), json_body(anonymous))

        user = self.create_user(kind="user", role="user")
        non_admin = page_builder.api_get_page_snapshot(
            str(snapshot.id),
            build_request(
                f"/api/admin/page-snapshots/{snapshot.id}",
                cookie=self.auth_cookie(user),
            ),
            self.db,
        )
        self.assertEqual(non_admin.status_code, 403)
        self.assertEqual(json_body(non_admin)["code"], "admin_access_required")

        invalid_filter = page_builder.api_list_deleted_page_snapshots(
            build_request(
                "/api/admin/page-snapshots/deleted?scope=global&series_id=battle-bros",
                cookie=cookie,
            ),
            "global",
            "battle-bros",
            self.db,
        )
        self.assertEqual(invalid_filter.status_code, 400)
        self.assertEqual(json_body(invalid_filter)["code"], "invalid_snapshot_filter")
        self.assertEqual(invalid_filter.headers["cache-control"], "no-store")

        routes = [route.path for route in page_builder.router.routes]
        self.assertLess(
            routes.index("/api/admin/page-snapshots/deleted"),
            routes.index("/api/admin/page-snapshots/{snapshot_id}"),
        )

    def test_snapshot_detail_never_returns_unvalidated_payload(self):
        self.seed_contract_series()
        page, *_ = self._make_page("detail-validation")
        snapshot = capture_page_snapshot(self.db, page.id, PAGE_CREATED)
        self.db.commit()
        self.assertEqual(get_snapshot_detail(self.db, snapshot.id)["payload"]["snapshotVersion"], 1)

        snapshot.payload_version = 2
        self.db.commit()
        with self.assertRaises(BuilderSnapshotError) as raised:
            get_snapshot_detail(self.db, snapshot.id)
        self.assertEqual(raised.exception.code, "snapshot_incompatible")
