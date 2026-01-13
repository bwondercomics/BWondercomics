"""Entry labels + entry visibility flags.

Revision ID: 0009_entry_labels
Revises: 0008_admin_todos
Create Date: 2026-01-13
"""

from __future__ import annotations

import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0009_entry_labels"
down_revision = "0008_admin_todos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "entry_labels",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("series_id", sa.String(length=64), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("singular", sa.String(length=30), nullable=False),
        sa.Column("plural", sa.String(length=30), nullable=False),
        sa.Column("sort_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["series_id"], ["series.id"], name="fk_entry_labels_series_id", ondelete="CASCADE"),
    )
    op.create_index("ix_entry_labels_series_id", "entry_labels", ["series_id"])

    op.add_column("entries", sa.Column("entry_label_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column(
        "entries",
        sa.Column("show_in_dropdown", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "entries",
        sa.Column("show_in_gallery", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "entries",
        sa.Column("release_type", sa.String(length=20), nullable=False, server_default="digital"),
    )
    op.add_column("entries", sa.Column("store_url", sa.String(length=500), nullable=True))
    op.add_column("entries", sa.Column("cover_image", sa.String(length=500), nullable=True))
    op.create_index("ix_entries_entry_label_id", "entries", ["entry_label_id"])
    op.create_foreign_key(
        "fk_entries_entry_label_id",
        "entries",
        "entry_labels",
        ["entry_label_id"],
        ["id"],
        ondelete="SET NULL",
    )

    conn = op.get_bind()
    series_rows = conn.execute(
        sa.text("SELECT id, unit_label_singular, unit_label_plural FROM series")
    ).fetchall()

    label_ids: dict[str, uuid.UUID] = {}
    for row in series_rows:
        if not row.id:
            continue
        label_id = uuid.uuid4()
        label_ids[row.id] = label_id
        singular = (row.unit_label_singular or "Entry")[:30]
        plural = (row.unit_label_plural or "Entries")[:30]
        slug = (singular or "entry").strip().lower()
        slug = "".join(ch if ch.isalnum() or ch in ("-", "_") else "-" for ch in slug)
        slug = "-".join(filter(None, slug.split("-")))[:64] or "entry"
        conn.execute(
            sa.text(
                """
                INSERT INTO entry_labels (id, series_id, slug, singular, plural, sort_index, is_default, created_at, updated_at)
                VALUES (:id, :series_id, :slug, :singular, :plural, 0, true, now(), now())
                """
            ),
            {
                "id": label_id,
                "series_id": row.id,
                "slug": slug,
                "singular": singular,
                "plural": plural,
            },
        )

    for series_id, label_id in label_ids.items():
        conn.execute(
            sa.text(
                "UPDATE entries SET entry_label_id = :label_id WHERE series_id = :series_id"
            ),
            {"label_id": label_id, "series_id": series_id},
        )


def downgrade() -> None:
    op.drop_constraint("fk_entries_entry_label_id", "entries", type_="foreignkey")
    op.drop_index("ix_entries_entry_label_id", table_name="entries")
    op.drop_column("entries", "cover_image")
    op.drop_column("entries", "store_url")
    op.drop_column("entries", "release_type")
    op.drop_column("entries", "show_in_gallery")
    op.drop_column("entries", "show_in_dropdown")
    op.drop_column("entries", "entry_label_id")

    op.drop_index("ix_entry_labels_series_id", table_name="entry_labels")
    op.drop_table("entry_labels")
