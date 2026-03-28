from __future__ import annotations

import os
from dataclasses import replace
from unittest.mock import patch

from sqlalchemy import select

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-route-tests.db")

from backend.app.models import User
from backend.app.routes import auth

from backend.tests.helpers import BackendRouteTestCase, build_request, json_body


class AuthRoutesTests(BackendRouteTestCase):
    def test_register_first_user_sets_admin_role_and_persists_email_opt_in(self):
        request = build_request(
            "/api/register",
            method="POST",
            headers=[(b"x-forwarded-proto", b"https")],
            client=("198.51.100.25", 1234),
        )
        payload = auth.RegisterRequest(
            email="first@example.com",
            password="password123",
            displayName="First Admin",
            emailOptIn=True,
        )
        response = auth.register(payload, request, self.db)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(json_body(response)["user"]["role"], "admin")
        self.assertIn(f"{self.test_settings.session_cookie_name}=", response.headers["set-cookie"])
        self.assertIn("secure", response.headers["set-cookie"].lower())

        user = self.db.scalar(select(User).where(User.email == "first@example.com"))
        self.assertIsNotNone(user)
        self.assertTrue(user.email_opt_in)

        subscribers = self.list_email_subscribers()
        self.assertEqual([subscriber.email for subscriber in subscribers], ["first@example.com"])
        self.assertEqual(subscribers[0].source, "account")

    def test_second_registered_user_defaults_to_regular_user(self):
        self.create_user(kind="admin", role="admin", email="admin@example.com")
        request = build_request("/api/register", method="POST")
        payload = auth.RegisterRequest(
            email="reader2@example.com",
            password="password123",
            displayName="Reader Two",
        )
        response = auth.register(payload, request, self.db)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(json_body(response)["user"]["role"], "user")

    def test_login_round_trips_session_cookie(self):
        self.create_user(kind="user", email="reader@example.com")
        login_request = build_request(
            "/api/login",
            method="POST",
            headers=[(b"x-forwarded-proto", b"https")],
        )
        login_response = auth.login(
            auth.LoginRequest(email="reader@example.com", password="password123"),
            login_request,
            self.db,
        )
        self.assertEqual(login_response.status_code, 200)
        self.assertIn(self.test_settings.session_cookie_name, login_response.headers["set-cookie"])

        cookie = login_response.headers["set-cookie"].split(";", 1)[0]
        session_request = build_request("/api/session", cookie=cookie)
        session_response = auth.session(session_request, self.db)
        self.assertEqual(session_response["user"]["email"], "reader@example.com")

    def test_logout_clears_the_session_cookie(self):
        response = auth.logout()

        self.assertEqual(response.status_code, 200)
        self.assertIn("Max-Age=0", response.headers["set-cookie"])

    def test_invite_and_closed_registration_modes_reject_invalid_requests(self):
        invite_payload = auth.RegisterRequest(
            email="invite@example.com",
            password="password123",
            displayName="Invite User",
            inviteCode="wrong-code",
        )
        invite_request = build_request("/api/register", method="POST")
        invite_settings = replace(
            self.test_settings,
            registration_mode="invite",
            invite_code="open-sesame",
        )
        with patch("backend.app.routes.auth.settings", invite_settings):
            invite_response = auth.register(invite_payload, invite_request, self.db)

        self.assertEqual(invite_response.status_code, 403)
        self.assertEqual(json_body(invite_response)["error"], "Invalid invite code")

        closed_payload = auth.RegisterRequest(
            email="closed@example.com",
            password="password123",
            displayName="Closed User",
        )
        closed_request = build_request("/api/register", method="POST")
        closed_settings = replace(self.test_settings, registration_mode="closed")
        with patch("backend.app.routes.auth.settings", closed_settings):
            closed_response = auth.register(closed_payload, closed_request, self.db)

        self.assertEqual(closed_response.status_code, 403)
        self.assertEqual(json_body(closed_response)["error"], "Registration is closed")


if __name__ == "__main__":
    import unittest

    unittest.main()
