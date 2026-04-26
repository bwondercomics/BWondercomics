from __future__ import annotations

import os
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select, text

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-route-tests.db")

from backend.app.models import Comment, EmailSubscriber, PremiumCode, PremiumCodeRedemption, User, VisitorSession
from backend.app.routes import admin

from backend.tests.helpers import BackendRouteTestCase, build_request


class AdminRouteTests(BackendRouteTestCase):
    def test_admin_delete_user_cleans_uuid_linked_records_and_raw_personal_feed_rows(self):
        admin_user = self.create_user(kind="admin", role="admin", email="admin@example.com")
        target = self.create_user(kind="user", email="target@example.com", display_name="Target")
        now = datetime.now(timezone.utc)

        self.db.add(
            Comment(
                id=uuid4(),
                target_id="battle-bros--issue-10",
                user_id=target.id,
                display_name=target.display_name,
                message="Delete me",
                created_at=now,
                ip_address="198.51.100.10",
            )
        )
        premium_code = PremiumCode(
            id=uuid4(),
            code="admin-delete-test",
            note="cleanup",
            active=False,
            created_at=now,
            created_by=target.id,
            redeemed_by=target.id,
            redeemed_at=now,
            redeemed_ip="198.51.100.10",
        )
        self.db.add(premium_code)
        self.db.add(
            PremiumCodeRedemption(
                id=uuid4(),
                code_id=premium_code.id,
                user_id=target.id,
                redeemed_at=now,
                redeemed_ip="198.51.100.10",
            )
        )
        self.db.add(
            EmailSubscriber(
                id=uuid4(),
                email=target.email,
                source="account",
                ip_address="198.51.100.10",
                opted_in_at=now,
            )
        )
        self.db.add(
            VisitorSession(
                id=uuid4(),
                visitor_id="admin-delete-session",
                user_id=target.id,
                ip_address="198.51.100.10",
                origin="https://battlebros.example.com",
                referrer="https://battlebros.example.com/feed.html",
                path="/index.html",
                title="Battle Bros Reader",
                series_id="battle-bros",
                entry_title="Issue 10",
                entry_label="battle-bros | Issue 10",
                page_number=2,
                entries_read=["battle-bros | Issue 10"],
                series_read=["battle-bros"],
                first_seen=now,
                last_seen=now,
                hit_count=1,
            )
        )
        self.db.execute(
            text("INSERT INTO personal_feed_items (id, user_id) VALUES (:id, :uid)"),
            {"id": "pfi-1", "uid": str(target.id)},
        )
        self.db.commit()

        response = admin.admin_delete_user(
            str(target.id),
            build_request(f"/api/admin/users/{target.id}", method="DELETE", cookie=self.auth_cookie(admin_user)),
            self.db,
        )

        self.assertEqual(response, {"status": "ok"})
        self.assertIsNone(self.db.scalar(select(User).where(User.id == target.id)))
        self.assertEqual(self.db.scalars(select(Comment).where(Comment.user_id == target.id)).all(), [])
        self.assertEqual(
            self.db.scalars(select(PremiumCodeRedemption).where(PremiumCodeRedemption.user_id == target.id)).all(),
            [],
        )
        self.assertEqual(
            self.db.scalars(select(EmailSubscriber).where(EmailSubscriber.email == target.email)).all(),
            [],
        )

        self.db.refresh(premium_code)
        self.assertIsNone(premium_code.created_by)
        self.assertIsNone(premium_code.redeemed_by)

        visitor_session = self.db.scalar(
            select(VisitorSession).where(VisitorSession.visitor_id == "admin-delete-session")
        )
        self.assertIsNotNone(visitor_session)
        self.assertIsNone(visitor_session.user_id)

        personal_feed_count = self.db.execute(
            text("SELECT count(*) FROM personal_feed_items WHERE user_id = :uid"),
            {"uid": str(target.id)},
        ).scalar_one()
        self.assertEqual(personal_feed_count, 0)


if __name__ == "__main__":
    import unittest

    unittest.main()
