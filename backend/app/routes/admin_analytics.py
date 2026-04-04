"""
Admin Analytics API routes.

Provides reader analytics data for the admin dashboard:
- Entry/series reads and finishes
- Time-series data for charts
- Visitor acquisition/technology breakdowns
- Live visitor counts

Key implementation notes:
- Entries are matched using (series_id, display_number) as canonical ID
- entry_label format from tracking: "series-id | Entry N"
- _extract_display_number() parses the numeric display_number from labels
- Health score calculated from finish_rate + week-over-week change
"""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

from ..db import get_db, get_umami_db
from ..models import Entry, EntryPage, Series, User, VisitorSession
from ..settings import settings
from ..umami_api import (
    UmamiAPIError,
    fetch_umami_expanded_metrics,
    fetch_umami_metrics,
    fetch_umami_stats,
)
from .admin_utils import iso_z, require_admin

router = APIRouter()


def _get_umami_website_id() -> str | None:
    """Get the Umami website ID for filtering queries."""
    return settings.umami_website_id or None


def _umami_website_filter(website_id: str | None) -> tuple[str, dict]:
    """Build SQL filter clause and params for website_id."""
    if website_id:
        return "AND we.website_id = :website_id", {"website_id": website_id}
    return "", {}


def _normalize_key(value: str | None) -> str:
    if not value:
        return ""
    lowered = str(value).strip().lower()
    lowered = re.sub(r"\s+", " ", lowered)
    return lowered[:200]


def _extract_display_number(label: str | None) -> int | None:
    """Extract display number from entry label format 'series-id | Entry N' or 'series-id | Issue N'."""
    if not label:
        return None
    # Strip series prefix if present (format: "series-id | Entry 5")
    if " | " in label:
        label = label.split(" | ", 1)[1].strip()

    # Match patterns like "Entry 5", "Issue 10", etc.
    match = re.search(r"\b(\d+)\b", label)
    if match:
        try:
            return int(match.group(1))
        except ValueError:
            return None
    return None


def _range_to_days(range_value: str | None, default_days: int) -> int:
    mapping = {
        "24h": 1,
        "7d": 7,
        "30d": 30,
        "90d": 90,
    }
    return mapping.get((range_value or "").strip(), default_days)


def _coerce_datetime(value):
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return value
    return value


def _build_entry_lookup(db: Session) -> tuple[dict[tuple[str, int], dict], set[tuple[str, int]]]:
    entries = db.scalars(select(Entry)).all()
    page_counts = {
        entry_id: count
        for entry_id, count in db.execute(
            select(EntryPage.entry_id, func.count()).group_by(EntryPage.entry_id)
        ).all()
    }
    series_map = {s.id: s for s in db.scalars(select(Series)).all()}

    entry_lookup: dict[tuple[str, int], dict] = {}
    empty_entry_keys: set[tuple[str, int]] = set()
    for entry in entries:
        series_id = entry.series_id or ""
        display_num = entry.display_number
        if display_num is None:
            continue

        key = (series_id, int(display_num))
        page_count = int(page_counts.get(entry.id) or 0)
        if page_count <= 0:
            empty_entry_keys.add(key)
        entry_lookup[key] = {
            "seriesId": series_id,
            "entryTitle": entry.title or "",
            "pageCount": page_count or None,
            "seriesTitle": series_map.get(series_id).title if series_id in series_map else None,
        }

    return entry_lookup, empty_entry_keys


def _parse_reader_entry_key(
    series_id: str | None,
    entry_label: str | None,
    empty_entry_keys: set[tuple[str, int]],
) -> tuple[str, int] | None:
    sid = series_id or ""
    display_num = _extract_display_number(entry_label)
    if display_num is None:
        return None
    key = (sid, display_num)
    if key in empty_entry_keys:
        return None
    return key


def _make_entry_key(series_id: str | None, display_num: int | None) -> str:
    try:
        return f"{str(series_id or '').strip()}:{int(display_num)}"
    except (TypeError, ValueError):
        return ""


def _parse_entry_key(entry_key: str | None) -> tuple[str | None, int | None]:
    raw = str(entry_key or "").strip()
    if not raw or ":" not in raw:
        return None, None
    series_id, display_raw = raw.rsplit(":", 1)
    try:
        return series_id, int(display_raw)
    except (TypeError, ValueError):
        return None, None


def _fetch_page_view_rows(
    umami_db: Session,
    start_time: datetime,
    end_time: datetime,
    website_filter: str,
    website_params: dict,
):
    visitor_key_expr = _umami_visitor_key_expr(umami_db)
    query = text(
        f"""
        SELECT
            we.created_at,
            we.session_id,
            {visitor_key_expr} AS visitor_key,
            ed_series.string_value as series_id,
            ed_entry.string_value as entry_label,
            ed_page.number_value as page_number,
            ed_total.number_value as total_pages
        FROM website_event we
        LEFT JOIN session s ON we.session_id = s.session_id
        LEFT JOIN event_data ed_series ON we.event_id = ed_series.website_event_id AND ed_series.data_key = 'series'
        LEFT JOIN event_data ed_entry ON we.event_id = ed_entry.website_event_id AND ed_entry.data_key = 'entryLabel'
        LEFT JOIN event_data ed_page ON we.event_id = ed_page.website_event_id AND ed_page.data_key = 'page'
        LEFT JOIN event_data ed_total ON we.event_id = ed_total.website_event_id AND ed_total.data_key = 'totalPages'
        WHERE we.event_name = 'reader_page_view'
            AND we.created_at >= :start_time
            AND we.created_at < :end_time
            {website_filter}
    """
    )
    rows = umami_db.execute(
        query,
        {
            "start_time": start_time,
            "end_time": end_time,
            **website_params,
        },
    ).fetchall()
    return [
        (
            _coerce_datetime(created_at),
            session_id,
            visitor_key,
            series_id,
            entry_label,
            page_number,
            total_pages,
        )
        for created_at, session_id, visitor_key, series_id, entry_label, page_number, total_pages in rows
    ]


