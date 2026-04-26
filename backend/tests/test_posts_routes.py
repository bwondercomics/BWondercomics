from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import UUID, uuid4

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///tmp/bw-quality-route-tests.db")

from backend.app.models import Post
from backend.app.routes import posts

from backend.tests.helpers import BackendRouteTestCase, build_request, json_body, parse_iso_z


class PostsRouteTests(BackendRouteTestCase):
    def test_public_and_admin_post_lists_respect_visibility_contracts(self):
        admin = self.create_user(kind="admin", role="admin")
        published_at = parse_iso_z(self.contracts["posts"]["published"]["date"])
        self.db.add(
            Post(
                id=uuid4(),
                title="Draft Update",
                content="<p>Not public</p>",
                image="",
                image_tags=[],
                image_fit="cover",
                image_focus="center",
                share=False,
                share_bluesky=False,
                status="draft",
                publish_at=published_at,
                created_at=published_at,
                updated_at=published_at,
            )
        )
        self.seed_posts()
        scheduled = self.db.get(Post, UUID(self.contracts["posts"]["scheduled"]["id"]))
        assert scheduled is not None
        scheduled.publish_at = datetime.now(timezone.utc) + timedelta(days=30)
        scheduled.status = "scheduled"
        self.db.add(scheduled)
        self.db.commit()

        public_payload = posts.list_public_posts(limit=50, offset=0, db=self.db)
        admin_request = build_request(
            "/api/admin/posts",
            cookie=self.auth_cookie(admin),
        )
        admin_payload = posts.admin_list_posts(admin_request, self.db)

        self.assertEqual([post["status"] for post in public_payload["posts"]], ["published"])
        self.assertEqual(len(admin_payload["posts"]), 3)

    def test_listing_public_posts_promotes_due_scheduled_posts(self):
        seeded = self.seed_posts()
        scheduled = seeded["scheduled"]
        scheduled.publish_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        scheduled.status = "scheduled"
        scheduled.share = False
        scheduled.share_bluesky = False
        self.db.add(scheduled)
        self.db.commit()

        payload = posts.list_public_posts(limit=50, offset=0, db=self.db)

        self.db.refresh(scheduled)
        self.assertEqual(scheduled.status, "published")
        self.assertEqual(len(payload["posts"]), 2)
        self.assertEqual(payload["posts"][0]["status"], "published")

    def test_admin_create_post_copies_protected_images_and_schedules_future_publish(self):
        admin = self.create_user(kind="admin", role="admin")
        source_path = self.base_dir / "protected" / "media" / "posts" / "patron-early-access.png"
        source_path.parent.mkdir(parents=True, exist_ok=True)
        source_path.write_bytes(b"protected-post-image")
        publish_at = datetime.now(timezone.utc) + timedelta(days=30)
        request = build_request(
            "/api/admin/posts",
            method="POST",
            cookie=self.auth_cookie(admin),
        )
        payload = posts.PostUpsertRequest(
            title=self.contracts["posts"]["scheduled"]["title"],
            content=self.contracts["posts"]["scheduled"]["content"],
            image=self.contracts["posts"]["scheduled"]["image"],
            imageTags=self.contracts["posts"]["scheduled"]["imageTags"],
            imageFit=self.contracts["posts"]["scheduled"]["imageFit"],
            imageFocus=self.contracts["posts"]["scheduled"]["imageFocus"],
            share=True,
            shareBluesky=True,
            status="published",
            date=publish_at.isoformat().replace("+00:00", "Z"),
        )

        with patch("backend.app.routes.posts.ensure_media_previews", lambda *_args, **_kwargs: None):
            response = posts.admin_create_post(payload, request, self.db)

        self.assertEqual(response["post"]["status"], "scheduled")
        self.assertTrue(response["post"]["image"].startswith("media/post-assets/"))
        copied_asset = self.base_dir / response["post"]["image"]
        self.assertTrue(copied_asset.exists())

    def test_deleting_a_post_cleans_up_unused_post_assets(self):
        admin = self.create_user(kind="admin", role="admin")
        publish_at = parse_iso_z(self.contracts["posts"]["published"]["date"])
        post = Post(
            id=UUID(self.contracts["posts"]["published"]["id"]),
            title="Cleanup",
            content="<p>Cleanup</p>",
            image="media/post-assets/cleanup.png",
            image_tags=[],
            image_fit="cover",
            image_focus="center",
            share=True,
            share_bluesky=False,
            status="published",
            publish_at=publish_at,
            created_at=publish_at,
            updated_at=publish_at,
        )
        self.db.add(post)
        self.db.commit()

        cleanup_path = self.base_dir / "media" / "post-assets" / "cleanup.png"
        cleanup_path.parent.mkdir(parents=True, exist_ok=True)
        cleanup_path.write_bytes(b"cleanup")

        request = build_request(
            f"/api/admin/posts/{post.id}",
            method="DELETE",
            cookie=self.auth_cookie(admin),
        )
        response = posts.admin_delete_post(str(post.id), request, self.db)

        self.assertEqual(response["status"], "ok")
        self.assertFalse(cleanup_path.exists())


if __name__ == "__main__":
    import unittest

    unittest.main()
