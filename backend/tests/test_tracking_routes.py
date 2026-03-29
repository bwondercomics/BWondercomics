from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-route-tests.db")

from backend.app.routes import tracking

from backend.tests.helpers import BackendRouteTestCase, build_request, json_body


class TrackingRouteTests(BackendRouteTestCase):
    def test_track_visitor_creates_session_and_attaches_authenticated_user(self):
        user = self.create_user(kind="user")
        payload = tracking.TrackVisitorRequest(**self.contracts["tracking"]["firstVisit"])
        request = build_request(
            "/api/track/visitor",
            method="POST",
            cookie=self.auth_cookie(user),
            client=("198.51.100.30", 4321),
        )

        response = tracking.track_visitor(payload, request, self.db)

        self.assertEqual(response, {"status": "ok"})
        sessions = self.list_visitor_sessions()
        self.assertEqual(len(sessions), 1)
        self.assertEqual(str(sessions[0].user_id), str(user.id))
        self.assertEqual(sessions[0].hit_count, 1)
        self.assertEqual(sessions[0].entries_read, ["battle-bros | Issue 10"])
        self.assertEqual(sessions[0].series_read, ["battle-bros"])
        self.assertEqual(sessions[0].ip_address, "198.51.100.30")

    def test_track_visitor_updates_existing_session_and_dedupes_labels(self):
        first = tracking.TrackVisitorRequest(**self.contracts["tracking"]["firstVisit"])
        second = tracking.TrackVisitorRequest(**self.contracts["tracking"]["repeatVisit"])

        tracking.track_visitor(first, build_request("/api/track/visitor", method="POST"), self.db)
        response = tracking.track_visitor(
            second,
            build_request("/api/track/visitor", method="POST", client=("203.0.113.55", 9999)),
            self.db,
        )

        self.assertEqual(response, {"status": "ok"})
        session = self.list_visitor_sessions()[0]
        self.assertEqual(session.hit_count, 2)
        self.assertEqual(session.page_number, 4)
        self.assertEqual(session.entries_read, ["battle-bros | Issue 10"])
        self.assertEqual(session.series_read, ["battle-bros"])
        self.assertEqual(session.path, "/index.html?series=battle-bros&page=4")
        self.assertEqual(session.ip_address, "203.0.113.55")

    def test_track_visitor_requires_visitor_id(self):
        response = tracking.track_visitor(
            tracking.TrackVisitorRequest(visitorId=" "),
            build_request("/api/track/visitor", method="POST"),
            self.db,
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(json_body(response)["error"], "visitorId is required")


if __name__ == "__main__":
    import unittest

    unittest.main()
