from __future__ import annotations

import importlib
import os
from unittest.mock import patch
from uuid import UUID, uuid4

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, select
from sqlalchemy.orm import Session

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-route-tests.db")

from backend.app import migrate_page_config, page_store
from backend.app.builder_history import (
    PAGE_CREATED,
    PAGE_UPDATED,
    SNAPSHOT_RETENTION,
    capture_page_snapshot,
    hash_recovery_payload,
    serialize_builder_page_recovery,
)
from backend.app.models import (
    BuilderModule,
    BuilderPage,
    BuilderPageBinding,
    BuilderPageSnapshot,
    BuilderSection,
)
from backend.app.routes import admin, page_builder
from backend.tests.helpers import BackendRouteTestCase, build_request


class BuilderSnapshotMigrationTests(BackendRouteTestCase):
    def test_revision_upgrade_and_downgrade_contract(self):
        migration = importlib.import_module("backend.alembic.versions.0018_builder_page_snapshots")
        engine = create_engine("sqlite://")
        with engine.begin() as connection:
            connection.exec_driver_sql("CREATE TABLE users (id UUID PRIMARY KEY)")
            operations = Operations(MigrationContext.configure(connection))
            with patch.object(migration, "op", operations):
                migration.upgrade()

                inspector = inspect(connection)
                self.assertIn("builder_page_snapshots", inspector.get_table_names())
                columns = {
                    column["name"]: column
                    for column in inspector.get_columns("builder_page_snapshots")
                }
                self.assertEqual(
                    set(columns),
                    {
                        "id",
                        "page_id",
                        "scope",
                        "series_id",
                        "slug",
                        "action",
                        "created_by_user_id",
                        "payload_version",
                        "payload",
                        "payload_hash",
                        "created_at",
                    },
                )
                self.assertFalse(columns["page_id"]["nullable"])
                self.assertTrue(columns["created_by_user_id"]["nullable"])

                checks = {
                    check["name"]
                    for check in inspector.get_check_constraints("builder_page_snapshots")
                }
                self.assertEqual(
                    checks,
                    {
                        "ck_builder_page_snapshots_payload_version",
                        "ck_builder_page_snapshots_scope",
                        "ck_builder_page_snapshots_scope_series_id",
                    },
                )
                indexes = {
                    index["name"] for index in inspector.get_indexes("builder_page_snapshots")
                }
                self.assertEqual(
                    indexes,
                    {
                        "ix_builder_page_snapshots_created_at",
                        "ix_builder_page_snapshots_page_created_at",
                        "ix_builder_page_snapshots_scope_series_created_at",
                    },
                )
                foreign_keys = inspector.get_foreign_keys("builder_page_snapshots")
                self.assertEqual(len(foreign_keys), 1)
                self.assertEqual(foreign_keys[0]["referred_table"], "users")
                self.assertEqual(foreign_keys[0]["options"].get("ondelete"), "SET NULL")

                migration.downgrade()
                self.assertNotIn("builder_page_snapshots", inspect(connection).get_table_names())
        engine.dispose()


