"""Admin features tables + columns.

Revision ID: 0004_admin_features
Revises: 85301a03ea9c
Create Date: 2026-01-12
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "0004_admin_features"
down_revision = "85301a03ea9c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Users: email opt-in + moderation fields.
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_opt_in boolean NOT NULL DEFAULT false")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_opt_in_at timestamptz")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at timestamptz")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_by uuid")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_reason text")

    # Comments: store IP for moderation.
    op.execute("ALTER TABLE comments ADD COLUMN IF NOT EXISTS ip_address varchar(64)")

    # Posts: Bluesky sharing metadata.
    op.execute("ALTER TABLE posts ADD COLUMN IF NOT EXISTS share_bluesky boolean NOT NULL DEFAULT false")
    op.execute("ALTER TABLE posts ADD COLUMN IF NOT EXISTS bluesky_error text")
    op.execute("ALTER TABLE posts ADD COLUMN IF NOT EXISTS bluesky_posted_at timestamptz")

    # Email subscribers.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS email_subscribers (
            id uuid PRIMARY KEY,
            email varchar(120) NOT NULL UNIQUE,
            source varchar(80),
            ip_address varchar(64),
            opted_in_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_email_subscribers_email ON email_subscribers(email)")

    # Premium codes and redemptions.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS premium_codes (
            id uuid PRIMARY KEY,
            code varchar(80) NOT NULL UNIQUE,
            note varchar(120),
            active boolean NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT now(),
            created_by uuid,
            redeemed_by uuid,
            redeemed_at timestamptz,
            redeemed_ip varchar(64)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_premium_codes_code ON premium_codes(code)")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS premium_code_redemptions (
            id uuid PRIMARY KEY,
            code_id uuid NOT NULL,
            user_id uuid NOT NULL,
            redeemed_at timestamptz NOT NULL DEFAULT now(),
            redeemed_ip varchar(64)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_premium_code_redemptions_code_id ON premium_code_redemptions(code_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_premium_code_redemptions_user_id ON premium_code_redemptions(user_id)")

    # Moderation tables.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS banned_ips (
            ip_address varchar(64) PRIMARY KEY,
            reason text,
            banned_at timestamptz NOT NULL DEFAULT now(),
            banned_by uuid
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS censored_words (
            id uuid PRIMARY KEY,
            phrase varchar(200) NOT NULL UNIQUE,
            created_at timestamptz NOT NULL DEFAULT now(),
            created_by uuid
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS comment_limits (
            id integer PRIMARY KEY,
            min_interval_seconds integer NOT NULL DEFAULT 0,
            rate_window_seconds integer NOT NULL DEFAULT 60,
            max_per_window_user integer NOT NULL DEFAULT 10,
            max_per_window_ip integer NOT NULL DEFAULT 25,
            duplicate_window_seconds integer NOT NULL DEFAULT 30,
            updated_at timestamptz
        )
        """
    )

    # Ops history.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_ops_runs (
            id uuid PRIMARY KEY,
            command_id varchar(80) NOT NULL,
            label varchar(200),
            status varchar(32) NOT NULL DEFAULT 'running',
            started_at timestamptz NOT NULL DEFAULT now(),
            finished_at timestamptz,
            duration_seconds integer,
            exit_code integer,
            output text,
            output_truncated boolean NOT NULL DEFAULT false,
            error_message text,
            user_email varchar(120),
            disrupts_api boolean NOT NULL DEFAULT false
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_admin_ops_runs_started_at ON admin_ops_runs(started_at)")

    # Social tokens (Bluesky).
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS social_accounts (
            id uuid PRIMARY KEY,
            provider varchar(40) NOT NULL UNIQUE,
            handle varchar(120),
            did varchar(120),
            access_token text,
            refresh_token text,
            pds_url varchar(200),
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_social_accounts_provider ON social_accounts(provider)")

    # Visitor sessions + events (analytics).
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS visitor_sessions (
            id uuid PRIMARY KEY,
            visitor_id varchar(120) NOT NULL UNIQUE,
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
    op.execute("CREATE INDEX IF NOT EXISTS ix_visitor_sessions_last_seen ON visitor_sessions(last_seen)")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS visitor_events (
            id uuid PRIMARY KEY,
            visitor_id varchar(120) NOT NULL,
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
    op.execute("CREATE INDEX IF NOT EXISTS ix_visitor_events_created_at ON visitor_events(created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_visitor_events_entry_label ON visitor_events(entry_label)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_visitor_events_series_id ON visitor_events(series_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS visitor_events")
    op.execute("DROP TABLE IF EXISTS visitor_sessions")
    op.execute("DROP TABLE IF EXISTS social_accounts")
    op.execute("DROP TABLE IF EXISTS admin_ops_runs")
    op.execute("DROP TABLE IF EXISTS comment_limits")
    op.execute("DROP TABLE IF EXISTS censored_words")
    op.execute("DROP TABLE IF EXISTS banned_ips")
    op.execute("DROP TABLE IF EXISTS premium_code_redemptions")
    op.execute("DROP TABLE IF EXISTS premium_codes")
    op.execute("DROP TABLE IF EXISTS email_subscribers")

    op.execute("ALTER TABLE posts DROP COLUMN IF EXISTS bluesky_posted_at")
    op.execute("ALTER TABLE posts DROP COLUMN IF EXISTS bluesky_error")
    op.execute("ALTER TABLE posts DROP COLUMN IF EXISTS share_bluesky")

    op.execute("ALTER TABLE comments DROP COLUMN IF EXISTS ip_address")

    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS banned_reason")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS banned_by")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS banned_at")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS email_opt_in_at")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS email_opt_in")
