"""Transaction-scoped serialization for builder page scope mutations."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Series
from .reader_bindings import PAGE_SCOPE_GLOBAL, PAGE_SCOPE_SERIES

# Reserved application lock: ``BWBP/global/v1``. PostgreSQL's two-integer
# advisory-lock namespace is distinct from its one-bigint namespace.
BUILDER_GLOBAL_LOCK_KEY = 0x42574250
BUILDER_GLOBAL_LOCK_VERSION = 1


def lock_builder_page_scope(
    db: Session,
    scope: str,
    series_id: str | None,
) -> None:
    """Serialize one scope until the owning transaction commits or rolls back.

    SQLite intentionally no-ops because it is used by the fast unit suite and
    cannot prove PostgreSQL row/advisory lock behavior. Production PostgreSQL
    uses one transaction advisory lock for the global scope and the existing
    ``Series`` row as the lockable identity for a series scope.
    """
    dialect = db.get_bind().dialect.name
    if dialect == "sqlite":
        return
    if dialect != "postgresql":
        raise RuntimeError(f"Unsupported builder locking database dialect: {dialect}")

    if scope == PAGE_SCOPE_GLOBAL:
        if series_id is not None:
            raise ValueError("Global page scope cannot include a series id")
        db.execute(
            select(
                func.pg_advisory_xact_lock(
                    BUILDER_GLOBAL_LOCK_KEY,
                    BUILDER_GLOBAL_LOCK_VERSION,
                )
            )
        )
        return

    if scope != PAGE_SCOPE_SERIES:
        raise ValueError(f"Unsupported page scope: {scope}")
    if not series_id:
        raise ValueError("Series page scope requires a series id")
    locked_series_id = db.scalar(select(Series.id).where(Series.id == series_id).with_for_update())
    if locked_series_id is None:
        raise ValueError(f"Series '{series_id}' does not exist")