def _fetch_completion_rows(
    umami_db: Session,
    start_time: datetime,
    end_time: datetime,
    website_filter: str,
    website_params: dict,
):
    visitor_key_expr = _umami_visitor_key_expr(umami_db)
    query = text(
        f"""
        SELECT
            we.created_at,
            we.session_id,
            {visitor_key_expr} AS visitor_key,
            ed_series.string_value as series_id,
            ed_entry.string_value as entry_label
        FROM website_event we
        LEFT JOIN session s ON we.session_id = s.session_id
        LEFT JOIN event_data ed_series ON we.event_id = ed_series.website_event_id AND ed_series.data_key = 'series'
        LEFT JOIN event_data ed_entry ON we.event_id = ed_entry.website_event_id AND ed_entry.data_key = 'entryLabel'
        WHERE we.event_name = 'reader_entry_complete'
            AND we.created_at >= :start_time
            AND we.created_at < :end_time
            {website_filter}
    """
    )
    rows = umami_db.execute(
        query,
        {
            "start_time": start_time,
            "end_time": end_time,
            **website_params,
        },
    ).fetchall()
    return [
        (
            _coerce_datetime(created_at),
            session_id,
            visitor_key,
            series_id,
            entry_label,
        )
        for created_at, session_id, visitor_key, series_id, entry_label in rows
    ]


def _umami_visitor_key_expr(umami_db: Session) -> str:
    session_columns = _umami_session_columns(umami_db)
    if "distinct_id" in session_columns:
        return "COALESCE(CAST(s.distinct_id AS TEXT), CAST(we.session_id AS TEXT))"
    if "visitor_id" in session_columns:
        return "COALESCE(CAST(s.visitor_id AS TEXT), CAST(we.session_id AS TEXT))"
    return "CAST(we.session_id AS TEXT)"


def _umami_session_columns(umami_db: Session) -> set[str]:
    bind = umami_db.get_bind()
    cached = getattr(bind, "_bw_umami_session_columns", None)
    if isinstance(cached, set):
        return cached
    try:
        session_columns = {
            str(column.get("name") or "")
            for column in sa_inspect(umami_db.get_bind()).get_columns("session")
        }
    except Exception:
        session_columns = set()
    try:
        setattr(bind, "_bw_umami_session_columns", session_columns)
    except Exception:
        pass
    return session_columns


def _sql_text_literal(value: str) -> str:
    escaped = str(value or "").replace("'", "''")
    return f"'{escaped}'"


def _umami_session_text_expr(
    umami_db: Session,
    *candidates: str,
    default: str = "",
) -> str:
    session_columns = _umami_session_columns(umami_db)
    exprs = [
        f"NULLIF(TRIM(CAST(s.{column} AS TEXT)), '')"
        for column in candidates
        if column in session_columns
    ]
    if not exprs:
        return _sql_text_literal(default)
    return f"COALESCE({', '.join(exprs)}, {_sql_text_literal(default)})"


def _build_reader_entry_stat(
    entry_lookup: dict[tuple[str, int], dict],
    key: tuple[str, int],
    total_pages: int | None = None,
) -> dict:
    base = entry_lookup.get(key) or {}
    sid, display_num = key
    page_count = base.get("pageCount")
    if not page_count and total_pages:
        try:
            page_count = int(total_pages)
        except (TypeError, ValueError):
            page_count = None
    return {
        "seriesId": sid,
        "seriesTitle": base.get("seriesTitle"),
        "entryTitle": base.get("entryTitle") or f"Entry {display_num}",
        "displayNumber": display_num,
        "pageCount": page_count,
        "pagesRead": 0,
        "startSessions": set(),
        "finishSessions": set(),
    }


def _collect_reader_window_metrics(
    umami_db: Session,
    start_time: datetime,
    end_time: datetime,
    website_filter: str,
    website_params: dict,
    entry_lookup: dict[tuple[str, int], dict],
    empty_entry_keys: set[tuple[str, int]],
) -> dict:
    stats: dict[tuple[str, int], dict] = {}
    entry_page_views: dict[tuple[str, int], int] = defaultdict(int)
    series_page_views: dict[str, int] = defaultdict(int)
    unique_visitor_ids: set[str] = set()

    page_view_rows = _fetch_page_view_rows(
        umami_db,
        start_time,
        end_time,
        website_filter,
        website_params,
    )
    completion_rows = _fetch_completion_rows(
        umami_db,
        start_time,
        end_time,
        website_filter,
        website_params,
    )

    for (
        _created_at,
        session_id,
        visitor_id,
        series_id,
        entry_label,
        _page_number,
        total_pages,
    ) in page_view_rows:
        key = _parse_reader_entry_key(series_id, entry_label, empty_entry_keys)
        if not key:
            continue
        if visitor_id:
            unique_visitor_ids.add(str(visitor_id))

        entry_stat = stats.get(key)
        if not entry_stat:
            entry_stat = _build_reader_entry_stat(entry_lookup, key, total_pages)
            stats[key] = entry_stat
        elif total_pages and not entry_stat.get("pageCount"):
            try:
                entry_stat["pageCount"] = int(total_pages)
            except (TypeError, ValueError):
                pass

        entry_stat["pagesRead"] += 1
        entry_page_views[key] += 1
        series_page_views[key[0]] += 1
        if session_id:
            entry_stat["startSessions"].add(str(session_id))

    for _created_at, session_id, visitor_id, series_id, entry_label in completion_rows:
        key = _parse_reader_entry_key(series_id, entry_label, empty_entry_keys)
        if not key:
            continue
        if visitor_id:
            unique_visitor_ids.add(str(visitor_id))

        entry_stat = stats.get(key)
        if not entry_stat:
            entry_stat = _build_reader_entry_stat(entry_lookup, key)
            stats[key] = entry_stat
        if session_id:
            entry_stat["finishSessions"].add(str(session_id))

    entry_start_counts = {
        key: len(entry_stat["startSessions"]) for key, entry_stat in stats.items()
    }
    entry_finish_counts = {
        key: len(entry_stat["finishSessions"]) for key, entry_stat in stats.items()
    }
    series_start_counts: dict[str, int] = defaultdict(int)
    series_finish_counts: dict[str, int] = defaultdict(int)
    for (sid, _display_num), count in entry_start_counts.items():
        series_start_counts[sid] += count
    for (sid, _display_num), count in entry_finish_counts.items():
        series_finish_counts[sid] += count

    total_page_views = sum(entry_page_views.values())
    total_starts = sum(entry_start_counts.values())
    total_finishes = sum(entry_finish_counts.values())

    return {
        "stats": stats,
        "entryPageViews": entry_page_views,
        "seriesPageViews": series_page_views,
        "entryStarts": entry_start_counts,
        "entryFinishes": entry_finish_counts,
        "seriesStarts": series_start_counts,
        "seriesFinishes": series_finish_counts,
        "totalPageViews": total_page_views,
        "totalStarts": total_starts,
        "totalFinishes": total_finishes,
        "uniqueVisitors": unique_visitor_ids,
    }


