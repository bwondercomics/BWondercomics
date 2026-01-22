"""
Admin Analytics API routes.

Provides reader analytics data for the admin dashboard:
- Entry/series reads, finishes, stop pages
- Time-series data for charts
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
from sqlalchemy.orm import Session

from ..db import get_db, get_umami_db
from ..models import Entry, EntryPage, Series, User, VisitorSession
from ..settings import settings
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
    if user_ids:
        for user in db.scalars(select(User).where(User.id.in_(user_ids))).all():
            user_email_map[user.id] = user.email

    shaped = []
    for s in sessions:
        shaped.append(
            {
                "visitorId": s.visitor_id,
                "userId": str(s.user_id) if s.user_id else None,
                "userEmail": user_email_map.get(s.user_id) if s.user_id else None,
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
                "hitCount": int(s.hit_count or 0),
                "entriesRead": list(s.entries_read or []),
                "seriesRead": list(s.series_read or []),
                "ipAddress": s.ip_address or "",
            }
        )

    return {
        "generatedAt": iso_z(now),
        "windowSeconds": window_seconds,
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
    website_id = _get_umami_website_id()
    website_filter, website_params = _umami_website_filter(website_id)

    try:
        with get_umami_db() as umami_db:
            # Query total page views from Umami (standard page views have NULL event_name)
            total_query = text(f"""
                SELECT COUNT(*)
                FROM website_event we
                WHERE we.event_name IS NULL
                    AND we.created_at >= :start_time
                    {website_filter}
            """)
            total = (
                umami_db.execute(total_query, {"start_time": start, **website_params}).scalar() or 0
            )

            # Query page views grouped by path
            pages_query = text(f"""
                SELECT
                    we.url_path as path,
                    COUNT(*) as views,
                    COUNT(DISTINCT s.visitor_id) as visitors
                FROM website_event we
                JOIN session s ON we.session_id = s.session_id
                WHERE we.event_name IS NULL
                    AND we.created_at >= :start_time
                    {website_filter}
                GROUP BY we.url_path
                ORDER BY views DESC
                LIMIT :limit
            """)
            rows = umami_db.execute(
                pages_query,
                {
                    "start_time": start,
                    "limit": limit,
                    **website_params,
                },
            ).fetchall()

    except Exception as e:
        return {
            "generatedAt": iso_z(now),
            "windowDays": days,
            "error": f"Umami query failed: {str(e)}",
            "total": 0,
            "pages": [],
        }

    pages = []
    for path, views, visitors in rows:
        if not path:
            continue
        pages.append(
            {
                "path": path or "",
                "title": "",  # Umami doesn't store page title in website_event
                "views": int(views or 0),
                "visitors": int(visitors or 0),
            }
        )

    return {
        "generatedAt": iso_z(now),
        "windowDays": days,
        "total": int(total),
        "pages": pages,
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
    prev_start = start - timedelta(days=days)
    prev_end = start
    website_id = _get_umami_website_id()

    # Get entry metadata from local DB
    entries = db.scalars(select(Entry)).all()
    page_counts = {
        entry_id: count
        for entry_id, count in db.execute(
            select(EntryPage.entry_id, func.count()).group_by(EntryPage.entry_id)
        ).all()
    }
    series_map = {s.id: s for s in db.scalars(select(Series)).all()}

    # Build lookup by (series_id, display_number)
    entry_lookup: dict[tuple[str, int], dict] = {}
    empty_entry_keys: set[tuple[str, int]] = set()
    for entry in entries:
        series_id = entry.series_id or ""
        display_num = entry.display_number
        if display_num is not None:
            key = (series_id, int(display_num))
            page_count = int(page_counts.get(entry.id) or 0)
            if page_count <= 0:
                empty_entry_keys.add(key)
            entry_lookup[key] = {
                "seriesId": series_id,
                "entryTitle": entry.title or "",
                "pageCount": page_count or None,
                "seriesTitle": (
                    series_map.get(series_id).title if series_id in series_map else None
                ),
            }

    # Query Umami for reader analytics
    stats: dict[tuple[str, int | None], dict] = {}
    website_filter, website_params = _umami_website_filter(website_id)

    try:
        with get_umami_db() as umami_db:

            def _collect_window_counts(start_time: datetime, end_time: datetime):
                entry_views_window: dict[tuple[str, int], int] = defaultdict(int)
                series_views_window: dict[str, int] = defaultdict(int)
                entry_finish_sessions: dict[tuple[str, int], set] = defaultdict(set)
                series_finish_sessions: dict[str, set] = defaultdict(set)

                page_view_query_window = text(f"""
                    SELECT
                        we.session_id,
                        ed_series.string_value as series_id,
                        ed_entry.string_value as entry_label
                    FROM website_event we
                    LEFT JOIN event_data ed_series ON we.event_id = ed_series.website_event_id AND ed_series.data_key = 'series'
                    LEFT JOIN event_data ed_entry ON we.event_id = ed_entry.website_event_id AND ed_entry.data_key = 'entryLabel'
                    WHERE we.event_name = 'reader_page_view'
                        AND we.created_at >= :start_time
                        AND we.created_at < :end_time
                        {website_filter}
                """)

                events_window = umami_db.execute(
                    page_view_query_window,
                    {
                        "start_time": start_time,
                        "end_time": end_time,
                        **website_params,
                    },
                ).fetchall()

                for session_id, series_id, entry_label in events_window:
                    sid = series_id or ""
                    display_num = _extract_display_number(entry_label)
                    if display_num is None:
                        continue
                    key = (sid, display_num)
                    if key in empty_entry_keys:
                        continue
                    entry_views_window[key] += 1
                    series_views_window[sid] += 1

                complete_query_window = text(f"""
                    SELECT
                        we.session_id,
                        ed_series.string_value as series_id,
                        ed_entry.string_value as entry_label
                    FROM website_event we
                    LEFT JOIN event_data ed_series ON we.event_id = ed_series.website_event_id AND ed_series.data_key = 'series'
                    LEFT JOIN event_data ed_entry ON we.event_id = ed_entry.website_event_id AND ed_entry.data_key = 'entryLabel'
                    WHERE we.event_name = 'reader_entry_complete'
                        AND we.created_at >= :start_time
                        AND we.created_at < :end_time
                        {website_filter}
                """)

                completions_window = umami_db.execute(
                    complete_query_window,
                    {
                        "start_time": start_time,
                        "end_time": end_time,
                        **website_params,
                    },
                ).fetchall()

                for session_id, series_id, entry_label in completions_window:
                    sid = series_id or ""
                    display_num = _extract_display_number(entry_label)
                    if display_num is None:
                        continue
                    key = (sid, display_num)
                    if key in empty_entry_keys:
                        continue
                    if session_id:
                        entry_finish_sessions[key].add(str(session_id))
                        series_finish_sessions[sid].add(str(session_id))

                entry_finishes_window = {
                    key: len(sessions) for key, sessions in entry_finish_sessions.items()
                }
                series_finishes_window = {
                    sid: len(sessions) for sid, sessions in series_finish_sessions.items()
                }

                return (
                    entry_views_window,
                    entry_finishes_window,
                    series_views_window,
                    series_finishes_window,
                )

            # Query page views with their properties from Umami
            # Join event_data to get series, entryLabel, page, totalPages
            page_view_query = text(f"""
                SELECT
                    we.session_id,
                    ed_series.string_value as series_id,
                    ed_entry.string_value as entry_label,
                    ed_page.number_value as page_number,
                    ed_total.number_value as total_pages
                FROM website_event we
                LEFT JOIN event_data ed_series ON we.event_id = ed_series.website_event_id AND ed_series.data_key = 'series'
                LEFT JOIN event_data ed_entry ON we.event_id = ed_entry.website_event_id AND ed_entry.data_key = 'entryLabel'
                LEFT JOIN event_data ed_page ON we.event_id = ed_page.website_event_id AND ed_page.data_key = 'page'
                LEFT JOIN event_data ed_total ON we.event_id = ed_total.website_event_id AND ed_total.data_key = 'totalPages'
                WHERE we.event_name = 'reader_page_view'
                    AND we.created_at >= :start_time
                    AND we.created_at < :end_time
                    {website_filter}
            """)

            events = umami_db.execute(
                page_view_query,
                {
                    "start_time": start,
                    "end_time": now,
                    **website_params,
                },
            ).fetchall()

            # Also get completion events
            complete_query = text(f"""
                SELECT
                    we.session_id,
                    ed_series.string_value as series_id,
                    ed_entry.string_value as entry_label
                FROM website_event we
                LEFT JOIN event_data ed_series ON we.event_id = ed_series.website_event_id AND ed_series.data_key = 'series'
                LEFT JOIN event_data ed_entry ON we.event_id = ed_entry.website_event_id AND ed_entry.data_key = 'entryLabel'
                WHERE we.event_name = 'reader_entry_complete'
                    AND we.created_at >= :start_time
                    AND we.created_at < :end_time
                    {website_filter}
            """)

            completions = umami_db.execute(
                complete_query,
                {
                    "start_time": start,
                    "end_time": now,
                    **website_params,
                },
            ).fetchall()

            (
                prev_entry_views,
                prev_entry_finishes,
                prev_series_views,
                prev_series_finishes,
            ) = _collect_window_counts(prev_start, prev_end)

    except Exception as e:
        # If Umami query fails, return empty data
        return {
            "generatedAt": iso_z(now),
            "windowDays": days,
            "error": f"Umami query failed: {str(e)}",
            "entryReadsTotal": 0,
            "entryFinishesTotal": 0,
            "finishRate": 0,
            "avgStopPage": 0,
            "entryViews": [],
            "entryCompletions": [],
            "entryStops": [],
            "seriesViews": [],
            "seriesCompletions": [],
        }

    # Process page view events
    for session_id, series_id, entry_label, page_number, total_pages in events:
        sid = series_id or ""
        display_num = _extract_display_number(entry_label)
        if display_num is None:
            continue

        key = (sid, display_num)
        if key in empty_entry_keys:
            continue
        base = entry_lookup.get(key)

        if key not in stats:
            stats[key] = {
                "seriesId": sid,
                "seriesTitle": base.get("seriesTitle") if base else None,
                "entryTitle": base.get("entryTitle") if base else f"Entry {display_num}",
                "displayNumber": display_num,
                "pageCount": base.get("pageCount")
                if base
                else (int(total_pages) if total_pages else None),
                "readsBySession": set(),
                "pageViews": 0,
                "maxPageBySession": {},
                "completedSessions": set(),
            }

        entry_stat = stats[key]
        entry_stat["pageViews"] += 1
        if session_id:
            entry_stat["readsBySession"].add(str(session_id))
            if page_number is not None:
                current_max = entry_stat["maxPageBySession"].get(str(session_id), 0)
                entry_stat["maxPageBySession"][str(session_id)] = max(current_max, int(page_number))

    # Process completion events
    for session_id, series_id, entry_label in completions:
        sid = series_id or ""
        display_num = _extract_display_number(entry_label)
        if display_num is None:
            continue

        key = (sid, display_num)
        if key in empty_entry_keys:
            continue
        if key in stats and session_id:
            stats[key]["completedSessions"].add(str(session_id))

    # Build frontend-expected arrays
    entry_views = []
    entry_completions = []
    entry_stops = []
    series_aggregates: dict[str, dict] = {}
    total_page_views = 0
    total_readers = 0
    total_finishes = 0
    all_stop_pages: list[int] = []

    for entry_stat in stats.values():
        readers = len(entry_stat["readsBySession"])
        page_views = int(entry_stat.get("pageViews") or 0)
        max_pages = list(entry_stat["maxPageBySession"].values())
        finishes = len(entry_stat["completedSessions"])

        avg_stop = (sum(max_pages) / len(max_pages)) if max_pages else 0
        finish_rate = (finishes / readers) if readers else 0

        total_page_views += page_views
        total_readers += readers
        total_finishes += finishes
        all_stop_pages.extend(max_pages)

        sid = entry_stat["seriesId"]
        label = entry_stat["entryTitle"] or f"Entry {entry_stat['displayNumber']}"

        prev_views = int(prev_entry_views.get((sid, entry_stat["displayNumber"]), 0))
        view_delta = page_views - prev_views
        entry_views.append(
            {
                "label": label,
                "value": str(entry_stat["displayNumber"]),  # Use displayNumber for detail queries
                "entryLabel": label,
                "displayNumber": entry_stat["displayNumber"],
                "count": page_views,
                "seriesId": sid,
                "seriesTitle": entry_stat["seriesTitle"] or "",
                "delta": view_delta,
                "deltaPct": (view_delta / prev_views) if prev_views else None,
            }
        )

        prev_finishes = int(prev_entry_finishes.get((sid, entry_stat["displayNumber"]), 0))
        finish_delta = finishes - prev_finishes
        entry_completions.append(
            {
                "label": label,
                "value": str(entry_stat["displayNumber"]),
                "entryLabel": label,
                "count": finishes,
                "completionRate": round(finish_rate, 4),
                "finishRate": round(finish_rate, 4),
                "seriesId": sid,
                "delta": finish_delta,
                "deltaPct": (finish_delta / prev_finishes) if prev_finishes else None,
            }
        )

        entry_stops.append(
            {
                "label": label,
                "value": str(entry_stat["displayNumber"]),
                "entryLabel": label,
                "page": round(avg_stop, 2),
                "avgStopPage": round(avg_stop, 2),
                "pageCount": entry_stat["pageCount"],
                "seriesId": sid,
            }
        )

        # Aggregate by series
        if sid not in series_aggregates:
            series_title = entry_stat["seriesTitle"] or sid or "Unknown Series"
            series_aggregates[sid] = {
                "label": series_title,
                "value": sid,
                "seriesId": sid,
                "seriesTitle": series_title,
                "count": 0,
                "readers": 0,
                "finishes": 0,
            }
        series_aggregates[sid]["count"] += page_views
        series_aggregates[sid]["readers"] += readers
        series_aggregates[sid]["finishes"] += finishes

    # Sort by count descending
    entry_views.sort(key=lambda x: x.get("count", 0), reverse=True)
    entry_completions.sort(key=lambda x: x.get("count", 0), reverse=True)
    entry_stops.sort(key=lambda x: x.get("avgStopPage", 0), reverse=True)
    series_views = sorted(series_aggregates.values(), key=lambda x: x.get("count", 0), reverse=True)
    for item in series_views:
        sid = item.get("seriesId", "")
        prev_views = int(prev_series_views.get(sid, 0))
        delta = int(item.get("count", 0)) - prev_views
        item["delta"] = delta
        item["deltaPct"] = (delta / prev_views) if prev_views else None

    # Build series completions from aggregates
    series_completions = []
    for agg in series_aggregates.values():
        reads = agg.get("readers", agg.get("count", 0))
        finishes = agg.get("finishes", 0)
        rate = (finishes / reads) if reads else 0
        prev_finishes = int(prev_series_finishes.get(agg.get("seriesId", ""), 0))
        finish_delta = finishes - prev_finishes
        series_completions.append(
            {
                "label": agg.get("label", ""),
                "value": agg.get("value", ""),
                "seriesId": agg.get("seriesId", ""),
                "seriesTitle": agg.get("seriesTitle", ""),
                "count": finishes,
                "completionRate": round(rate, 4),
                "delta": finish_delta,
                "deltaPct": (finish_delta / prev_finishes) if prev_finishes else None,
            }
        )
    series_completions.sort(key=lambda x: x.get("count", 0), reverse=True)

    # Calculate overall stats
    overall_finish_rate = (total_finishes / total_readers) if total_readers else 0
    overall_avg_stop = (sum(all_stop_pages) / len(all_stop_pages)) if all_stop_pages else 0

    return {
        "generatedAt": iso_z(now),
        "windowDays": days,
        "entryReadsTotal": total_page_views,
        "entryFinishesTotal": total_finishes,
        "finishRate": round(overall_finish_rate, 4),
        "avgStopPage": round(overall_avg_stop, 2),
        "entryViews": entry_views,
        "entryCompletions": entry_completions,
        "entryStops": entry_stops,
        "seriesViews": series_views,
        "seriesCompletions": series_completions,
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
    points: int = Query(12, ge=1, le=100),
):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    # Convert range parameter to days if provided
    if time_range:
        if time_range == "24h":
            days = 1
        elif time_range == "7d":
            days = 7
        elif time_range == "30d":
            days = 30
        elif time_range == "90d":
            days = 90

    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)
    website_id = _get_umami_website_id()

    # Determine bucket size based on time range
    total_seconds = int((now - start).total_seconds())
    bucket_seconds = max(3600, total_seconds // points)  # Minimum 1 hour buckets

    # Check if we're counting finishes (completions) vs views
    is_finish_metric = event == "reader_entry_complete"

    # Parse filter values
    filter_series_id = None
    filter_display_num = None
    if prop and value:
        normalized_value = value.strip()
        if prop == "entryLabel":
            # Check if value is a direct display number
            if normalized_value.isdigit():
                filter_display_num = int(normalized_value)
            else:
                filter_display_num = _extract_display_number(normalized_value)
        elif prop in ("seriesId", "series"):
            filter_series_id = normalized_value

    # Create time buckets
    buckets: dict[int, int] = defaultdict(int)
    website_filter, website_params = _umami_website_filter(website_id)

    try:
        with get_umami_db() as umami_db:
            if is_finish_metric:
                # Query completion events from Umami
                query = text(f"""
                    SELECT
                        we.created_at,
                        we.session_id,
                        ed_series.string_value as series_id,
                        ed_entry.string_value as entry_label
                    FROM website_event we
                    LEFT JOIN event_data ed_series ON we.event_id = ed_series.website_event_id AND ed_series.data_key = 'series'
                    LEFT JOIN event_data ed_entry ON we.event_id = ed_entry.website_event_id AND ed_entry.data_key = 'entryLabel'
                    WHERE we.event_name = 'reader_entry_complete'
                        AND we.created_at >= :start_time
                        {website_filter}
                """)

                events = umami_db.execute(
                    query,
                    {
                        "start_time": start,
                        **website_params,
                    },
                ).fetchall()

                # Track unique completions per session+entry
                completion_times: dict[tuple[str, str, int], datetime] = {}

                for created_at, session_id, series_id, entry_label in events:
                    sid = series_id or ""
                    display_num = _extract_display_number(entry_label)
                    if display_num is None:
                        continue

                    # Apply filters
                    if filter_series_id and sid != filter_series_id:
                        continue
                    if filter_display_num is not None and display_num != filter_display_num:
                        continue

                    # Track first completion time per session+entry
                    key = (str(session_id), sid, display_num)
                    if key not in completion_times or created_at < completion_times[key]:
                        completion_times[key] = created_at

                # Bucket the completion times
                for completion_time in completion_times.values():
                    seconds_since_start = int((completion_time - start).total_seconds())
                    bucket_index = seconds_since_start // bucket_seconds
                    buckets[bucket_index] += 1
            else:
                # Query page view events from Umami
                query = text(f"""
                    SELECT
                        we.created_at,
                        we.session_id,
                        ed_series.string_value as series_id,
                        ed_entry.string_value as entry_label
                    FROM website_event we
                    LEFT JOIN event_data ed_series ON we.event_id = ed_series.website_event_id AND ed_series.data_key = 'series'
                    LEFT JOIN event_data ed_entry ON we.event_id = ed_entry.website_event_id AND ed_entry.data_key = 'entryLabel'
                    WHERE we.event_name = 'reader_page_view'
                        AND we.created_at >= :start_time
                        {website_filter}
                """)

                events = umami_db.execute(
                    query,
                    {
                        "start_time": start,
                        **website_params,
                    },
                ).fetchall()

                for created_at, session_id, series_id, entry_label in events:
                    sid = series_id or ""
                    display_num = _extract_display_number(entry_label)

                    # Apply filters
                    if filter_series_id and sid != filter_series_id:
                        continue
                    if filter_display_num is not None:
                        if display_num is None or display_num != filter_display_num:
                            continue

                    seconds_since_start = int((created_at - start).total_seconds())
                    bucket_index = seconds_since_start // bucket_seconds
                    buckets[bucket_index] += 1

    except Exception as e:
        # If Umami query fails, return empty series
        return {
            "generatedAt": iso_z(now),
            "windowDays": days,
            "error": f"Umami query failed: {str(e)}",
            "series": [],
        }

    # Build response with time-series data
    series = []
    for i in range(points):
        bucket_start = start + timedelta(seconds=i * bucket_seconds)
        bucket_end = start + timedelta(seconds=(i + 1) * bucket_seconds)
        if bucket_end > now:
            bucket_end = now

        count = buckets.get(i, 0)
        series.append(
            {
                "start": iso_z(bucket_start),
                "end": iso_z(bucket_end),
                "count": count,
            }
        )

        if bucket_end >= now:
            break

    return {
        "generatedAt": iso_z(now),
        "windowDays": days,
        "series": series,
    }


@router.get("/api/admin/analytics/reads-over-time")
def admin_reads_over_time(
    request: Request,
    db: Session = Depends(get_db),
    time_range: str = Query("7d", alias="range"),
    entry_id: str = Query(None),
    series_id: str = Query(None),
):
    """Daily read counts for time-series chart. Supports aggregate or per-entry view."""
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

    # Parse range to days
    days_map = {"7d": 7, "30d": 30, "90d": 90}
    days = days_map.get(time_range, 7)

    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)
    website_id = _get_umami_website_id()

    # Determine mode and entry filter
    mode = "aggregate"
    entry_label_filter = None
    target_display_num = None

    if entry_id and entry_id != "aggregate":
        mode = "entry"
        entry_label_filter = entry_id
        # entry_id can be a direct display number (e.g., "5") or a label string
        if entry_id.isdigit():
            target_display_num = int(entry_id)
        else:
            target_display_num = _extract_display_number(entry_id)

    # Group by date
    daily_counts: dict[str, dict] = {}
    website_filter, website_params = _umami_website_filter(website_id)

    try:
        with get_umami_db() as umami_db:
            # Query page views from Umami
            query = text(f"""
                SELECT
                    we.created_at,
                    we.session_id,
                    ed_series.string_value as series_id,
                    ed_entry.string_value as entry_label
                FROM website_event we
                LEFT JOIN event_data ed_series ON we.event_id = ed_series.website_event_id AND ed_series.data_key = 'series'
                LEFT JOIN event_data ed_entry ON we.event_id = ed_entry.website_event_id AND ed_entry.data_key = 'entryLabel'
                WHERE we.event_name = 'reader_page_view'
                    AND we.created_at >= :start_time
                    {website_filter}
            """)

            events = umami_db.execute(
                query,
                {
                    "start_time": start,
                    **website_params,
                },
            ).fetchall()

            for created_at, session_id, evt_series_id, entry_label in events:
                # Apply series filter
                if series_id and evt_series_id != series_id:
                    continue

                # Apply entry filter if in entry mode
                if mode == "entry" and target_display_num is not None:
                    event_display_num = _extract_display_number(entry_label)
                    if event_display_num != target_display_num:
                        continue

                date_str = created_at.date().isoformat()
                if date_str not in daily_counts:
                    daily_counts[date_str] = {"sessions": set(), "views": 0}
                daily_counts[date_str]["views"] += 1
                if session_id:
                    daily_counts[date_str]["sessions"].add(str(session_id))

    except Exception as e:
        return {
            "generatedAt": iso_z(now),
            "range": time_range,
            "mode": mode,
            "entryLabel": entry_label_filter,
            "error": f"Umami query failed: {str(e)}",
            "series": [],
            "totals": {"reads": 0, "uniqueVisitors": 0},
        }

    # Build response with all dates in range (including zeros)
    series = []
    all_sessions: set[str] = set()
    total_views = 0

    current = start.date()
    end_date = now.date()
    while current <= end_date:
        date_str = current.isoformat()
        data = daily_counts.get(date_str, {"sessions": set(), "views": 0})
        sessions = data["sessions"]
        views = int(data.get("views") or 0)

        all_sessions.update(sessions)
        total_views += views

        series.append(
            {
                "date": date_str,
                "count": views,  # Total page views per day
                "uniqueVisitors": len(sessions),
            }
        )
        current += timedelta(days=1)

    return {
        "generatedAt": iso_z(now),
        "range": time_range,
        "mode": mode,
        "entryLabel": entry_label_filter,
        "series": series,
        "totals": {
            "reads": total_views,  # Total page views
            "uniqueVisitors": len(all_sessions),
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

    def calculate_period_stats_umami(start_dt: datetime, end_dt: datetime) -> dict:
        try:
            with get_umami_db() as umami_db:
                # Query unique visitors from all reader events
                visitors_query = text(f"""
                    SELECT COUNT(DISTINCT s.visitor_id)
                    FROM website_event we
                    JOIN session s ON we.session_id = s.session_id
                    WHERE we.event_name IN ('reader_page_view', 'reader_entry_complete', 'reader_entry_exit')
                        AND we.created_at >= :start_time
                        AND we.created_at < :end_time
                        {website_filter}
                """)
                unique_visitors = (
                    umami_db.execute(
                        visitors_query,
                        {
                            "start_time": start_dt,
                            "end_time": end_dt,
                            **website_params,
                        },
                    ).scalar()
                    or 0
                )

                # Query reads: unique sessions per entry from reader_page_view
                reads_query = text(f"""
                    SELECT
                        ed_entry.string_value as entry_label,
                        COUNT(DISTINCT we.session_id) as session_count
                    FROM website_event we
                    LEFT JOIN event_data ed_entry ON we.event_id = ed_entry.website_event_id
                        AND ed_entry.data_key = 'entryLabel'
                    WHERE we.event_name = 'reader_page_view'
                        AND we.created_at >= :start_time
                        AND we.created_at < :end_time
                        AND ed_entry.string_value IS NOT NULL
                        {website_filter}
                    GROUP BY ed_entry.string_value
                """)
                reads_rows = umami_db.execute(
                    reads_query,
                    {
                        "start_time": start_dt,
                        "end_time": end_dt,
                        **website_params,
                    },
                ).fetchall()

                total_reads = sum(row[1] for row in reads_rows)

                # Query finishes: unique sessions from reader_entry_complete
                finishes_query = text(f"""
                    SELECT COUNT(DISTINCT we.session_id)
                    FROM website_event we
                    WHERE we.event_name = 'reader_entry_complete'
                        AND we.created_at >= :start_time
                        AND we.created_at < :end_time
                        {website_filter}
                """)
                total_finishes = (
                    umami_db.execute(
                        finishes_query,
                        {
                            "start_time": start_dt,
                            "end_time": end_dt,
                            **website_params,
                        },
                    ).scalar()
                    or 0
                )

        except Exception:
            return {
                "reads": 0,
                "finishes": 0,
                "completionRate": 0,
                "uniqueVisitors": 0,
            }

        completion_rate = total_finishes / total_reads if total_reads > 0 else 0

        return {
            "reads": total_reads,
            "finishes": total_finishes,
            "completionRate": round(completion_rate, 4),
            "uniqueVisitors": unique_visitors,
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
