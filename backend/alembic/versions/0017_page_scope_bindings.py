"""Add builder page scopes and route bindings.

Revision ID: 0017_page_scope_bindings
Revises: 0016_oidc_provider
Create Date: 2026-06-03
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0017_page_scope_bindings"
down_revision = "0016_oidc_provider"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "builder_pages",
        sa.Column("scope", sa.String(length=20), nullable=False, server_default="series"),
    )
    op.alter_column("builder_pages", "series_id", existing_type=sa.String(length=64), nullable=True)
    op.drop_index("ix_builder_pages_series_slug", table_name="builder_pages")
    op.create_check_constraint(
        "ck_builder_pages_scope",
        "builder_pages",
        "scope IN ('series', 'global')",
    )
    op.create_check_constraint(
        "ck_builder_pages_scope_series_id",
        "builder_pages",
        "(scope = 'global' AND series_id IS NULL) OR (scope = 'series' AND series_id IS NOT NULL)",
    )
    op.create_index("ix_builder_pages_scope", "builder_pages", ["scope"])
    op.create_index(
        "ux_builder_pages_series_scope_slug",
        "builder_pages",
        ["scope", "series_id", "slug"],
        unique=True,
        postgresql_where=sa.text("scope = 'series'"),
        sqlite_where=sa.text("scope = 'series'"),
    )
    op.create_index(
        "ux_builder_pages_global_slug",
        "builder_pages",
        ["scope", "slug"],
        unique=True,
        postgresql_where=sa.text("scope = 'global'"),
        sqlite_where=sa.text("scope = 'global'"),
    )

    op.create_table(
        "builder_page_bindings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("series_id", sa.String(length=64), nullable=False),
        sa.Column("role", sa.String(length=30), nullable=False),
        sa.Column("page_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "role IN ('reader', 'feed', 'gallery')", name="ck_builder_page_bindings_role"
        ),
        sa.ForeignKeyConstraint(
            ["series_id"],
            ["series.id"],
            name="fk_builder_page_bindings_series_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["page_id"],
            ["builder_pages.id"],
            name="fk_builder_page_bindings_page_id",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_builder_page_bindings_series_id", "builder_page_bindings", ["series_id"])
    op.create_index("ix_builder_page_bindings_page_id", "builder_page_bindings", ["page_id"])
    op.create_index(
        "ux_builder_page_bindings_series_role",
        "builder_page_bindings",
        ["series_id", "role"],
        unique=True,
    )

    connection = op.get_bind()
    reader_pages = connection.execute(
        sa.text(
            """
            SELECT id, series_id
            FROM (
                SELECT
                    id,
                    series_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY series_id
                        ORDER BY
                            CASE WHEN is_published THEN 0 ELSE 1 END,
                            sort_index ASC,
                            created_at ASC
                    ) AS rn
                FROM builder_pages
                WHERE scope = 'series'
                  AND slug = 'reader'
                  AND series_id IS NOT NULL
            ) ranked
            WHERE rn = 1
            """
        )
    ).mappings()
    for row in reader_pages:
        connection.execute(
            sa.text(
                """
                INSERT INTO builder_page_bindings (id, series_id, role, page_id, created_at, updated_at)
                VALUES (:id, :series_id, 'reader', :page_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "series_id": row["series_id"],
                "page_id": row["id"],
            },
        )


def downgrade() -> None:
    op.drop_index("ux_builder_page_bindings_series_role", table_name="builder_page_bindings")
    op.drop_index("ix_builder_page_bindings_page_id", table_name="builder_page_bindings")
    op.drop_index("ix_builder_page_bindings_series_id", table_name="builder_page_bindings")
    op.drop_table("builder_page_bindings")

    op.drop_index("ux_builder_pages_global_slug", table_name="builder_pages")
    op.drop_index("ux_builder_pages_series_scope_slug", table_name="builder_pages")
    op.drop_index("ix_builder_pages_scope", table_name="builder_pages")
    op.drop_constraint("ck_builder_pages_scope_series_id", "builder_pages", type_="check")
    op.drop_constraint("ck_builder_pages_scope", "builder_pages", type_="check")
    op.execute("DELETE FROM builder_pages WHERE scope = 'global'")
    op.alter_column(
        "builder_pages", "series_id", existing_type=sa.String(length=64), nullable=False
    )
    op.drop_column("builder_pages", "scope")
    op.create_index(
        "ix_builder_pages_series_slug", "builder_pages", ["series_id", "slug"], unique=True
    )