def _fetch_visitor_activity_rows(
    umami_db: Session,
    start_time: datetime,
    end_time: datetime,
    website_filter: str,
    website_params: dict,
):
    visitor_key_expr = _umami_visitor_key_expr(umami_db)
    referrer_expr = _umami_session_text_expr(
        umami_db,
        "referrer_domain",
        "referrer",
        "referrer_path",
        default="",
    )
    country_expr = _umami_session_text_expr(umami_db, "country", default="")
    browser_expr = _umami_session_text_expr(umami_db, "browser", default="")
    device_expr = _umami_session_text_expr(umami_db, "device", default="")
    query = text(
        f"""
        SELECT
            we.created_at,
            we.session_id,
            {visitor_key_expr} AS visitor_key,
            COALESCE(CAST(we.url_path AS TEXT), '') AS url_path,
            {referrer_expr} AS referrer,
            {country_expr} AS country,
            {browser_expr} AS browser,
            {device_expr} AS device
        FROM website_event we
        LEFT JOIN session s ON we.session_id = s.session_id
        WHERE we.created_at >= :start_time
            AND we.created_at < :end_time
            {website_filter}
        ORDER BY we.created_at ASC, we.session_id ASC
        """
    )
    rows = umami_db.execute(
        query,
        {
            "start_time": start_time,
            "end_time": end_time,
            **website_params,
        },
    ).fetchall()
    return [
        (
            _coerce_datetime(created_at),
            session_id,
            str(visitor_key or session_id or "").strip(),
            str(url_path or "").strip(),
            str(referrer or "").strip(),
            str(country or "").strip(),
            str(browser or "").strip(),
            str(device or "").strip(),
        )
        for created_at, session_id, visitor_key, url_path, referrer, country, browser, device in rows
    ]


@router.get("/api/admin/analytics/live")
def admin_live_visitors(
    request: Request,
    db: Session = Depends(get_db),
    window_seconds: int = Query(300, ge=30, le=86400, alias="window"),
    limit: int = Query(200, ge=1, le=500),
):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=window_seconds)

    sessions = db.scalars(
        select(VisitorSession)
        .where(VisitorSession.last_seen >= cutoff)
        .order_by(VisitorSession.last_seen.desc())
        .limit(limit)
    ).all()

    user_ids = {s.user_id for s in sessions if s.user_id}
    user_email_map = {}
    user_display_map = {}
    if user_ids:
        for user in db.scalars(select(User).where(User.id.in_(user_ids))).all():
            user_email_map[user.id] = user.email
            user_display_map[user.id] = user.display_name

    shaped = []
    for s in sessions:
        duration_seconds = 0
        if s.first_seen and s.last_seen:
            duration_seconds = max(0, int((s.last_seen - s.first_seen).total_seconds()))
        user_email = user_email_map.get(s.user_id) if s.user_id else None
        user_display = user_display_map.get(s.user_id) if s.user_id else None
        shaped.append(
            {
                "visitorId": s.visitor_id,
                "userId": str(s.user_id) if s.user_id else None,
                "userEmail": user_email,
                "userDisplayName": user_display,
                "user": (
                    {
                        "displayName": user_display or user_email or "Member",
                        "email": user_email or "",
                    }
                    if s.user_id
                    else None
                ),
                "path": s.path or "",
                "title": s.title or "",
                "origin": s.origin or "",
                "referrer": s.referrer or "",
                "seriesId": s.series_id or "",
                "entryTitle": s.entry_title or "",
                "entryLabel": s.entry_label or "",
                "pageNumber": s.page_number,
                "firstSeen": iso_z(s.first_seen),
                "lastSeen": iso_z(s.last_seen),
                "durationSeconds": duration_seconds,
                "hitCount": int(s.hit_count or 0),
                "entriesRead": list(s.entries_read or []),
                "seriesRead": list(s.series_read or []),
                "ipAddress": s.ip_address or "",
            }
        )

    return {
        "generatedAt": iso_z(now),
        "windowSeconds": window_seconds,
        "activeCount": len(shaped),
        "visitors": shaped,
        "total": len(shaped),
        "sessions": shaped,
    }


@router.get("/api/admin/analytics/pages")
def admin_page_reads(
    request: Request,
    db: Session = Depends(get_db),
    days: int = Query(30, ge=1, le=365),
    range: str = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    # Convert range parameter to days if provided
    if range:
        if range == "24h":
            days = 1
        elif range == "7d":
            days = 7
        elif range == "30d":
            days = 30
        elif range == "90d":
            days = 90

    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)
    start_ms = int(start.timestamp() * 1000)
    end_ms = int(now.timestamp() * 1000)

    try:
        stats = fetch_umami_stats({"selected": (start_ms, end_ms)})
        rows = fetch_umami_expanded_metrics(start_ms, end_ms, metric_type="path", limit=limit)
    except UmamiAPIError as exc:
        return JSONResponse(status_code=502, content={"error": f"Umami API error: {exc}"})

    pages = []
    for item in rows or []:
        if not isinstance(item, dict):
            continue
        path = str(item.get("name") or "").strip()
        views = int(item.get("pageviews") or 0)
        visitors = int(item.get("visitors") or 0)
        if not path:
            continue
        pages.append(
            {
                "path": path,
                "title": "",
                "views": views,
                "visitors": visitors,
            }
        )

    return {
        "generatedAt": iso_z(now),
        "windowDays": days,
        "total": int((stats.get("selected") or {}).get("pageviews") or 0),
        "pages": pages,
    }


