"""Series + entries tables.

Revision ID: 0003_series_entries
Revises: 0002_posts
Create Date: 2025-12-17
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0003_series_entries"
down_revision = "0002_posts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "series",
        sa.Column("id", sa.String(length=64), primary_key=True, nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("cover_image", sa.String(length=500), nullable=True),
        sa.Column("premium_only", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("status_message", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("unit_label_singular", sa.String(length=30), nullable=False, server_default="Chapter"),
        sa.Column("unit_label_plural", sa.String(length=30), nullable=False, server_default="Chapters"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("series_id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("display_number", sa.Integer(), nullable=True),
        sa.Column("folder_path", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("premium_only", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="published"),
        sa.Column("publish_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("sort_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["series_id"], ["series.id"], name="fk_entries_series_id", ondelete="CASCADE"),
    )
    op.create_index("ix_entries_series_id", "entries", ["series_id"])

    op.create_table(
        "entry_pages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("entry_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sort_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("path", sa.String(length=500), nullable=False),
        sa.Column("alt_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["entry_id"], ["entries.id"], name="fk_entry_pages_entry_id", ondelete="CASCADE"),
    )
    op.create_index("ix_entry_pages_entry_id", "entry_pages", ["entry_id"])

    op.create_index("ix_entries_publish_at", "entries", ["publish_at"])
    op.create_index("ix_entries_status", "entries", ["status"])


def downgrade() -> None:
    op.drop_index("ix_entries_status", table_name="entries")
    op.drop_index("ix_entries_publish_at", table_name="entries")
    op.drop_index("ix_entry_pages_entry_id", table_name="entry_pages")
    op.drop_table("entry_pages")
    op.drop_index("ix_entries_series_id", table_name="entries")
    op.drop_table("entries")
    op.drop_table("series")

