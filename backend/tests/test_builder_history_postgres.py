from __future__ import annotations

import os
import queue
import threading
import time
import unittest
from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-route-tests.db")

from backend.app import page_store
from backend.app.builder_history import (
    PAGE_CREATED,
    PAGE_UPDATED,
    PRE_RESTORE,
    BuilderSnapshotError,
    capture_page_snapshot,
    restore_page_snapshot,
)
from backend.app.builder_locking import lock_builder_page_scope
from backend.app.db import Base
from backend.app.models import (
    BuilderModule,
    BuilderPage,
    BuilderPageSnapshot,
    BuilderSection,
    Series,
)

POSTGRES_URL = os.environ.get("BUILDER_HISTORY_POSTGRES_URL")


@unittest.skipUnless(
    POSTGRES_URL,
    "Set BUILDER_HISTORY_POSTGRES_URL to run the PostgreSQL 16 locking drill",
)
class BuilderHistoryPostgresLockingDrill(unittest.TestCase):
    """Database-observed PostgreSQL serialization races for builder recovery."""

    @classmethod
    def setUpClass(cls):
        if make_url(POSTGRES_URL).database != "builder_history_locking_drill":
            raise unittest.SkipTest(
                "The drill URL must target a database named builder_history_locking_drill"
            )
        cls.engine = create_engine(POSTGRES_URL, pool_pre_ping=True)
        with cls.engine.connect() as connection:
            version = connection.scalar(text("SHOW server_version_num"))
        if int(version) // 10000 != 16:
            raise unittest.SkipTest("The builder history locking drill requires PostgreSQL 16")

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(cls.engine)
        cls.engine.dispose()

    def setUp(self):
        Base.metadata.drop_all(self.engine)
        Base.metadata.create_all(self.engine)

    def _series(self, db: Session, series_id: str = "locking-drill") -> None:
        now = datetime.now(timezone.utc)
        db.add(
            Series(
                id=series_id,
                title="Locking Drill",
                description="",
                status_message="",
                active=True,
                created_at=now,
                updated_at=now,
            )
        )
        db.commit()

    def _page(
        self,
        db: Session,
        slug: str,
        *,
        scope: str = "series",
        series_id: str | None = "locking-drill",
        title: str | None = None,
        sort_index: int = 0,
        homepage: bool = False,
    ) -> BuilderPage:
        now = datetime.now(timezone.utc)
        page = BuilderPage(
            id=uuid4(),
            scope=scope,
            series_id=series_id,
            slug=slug,
            title=title or slug.title(),
            page_type="custom",
            is_published=False,
            is_homepage=homepage,
            sort_index=sort_index,
            meta={},
            created_at=now,
            updated_at=now,
        )
        section = BuilderSection(
            id=uuid4(),
            page=page,
            section_type="row",
            layout="1",
            sort_index=0,
            settings={},
            created_at=now,
        )
        BuilderModule(
            id=uuid4(),
            section=section,
            module_type="text",
            column_index=0,
            sort_index=0,
            config={"content": "<p>Before</p>", "alignment": "left"},
            created_at=now,
            updated_at=now,
        )
        db.add(page)
        db.flush()
        return page

    def _assert_database_blocker(self, waiter_pid: int, blocker_pid: int) -> None:
        deadline = time.monotonic() + 10
        last_observation = None
        with self.engine.connect().execution_options(isolation_level="AUTOCOMMIT") as observer:
            while time.monotonic() < deadline:
                last_observation = observer.execute(
                    text(
                        """
                        SELECT state, wait_event_type, wait_event, pg_blocking_pids(pid)
                        FROM pg_stat_activity
                        WHERE pid = :pid
                        """
                    ),
                    {"pid": waiter_pid},
                ).one_or_none()
                if (
                    last_observation is not None
                    and last_observation.state == "active"
                    and last_observation.wait_event_type == "Lock"
                    and blocker_pid in last_observation.pg_blocking_pids
                ):
                    return
                threading.Event().wait(0.02)
        self.fail(
            "PostgreSQL never reported the expected active lock wait; "
            f"waiter={waiter_pid}, blocker={blocker_pid}, last={last_observation}"
        )

    def _run_observed_pair(self, first, second):
        first_ready: queue.Queue[int] = queue.Queue()
        second_started: queue.Queue[int] = queue.Queue()
        release_first = threading.Event()
        results: queue.Queue[tuple[str, object]] = queue.Queue()

        def run_first() -> None:
            try:
                with Session(self.engine) as db:
                    pid = db.scalar(text("SELECT pg_backend_pid()"))
                    first(db, first_ready, release_first)
                    results.put(("first", pid))
            except BaseException as exc:  # pragma: no cover - surfaced in the main thread
                results.put(("first_error", exc))

        def run_second() -> None:
            try:
                with Session(self.engine) as db:
                    pid = db.scalar(text("SELECT pg_backend_pid()"))
                    second_started.put(pid)
                    result = second(db)
                    results.put(("second", result))
            except BaseException as exc:  # pragma: no cover - asserted in the main thread
                results.put(("second_error", exc))

        first_thread = threading.Thread(target=run_first, daemon=True)
        second_thread = threading.Thread(target=run_second, daemon=True)
        first_thread.start()
        blocker_pid = first_ready.get(timeout=10)
        second_thread.start()
        waiter_pid = second_started.get(timeout=10)
        self._assert_database_blocker(waiter_pid, blocker_pid)
        release_first.set()
        first_thread.join(timeout=10)
        second_thread.join(timeout=10)
        self.assertFalse(first_thread.is_alive())
        self.assertFalse(second_thread.is_alive())
        return [results.get(timeout=2), results.get(timeout=2)]

    def test_mutation_and_current_restore_serialize_on_page_row(self):
        with Session(self.engine) as setup_db:
            self._series(setup_db)
            page = self._page(setup_db, "locking", title="Before mutation")
            selected = capture_page_snapshot(setup_db, page.id, PAGE_CREATED)
            setup_db.commit()
            page_id = page.id
            snapshot_id = selected.id

        def first(db: Session, ready: queue.Queue[int], release: threading.Event) -> None:
            pid = db.scalar(text("SELECT pg_backend_pid()"))
            db.scalar(select(BuilderPage.id).where(BuilderPage.id == page_id).with_for_update())
            ready.put(pid)
            if not release.wait(timeout=10):
                raise TimeoutError("Timed out waiting to release the mutation")
            page_store.update_page(db, str(page_id), {"title": "Concurrent mutation"})

        results = self._run_observed_pair(
            first,
            lambda db: restore_page_snapshot(db, snapshot_id, None),
        )
        self.assertEqual({label for label, _ in results}, {"first", "second"})

        with Session(self.engine) as verification_db:
            self.assertEqual(verification_db.get(BuilderPage, page_id).title, "Before mutation")
            actions = verification_db.scalars(
                select(BuilderPageSnapshot.action).where(BuilderPageSnapshot.page_id == page_id)
            ).all()
            self.assertIn(PRE_RESTORE, actions)

    def test_concurrent_global_homepage_creates_have_exact_displacement_history(self):
        with Session(self.engine) as setup_db:
            old = self._page(
                setup_db,
                "old-home",
                scope="global",
                series_id=None,
                homepage=True,
            )
            capture_page_snapshot(setup_db, old.id, PAGE_CREATED)
            setup_db.commit()
            old_id = old.id

        first_page: queue.Queue[UUID] = queue.Queue()

        def first(db: Session, ready: queue.Queue[int], release: threading.Event) -> None:
            pid = db.scalar(text("SELECT pg_backend_pid()"))
            lock_builder_page_scope(db, "global", None)
            ready.put(pid)
            if not release.wait(timeout=10):
                raise TimeoutError("Timed out waiting to release the first homepage create")
            created = page_store.create_scoped_page(
                db,
                "global",
                None,
                {"slug": "first-home", "title": "First Home", "isHomepage": True},
            )
            first_page.put(UUID(created["id"]))

        results = self._run_observed_pair(
            first,
            lambda db: page_store.create_scoped_page(
                db,
                "global",
                None,
                {"slug": "second-home", "title": "Second Home", "isHomepage": True},
            ),
        )
        self.assertEqual({label for label, _ in results}, {"first", "second"})
        first_id = first_page.get(timeout=2)

        with Session(self.engine) as verification_db:
            pages = list(
                verification_db.scalars(
                    select(BuilderPage)
                    .where(BuilderPage.scope == "global")
                    .order_by(BuilderPage.slug.asc())
                ).all()
            )
            homepages = [page for page in pages if page.is_homepage]
            self.assertEqual([page.slug for page in homepages], ["second-home"])
            second_id = next(page.id for page in pages if page.slug == "second-home")

            def snapshots(page_id: UUID) -> list[BuilderPageSnapshot]:
                return list(
                    verification_db.scalars(
                        select(BuilderPageSnapshot)
                        .where(BuilderPageSnapshot.page_id == page_id)
                        .order_by(
                            BuilderPageSnapshot.created_at.asc(),
                            BuilderPageSnapshot.id.asc(),
                        )
                    ).all()
                )

            old_history = snapshots(old_id)
            first_history = snapshots(first_id)
            second_history = snapshots(second_id)
            self.assertEqual([row.action for row in old_history], [PAGE_CREATED, PAGE_UPDATED])
            self.assertEqual([row.action for row in first_history], [PAGE_CREATED, PAGE_UPDATED])
            self.assertEqual([row.action for row in second_history], [PAGE_CREATED])
            self.assertTrue(old_history[-1].payload["page"]["isHomepage"])
            self.assertTrue(first_history[-1].payload["page"]["isHomepage"])
            self.assertTrue(second_history[-1].payload["page"]["isHomepage"])

    def test_concurrent_restores_of_same_deleted_page_yield_one_identity_conflict(self):
        with Session(self.engine) as setup_db:
            self._series(setup_db)
            page = self._page(setup_db, "same-deleted")
            selected = capture_page_snapshot(setup_db, page.id, PAGE_CREATED)
            setup_db.commit()
            page_id = page.id
            snapshot_id = selected.id
            page_store.delete_page(setup_db, str(page_id))

        def first(db: Session, ready: queue.Queue[int], release: threading.Event) -> None:
            pid = db.scalar(text("SELECT pg_backend_pid()"))
            lock_builder_page_scope(db, "series", "locking-drill")
            ready.put(pid)
            if not release.wait(timeout=10):
                raise TimeoutError("Timed out waiting to release the first deleted restore")
            restore_page_snapshot(db, snapshot_id, None)

        results = self._run_observed_pair(
            first,
            lambda db: restore_page_snapshot(db, snapshot_id, None),
        )
        labels = {label for label, _ in results}
        self.assertEqual(labels, {"first", "second_error"})
        error = next(value for label, value in results if label == "second_error")
        self.assertIsInstance(error, BuilderSnapshotError)
        self.assertEqual(error.code, "snapshot_identity_conflict")
        with Session(self.engine) as verification_db:
            self.assertIsNotNone(verification_db.get(BuilderPage, page_id))
            self.assertEqual(
                len(
                    verification_db.scalars(
                        select(BuilderPage).where(BuilderPage.id == page_id)
                    ).all()
                ),
                1,
            )

    def test_different_deleted_pages_restore_with_consecutive_unique_append_indexes(self):
        with Session(self.engine) as setup_db:
            self._series(setup_db)
            existing = self._page(setup_db, "existing", sort_index=4)
            first_page = self._page(setup_db, "deleted-one", sort_index=1)
            second_page = self._page(setup_db, "deleted-two", sort_index=2)
            first_snapshot = capture_page_snapshot(setup_db, first_page.id, PAGE_CREATED)
            second_snapshot = capture_page_snapshot(setup_db, second_page.id, PAGE_CREATED)
            setup_db.commit()
            existing_id = existing.id
            first_id = first_page.id
            second_id = second_page.id
            first_snapshot_id = first_snapshot.id
            second_snapshot_id = second_snapshot.id
            page_store.delete_page(setup_db, str(first_id))
            page_store.delete_page(setup_db, str(second_id))

        def first(db: Session, ready: queue.Queue[int], release: threading.Event) -> None:
            pid = db.scalar(text("SELECT pg_backend_pid()"))
            lock_builder_page_scope(db, "series", "locking-drill")
            ready.put(pid)
            if not release.wait(timeout=10):
                raise TimeoutError("Timed out waiting to release the first append restore")
            restore_page_snapshot(db, first_snapshot_id, None)

        results = self._run_observed_pair(
            first,
            lambda db: restore_page_snapshot(db, second_snapshot_id, None),
        )
        self.assertEqual({label for label, _ in results}, {"first", "second"})
        with Session(self.engine) as verification_db:
            existing_sort = verification_db.get(BuilderPage, existing_id).sort_index
            restored_sorts = sorted(
                [
                    verification_db.get(BuilderPage, first_id).sort_index,
                    verification_db.get(BuilderPage, second_id).sort_index,
                ]
            )
            self.assertEqual(restored_sorts, [existing_sort + 1, existing_sort + 2])
            self.assertEqual(len(set(restored_sorts)), 2)


if __name__ == "__main__":
    unittest.main()
