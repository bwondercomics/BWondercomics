"""Add post image fit field.

Revision ID: 0015_post_image_fit
Revises: 0014_page_builder
Create Date: 2026-01-21
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0015_post_image_fit"
down_revision = "0014_page_builder"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "posts",
        sa.Column("image_fit", sa.String(length=20), nullable=False, server_default="cover"),
    )


def downgrade() -> None:
    op.drop_column("posts", "image_fit")
