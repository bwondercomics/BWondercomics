from __future__ import annotations

import os
from contextlib import contextmanager
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-route-tests.db")

from backend.app.routes import admin_analytics

from backend.app.models import VisitorSession
from backend.tests.helpers import BackendRouteTestCase, build_request


class AdminAnalyticsRouteTests(BackendRouteTestCase):
    def setUp(self):
        super().setUp()
        self.admin_user = self.create_user(kind="admin", role="admin", email="admin@example.com")
        self.seed_contract_series()

        self.umami_engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        with self.umami_engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE TABLE session ("
                    "session_id TEXT PRIMARY KEY, "
                    "visitor_id TEXT, "
                    "distinct_id TEXT, "
                    "referrer TEXT, "
                    "country TEXT, "
                    "browser TEXT, "
                    "device TEXT)"
                )
            )
            conn.execute(
                text(
                    "CREATE TABLE website_event ("
                    "event_id TEXT PRIMARY KEY, "
                    "website_id TEXT, "
                    "session_id TEXT, "
                    "created_at TIMESTAMP, "
                    "event_name TEXT, "
                    "url_path TEXT)"
                )
            )
            conn.execute(
                text(
                    "CREATE TABLE event_data ("
                    "id INTEGER PRIMARY KEY AUTOINCREMENT, "
                    "website_event_id TEXT, "
                    "data_key TEXT, "
                    "string_value TEXT, "
                    "number_value REAL)"
                )
            )

        analytics_settings = replace(self.test_settings, umami_website_id="site-1")
        self.patches.enter_context(patch("backend.app.routes.admin_analytics.settings", analytics_settings))
        self.patches.enter_context(
            patch("backend.app.routes.admin_analytics.get_umami_db", self._get_umami_db)
        )

    def tearDown(self):
        self.umami_engine.dispose()
        super().tearDown()

    @contextmanager
    def _get_umami_db(self):
        db = Session(self.umami_engine)
        try:
            yield db
        finally:
            db.close()

    def _admin_request(self, path: str) -> object:
        return build_request(path, cookie=self.auth_cookie(self.admin_user))

    def _insert_umami_session(
        self,
        session_id: str,
        visitor_id: str | None = None,
        *,
        distinct_id: str | None = None,
        referrer: str | None = None,
        country: str | None = None,
        browser: str | None = None,
        device: str | None = None,
    ):
        with self.umami_engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO session ("
                    "session_id, visitor_id, distinct_id, referrer, country, browser, device"
                    ") VALUES ("
                    ":session_id, :visitor_id, :distinct_id, :referrer, :country, :browser, :device"
                    ")"
                ),
                {
                    "session_id": session_id,
                    "visitor_id": visitor_id,
                    "distinct_id": distinct_id or visitor_id or session_id,
                    "referrer": referrer,
                    "country": country,
                    "browser": browser,
                    "device": device,
                },
            )

    def _insert_umami_event(
        self,
        *,
        session_id: str,
        created_at: datetime,
        event_name: str,
        url_path: str = "/index.html",
        data: dict | None = None,
    ):
        event_id = str(uuid4())
        with self.umami_engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO website_event ("
                    "event_id, website_id, session_id, created_at, event_name, url_path"
                    ") VALUES ("
                    ":event_id, :website_id, :session_id, :created_at, :event_name, :url_path"
                    ")"
                ),
                {
                    "event_id": event_id,
                    "website_id": "site-1",
                    "session_id": session_id,
                    "created_at": created_at,
                    "event_name": event_name,
                    "url_path": url_path,
                },
            )
            for key, value in (data or {}).items():
                conn.execute(
                    text(
                        "INSERT INTO event_data (website_event_id, data_key, string_value, number_value) "
                        "VALUES (:website_event_id, :data_key, :string_value, :number_value)"
                    ),
                    {
                        "website_event_id": event_id,
                        "data_key": key,
                        "string_value": None
                        if isinstance(value, (int, float)) and not isinstance(value, bool)
                        else str(value),
                        "number_value": value
                        if isinstance(value, (int, float)) and not isinstance(value, bool)
                        else None,
                    },
                )

    def test_reader_endpoint_returns_page_views_starts_and_rates(self):
        now = datetime.now(timezone.utc)
        self._insert_umami_session("session-a", "visitor-a")
        self._insert_umami_session("session-b", "visitor-b")

        self._insert_umami_event(
            session_id="session-a",
            created_at=now - timedelta(days=2, minutes=5),
            event_name="reader_page_view",
            data={
                "series": "battle-bros",
                "entryLabel": "battle-bros | Issue 10",
                "page": 1,
                "totalPages": 2,
            },
        )
        self._insert_umami_event(
            session_id="session-a",
            created_at=now - timedelta(days=2, minutes=4),
            event_name="reader_page_view",
            data={
                "series": "battle-bros",
                "entryLabel": "battle-bros | Issue 10",
                "page": 2,
                "totalPages": 2,
            },
        )
        self._insert_umami_event(
            session_id="session-b",
            created_at=now - timedelta(days=1, minutes=2),
            event_name="reader_page_view",
            data={
                "series": "battle-bros",
                "entryLabel": "battle-bros | Issue 10",
                "page": 1,
                "totalPages": 2,
            },
        )
        self._insert_umami_event(
            session_id="session-a",
            created_at=now - timedelta(days=2, minutes=3),
            event_name="reader_entry_complete",
            data={
                "series": "battle-bros",
                "entryLabel": "battle-bros | Issue 10",
                "totalPages": 2,
            },
        )

        payload = admin_analytics.admin_reader_analytics(
            self._admin_request("/api/admin/analytics/reader"),
            self.db,
            range="7d",
        )

        self.assertEqual(payload["entryReadsTotal"], 3)
        self.assertEqual(payload["entryStartsTotal"], 2)
        self.assertEqual(payload["entryFinishesTotal"], 1)
        self.assertEqual(payload["uniqueVisitors"], 2)
        self.assertAlmostEqual(payload["finishRate"], 0.5)
        self.assertNotIn("entryStops", payload)
        self.assertNotIn("avgStopPage", payload)
        self.assertEqual(payload["entryViews"][0]["count"], 3)
        self.assertEqual(payload["seriesViews"][0]["count"], 3)
        self.assertEqual(payload["entryRates"][0]["starts"], 2)
        self.assertEqual(payload["entryRates"][0]["finishes"], 1)
        self.assertAlmostEqual(payload["entryRates"][0]["completionRate"], 0.5)
        self.assertEqual(payload["seriesRates"][0]["starts"], 2)
        self.assertEqual(payload["entryViews"][0]["entryKey"], "battle-bros:10")
        self.assertEqual(payload["entryRates"][0]["entryKey"], "battle-bros:10")

    def test_reads_over_time_uses_raw_page_view_counts(self):
        now = datetime.now(timezone.utc)
        day_one = now - timedelta(days=6)
        day_two = now - timedelta(days=5)

        self._insert_umami_session("session-a", "visitor-a")
        self._insert_umami_session("session-b", "visitor-b")

        self._insert_umami_event(
            session_id="session-a",
            created_at=day_one,
            event_name="reader_page_view",
            data={
                "series": "battle-bros",
                "entryLabel": "battle-bros | Issue 10",
                "page": 1,
                "totalPages": 2,
            },
        )
        self._insert_umami_event(
            session_id="session-a",
            created_at=day_two,
            event_name="reader_page_view",
            data={
                "series": "battle-bros",
                "entryLabel": "battle-bros | Issue 10",
                "page": 2,
                "totalPages": 2,
            },
        )
        self._insert_umami_event(
            session_id="session-b",
            created_at=day_two + timedelta(minutes=15),
            event_name="reader_page_view",
            data={
                "series": "battle-bros",
                "entryLabel": "battle-bros | Issue 10",
                "page": 1,
                "totalPages": 2,
            },
        )

        payload = admin_analytics.admin_reads_over_time(
            self._admin_request("/api/admin/analytics/reads-over-time"),
            self.db,
            time_range="7d",
        )

        non_zero_counts = [item["count"] for item in payload["series"] if item["count"] > 0]
        self.assertEqual(non_zero_counts, [1, 2])
        self.assertEqual(payload["totals"]["reads"], 3)
        self.assertEqual(payload["totals"]["uniqueVisitors"], 2)

    def test_reader_series_supports_completion_rate_metric(self):
        now = datetime.now(timezone.utc)
        self._insert_umami_session("session-a", "visitor-a")
        self._insert_umami_session("session-b", "visitor-b")

        self._insert_umami_event(
            session_id="session-a",
            created_at=now - timedelta(days=3),
            event_name="reader_page_view",
            data={
                "series": "battle-bros",
                "entryLabel": "battle-bros | Issue 10",
                "page": 1,
                "totalPages": 2,
            },
        )
        self._insert_umami_event(
            session_id="session-b",
            created_at=now - timedelta(days=2),
            event_name="reader_page_view",
            data={
                "series": "battle-bros",
                "entryLabel": "battle-bros | Issue 10",
                "page": 1,
                "totalPages": 2,
            },
        )
        self._insert_umami_event(
            session_id="session-a",
            created_at=now - timedelta(days=1),
            event_name="reader_entry_complete",
            data={
                "series": "battle-bros",
                "entryLabel": "battle-bros | Issue 10",
            },
        )

        payload = admin_analytics.admin_reader_series_analytics(
            self._admin_request("/api/admin/analytics/reader-series"),
            self.db,
            time_range="7d",
            prop="entryLabel",
            value="10",
            metric="completion_rate",
            points=6,
        )

        total_starts = sum(int(point.get("starts") or 0) for point in payload["series"])
        total_finishes = sum(int(point.get("finishes") or 0) for point in payload["series"])
        self.assertEqual(payload["metric"], "completion_rate")
        self.assertEqual(total_starts, 2)
        self.assertEqual(total_finishes, 1)
        self.assertTrue(any("completionRate" in point for point in payload["series"]))

    def test_reader_entry_key_keeps_duplicate_display_numbers_separate(self):
        now = datetime.now(timezone.utc)
        self._insert_umami_session("session-a", "visitor-a")
        self._insert_umami_session("session-b", "visitor-b")

        self._insert_umami_event(
            session_id="session-a",
            created_at=now - timedelta(days=3),
            event_name="reader_page_view",
            data={
                "series": "battle-bros",
                "entryLabel": "battle-bros | Issue 10",
                "page": 1,
                "totalPages": 2,
            },
        )
        self._insert_umami_event(
            session_id="session-a",
            created_at=now - timedelta(days=2),
            event_name="reader_entry_complete",
            data={
                "series": "battle-bros",
                "entryLabel": "battle-bros | Issue 10",
            },
        )
        self._insert_umami_event(
            session_id="session-b",
            created_at=now - timedelta(days=1),
            event_name="reader_page_view",
            data={
                "series": "rook-and-rabbit",
                "entryLabel": "rook-and-rabbit | Issue 10",
                "page": 1,
                "totalPages": 3,
            },
        )

        reader_payload = admin_analytics.admin_reader_analytics(
            self._admin_request("/api/admin/analytics/reader"),
            self.db,
            range="7d",
        )
        keyed_entries = {item["entryKey"]: item for item in reader_payload["entryViews"]}
        self.assertIn("battle-bros:10", keyed_entries)
        self.assertIn("rook-and-rabbit:10", keyed_entries)

        completion_payload = admin_analytics.admin_reader_series_analytics(
            self._admin_request("/api/admin/analytics/reader-series"),
            self.db,
            time_range="7d",
            prop="entryLabel",
            value="10",
            entry_key="battle-bros:10",
            metric="completion_rate",
            points=6,
        )
        self.assertEqual(
            sum(int(point.get("starts") or 0) for point in completion_payload["series"]),
            1,
        )
        self.assertEqual(
            sum(int(point.get("finishes") or 0) for point in completion_payload["series"]),
            1,
        )

        reads_payload = admin_analytics.admin_reads_over_time(
            self._admin_request("/api/admin/analytics/reads-over-time"),
            self.db,
            time_range="7d",
            entry_key="battle-bros:10",
        )
        self.assertEqual(reads_payload["entryKey"], "battle-bros:10")
        self.assertEqual(reads_payload["totals"]["reads"], 1)
        self.assertEqual(reads_payload["totals"]["uniqueVisitors"], 1)

    def test_visitor_history_aggregates_metadata_and_issue_progress(self):
        now = datetime.now(timezone.utc)
        self._insert_umami_session(
            "session-a",
            "visitor-a",
            referrer="google.com",
            country="US",
            browser="Chrome",
            device="Mobile",
        )

        self._insert_umami_event(
            session_id="session-a",
            created_at=now - timedelta(days=2, minutes=10),
            event_name="pageview",
            url_path="/landing",
        )
        self._insert_umami_event(
            session_id="session-a",
            created_at=now - timedelta(days=2, minutes=9),
            event_name="reader_page_view",
            url_path="/reader/issue-10/1",
            data={
                "series": "battle-bros",
                "entryLabel": "battle-bros | Issue 10",
                "page": 1,
                "totalPages": 2,
            },
        )
        self._insert_umami_event(
            session_id="session-a",
            created_at=now - timedelta(days=2, minutes=8),
            event_name="reader_page_view",
            url_path="/reader/issue-10/2",
            data={
                "series": "battle-bros",
                "entryLabel": "battle-bros | Issue 10",
                "page": 2,
                "totalPages": 2,
            },
        )
        self._insert_umami_event(
            session_id="session-a",
            created_at=now - timedelta(days=2, minutes=7),
            event_name="reader_entry_complete",
            url_path="/reader/issue-10/end",
            data={
                "series": "battle-bros",
                "entryLabel": "battle-bros | Issue 10",
            },
        )
        self._insert_umami_event(
            session_id="session-a",
            created_at=now - timedelta(days=1, minutes=4),
            event_name="reader_page_view",
            url_path="/reader/issue-11/1",
            data={
                "series": "battle-bros",
                "entryLabel": "battle-bros | Issue 11",
                "page": 1,
                "totalPages": 2,
            },
        )

        payload = admin_analytics.admin_visitor_history(
            self._admin_request("/api/admin/analytics/visitor-history"),
            self.db,
            range="7d",
            limit=10,
        )

        visitor = payload["visitors"][0]
        self.assertEqual(payload["totalVisitors"], 1)
        self.assertEqual(visitor["visitorKey"], "visitor-a")
        self.assertEqual(visitor["landingPage"], "/landing")
        self.assertEqual(visitor["lastPath"], "/reader/issue-11/1")
        self.assertEqual(visitor["referrer"], "google.com")
        self.assertEqual(visitor["country"], "US")
        self.assertEqual(visitor["browser"], "Chrome")
        self.assertEqual(visitor["device"], "Mobile")
        self.assertEqual(visitor["pagesRead"], 3)
        self.assertEqual(visitor["issuesStarted"], 2)
        self.assertEqual(visitor["issuesFinished"], 1)
        self.assertEqual(visitor["issues"][0]["entryDisplayNumber"], 10)
        self.assertEqual(visitor["issues"][0]["pagesRead"], 2)
        self.assertTrue(visitor["issues"][0]["finished"])

    def test_reader_metrics_prefer_distinct_id_for_unique_visitors(self):
        now = datetime.now(timezone.utc)
        self._insert_umami_session("session-a", None, distinct_id="shared-visitor")
        self._insert_umami_session("session-b", None, distinct_id="shared-visitor")

        self._insert_umami_event(
            session_id="session-a",
            created_at=now - timedelta(days=2),
            event_name="reader_page_view",
            data={
                "series": "battle-bros",
                "entryLabel": "battle-bros | Issue 10",
                "page": 1,
                "totalPages": 2,
            },
        )
        self._insert_umami_event(
            session_id="session-b",
            created_at=now - timedelta(days=1),
            event_name="reader_page_view",
            data={
                "series": "battle-bros",
                "entryLabel": "battle-bros | Issue 10",
                "page": 1,
                "totalPages": 2,
            },
        )

        payload = admin_analytics.admin_reader_analytics(
            self._admin_request("/api/admin/analytics/reader"),
            self.db,
            range="7d",
        )

        self.assertEqual(payload["entryReadsTotal"], 2)
        self.assertEqual(payload["entryStartsTotal"], 2)
        self.assertEqual(payload["uniqueVisitors"], 1)

    def test_live_visitors_route_matches_frontend_contract(self):
        now = datetime.now(timezone.utc)
        session = VisitorSession(
            visitor_id="live-visitor",
            user_id=self.admin_user.id,
            ip_address="127.0.0.1",
            origin="Direct",
            path="/reader/issue-10/1",
            entry_label="battle-bros | Issue 10",
            entry_title="Issue 10",
            entries_read=["Issue 10"],
            first_seen=now - timedelta(minutes=6),
            last_seen=now - timedelta(minutes=1),
            hit_count=4,
        )
        self.db.add(session)
        self.db.commit()

        payload = admin_analytics.admin_live_visitors(
            self._admin_request("/api/admin/analytics/live"),
            self.db,
            window_seconds=600,
            limit=10,
        )

        self.assertEqual(payload["activeCount"], 1)
        self.assertEqual(payload["total"], 1)
        self.assertEqual(len(payload["visitors"]), 1)
        self.assertEqual(len(payload["sessions"]), 1)
        visitor = payload["visitors"][0]
        self.assertEqual(visitor["user"]["displayName"], self.admin_user.display_name)
        self.assertEqual(visitor["user"]["email"], self.admin_user.email)
        self.assertGreaterEqual(visitor["durationSeconds"], 300)

    def test_visitors_endpoint_shapes_expanded_umami_metrics(self):
        expanded_rows = {
            "referrer": [{"name": "google.com", "visitors": 9, "visits": 11, "pageviews": 17, "bounces": 4, "totaltime": 660000}],
            "entry": [{"name": "/launch-campaign", "visitors": 7, "visits": 8, "pageviews": 12, "bounces": 2, "totaltime": 420000}],
            "country": [{"name": "US", "visitors": 5, "visits": 6, "pageviews": 9, "bounces": 1, "totaltime": 300000}],
            "browser": [{"name": "Chrome", "visitors": 6, "visits": 7, "pageviews": 10, "bounces": 2, "totaltime": 360000}],
            "device": [{"name": "Mobile", "visitors": 4, "visits": 5, "pageviews": 8, "bounces": 2, "totaltime": 240000}],
        }

        with (
            patch(
                "backend.app.routes.admin_analytics.fetch_umami_expanded_metrics",
                side_effect=lambda _start, _end, metric_type, limit=10: expanded_rows[metric_type],
            ) as expanded_mock,
            patch(
                "backend.app.routes.admin_analytics.fetch_umami_metrics",
                return_value=[{"x": "cta-click", "y": 5}],
            ) as metrics_mock,
        ):
            payload = admin_analytics.admin_visitor_analytics(
                self._admin_request("/api/admin/analytics/visitors"),
                self.db,
                range="30d",
                limit=5,
            )

        self.assertEqual(payload["range"], "30d")
        self.assertEqual(payload["landingPages"][0]["name"], "/launch-campaign")
        self.assertEqual(payload["referrers"][0]["visitors"], 9)
        self.assertEqual(payload["countries"][0]["name"], "US")
        self.assertEqual(payload["browsers"][0]["pageviews"], 10)
        self.assertEqual(payload["devices"][0]["visits"], 5)
        self.assertEqual(payload["events"][0]["name"], "cta-click")
        self.assertEqual(metrics_mock.call_count, 1)
        self.assertEqual(expanded_mock.call_count, 5)

    def test_visitors_endpoint_falls_back_to_umami_db_for_events(self):
        now = datetime.now(timezone.utc)
        expanded_rows = {
            "referrer": [{"name": "google.com", "visitors": 9, "visits": 11, "pageviews": 17, "bounces": 4, "totaltime": 660000}],
            "entry": [{"name": "/launch-campaign", "visitors": 7, "visits": 8, "pageviews": 12, "bounces": 2, "totaltime": 420000}],
            "country": [{"name": "US", "visitors": 5, "visits": 6, "pageviews": 9, "bounces": 1, "totaltime": 300000}],
            "browser": [{"name": "Chrome", "visitors": 6, "visits": 7, "pageviews": 10, "bounces": 2, "totaltime": 360000}],
            "device": [{"name": "Mobile", "visitors": 4, "visits": 5, "pageviews": 8, "bounces": 2, "totaltime": 240000}],
        }

        self._insert_umami_session("session-a", "visitor-a")
        self._insert_umami_session("session-b", "visitor-b")
        self._insert_umami_session("session-c", None, distinct_id="visitor-a")
        self._insert_umami_event(
            session_id="session-a",
            created_at=now - timedelta(days=1),
            event_name="cta-click",
        )
        self._insert_umami_event(
            session_id="session-a",
            created_at=now - timedelta(hours=12),
            event_name="cta-click",
        )
        self._insert_umami_event(
            session_id="session-c",
            created_at=now - timedelta(hours=10),
            event_name="cta-click",
        )
        self._insert_umami_event(
            session_id="session-b",
            created_at=now - timedelta(hours=6),
            event_name="reader_entry_complete",
        )

        with (
            patch(
                "backend.app.routes.admin_analytics.fetch_umami_expanded_metrics",
                side_effect=lambda _start, _end, metric_type, limit=10: expanded_rows[metric_type],
            ) as expanded_mock,
            patch(
                "backend.app.routes.admin_analytics.fetch_umami_metrics",
                return_value=[],
            ) as metrics_mock,
        ):
            payload = admin_analytics.admin_visitor_analytics(
                self._admin_request("/api/admin/analytics/visitors"),
                self.db,
                range="30d",
                limit=5,
            )

        self.assertEqual(payload["events"][0]["name"], "cta-click")
        self.assertEqual(payload["events"][0]["count"], 1)
        self.assertEqual(payload["events"][1]["name"], "reader_entry_complete")
        self.assertEqual(payload["events"][1]["count"], 1)
        self.assertEqual(metrics_mock.call_count, 1)
        self.assertEqual(expanded_mock.call_count, 5)

    def test_page_reads_endpoint_uses_umami_path_metrics(self):
        with (
            patch(
                "backend.app.routes.admin_analytics.fetch_umami_stats",
                return_value={"selected": {"pageviews": 63}},
            ) as stats_mock,
            patch(
                "backend.app.routes.admin_analytics.fetch_umami_expanded_metrics",
                return_value=[
                    {
                        "name": "/",
                        "pageviews": 40,
                        "visitors": 18,
                        "visits": 24,
                        "bounces": 6,
                        "totaltime": 720000,
                    },
                    {
                        "name": "/about",
                        "pageviews": 23,
                        "visitors": 9,
                        "visits": 12,
                        "bounces": 3,
                        "totaltime": 240000,
                    },
                ],
            ) as expanded_mock,
        ):
            payload = admin_analytics.admin_page_reads(
                self._admin_request("/api/admin/analytics/pages"),
                self.db,
                range="7d",
                limit=5,
            )

        self.assertEqual(payload["total"], 63)
        self.assertEqual(payload["pages"][0]["path"], "/")
        self.assertEqual(payload["pages"][0]["views"], 40)
        self.assertEqual(payload["pages"][0]["visitors"], 18)
        self.assertEqual(payload["pages"][1]["path"], "/about")
        self.assertEqual(stats_mock.call_count, 1)
        expanded_mock.assert_called_once()

    def test_weekly_digest_uses_reader_entry_lookup(self):
        now = datetime.now(timezone.utc)
        self._insert_umami_session("session-a", "visitor-a")
        self._insert_umami_event(
            session_id="session-a",
            created_at=now - timedelta(minutes=5),
            event_name="reader_page_view",
            data={
                "series": "battle-bros",
                "entryLabel": "battle-bros | Issue 10",
                "page": 1,
                "totalPages": 2,
            },
        )

        payload = admin_analytics.admin_weekly_digest(
            self._admin_request("/api/admin/analytics/weekly-digest"),
            self.db,
        )

        self.assertNotIn("error", payload)
        self.assertGreaterEqual(payload["thisWeek"]["reads"], 1)


if __name__ == "__main__":
    import unittest

    unittest.main()