def _shape_expanded_metrics(rows: list[dict]) -> list[dict]:
    shaped = []
    for item in rows or []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        shaped.append(
            {
                "name": name,
                "visitors": int(item.get("visitors") or 0),
                "visits": int(item.get("visits") or 0),
                "pageviews": int(item.get("pageviews") or 0),
                "bounces": int(item.get("bounces") or 0),
                "totaltime": int(item.get("totaltime") or 0),
            }
        )
    return shaped


def _shape_metric_events(rows: list[dict]) -> list[dict]:
    return [
        {"name": str(item.get("x") or "").strip(), "count": int(item.get("y") or 0)}
        for item in rows or []
        if isinstance(item, dict) and str(item.get("x") or "").strip()
    ]


def _fetch_top_events(
    start_time: datetime,
    end_time: datetime,
    start_ms: int,
    end_ms: int,
    website_filter: str,
    website_params: dict,
    limit: int,
) -> list[dict]:
    try:
        events = _shape_metric_events(
            fetch_umami_metrics(start_ms, end_ms, metric_type="event", limit=limit)
        )
        if events:
            return events
    except UmamiAPIError:
        pass

    try:
        with get_umami_db() as umami_db:
            visitor_key_expr = _umami_visitor_key_expr(umami_db)
            rows = umami_db.execute(
                text(
                    f"""
                    SELECT
                        we.event_name,
                        COUNT(DISTINCT {visitor_key_expr}) AS event_count
                    FROM website_event we
                    LEFT JOIN session s ON we.session_id = s.session_id
                    WHERE we.event_name IS NOT NULL
                        AND we.event_name <> ''
                        AND we.created_at >= :start_time
                        AND we.created_at < :end_time
                        {website_filter}
                    GROUP BY we.event_name
                    ORDER BY event_count DESC, we.event_name ASC
                    LIMIT :limit
                    """
                ),
                {
                    "start_time": start_time,
                    "end_time": end_time,
                    "limit": limit,
                    **website_params,
                },
            ).fetchall()
    except Exception:
        return []

    return [
        {"name": str(event_name).strip(), "count": int(event_count or 0)}
        for event_name, event_count in rows
        if str(event_name or "").strip()
    ]


@router.get("/api/admin/analytics/visitors")
def admin_visitor_analytics(
    request: Request,
    db: Session = Depends(get_db),
    range: str = Query("7d"),
    limit: int = Query(10, ge=1, le=100),
):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    now = datetime.now(timezone.utc)
    days = _range_to_days(range, 7)
    start = now - timedelta(days=days)
    start_ms = int(start.timestamp() * 1000)
    end_ms = int(now.timestamp() * 1000)
    website_id = _get_umami_website_id()
    website_filter, website_params = _umami_website_filter(website_id)

    try:
        referrers = fetch_umami_expanded_metrics(
            start_ms, end_ms, metric_type="referrer", limit=limit
        )
        landing_pages = fetch_umami_expanded_metrics(
            start_ms, end_ms, metric_type="entry", limit=limit
        )
        countries = fetch_umami_expanded_metrics(
            start_ms, end_ms, metric_type="country", limit=limit
        )
        browsers = fetch_umami_expanded_metrics(
            start_ms, end_ms, metric_type="browser", limit=limit
        )
        devices = fetch_umami_expanded_metrics(start_ms, end_ms, metric_type="device", limit=limit)
    except UmamiAPIError as exc:
        return JSONResponse(status_code=502, content={"error": f"Umami API error: {exc}"})

    events = _fetch_top_events(
        start,
        now,
        start_ms,
        end_ms,
        website_filter,
        website_params,
        limit,
    )

    return {
        "generatedAt": iso_z(now),
        "range": range,
        "referrers": _shape_expanded_metrics(referrers),
        "events": events,
        "landingPages": _shape_expanded_metrics(landing_pages),
        "countries": _shape_expanded_metrics(countries),
        "browsers": _shape_expanded_metrics(browsers),
        "devices": _shape_expanded_metrics(devices),
    }


