"""Media library + page config tables.

Revision ID: 85301a03ea9c
Revises: 0003_series_entries
Create Date: 2026-01-09
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "85301a03ea9c"
down_revision = "0003_series_entries"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "media_items",
        sa.Column("id", sa.String(length=120), primary_key=True, nullable=False),
        sa.Column("path", sa.String(length=500), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_media_items_path", "media_items", ["path"], unique=True)

    op.create_table(
        "page_configs",
        sa.Column("series_id", sa.String(length=64), primary_key=True, nullable=False),
        sa.Column("config", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("page_configs")
    op.drop_index("ix_media_items_path", table_name="media_items")
    op.drop_table("media_items")
