"""Posts table (blog/feed entries).

Revision ID: 0002_posts
Revises: 0001_initial
Create Date: 2025-12-16
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0002_posts"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "posts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("image", sa.String(length=500), nullable=True),
        sa.Column("image_tags", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("image_focus", sa.String(length=20), nullable=False, server_default="center"),
        sa.Column("share", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="published"),
        sa.Column("publish_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_index("ix_posts_publish_at", "posts", ["publish_at"])
    op.create_index("ix_posts_status", "posts", ["status"])


def downgrade() -> None:
    op.drop_index("ix_posts_status", table_name="posts")
    op.drop_index("ix_posts_publish_at", table_name="posts")
    op.drop_table("posts")

