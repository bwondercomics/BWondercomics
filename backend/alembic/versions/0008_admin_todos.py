"""Add admin_todos table.

Revision ID: 0008_admin_todos
Revises: 0007_fix_social_accounts
Create Date: 2026-01-07
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "0008_admin_todos"
down_revision = "0007_fix_social_accounts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_todos (
            id uuid PRIMARY KEY,
            body text NOT NULL,
            created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
            created_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_admin_todos_created_at ON admin_todos(created_at DESC)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_admin_todos_created_at")
    op.execute("DROP TABLE IF EXISTS admin_todos")