@router.get("/api/admin/analytics/visitor-history")
def admin_visitor_history(
    request: Request,
    db: Session = Depends(get_db),
    range: str = Query("7d"),
    limit: int = Query(50, ge=1, le=200),
):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    now = datetime.now(timezone.utc)
    days = _range_to_days(range, 7)
    start = now - timedelta(days=days)
    website_id = _get_umami_website_id()
    website_filter, website_params = _umami_website_filter(website_id)
    entry_lookup, empty_entry_keys = _build_entry_lookup(db)

    try:
        with get_umami_db() as umami_db:
            visitor_rows = _fetch_visitor_activity_rows(
                umami_db,
                start,
                now,
                website_filter,
                website_params,
            )
            page_view_rows = _fetch_page_view_rows(
                umami_db,
                start,
                now,
                website_filter,
                website_params,
            )
            completion_rows = _fetch_completion_rows(
                umami_db,
                start,
                now,
                website_filter,
                website_params,
            )
    except Exception as exc:
        return {
            "generatedAt": iso_z(now),
            "range": range,
            "totalVisitors": 0,
            "returned": 0,
            "error": f"Umami query failed: {str(exc)}",
            "visitors": [],
        }

    visitors: dict[str, dict] = {}

    def ensure_visitor(visitor_key: str) -> dict:
        visitor = visitors.get(visitor_key)
        if visitor:
            return visitor
        visitor = {
            "visitorKey": visitor_key,
            "firstSeen": None,
            "lastSeen": None,
            "landingPage": "",
            "lastPath": "",
            "referrer": "",
            "country": "",
            "browser": "",
            "device": "",
            "pagesRead": 0,
            "issueMap": {},
        }
        visitors[visitor_key] = visitor
        return visitor

    for (
        created_at,
        session_id,
        visitor_key,
        url_path,
        referrer,
        country,
        browser,
        device,
    ) in visitor_rows:
        key = visitor_key or str(session_id or "").strip()
        if not key:
            continue
        visitor = ensure_visitor(key)

        if visitor["firstSeen"] is None or created_at < visitor["firstSeen"]:
            visitor["firstSeen"] = created_at
            if url_path:
                visitor["landingPage"] = url_path
        elif url_path and not visitor["landingPage"]:
            visitor["landingPage"] = url_path

        if visitor["lastSeen"] is None or created_at >= visitor["lastSeen"]:
            visitor["lastSeen"] = created_at
            if url_path:
                visitor["lastPath"] = url_path

        if referrer and not visitor["referrer"]:
            visitor["referrer"] = referrer
        if country and not visitor["country"]:
            visitor["country"] = country
        if browser and not visitor["browser"]:
            visitor["browser"] = browser
        if device and not visitor["device"]:
            visitor["device"] = device

    for (
        _created_at,
        session_id,
        visitor_id,
        series_id,
        entry_label,
        page_number,
        total_pages,
    ) in page_view_rows:
        key = str(visitor_id or session_id or "").strip()
        if not key:
            continue
        entry_key = _parse_reader_entry_key(series_id, entry_label, empty_entry_keys)
        if not entry_key:
            continue

        visitor = ensure_visitor(key)
        visitor["pagesRead"] += 1

        issue = visitor["issueMap"].get(entry_key)
        if not issue:
            base = entry_lookup.get(entry_key) or {}
            sid, display_num = entry_key
            issue = {
                "seriesId": sid,
                "seriesTitle": base.get("seriesTitle") or sid,
                "entryDisplayNumber": display_num,
                "entryTitle": base.get("entryTitle") or f"Entry {display_num}",
                "pagesRead": 0,
                "maxPageReached": None,
                "totalPages": base.get("pageCount"),
                "finished": False,
            }
            visitor["issueMap"][entry_key] = issue

        issue["pagesRead"] += 1
        try:
            page_num = int(page_number) if page_number is not None else None
        except (TypeError, ValueError):
            page_num = None
        if page_num is not None:
            current_max = issue.get("maxPageReached")
            issue["maxPageReached"] = max(int(current_max or 0), page_num)
        try:
            total_pages_value = int(total_pages) if total_pages is not None else None
        except (TypeError, ValueError):
            total_pages_value = None
        if total_pages_value is not None:
            current_total = issue.get("totalPages")
            issue["totalPages"] = max(int(current_total or 0), total_pages_value)

    for _created_at, session_id, visitor_id, series_id, entry_label in completion_rows:
        key = str(visitor_id or session_id or "").strip()
        if not key:
            continue
        entry_key = _parse_reader_entry_key(series_id, entry_label, empty_entry_keys)
        if not entry_key:
            continue

        visitor = ensure_visitor(key)
        issue = visitor["issueMap"].get(entry_key)
        if not issue:
            base = entry_lookup.get(entry_key) or {}
            sid, display_num = entry_key
            issue = {
                "seriesId": sid,
                "seriesTitle": base.get("seriesTitle") or sid,
                "entryDisplayNumber": display_num,
                "entryTitle": base.get("entryTitle") or f"Entry {display_num}",
                "pagesRead": 0,
                "maxPageReached": None,
                "totalPages": base.get("pageCount"),
                "finished": False,
            }
            visitor["issueMap"][entry_key] = issue
        issue["finished"] = True

    shaped_visitors = []
    for visitor in visitors.values():
        issue_map = visitor.pop("issueMap", {})
        issues = sorted(
            issue_map.values(),
            key=lambda item: (
                -(int(item.get("pagesRead") or 0)),
                str(item.get("seriesTitle") or item.get("seriesId") or ""),
                int(item.get("entryDisplayNumber") or 0),
            ),
        )
        issues_finished = sum(1 for item in issues if item.get("finished"))
        shaped_visitors.append(
            {
                "visitorKey": visitor.get("visitorKey", ""),
                "firstSeen": iso_z(visitor["firstSeen"]) if visitor.get("firstSeen") else None,
                "lastSeen": iso_z(visitor["lastSeen"]) if visitor.get("lastSeen") else None,
                "landingPage": visitor.get("landingPage") or "",
                "lastPath": visitor.get("lastPath") or "",
                "referrer": visitor.get("referrer") or "",
                "country": visitor.get("country") or "",
                "browser": visitor.get("browser") or "",
                "device": visitor.get("device") or "",
                "pagesRead": int(visitor.get("pagesRead") or 0),
                "issuesStarted": len(issues),
                "issuesFinished": issues_finished,
                "issues": issues,
            }
        )

    shaped_visitors.sort(
        key=lambda item: (
            item.get("lastSeen") or "",
            int(item.get("pagesRead") or 0),
        ),
        reverse=True,
    )
    limited_visitors = shaped_visitors[:limit]

    return {
        "generatedAt": iso_z(now),
        "range": range,
        "totalVisitors": len(shaped_visitors),
        "returned": len(limited_visitors),
        "visitors": limited_visitors,
    }


