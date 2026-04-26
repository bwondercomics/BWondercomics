from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from .db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(60), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="user")
    banned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    banned_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    banned_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    email_opt_in: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    email_opt_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class OIDCClient(Base):
    __tablename__ = "oidc_clients"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False, default="Stoat Chat")
    redirect_uris: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    scopes: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class OIDCAuthorizationCode(Base):
    __tablename__ = "oidc_authorization_codes"

    code: Mapped[str] = mapped_column(String(128), primary_key=True)
    client_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    redirect_uri: Mapped[str] = mapped_column(String(500), nullable=False)
    scope: Mapped[str] = mapped_column(String(300), nullable=False, default="openid")
    nonce: Mapped[str | None] = mapped_column(String(200), nullable=True)
    code_challenge: Mapped[str] = mapped_column(String(200), nullable=False)
    code_challenge_method: Mapped[str] = mapped_column(String(20), nullable=False, default="S256")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class OIDCRefreshToken(Base):
    __tablename__ = "oidc_refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    client_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    scope: Mapped[str] = mapped_column(String(300), nullable=False, default="openid")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    target_id: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    display_name: Mapped[str] = mapped_column(String(60), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)

    hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    hidden_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    hidden_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EmailSubscriber(Base):
    __tablename__ = "email_subscribers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    source: Mapped[str | None] = mapped_column(String(80), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    opted_in_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class PremiumCode(Base):
    __tablename__ = "premium_codes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    note: Mapped[str | None] = mapped_column(String(120), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    redeemed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    redeemed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    redeemed_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)


class PremiumCodeRedemption(Base):
    __tablename__ = "premium_code_redemptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("premium_codes.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    redeemed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    redeemed_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    image: Mapped[str | None] = mapped_column(String(500), nullable=True)
    media_id: Mapped[str | None] = mapped_column(
        String(120), ForeignKey("media_items.id", ondelete="SET NULL"), nullable=True
    )
    image_tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    image_fit: Mapped[str] = mapped_column(String(20), nullable=False, default="cover")
    image_focus: Mapped[str] = mapped_column(String(20), nullable=False, default="center")
    share: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    share_bluesky: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    bluesky_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    bluesky_posted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="published")
    publish_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class MediaItem(Base):
    __tablename__ = "media_items"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    path: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    access: Mapped[str] = mapped_column(String(20), nullable=False, default="public")
    premium_visibility: Mapped[str] = mapped_column(String(20), nullable=False, default="blur")
    thumb_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    preview_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class PageConfig(Base):
    __tablename__ = "page_configs"

    series_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    content: Mapped[dict[str, Any]] = mapped_column("config", JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Series(Base):
    __tablename__ = "series"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    cover_image: Mapped[str | None] = mapped_column(String(500), nullable=True)
    premium_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status_message: Mapped[str] = mapped_column(String(200), nullable=False, default="")

    unit_label_singular: Mapped[str] = mapped_column(String(30), nullable=False, default="Chapter")
    unit_label_plural: Mapped[str] = mapped_column(String(30), nullable=False, default="Chapters")

    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    entries: Mapped[list["Entry"]] = relationship(
        back_populates="series", cascade="all, delete-orphan"
    )
    entry_labels: Mapped[list["EntryLabel"]] = relationship(
        back_populates="series",
        cascade="all, delete-orphan",
    )
    builder_pages: Mapped[list["BuilderPage"]] = relationship(
        back_populates="series",
        cascade="all, delete-orphan",
    )


class EntryLabel(Base):
    __tablename__ = "entry_labels"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    series_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("series.id"), nullable=False, index=True
    )
    slug: Mapped[str] = mapped_column(String(64), nullable=False)
    singular: Mapped[str] = mapped_column(String(30), nullable=False)
    plural: Mapped[str] = mapped_column(String(30), nullable=False)
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    series: Mapped[Series] = relationship(back_populates="entry_labels")
    entries: Mapped[list["Entry"]] = relationship(back_populates="entry_label")


