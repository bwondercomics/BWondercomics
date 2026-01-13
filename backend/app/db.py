from __future__ import annotations

from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .settings import settings


class Base(DeclarativeBase):
    pass


if not settings.database_url:
    raise RuntimeError("DATABASE_URL is required (e.g. postgresql+psycopg://user:pass@host:5432/db)")


engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Umami database connection (read-only, for analytics queries)
_umami_engine = None
_UmamiSessionLocal = None


def _init_umami_db():
    global _umami_engine, _UmamiSessionLocal
    if not settings.umami_database_url:
        return False
    if _umami_engine is None:
        _umami_engine = create_engine(settings.umami_database_url, pool_pre_ping=True)
        _UmamiSessionLocal = sessionmaker(bind=_umami_engine, autoflush=False, autocommit=False)
    return True


@contextmanager
def get_umami_db():
    """Get a connection to the Umami database for read-only analytics queries."""
    if not _init_umami_db():
        raise RuntimeError("UMAMI_DATABASE_URL is not configured")
    db = _UmamiSessionLocal()
    try:
        yield db
    finally:
        db.close()

