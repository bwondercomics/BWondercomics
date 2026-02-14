"""Add OIDC provider tables.

Revision ID: 0016_oidc_provider
Revises: 0015_post_image_fit
Create Date: 2026-02-10
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0016_oidc_provider"
down_revision = "0015_post_image_fit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "oidc_clients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("client_id", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False, server_default="Stoat Chat"),
        sa.Column("redirect_uris", postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("scopes", postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("client_id", name="uq_oidc_clients_client_id"),
    )
    op.create_index("ix_oidc_clients_client_id", "oidc_clients", ["client_id"], unique=True)

    op.create_table(
        "oidc_authorization_codes",
        sa.Column("code", sa.String(length=128), primary_key=True, nullable=False),
        sa.Column("client_id", sa.String(length=120), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("redirect_uri", sa.String(length=500), nullable=False),
        sa.Column("scope", sa.String(length=300), nullable=False, server_default="openid"),
        sa.Column("nonce", sa.String(length=200), nullable=True),
        sa.Column("code_challenge", sa.String(length=200), nullable=False),
        sa.Column("code_challenge_method", sa.String(length=20), nullable=False, server_default="S256"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_oidc_codes_user_id", ondelete="CASCADE"),
    )
    op.create_index(
        "ix_oidc_authorization_codes_client_id",
        "oidc_authorization_codes",
        ["client_id"],
        unique=False,
    )

    op.create_table(
        "oidc_refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("client_id", sa.String(length=120), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scope", sa.String(length=300), nullable=False, server_default="openid"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_oidc_refresh_tokens_user_id", ondelete="CASCADE"
        ),
        sa.UniqueConstraint("token_hash", name="uq_oidc_refresh_tokens_token_hash"),
    )
    op.create_index(
        "ix_oidc_refresh_tokens_token_hash",
        "oidc_refresh_tokens",
        ["token_hash"],
        unique=True,
    )
    op.create_index(
        "ix_oidc_refresh_tokens_client_id",
        "oidc_refresh_tokens",
        ["client_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_oidc_refresh_tokens_client_id", table_name="oidc_refresh_tokens")
    op.drop_index("ix_oidc_refresh_tokens_token_hash", table_name="oidc_refresh_tokens")
    op.drop_table("oidc_refresh_tokens")

    op.drop_index("ix_oidc_authorization_codes_client_id", table_name="oidc_authorization_codes")
    op.drop_table("oidc_authorization_codes")

    op.drop_index("ix_oidc_clients_client_id", table_name="oidc_clients")
    op.drop_table("oidc_clients")
