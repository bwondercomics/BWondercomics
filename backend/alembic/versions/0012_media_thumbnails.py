"""Add thumbnail paths for entries and media items.

Revision ID: 0012_media_thumbnails
Revises: 0011_media_access
Create Date: 2026-01-16
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0012_media_thumbnails"
down_revision = "0011_media_access"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "entries",
        sa.Column("cover_thumb_path", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "media_items",
        sa.Column("thumb_path", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "media_items",
        sa.Column("preview_path", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("media_items", "preview_path")
    op.drop_column("media_items", "thumb_path")
    op.drop_column("entries", "cover_thumb_path")
