"""Align comment_limits schema with existing UUID primary key.

Revision ID: 0006_comment_limits_uuid
Revises: 0005_tracking_columns
Create Date: 2026-01-13
"""

from __future__ import annotations

from alembic import op


revision = "0006_comment_limits_uuid"
down_revision = "0005_tracking_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE comment_limits ADD COLUMN IF NOT EXISTS updated_by uuid")

    op.execute(
        """
        DO $$
        DECLARE
            has_int_id boolean;
            has_updated_by boolean;
        BEGIN
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'comment_limits'
                  AND column_name = 'id'
                  AND data_type = 'integer'
            ) INTO has_int_id;

            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'comment_limits'
                  AND column_name = 'updated_by'
            ) INTO has_updated_by;

            IF has_int_id THEN
                CREATE TABLE comment_limits_new (
                    id uuid PRIMARY KEY,
                    min_interval_seconds integer NOT NULL DEFAULT 0,
                    rate_window_seconds integer NOT NULL DEFAULT 60,
                    max_per_window_user integer NOT NULL DEFAULT 10,
                    max_per_window_ip integer NOT NULL DEFAULT 25,
                    duplicate_window_seconds integer NOT NULL DEFAULT 30,
                    updated_at timestamptz,
                    updated_by uuid
                );

                IF has_updated_by THEN
                    EXECUTE
                        'INSERT INTO comment_limits_new (id, min_interval_seconds, rate_window_seconds, max_per_window_user, max_per_window_ip, duplicate_window_seconds, updated_at, updated_by) ' ||
                        'SELECT md5(random()::text || clock_timestamp()::text)::uuid, min_interval_seconds, rate_window_seconds, max_per_window_user, max_per_window_ip, duplicate_window_seconds, updated_at, updated_by FROM comment_limits';
                ELSE
                    EXECUTE
                        'INSERT INTO comment_limits_new (id, min_interval_seconds, rate_window_seconds, max_per_window_user, max_per_window_ip, duplicate_window_seconds, updated_at, updated_by) ' ||
                        'SELECT md5(random()::text || clock_timestamp()::text)::uuid, min_interval_seconds, rate_window_seconds, max_per_window_user, max_per_window_ip, duplicate_window_seconds, updated_at, NULL FROM comment_limits';
                END IF;

                DROP TABLE comment_limits;
                ALTER TABLE comment_limits_new RENAME TO comment_limits;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    # No downgrade: avoid data loss or mismatched types.
    pass