class BuilderHistoryTests(BackendRouteTestCase):
    def _legacy_page_config(self) -> dict:
        return {
            "content": {
                "header": {
                    "title": "Migrated Reader",
                    "subtitle": "Legacy subtitle",
                    "subtitles": ["Legacy subtitle", "Second subtitle"],
                },
                "leftPanel": {
                    "topText": "Left top",
                    "image": "/media/left.png",
                    "bottomText": "<p>Left bottom</p>",
                },
                "rightPanel": {
                    "image": "/media/right.png",
                    "buttons": [{"label": "Community", "url": "https://example.com/community"}],
                },
            },
            "layout": {
                "leftPanel": {"enabled": True, "order": 1},
                "viewport": {"order": 2},
                "rightPanel": {"enabled": True, "order": 3},
            },
        }

    def _create_nested_page(self) -> tuple[BuilderPage, BuilderSection, BuilderModule]:
        self.seed_contract_series()
        page = BuilderPage(
            id=uuid4(),
            scope="series",
            series_id="battle-bros",
            slug="history",
            title="History",
            page_type="custom",
            is_published=True,
            is_homepage=False,
            sort_index=4,
            meta={"theme": {"contentWidth": 5000}},
        )
        later_section = BuilderSection(
            id=uuid4(),
            page=page,
            section_type="row",
            layout="1",
            sort_index=2,
            settings={},
        )
        first_section = BuilderSection(
            id=uuid4(),
            page=page,
            section_type="row",
            layout="1-1",
            sort_index=1,
            settings={"columns": [{"index": 0, "padding": {"top": 999}}, {}]},
        )
        BuilderModule(
            id=uuid4(),
            section=later_section,
            module_type="text",
            column_index=0,
            sort_index=0,
            config={"content": "<script>bad()</script><p>Later</p>"},
        )
        first_module = BuilderModule(
            id=uuid4(),
            section=first_section,
            module_type="text",
            column_index=1,
            sort_index=3,
            config={"content": "<p>First</p>"},
        )
        page.bindings.append(
            BuilderPageBinding(id=uuid4(), series_id="battle-bros", role="feed", page_id=page.id)
        )
        self.db.add(page)
        self.db.commit()
        return page, first_section, first_module

    def test_recovery_shape_is_sanitized_stable_and_deterministic(self):
        page, first_section, first_module = self._create_nested_page()
        payload = serialize_builder_page_recovery(self.db, page)

        self.assertEqual(payload["snapshotVersion"], 1)
        self.assertEqual(list(payload), ["snapshotVersion", "page", "bindings"])
        self.assertEqual(payload["page"]["id"], str(page.id))
        self.assertEqual(payload["page"]["scope"], "series")
        self.assertEqual(payload["page"]["seriesId"], "battle-bros")
        self.assertNotIn("createdAt", payload["page"])
        self.assertNotIn("updatedAt", payload["page"])
        self.assertEqual([section["sortIndex"] for section in payload["page"]["sections"]], [1, 2])
        stored_first = payload["page"]["sections"][0]
        self.assertEqual(stored_first["id"], str(first_section.id))
        self.assertEqual(stored_first["modules"][0]["id"], str(first_module.id))
        self.assertEqual(stored_first["settings"]["columns"][0]["padding"]["top"], 600)
        self.assertNotIn(
            "script", payload["page"]["sections"][1]["modules"][0]["config"]["content"]
        )
        self.assertEqual(payload["bindings"], [{"seriesId": "battle-bros", "role": "feed"}])

        original_hash = hash_recovery_payload(payload)
        reordered = {"bindings": payload["bindings"], "page": payload["page"], "snapshotVersion": 1}
        self.assertEqual(hash_recovery_payload(reordered), original_hash)
        page.updated_at = page.created_at
        first_module.updated_at = first_module.created_at
        self.assertEqual(
            hash_recovery_payload(serialize_builder_page_recovery(self.db, page)), original_hash
        )

    def test_action_validation_deduplication_and_retention(self):
        page, _, _ = self._create_nested_page()
        first = capture_page_snapshot(self.db, page.id, PAGE_CREATED)
        self.assertIsNotNone(first)
        self.assertIsNone(capture_page_snapshot(self.db, page.id, PAGE_UPDATED))
        with self.assertRaisesRegex(ValueError, "Unsupported builder snapshot action"):
            capture_page_snapshot(self.db, page.id, "client_supplied_action")

        for index in range(SNAPSHOT_RETENTION + 5):
            page.title = f"History {index}"
            capture_page_snapshot(self.db, page.id, PAGE_UPDATED)
        self.db.flush()

        snapshots = self.db.scalars(
            select(BuilderPageSnapshot)
            .where(BuilderPageSnapshot.page_id == page.id)
            .order_by(BuilderPageSnapshot.created_at.desc())
        ).all()
        self.assertEqual(len(snapshots), SNAPSHOT_RETENTION)
        self.assertEqual(snapshots[0].payload["page"]["title"], "History 34")

    def test_legacy_conversion_captures_complete_actorless_baseline_that_survives_delete(self):
        self.seed_contract_series()
        page = migrate_page_config.migrate_page_config_to_builder(
            self.db, "battle-bros", self._legacy_page_config()
        )
        self.assertIsNotNone(page)

        snapshots = self.db.scalars(select(BuilderPageSnapshot)).all()
        self.assertEqual(len(snapshots), 1)
        [snapshot] = snapshots
        self.assertEqual(snapshot.page_id, page.id)
        self.assertEqual(snapshot.scope, "series")
        self.assertEqual(snapshot.series_id, "battle-bros")
        self.assertEqual(snapshot.action, PAGE_CREATED)
        self.assertIsNone(snapshot.created_by_user_id)

        payload_sections = snapshot.payload["page"]["sections"]
        self.assertEqual([section["sortIndex"] for section in payload_sections], [0, 1])
        self.assertEqual(
            [module["moduleType"] for module in payload_sections[0]["modules"]],
            ["header"],
        )
        self.assertEqual(
            [module["moduleType"] for module in payload_sections[1]["modules"]],
            ["text", "image", "html", "reader", "image", "social"],
        )

        self.db.commit()
        page_id = page.id
        self.assertTrue(page_store.delete_page(self.db, str(page_id)))
        surviving = self.db.scalar(
            select(BuilderPageSnapshot).where(BuilderPageSnapshot.page_id == page_id)
        )
        self.assertIsNotNone(surviving)

    def test_legacy_migration_failure_rolls_back_page_graph_and_snapshot(self):
        self.seed_contract_series()
        self.seed_page_config()
        real_capture = migrate_page_config.capture_page_snapshot

        def capture_then_fail(*args, **kwargs):
            real_capture(*args, **kwargs)
            raise RuntimeError("forced legacy snapshot failure")

        with (
            patch.object(migrate_page_config, "SessionLocal", return_value=self.db),
            patch.object(
                migrate_page_config,
                "capture_page_snapshot",
                side_effect=capture_then_fail,
            ),
            self.assertRaisesRegex(RuntimeError, "forced legacy snapshot failure"),
        ):
            migrate_page_config.run_migration()

        with Session(self.engine) as verification_db:
            self.assertEqual(verification_db.scalars(select(BuilderPage)).all(), [])
            self.assertEqual(verification_db.scalars(select(BuilderSection)).all(), [])
            self.assertEqual(verification_db.scalars(select(BuilderModule)).all(), [])
            self.assertEqual(verification_db.scalars(select(BuilderPageSnapshot)).all(), [])

    def test_legacy_conversion_skip_does_not_add_history(self):
        self.seed_contract_series()
        existing = BuilderPage(
            id=uuid4(),
            scope="series",
            series_id="battle-bros",
            slug="reader",
            title="Existing Reader",
            page_type="reader",
            is_published=True,
            is_homepage=True,
            sort_index=0,
            meta={},
        )
        self.db.add(existing)
        self.db.commit()

        migrated = migrate_page_config.migrate_page_config_to_builder(
            self.db, "battle-bros", self._legacy_page_config()
        )

        self.assertIsNone(migrated)
        self.assertEqual(self.db.scalars(select(BuilderPageSnapshot)).all(), [])
        self.assertEqual(len(self.db.scalars(select(BuilderPage)).all()), 1)

    def test_page_snapshot_survives_page_delete_and_actor_cleanup(self):
        self.seed_contract_series()
        deleting_admin = self.create_user(
            kind="admin", role="admin", email="history-admin@example.com"
        )
        executor = self.create_user(kind="user", role="admin", email="executor-admin@example.com")
        created = page_store.create_scoped_page(
            self.db,
            "series",
            "battle-bros",
            {"slug": "survives", "title": "Survives"},
            actor_user_id=deleting_admin.id,
        )
        page_id = UUID(created["id"])

        self.assertTrue(page_store.delete_page(self.db, str(page_id)))
        snapshot = self.db.scalar(
            select(BuilderPageSnapshot).where(BuilderPageSnapshot.page_id == page_id)
        )
        self.assertIsNotNone(snapshot)
        self.assertEqual(snapshot.created_by_user_id, deleting_admin.id)

        response = admin.admin_delete_user(
            str(deleting_admin.id),
            build_request(
                f"/api/admin/users/{deleting_admin.id}",
                method="DELETE",
                cookie=self.auth_cookie(executor),
            ),
            self.db,
        )
        self.assertEqual(response, {"status": "ok"})
        self.db.refresh(snapshot)
        self.assertIsNone(snapshot.created_by_user_id)

    def test_failed_create_transaction_can_roll_back_page_and_snapshot(self):
        self.seed_contract_series()
        real_capture = page_store.capture_page_snapshot

        def capture_then_fail(*args, **kwargs):
            real_capture(*args, **kwargs)
            raise RuntimeError("forced failure after snapshot flush")

        with patch.object(page_store, "capture_page_snapshot", side_effect=capture_then_fail):
            with self.assertRaisesRegex(RuntimeError, "forced failure"):
                page_store.create_scoped_page(
                    self.db,
                    "series",
                    "battle-bros",
                    {"slug": "rolled-back", "title": "Rolled Back"},
                )
        self.db.rollback()

        self.assertIsNone(
            self.db.scalar(select(BuilderPage).where(BuilderPage.slug == "rolled-back"))
        )
        self.assertEqual(self.db.scalars(select(BuilderPageSnapshot)).all(), [])

    def test_creation_routes_attribute_actor_without_changing_response_shape(self):
        self.seed_contract_series()
        admin_user = self.create_user(kind="admin", role="admin")
        request = build_request(
            "/api/admin/pages/series/battle-bros",
            method="POST",
            cookie=self.auth_cookie(admin_user),
        )
        response = page_builder.api_create_series_page(
            "battle-bros",
            page_builder.CreatePageRequest(slug="route-history", title="Route History"),
            request,
            self.db,
        )

        self.assertEqual(set(response), {"page"})
        snapshot = self.db.scalar(
            select(BuilderPageSnapshot).where(
                BuilderPageSnapshot.page_id == UUID(response["page"]["id"])
            )
        )
        self.assertIsNotNone(snapshot)
        self.assertEqual(snapshot.action, PAGE_CREATED)
        self.assertEqual(snapshot.created_by_user_id, admin_user.id)

        global_response = page_builder.api_create_global_page(
            page_builder.CreatePageRequest(slug="global-history", title="Global History"),
            build_request(
                "/api/admin/pages/global",
                method="POST",
                cookie=self.auth_cookie(admin_user),
            ),
            self.db,
        )
        self.assertEqual(set(global_response), {"page"})
        global_snapshot = self.db.scalar(
            select(BuilderPageSnapshot).where(
                BuilderPageSnapshot.page_id == UUID(global_response["page"]["id"])
            )
        )
        self.assertIsNotNone(global_snapshot)
        self.assertEqual(global_snapshot.scope, "global")
        self.assertIsNone(global_snapshot.series_id)
        self.assertEqual(global_snapshot.created_by_user_id, admin_user.id)

        snapshot_count = len(self.db.scalars(select(BuilderPageSnapshot)).all())
        duplicate = page_builder.api_create_series_page(
            "battle-bros",
            page_builder.CreatePageRequest(slug="route-history", title="Duplicate"),
            request,
            self.db,
        )
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(len(self.db.scalars(select(BuilderPageSnapshot)).all()), snapshot_count)

        unauthorized = page_builder.api_create_global_page(
            page_builder.CreatePageRequest(slug="denied", title="Denied"),
            build_request("/api/admin/pages/global", method="POST"),
            self.db,
        )
        self.assertEqual(unauthorized.status_code, 403)
        self.assertIsNone(self.db.scalar(select(BuilderPage).where(BuilderPage.slug == "denied")))