@router.get("/api/admin/analytics/reader")
def admin_reader_analytics(
    request: Request,
    db: Session = Depends(get_db),
    days: int = Query(90, ge=1, le=365),
    range: str = Query(None),
):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    days = _range_to_days(range, days)
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)
    prev_start = start - timedelta(days=days)
    prev_end = start
    website_id = _get_umami_website_id()
    entry_lookup, empty_entry_keys = _build_entry_lookup(db)
    website_filter, website_params = _umami_website_filter(website_id)

    try:
        with get_umami_db() as umami_db:
            current_metrics = _collect_reader_window_metrics(
                umami_db,
                start,
                now,
                website_filter,
                website_params,
                entry_lookup,
                empty_entry_keys,
            )
            prev_metrics = _collect_reader_window_metrics(
                umami_db,
                prev_start,
                prev_end,
                website_filter,
                website_params,
                entry_lookup,
                empty_entry_keys,
            )

    except Exception as e:
        return {
            "generatedAt": iso_z(now),
            "windowDays": days,
            "error": f"Umami query failed: {str(e)}",
            "entryReadsTotal": 0,
            "entryStartsTotal": 0,
            "entryFinishesTotal": 0,
            "finishRate": 0,
            "uniqueVisitors": 0,
            "entryViews": [],
            "entryRates": [],
            "seriesViews": [],
            "seriesRates": [],
        }

    entry_views = []
    entry_rates = []
    series_aggregates: dict[str, dict] = {}
    current_stats = current_metrics["stats"]

    for entry_stat in current_stats.values():
        sid = entry_stat["seriesId"]
        key = (sid, entry_stat["displayNumber"])
        label = entry_stat["entryTitle"] or f"Entry {entry_stat['displayNumber']}"
        page_views = int(entry_stat.get("pagesRead") or 0)
        starts = len(entry_stat["startSessions"])
        finishes = len(entry_stat["finishSessions"])
        finish_rate = (finishes / starts) if starts else 0

        prev_page_views = int(prev_metrics["entryPageViews"].get(key, 0))
        view_delta = page_views - prev_page_views
        entry_views.append(
            {
                "label": label,
                "value": str(entry_stat["displayNumber"]),
                "entryKey": _make_entry_key(sid, entry_stat["displayNumber"]),
                "entryLabel": label,
                "displayNumber": entry_stat["displayNumber"],
                "count": page_views,
                "seriesId": sid,
                "seriesTitle": entry_stat["seriesTitle"] or "",
                "delta": view_delta,
                "deltaPct": (view_delta / prev_page_views) if prev_page_views else None,
            }
        )

        entry_rates.append(
            {
                "label": label,
                "value": str(entry_stat["displayNumber"]),
                "entryKey": _make_entry_key(sid, entry_stat["displayNumber"]),
                "entryLabel": label,
                "displayNumber": entry_stat["displayNumber"],
                "count": round(finish_rate, 4),
                "pageViews": page_views,
                "starts": starts,
                "finishes": finishes,
                "completionRate": round(finish_rate, 4),
                "seriesId": sid,
                "seriesTitle": entry_stat["seriesTitle"] or "",
            }
        )

        if sid not in series_aggregates:
            series_title = entry_stat["seriesTitle"] or sid or "Unknown Series"
            series_aggregates[sid] = {
                "label": series_title,
                "value": sid,
                "seriesId": sid,
                "seriesTitle": series_title,
                "count": 0,
                "starts": 0,
                "finishes": 0,
            }
        series_aggregates[sid]["count"] += page_views
        series_aggregates[sid]["starts"] += starts
        series_aggregates[sid]["finishes"] += finishes

    entry_views.sort(key=lambda x: x.get("count", 0), reverse=True)
    entry_rates.sort(
        key=lambda x: (
            x.get("completionRate", 0),
            x.get("starts", 0),
            x.get("pageViews", 0),
        ),
        reverse=True,
    )
    series_views = sorted(series_aggregates.values(), key=lambda x: x.get("count", 0), reverse=True)
    for item in series_views:
        sid = item.get("seriesId", "")
        prev_views = int(prev_metrics["seriesPageViews"].get(sid, 0))
        delta = int(item.get("count", 0)) - prev_views
        item["delta"] = delta
        item["deltaPct"] = (delta / prev_views) if prev_views else None

    series_rates = []
    for agg in series_aggregates.values():
        starts = agg.get("starts", 0)
        finishes = agg.get("finishes", 0)
        rate = (finishes / starts) if starts else 0
        series_rates.append(
            {
                "label": agg.get("label", ""),
                "value": agg.get("value", ""),
                "seriesId": agg.get("seriesId", ""),
                "seriesTitle": agg.get("seriesTitle", ""),
                "count": round(rate, 4),
                "pageViews": int(agg.get("count", 0)),
                "starts": int(starts),
                "finishes": int(finishes),
                "completionRate": round(rate, 4),
            }
        )
    series_rates.sort(
        key=lambda x: (
            x.get("completionRate", 0),
            x.get("starts", 0),
            x.get("pageViews", 0),
        ),
        reverse=True,
    )

    total_page_views = int(current_metrics["totalPageViews"])
    total_starts = int(current_metrics["totalStarts"])
    total_finishes = int(current_metrics["totalFinishes"])
    overall_finish_rate = (total_finishes / total_starts) if total_starts else 0

    return {
        "generatedAt": iso_z(now),
        "windowDays": days,
        "entryReadsTotal": total_page_views,
        "entryStartsTotal": total_starts,
        "entryFinishesTotal": total_finishes,
        "finishRate": round(overall_finish_rate, 4),
        "uniqueVisitors": len(current_metrics["uniqueVisitors"]),
        "entryViews": entry_views,
        "entryRates": entry_rates,
        "seriesViews": series_views,
        "seriesRates": series_rates,
    }


