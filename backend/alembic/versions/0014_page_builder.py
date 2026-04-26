"""Page builder tables.

Revision ID: 0014_page_builder
Revises: 0013_posts_media_id
Create Date: 2026-01-21
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0014_page_builder"
down_revision = "0013_posts_media_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create builder_pages table
    op.create_table(
        "builder_pages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("series_id", sa.String(length=64), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("page_type", sa.String(length=30), nullable=False, server_default="custom"),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_homepage", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("sort_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("meta", postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["series_id"], ["series.id"], name="fk_builder_pages_series_id", ondelete="CASCADE"),
    )
    op.create_index("ix_builder_pages_series_id", "builder_pages", ["series_id"])
    op.create_index("ix_builder_pages_series_slug", "builder_pages", ["series_id", "slug"], unique=True)

    # Create builder_sections table
    op.create_table(
        "builder_sections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("page_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("section_type", sa.String(length=30), nullable=False, server_default="row"),
        sa.Column("layout", sa.String(length=50), nullable=False, server_default="1"),
        sa.Column("sort_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("settings", postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["page_id"], ["builder_pages.id"], name="fk_builder_sections_page_id", ondelete="CASCADE"
        ),
    )
    op.create_index("ix_builder_sections_page_id", "builder_sections", ["page_id"])

    # Create builder_modules table
    op.create_table(
        "builder_modules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("section_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("module_type", sa.String(length=50), nullable=False),
        sa.Column("column_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sort_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("config", postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["section_id"], ["builder_sections.id"], name="fk_builder_modules_section_id", ondelete="CASCADE"
        ),
    )
    op.create_index("ix_builder_modules_section_id", "builder_modules", ["section_id"])


def downgrade() -> None:
    op.drop_index("ix_builder_modules_section_id", table_name="builder_modules")
    op.drop_table("builder_modules")

    op.drop_index("ix_builder_sections_page_id", table_name="builder_sections")
    op.drop_table("builder_sections")

    op.drop_index("ix_builder_pages_series_slug", table_name="builder_pages")
    op.drop_index("ix_builder_pages_series_id", table_name="builder_pages")
    op.drop_table("builder_pages")
