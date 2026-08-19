"""Relax the legacy Admin/Ops command column.

Revision ID: 0019_admin_ops_legacy_command
Revises: 0018_builder_page_snapshots
Create Date: 2026-08-19
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "0019_admin_ops_legacy_command"
down_revision = "0018_builder_page_snapshots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Early production installs created this extra column before Alembic owned
    # the Ops table. Fresh installs do not have it, so keep the repair
    # conditional and preserve all historical values.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'admin_ops_runs'
                  AND column_name = 'command'
            ) THEN
                ALTER TABLE admin_ops_runs ALTER COLUMN command DROP NOT NULL;
            END IF;
        END
        $$
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'admin_ops_runs'
                  AND column_name = 'command'
            ) THEN
                UPDATE admin_ops_runs
                SET command = command_id
                WHERE command IS NULL;
                ALTER TABLE admin_ops_runs ALTER COLUMN command SET NOT NULL;
            END IF;
        END
        $$
        """
    )
