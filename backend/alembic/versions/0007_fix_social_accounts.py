"""Fix social_accounts table schema.

Revision ID: 0007_fix_social_accounts
Revises: 0006_comment_limits_uuid
Create Date: 2026-01-06
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "0007_fix_social_accounts"
down_revision = "0006_comment_limits_uuid"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add missing pds_url column if it doesn't exist
    op.execute("ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS pds_url varchar(200)")


def downgrade() -> None:
    op.execute("ALTER TABLE social_accounts DROP COLUMN IF EXISTS pds_url")
