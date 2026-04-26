"""Add access fields for media items.

Revision ID: 0011_media_access
Revises: 0010_media_public
Create Date: 2026-01-14
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0011_media_access"
down_revision = "0010_media_public"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "media_items",
        sa.Column("access", sa.String(length=20), nullable=False, server_default="public"),
    )
    op.add_column(
        "media_items",
        sa.Column(
            "premium_visibility",
            sa.String(length=20),
            nullable=False,
            server_default="blur",
        ),
    )


def downgrade() -> None:
    op.drop_column("media_items", "premium_visibility")
    op.drop_column("media_items", "access")
