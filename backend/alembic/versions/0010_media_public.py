"""Add public flag to media items.

Revision ID: 0010_media_public
Revises: 0009_entry_labels
Create Date: 2026-01-13
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0010_media_public"
down_revision = "0009_entry_labels"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "media_items",
        sa.Column("public", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )


def downgrade() -> None:
    op.drop_column("media_items", "public")