@router.get("/api/admin/analytics/reader-series")
def admin_reader_series_analytics(
    request: Request,
    db: Session = Depends(get_db),
    days: int = Query(90, ge=1, le=365),
    time_range: str = Query(None, alias="range"),
    event: str = Query(""),
    prop: str = Query("", alias="property"),
    value: str = Query(""),
    entry_key: str = Query("", alias="entry_key"),
    metric: str = Query("page_views"),
    points: int = Query(12, ge=1, le=100),
):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    time_range = time_range if isinstance(time_range, str) else None
    event = event if isinstance(event, str) else ""
    prop = prop if isinstance(prop, str) else ""
    value = value if isinstance(value, str) else ""
    entry_key = entry_key if isinstance(entry_key, str) else ""
    metric = metric if isinstance(metric, str) else "page_views"
    days = _range_to_days(time_range, days)
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)
    website_id = _get_umami_website_id()
    entry_lookup, empty_entry_keys = _build_entry_lookup(db)

    # Determine bucket size based on time range
    total_seconds = int((now - start).total_seconds())
    bucket_seconds = max(3600, total_seconds // points)  # Minimum 1 hour buckets

    normalized_metric = metric.strip() or ""
    if normalized_metric not in ("page_views", "completion_rate"):
        normalized_metric = "completion_rate" if event == "reader_entry_complete" else "page_views"
    if normalized_metric not in ("page_views", "completion_rate"):
        return JSONResponse(status_code=400, content={"error": "Unsupported analytics event"})

    filter_series_id = None
    filter_display_num = None
    parsed_series_id, parsed_display_num = _parse_entry_key(entry_key)
    if parsed_display_num is not None:
        filter_series_id = parsed_series_id
        filter_display_num = parsed_display_num
    elif prop and value:
        normalized_value = value.strip()
        if prop == "entryLabel":
            if normalized_value.isdigit():
                filter_display_num = int(normalized_value)
            else:
                filter_display_num = _extract_display_number(normalized_value)
        elif prop in ("seriesId", "series"):
            filter_series_id = normalized_value

    buckets: dict[int, dict[str, int]] = defaultdict(
        lambda: {"count": 0, "starts": 0, "finishes": 0}
    )
    website_filter, website_params = _umami_website_filter(website_id)

    try:
        with get_umami_db() as umami_db:
            if normalized_metric == "completion_rate":
                start_times: dict[tuple[str, str, int], datetime] = {}
                completion_times: dict[tuple[str, str, int], datetime] = {}
                page_view_events = _fetch_page_view_rows(
                    umami_db,
                    start,
                    now,
                    website_filter,
                    website_params,
                )
                for (
                    created_at,
                    session_id,
                    _visitor_id,
                    series_id,
                    entry_label,
                    _page_number,
                    _total_pages,
                ) in page_view_events:
                    if not session_id:
                        continue
                    key = _parse_reader_entry_key(series_id, entry_label, empty_entry_keys)
                    if not key:
                        continue
                    sid, display_num = key
                    if filter_series_id and sid != filter_series_id:
                        continue
                    if filter_display_num is not None and display_num != filter_display_num:
                        continue

                    read_key = (str(session_id), sid, display_num)
                    if read_key not in start_times or created_at < start_times[read_key]:
                        start_times[read_key] = created_at

                events = _fetch_completion_rows(
                    umami_db, start, now, website_filter, website_params
                )

                for created_at, session_id, _visitor_id, series_id, entry_label in events:
                    if not session_id:
                        continue
                    key = _parse_reader_entry_key(series_id, entry_label, empty_entry_keys)
                    if not key:
                        continue
                    sid, display_num = key

                    if filter_series_id and sid != filter_series_id:
                        continue
                    if filter_display_num is not None and display_num != filter_display_num:
                        continue

                    key = (str(session_id), sid, display_num)
                    if key not in completion_times or created_at < completion_times[key]:
                        completion_times[key] = created_at

                for read_time in start_times.values():
                    seconds_since_start = int((read_time - start).total_seconds())
                    bucket_index = seconds_since_start // bucket_seconds
                    buckets[bucket_index]["starts"] += 1
                for completion_time in completion_times.values():
                    seconds_since_start = int((completion_time - start).total_seconds())
                    bucket_index = seconds_since_start // bucket_seconds
                    buckets[bucket_index]["finishes"] += 1
            else:
                events = _fetch_page_view_rows(umami_db, start, now, website_filter, website_params)

                for (
                    created_at,
                    session_id,
                    _visitor_id,
                    series_id,
                    entry_label,
                    _page_number,
                    _total_pages,
                ) in events:
                    key = _parse_reader_entry_key(series_id, entry_label, empty_entry_keys)
                    if not key:
                        continue
                    sid, display_num = key
                    if filter_series_id and sid != filter_series_id:
                        continue
                    if filter_display_num is not None and display_num != filter_display_num:
                        continue

                    seconds_since_start = int((created_at - start).total_seconds())
                    bucket_index = seconds_since_start // bucket_seconds
                    buckets[bucket_index]["count"] += 1

    except Exception as e:
        return {
            "generatedAt": iso_z(now),
            "windowDays": days,
            "error": f"Umami query failed: {str(e)}",
            "series": [],
        }

    series = []
    for i in range(points):
        bucket_start = start + timedelta(seconds=i * bucket_seconds)
        bucket_end = start + timedelta(seconds=(i + 1) * bucket_seconds)
        if bucket_end > now:
            bucket_end = now

        bucket = buckets.get(i, {"count": 0, "starts": 0, "finishes": 0})
        item = {
            "start": iso_z(bucket_start),
            "end": iso_z(bucket_end),
        }
        if normalized_metric == "completion_rate":
            starts = int(bucket.get("starts", 0))
            finishes = int(bucket.get("finishes", 0))
            item.update(
                {
                    "starts": starts,
                    "finishes": finishes,
                    "completionRate": round((finishes / starts), 4) if starts else 0,
                }
            )
        else:
            item["count"] = int(bucket.get("count", 0))
        series.append(item)

        if bucket_end >= now:
            break

    return {
        "generatedAt": iso_z(now),
        "windowDays": days,
        "metric": normalized_metric,
        "series": series,
    }


@router.get("/api/admin/analytics/reads-over-time")
def admin_reads_over_time(
    request: Request,
    db: Session = Depends(get_db),
    time_range: str = Query("7d", alias="range"),
    entry_id: str = Query(None),
    entry_key: str = Query(None, alias="entry_key"),
    series_id: str = Query(None),
):
    """Daily read counts for time-series chart. Supports aggregate or per-entry view."""
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    entry_id = entry_id if isinstance(entry_id, str) else None
    entry_key = entry_key if isinstance(entry_key, str) else None
    series_id = series_id if isinstance(series_id, str) else None
    days = _range_to_days(time_range, 7)
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)
    website_id = _get_umami_website_id()
    entry_lookup, empty_entry_keys = _build_entry_lookup(db)

    mode = "aggregate"
    entry_label_filter = None
    selected_entry_key = None
    target_display_num = None
    target_series_id = None

    parsed_series_id, parsed_display_num = _parse_entry_key(entry_key)
    if entry_key and entry_key != "aggregate" and parsed_display_num is not None:
        mode = "entry"
        entry_label_filter = entry_key
        selected_entry_key = entry_key
        target_display_num = parsed_display_num
        target_series_id = parsed_series_id
    elif entry_id and entry_id != "aggregate":
        mode = "entry"
        entry_label_filter = entry_id
        if entry_id.isdigit():
            target_display_num = int(entry_id)
        else:
            target_display_num = _extract_display_number(entry_id)

    daily_counts: dict[str, dict] = {}
    website_filter, website_params = _umami_website_filter(website_id)

    try:
        with get_umami_db() as umami_db:
            events = _fetch_page_view_rows(umami_db, start, now, website_filter, website_params)

            for (
                created_at,
                session_id,
                visitor_id,
                evt_series_id,
                entry_label,
                _page_number,
                _total_pages,
            ) in events:
                key = _parse_reader_entry_key(evt_series_id, entry_label, empty_entry_keys)
                if not key:
                    continue
                entry_series_id, display_num = key

                if series_id and entry_series_id != series_id:
                    continue
                if target_series_id and entry_series_id != target_series_id:
                    continue
                if (
                    mode == "entry"
                    and target_display_num is not None
                    and display_num != target_display_num
                ):
                    continue

                date_str = created_at.date().isoformat()
                if date_str not in daily_counts:
                    daily_counts[date_str] = {"visitorIds": set(), "reads": 0}
                daily_counts[date_str]["reads"] += 1
                if visitor_id:
                    daily_counts[date_str]["visitorIds"].add(visitor_id)

    except Exception as e:
        return {
            "generatedAt": iso_z(now),
            "range": time_range,
            "mode": mode,
            "entryLabel": entry_label_filter,
            "entryKey": selected_entry_key,
            "error": f"Umami query failed: {str(e)}",
            "series": [],
            "totals": {"reads": 0, "uniqueVisitors": 0},
        }

    series = []
    all_visitor_ids: set[str] = set()
    total_reads = 0

    current = start.date()
    end_date = now.date()
    while current <= end_date:
        date_str = current.isoformat()
        data = daily_counts.get(date_str, {"visitorIds": set(), "reads": 0})
        visitor_ids = data["visitorIds"]
        reads = int(data.get("reads") or 0)

        all_visitor_ids.update(visitor_ids)
        total_reads += reads

        series.append(
            {
                "date": date_str,
                "count": reads,
                "uniqueVisitors": len(visitor_ids),
            }
        )
        current += timedelta(days=1)

    return {
        "generatedAt": iso_z(now),
        "range": time_range,
        "mode": mode,
        "entryLabel": entry_label_filter,
        "entryKey": selected_entry_key,
        "series": series,
        "totals": {
            "reads": total_reads,
            "uniqueVisitors": len(all_visitor_ids),
        },
    }