class Entry(Base):
    __tablename__ = "entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    series_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("series.id"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    display_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    entry_label_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entry_labels.id", ondelete="SET NULL"),
        nullable=True,
    )

    folder_path: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    premium_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    show_in_dropdown: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_in_gallery: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    release_type: Mapped[str] = mapped_column(String(20), nullable=False, default="digital")
    store_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cover_image: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cover_thumb_path: Mapped[str | None] = mapped_column(String(500), nullable=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="published")
    publish_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    series: Mapped[Series] = relationship(back_populates="entries")
    entry_label: Mapped[EntryLabel | None] = relationship(back_populates="entries")
    pages: Mapped[list["EntryPage"]] = relationship(
        back_populates="entry", cascade="all, delete-orphan"
    )


class EntryPage(Base):
    __tablename__ = "entry_pages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entries.id"), nullable=False, index=True
    )
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    path: Mapped[str] = mapped_column(String(500), nullable=False)
    alt_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    entry: Mapped[Entry] = relationship(back_populates="pages")


class BannedIP(Base):
    __tablename__ = "banned_ips"

    ip_address: Mapped[str] = mapped_column(String(64), primary_key=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    banned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    banned_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )


class CensoredWord(Base):
    __tablename__ = "censored_words"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phrase: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )


class CommentLimit(Base):
    __tablename__ = "comment_limits"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    min_interval_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rate_window_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    max_per_window_user: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    max_per_window_ip: Mapped[int] = mapped_column(Integer, nullable=False, default=25)
    duplicate_window_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AdminOpsRun(Base):
    __tablename__ = "admin_ops_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    command_id: Mapped[str] = mapped_column(String(80), nullable=False)
    label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="running")
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    exit_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_truncated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_email: Mapped[str | None] = mapped_column(String(120), nullable=True)
    disrupts_api: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class AdminTodo(Base):
    __tablename__ = "admin_todos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class SocialAccount(Base):
    __tablename__ = "social_accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)
    handle: Mapped[str | None] = mapped_column(String(120), nullable=True)
    did: Mapped[str | None] = mapped_column(String(120), nullable=True)
    access_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    pds_url: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class VisitorSession(Base):
    __tablename__ = "visitor_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    visitor_id: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    origin: Mapped[str | None] = mapped_column(String(300), nullable=True)
    referrer: Mapped[str | None] = mapped_column(String(500), nullable=True)
    path: Mapped[str | None] = mapped_column(String(300), nullable=True)
    title: Mapped[str | None] = mapped_column(String(300), nullable=True)
    series_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    entry_title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    entry_label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    entries_read: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    series_read: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    first_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    hit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


# Page Builder models


class BuilderPage(Base):
    """A customizable page within a series (e.g., reader, about, gallery)."""

    __tablename__ = "builder_pages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    series_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("series.id"), nullable=False, index=True
    )
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    page_type: Mapped[str] = mapped_column(String(30), nullable=False, default="custom")
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_homepage: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    meta: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    series: Mapped[Series] = relationship(back_populates="builder_pages")
    sections: Mapped[list["BuilderSection"]] = relationship(
        back_populates="page", cascade="all, delete-orphan", order_by="BuilderSection.sort_index"
    )


class BuilderSection(Base):
    """A layout row/section within a page containing modules."""

    __tablename__ = "builder_sections"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    page_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("builder_pages.id"), nullable=False, index=True
    )
    section_type: Mapped[str] = mapped_column(String(30), nullable=False, default="row")
    layout: Mapped[str] = mapped_column(String(50), nullable=False, default="1")
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    settings: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    page: Mapped[BuilderPage] = relationship(back_populates="sections")
    modules: Mapped[list["BuilderModule"]] = relationship(
        back_populates="section", cascade="all, delete-orphan", order_by="BuilderModule.sort_index"
    )


class BuilderModule(Base):
    """An individual content block within a section."""

    __tablename__ = "builder_modules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    section_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("builder_sections.id"), nullable=False, index=True
    )
    module_type: Mapped[str] = mapped_column(String(50), nullable=False)
    column_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    section: Mapped[BuilderSection] = relationship(back_populates="modules")
