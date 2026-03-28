from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import delete

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-route-tests.db")

from backend.app.models import BannedIP, CensoredWord, Comment, CommentLimit
from backend.app.routes import comments

from backend.tests.helpers import BackendRouteTestCase, build_request, json_body


class CommentRoutesTests(BackendRouteTestCase):
    def test_post_comment_requires_authentication(self):
        request = build_request("/api/comments", method="POST")
        payload = comments.PostCommentRequest(targetId="issue-10", message="First!")

        response = comments.post_comment(payload, request, self.db)

        self.assertEqual(response.status_code, 401)
        self.assertEqual(json_body(response)["error"], "Not authenticated")

    def test_post_comment_rejects_banned_users_and_banned_ips(self):
        banned_user = self.create_user(kind="user", banned_at=datetime.now(timezone.utc))
        banned_request = build_request(
            "/api/comments",
            method="POST",
            cookie=self.auth_cookie(banned_user),
        )
        payload = comments.PostCommentRequest(targetId="issue-10", message="Nope")
        banned_response = comments.post_comment(payload, banned_request, self.db)
        self.assertEqual(banned_response.status_code, 403)
        self.assertEqual(
            json_body(banned_response)["error"], "Account is banned from commenting"
        )

        allowed_user = self.create_user(kind="premium", role="user", email="allowed@example.com")
        self.db.add(BannedIP(ip_address="203.0.113.10", reason="spam"))
        self.db.commit()
        ip_request = build_request(
            "/api/comments",
            method="POST",
            cookie=self.auth_cookie(allowed_user),
            client=("203.0.113.10", 1234),
        )
        ip_response = comments.post_comment(payload, ip_request, self.db)
        self.assertEqual(ip_response.status_code, 403)
        self.assertEqual(json_body(ip_response)["error"], "IP is banned from commenting")

    def test_post_comment_enforces_rate_limits_duplicates_and_censored_phrases(self):
        user = self.create_user(kind="user", email="commenter@example.com")
        now = datetime.now(timezone.utc)
        self.seed_comment_limits(
            min_interval_seconds=0,
            rate_window_seconds=60,
            max_per_window_user=1,
            max_per_window_ip=5,
            duplicate_window_seconds=60,
        )
        self.db.add(
            Comment(
                id=uuid4(),
                target_id="issue-10",
                user_id=user.id,
                display_name=user.display_name,
                message="Already posted",
                created_at=now,
                ip_address="127.0.0.1",
            )
        )
        self.db.commit()

        request = build_request(
            "/api/comments",
            method="POST",
            cookie=self.auth_cookie(user),
        )
        rate_payload = comments.PostCommentRequest(targetId="issue-10", message="Different text")
        rate_response = comments.post_comment(rate_payload, request, self.db)
        self.assertEqual(rate_response.status_code, 429)
        self.assertEqual(json_body(rate_response)["error"], "Too many comments in a short period")

        self.db.execute(delete(Comment))
        self.db.execute(delete(CommentLimit))
        self.db.commit()
        self.seed_comment_limits(
            min_interval_seconds=0,
            rate_window_seconds=0,
            max_per_window_user=0,
            max_per_window_ip=0,
            duplicate_window_seconds=60,
        )
        self.db.add(
            Comment(
                id=uuid4(),
                target_id="issue-10",
                user_id=user.id,
                display_name=user.display_name,
                message="Repeat me",
                created_at=now - timedelta(seconds=5),
                ip_address="127.0.0.1",
            )
        )
        self.db.add(CensoredWord(id=uuid4(), phrase="spoiler"))
        self.db.commit()

        duplicate_payload = comments.PostCommentRequest(targetId="issue-10", message="Repeat me")
        duplicate_response = comments.post_comment(duplicate_payload, request, self.db)
        self.assertEqual(duplicate_response.status_code, 400)
        self.assertEqual(json_body(duplicate_response)["error"], "Duplicate comment detected")

        censored_payload = comments.PostCommentRequest(targetId="issue-10", message="spoiler alert")
        censored_response = comments.post_comment(censored_payload, request, self.db)
        self.assertEqual(censored_response.status_code, 400)
        self.assertEqual(
            json_body(censored_response)["error"], "Message contains a censored phrase"
        )

    def test_get_comments_hides_moderated_message_for_public_but_not_admins(self):
        user = self.create_user(kind="user", email="reader-comments@example.com")
        admin = self.create_user(kind="admin", role="admin", email="admin-comments@example.com")
        hidden_comment = Comment(
            id=uuid4(),
            target_id="issue-10",
            user_id=user.id,
            display_name=user.display_name,
            message="Hidden by mod",
            created_at=datetime.now(timezone.utc),
            ip_address="127.0.0.1",
            hidden=True,
            hidden_by=admin.id,
            hidden_at=datetime.now(timezone.utc),
        )
        self.db.add(hidden_comment)
        self.db.commit()

        public_request = build_request("/api/comments")
        public_payload = comments.get_comments(public_request, "issue-10", self.db)
        self.assertEqual(public_payload["comments"][0]["message"], "Comment removed by moderator")
        self.assertTrue(public_payload["comments"][0]["hidden"])
        self.assertNotIn("hiddenBy", public_payload["comments"][0])

        admin_request = build_request(
            "/api/comments",
            cookie=self.auth_cookie(admin),
        )
        admin_payload = comments.get_comments(admin_request, "issue-10", self.db)
        self.assertEqual(admin_payload["comments"][0]["message"], "Hidden by mod")
        self.assertEqual(admin_payload["comments"][0]["hiddenBy"], str(admin.id))
        self.assertEqual(admin_payload["comments"][0]["userId"], str(user.id))

    def test_post_comment_returns_the_current_public_comment_shape(self):
        user = self.create_user(kind="user", email="poster@example.com")
        request = build_request(
            "/api/comments",
            method="POST",
            cookie=self.auth_cookie(user),
        )
        payload = comments.PostCommentRequest(targetId="issue-10", message="Fresh comment")

        response = comments.post_comment(payload, request, self.db)

        self.assertEqual(response["comment"]["displayName"], user.display_name)
        self.assertEqual(response["comment"]["message"], "Fresh comment")
        self.assertEqual(response["comment"]["userId"], str(user.id))


if __name__ == "__main__":
    import unittest

    unittest.main()