@router.get("/api/admin/analytics/weekly-digest")
def admin_weekly_digest(
    request: Request,
    db: Session = Depends(get_db),
):
    """This week vs last week comparison for dashboard card."""
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    now = datetime.now(timezone.utc)
    today = now.date()

    # Week boundaries (Monday to Sunday)
    days_since_monday = today.weekday()
    this_week_start = datetime.combine(
        today - timedelta(days=days_since_monday), datetime.min.time(), tzinfo=timezone.utc
    )
    this_week_end = now

    last_week_start = this_week_start - timedelta(days=7)
    last_week_end = this_week_start

    website_id = _get_umami_website_id()
    website_filter, website_params = _umami_website_filter(website_id)
    entry_lookup, empty_entry_keys = _build_entry_lookup(db)

    def calculate_period_stats_umami(start_dt: datetime, end_dt: datetime) -> dict:
        try:
            with get_umami_db() as umami_db:
                metrics = _collect_reader_window_metrics(
                    umami_db,
                    start_dt,
                    end_dt,
                    website_filter,
                    website_params,
                    entry_lookup,
                    empty_entry_keys,
                )

        except Exception:
            return {
                "reads": 0,
                "starts": 0,
                "finishes": 0,
                "completionRate": 0,
                "uniqueVisitors": 0,
            }

        total_reads = int(metrics["totalPageViews"])
        total_starts = int(metrics["totalStarts"])
        total_finishes = int(metrics["totalFinishes"])
        completion_rate = total_finishes / total_starts if total_starts > 0 else 0

        return {
            "reads": total_reads,
            "starts": total_starts,
            "finishes": total_finishes,
            "completionRate": round(completion_rate, 4),
            "uniqueVisitors": len(metrics["uniqueVisitors"]),
        }

    this_week = calculate_period_stats_umami(this_week_start, this_week_end)
    this_week["startDate"] = this_week_start.date().isoformat()
    this_week["endDate"] = this_week_end.date().isoformat()

    last_week = calculate_period_stats_umami(last_week_start, last_week_end)
    last_week["startDate"] = last_week_start.date().isoformat()
    last_week["endDate"] = last_week_end.date().isoformat()

    def calc_change(current: float, previous: float) -> dict:
        diff = current - previous
        pct = diff / previous if previous != 0 else (1.0 if diff > 0 else 0.0)
        return {"value": round(diff, 4), "percent": round(pct, 4)}

    changes = {
        "reads": calc_change(this_week["reads"], last_week["reads"]),
        "starts": calc_change(this_week["starts"], last_week["starts"]),
        "finishes": calc_change(this_week["finishes"], last_week["finishes"]),
        "completionRate": calc_change(this_week["completionRate"], last_week["completionRate"]),
        "uniqueVisitors": calc_change(this_week["uniqueVisitors"], last_week["uniqueVisitors"]),
    }

    return {
        "generatedAt": iso_z(now),
        "thisWeek": this_week,
        "lastWeek": last_week,
        "changes": changes,
    }
