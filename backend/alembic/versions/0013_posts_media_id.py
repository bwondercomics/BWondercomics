"""Add media_id to posts for media library linkage.

Revision ID: 0013_posts_media_id
Revises: 0012_media_thumbnails
Create Date: 2026-01-16
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0013_posts_media_id"
down_revision = "0012_media_thumbnails"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("media_id", sa.String(length=120), nullable=True))
    op.create_index("ix_posts_media_id", "posts", ["media_id"])
    op.create_foreign_key(
        "fk_posts_media_id_media_items",
        "posts",
        "media_items",
        ["media_id"],
        ["id"],
        ondelete="SET NULL",
    )

    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE posts
            SET media_id = m.id
            FROM media_items m
            WHERE posts.media_id IS NULL
              AND posts.image IS NOT NULL
              AND posts.image <> ''
              AND (
                posts.image = m.path
                OR posts.image = concat('protected/', m.path)
                OR m.path = concat('protected/', posts.image)
              )
            """
        )
    )
    conn.execute(
        sa.text(
            """
            UPDATE posts
            SET media_id = m.id
            FROM media_items m
            WHERE posts.media_id IS NULL
              AND posts.image LIKE 'media/post-assets/%'
              AND m.id = regexp_replace(posts.image, '^media/post-assets/([^./]+).*$','\\1')
            """
        )
    )


def downgrade() -> None:
    op.drop_constraint("fk_posts_media_id_media_items", "posts", type_="foreignkey")
    op.drop_index("ix_posts_media_id", table_name="posts")
    op.drop_column("posts", "media_id")
