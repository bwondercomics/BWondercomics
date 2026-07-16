"""Add builder page recovery snapshots.

Revision ID: 0018_builder_page_snapshots
Revises: 0017_page_scope_bindings
Create Date: 2026-07-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0018_builder_page_snapshots"
down_revision = "0017_page_scope_bindings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "builder_page_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        # Intentionally not an FK so snapshots survive builder page deletion.
        sa.Column("page_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scope", sa.String(length=20), nullable=False),
        sa.Column("series_id", sa.String(length=64), nullable=True),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("action", sa.String(length=40), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("payload_version", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("payload_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("scope IN ('series', 'global')", name="ck_builder_page_snapshots_scope"),
        sa.CheckConstraint(
            "(scope = 'global' AND series_id IS NULL) OR "
            "(scope = 'series' AND series_id IS NOT NULL)",
            name="ck_builder_page_snapshots_scope_series_id",
        ),
        sa.CheckConstraint("payload_version > 0", name="ck_builder_page_snapshots_payload_version"),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name="fk_builder_page_snapshots_created_by_user_id",
            ondelete="SET NULL",
        ),
    )
    op.create_index(
        "ix_builder_page_snapshots_page_created_at",
        "builder_page_snapshots",
        ["page_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "ix_builder_page_snapshots_scope_series_created_at",
        "builder_page_snapshots",
        ["scope", "series_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "ix_builder_page_snapshots_created_at", "builder_page_snapshots", ["created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_builder_page_snapshots_created_at", table_name="builder_page_snapshots")
    op.drop_index(
        "ix_builder_page_snapshots_scope_series_created_at",
        table_name="builder_page_snapshots",
    )
    op.drop_index("ix_builder_page_snapshots_page_created_at", table_name="builder_page_snapshots")
    op.drop_table("builder_page_snapshots")
