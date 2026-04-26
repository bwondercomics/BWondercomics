"""Ensure tracking tables include all expected columns.

Revision ID: 0005_tracking_columns
Revises: 0004_admin_features
Create Date: 2026-01-13
"""

from __future__ import annotations

from alembic import op


revision = "0005_tracking_columns"
down_revision = "0004_admin_features"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS visitor_sessions (
            id uuid PRIMARY KEY,
            visitor_id varchar(120),
            user_id uuid,
            ip_address varchar(64),
            origin varchar(300),
            referrer varchar(500),
            path varchar(300),
            title varchar(300),
            series_id varchar(64),
            entry_title varchar(200),
            entry_label varchar(200),
            page_number integer,
            entries_read json NOT NULL DEFAULT '[]'::json,
            series_read json NOT NULL DEFAULT '[]'::json,
            first_seen timestamptz NOT NULL DEFAULT now(),
            last_seen timestamptz NOT NULL DEFAULT now(),
            hit_count integer NOT NULL DEFAULT 0
        )
        """
    )
    op.execute("ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS visitor_id varchar(120)")
    op.execute("ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS user_id uuid")
    op.execute("ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS ip_address varchar(64)")
    op.execute("ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS origin varchar(300)")
    op.execute("ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS referrer varchar(500)")
    op.execute("ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS path varchar(300)")
    op.execute("ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS title varchar(300)")
    op.execute("ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS series_id varchar(64)")
    op.execute("ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS entry_title varchar(200)")
    op.execute("ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS entry_label varchar(200)")
    op.execute("ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS page_number integer")
    op.execute("ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS entries_read json NOT NULL DEFAULT '[]'::json")
    op.execute("ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS series_read json NOT NULL DEFAULT '[]'::json")
    op.execute("ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS first_seen timestamptz NOT NULL DEFAULT now()")
    op.execute("ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS last_seen timestamptz NOT NULL DEFAULT now()")
    op.execute("ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS hit_count integer NOT NULL DEFAULT 0")
    op.execute("CREATE INDEX IF NOT EXISTS ix_visitor_sessions_last_seen ON visitor_sessions(last_seen)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS visitor_events (
            id uuid PRIMARY KEY,
            visitor_id varchar(120),
            user_id uuid,
            ip_address varchar(64),
            origin varchar(300),
            referrer varchar(500),
            path varchar(300),
            title varchar(300),
            series_id varchar(64),
            entry_title varchar(200),
            entry_label varchar(200),
            page_number integer,
            created_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("ALTER TABLE visitor_events ADD COLUMN IF NOT EXISTS visitor_id varchar(120)")
    op.execute("ALTER TABLE visitor_events ADD COLUMN IF NOT EXISTS user_id uuid")
    op.execute("ALTER TABLE visitor_events ADD COLUMN IF NOT EXISTS ip_address varchar(64)")
    op.execute("ALTER TABLE visitor_events ADD COLUMN IF NOT EXISTS origin varchar(300)")
    op.execute("ALTER TABLE visitor_events ADD COLUMN IF NOT EXISTS referrer varchar(500)")
    op.execute("ALTER TABLE visitor_events ADD COLUMN IF NOT EXISTS path varchar(300)")
    op.execute("ALTER TABLE visitor_events ADD COLUMN IF NOT EXISTS title varchar(300)")
    op.execute("ALTER TABLE visitor_events ADD COLUMN IF NOT EXISTS series_id varchar(64)")
    op.execute("ALTER TABLE visitor_events ADD COLUMN IF NOT EXISTS entry_title varchar(200)")
    op.execute("ALTER TABLE visitor_events ADD COLUMN IF NOT EXISTS entry_label varchar(200)")
    op.execute("ALTER TABLE visitor_events ADD COLUMN IF NOT EXISTS page_number integer")
    op.execute("ALTER TABLE visitor_events ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()")
    op.execute("CREATE INDEX IF NOT EXISTS ix_visitor_events_created_at ON visitor_events(created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_visitor_events_entry_label ON visitor_events(entry_label)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_visitor_events_series_id ON visitor_events(series_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_visitor_events_series_id")
    op.execute("DROP INDEX IF EXISTS ix_visitor_events_entry_label")
    op.execute("DROP INDEX IF EXISTS ix_visitor_events_created_at")
    op.execute("DROP INDEX IF EXISTS ix_visitor_sessions_last_seen")
