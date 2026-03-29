from __future__ import annotations

import os
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-route-tests.db")

from backend.app.models import Comment, PremiumCodeRedemption, User, VisitorSession
from backend.app.routes import user

from backend.tests.helpers import BackendRouteTestCase, build_request, json_body


class UserRouteTests(BackendRouteTestCase):
    def user_request(self, path: str, account=None, method: str = "GET", client=("198.51.100.25", 1234)):
        active_user = account or self.create_user(kind="user")
        return build_request(path, method=method, cookie=self.auth_cookie(active_user), client=client)

    def test_email_subscribe_marks_matching_user_and_creates_subscriber(self):
        account = self.create_user(kind="user", email="reader@example.com")
        payload = user.EmailSubscribeRequest(**self.contracts["userFixtures"]["emailSubscribe"])
        request = self.user_request("/api/email/subscribe", account, "POST", ("203.0.113.7", 2222))

        response = user.subscribe_email(payload, request, self.db)

        self.assertEqual(response, {"ok": True})
        self.db.refresh(account)
        self.assertTrue(account.email_opt_in)
        subscriber = self.list_email_subscribers()[0]
        self.assertEqual(subscriber.email, "reader@example.com")
        self.assertEqual(subscriber.source, "feed-module")
        self.assertEqual(subscriber.ip_address, "203.0.113.7")

    def test_settings_and_email_opt_round_trip_follow_current_contract(self):
        account = self.create_user(kind="user")
        self.seed_user_comments(account)

        settings_payload = user.get_user_settings(
            self.user_request("/api/user/settings", account),
            self.db,
        )
        enabled_payload = user.update_email_opt(
            user.EmailOptRequest(emailOptIn=True),
            self.user_request("/api/user/email-opt", account, "POST"),
            self.db,
        )
        enabled_subscribers = self.list_email_subscribers()
        disabled_payload = user.update_email_opt(
            user.EmailOptRequest(emailOptIn=False),
            self.user_request("/api/user/email-opt", account, "POST"),
            self.db,
        )

        self.assertEqual(settings_payload["commentCount"], 2)
        self.assertFalse(settings_payload["user"]["premiumActive"])
        self.assertTrue(enabled_payload["user"]["emailOptIn"])
        self.assertIsNotNone(enabled_payload["user"]["emailOptInAt"])
        self.assertEqual(enabled_subscribers[0].email, account.email)
        self.assertFalse(disabled_payload["user"]["emailOptIn"])
        self.assertEqual(self.list_email_subscribers(), [])

    def test_comment_listing_delete_and_bulk_delete_scope_to_current_user(self):
        account = self.create_user(kind="user")
        other = self.create_user(kind="premium", email="other@example.com", display_name="Other")
        seeded = self.seed_user_comments(account)
        other_seeded = self.seed_user_comments(
            other,
            comments=[
                {
                    "id": "99999999-9999-4999-8999-999999999903",
                    "targetId": "battle-bros--issue-2",
                    "message": "Other account comment",
                    "createdAt": "2026-03-28T03:00:00Z",
                    "hidden": False,
                }
            ],
        )

        listed = user.get_user_comments(
            self.user_request("/api/user/comments", account),
            limit=10,
            offset=0,
            db=self.db,
        )
        invalid = user.delete_user_comment(
            "not-a-uuid",
            self.user_request("/api/user/comments/not-a-uuid", account, "DELETE"),
            self.db,
        )
        missing = user.delete_user_comment(
            str(other_seeded[0].id),
            self.user_request(f"/api/user/comments/{other_seeded[0].id}", account, "DELETE"),
            self.db,
        )
        deleted = user.delete_user_comment(
            str(seeded[0].id),
            self.user_request(f"/api/user/comments/{seeded[0].id}", account, "DELETE"),
            self.db,
        )
        bulk = user.delete_user_comments(
            self.user_request("/api/user/comments/delete", account, "POST"),
            self.db,
        )

        self.assertEqual(listed["total"], 2)
        self.assertEqual(len(listed["comments"]), 2)
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(json_body(missing)["error"], "Comment not found")
        self.assertEqual(deleted, {"status": "ok"})
        self.assertEqual(bulk, {"status": "ok"})
        remaining = self.db.scalars(select(Comment).order_by(Comment.created_at.asc())).all()
        self.assertEqual(len(remaining), 1)
        self.assertEqual(str(remaining[0].user_id), str(other.id))

    def test_premium_redeem_and_account_delete_clear_non_admin_state(self):
        account = self.create_user(kind="user")
        self.seed_user_comments(account)
        premium_code = self.seed_premium_code()
        self.db.add(
            VisitorSession(
                id=uuid4(),
                visitor_id="account-delete-session",
                user_id=account.id,
                ip_address="198.51.100.25",
                origin="https://battlebros.example.com",
                referrer="https://battlebros.example.com/feed.html",
                path="/index.html",
                title="Battle Bros Reader",
                series_id="battle-bros",
                entry_title="Issue 10",
                entry_label="battle-bros | Issue 10",
                page_number=1,
                entries_read=["battle-bros | Issue 10"],
                series_read=["battle-bros"],
                first_seen=datetime.now(timezone.utc),
                last_seen=datetime.now(timezone.utc),
                hit_count=1,
            )
        )
        self.db.commit()
        user.subscribe_email(
            user.EmailSubscribeRequest(**self.contracts["userFixtures"]["emailSubscribe"]),
            self.user_request("/api/email/subscribe", account, "POST"),
            self.db,
        )

        redeemed = user.redeem_premium(
            user.RedeemPremiumRequest(code=premium_code.code),
            self.user_request("/api/user/premium/redeem", account, "POST"),
            self.db,
        )
        deleted = user.delete_account(
            self.user_request("/api/user/account", account, "DELETE"),
            self.db,
        )

        self.assertTrue(redeemed["user"]["premiumActive"])
        self.assertEqual(redeemed["user"]["role"], "premium")
        self.assertEqual(deleted.status_code, 200)
        self.assertIn(self.test_settings.session_cookie_name, deleted.headers["set-cookie"])
        self.assertIsNone(self.db.scalar(select(User).where(User.id == account.id)))
        self.assertEqual(self.db.scalars(select(Comment).where(Comment.user_id == account.id)).all(), [])
        self.assertEqual(
            self.db.scalars(select(PremiumCodeRedemption).where(PremiumCodeRedemption.user_id == account.id)).all(),
            [],
        )
        self.assertEqual(self.db.scalars(select(VisitorSession).where(VisitorSession.user_id == account.id)).all(), [])
        self.assertEqual(self.list_email_subscribers(), [])

    def test_admin_delete_and_invalid_premium_code_requests_are_rejected(self):
        admin = self.create_user(kind="admin", role="admin")

        blank_code = user.redeem_premium(
            user.RedeemPremiumRequest(code=""),
            self.user_request("/api/user/premium/redeem", admin, "POST"),
            self.db,
        )
        invalid_code = user.redeem_premium(
            user.RedeemPremiumRequest(code="missing-code"),
            self.user_request("/api/user/premium/redeem", admin, "POST"),
            self.db,
        )
        denied_delete = user.delete_account(
            self.user_request("/api/user/account", admin, "DELETE"),
            self.db,
        )

        self.assertEqual(blank_code.status_code, 400)
        self.assertEqual(json_body(blank_code)["error"], "Code is required")
        self.assertEqual(invalid_code.status_code, 404)
        self.assertEqual(json_body(invalid_code)["error"], "Invalid premium code")
        self.assertEqual(denied_delete.status_code, 403)
        self.assertEqual(json_body(denied_delete)["error"], "Admin accounts cannot be deleted here")


if __name__ == "__main__":
    import unittest

    unittest.main()
