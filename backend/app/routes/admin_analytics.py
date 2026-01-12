from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
import re

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Entry, EntryPage, Series, User, VisitorEvent, VisitorSession
from .admin_utils import iso_z, require_admin


router = APIRouter()


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
    match = re.search(r'\b(\d+)\b', label)
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

    total = db.scalar(select(func.count()).select_from(VisitorEvent).where(VisitorEvent.created_at >= start)) or 0

    rows = db.execute(
        select(
            VisitorEvent.path,
            VisitorEvent.title,
            func.count().label("views"),
            func.count(distinct(VisitorEvent.visitor_id)).label("visitors"),
        )
        .where(VisitorEvent.created_at >= start)
        .group_by(VisitorEvent.path, VisitorEvent.title)
        .order_by(func.count().desc())
        .limit(limit)
    ).all()

    pages = []
    for path, title, views, visitors in rows:
        if not path and not title:
            continue
        pages.append(
            {
                "path": path or "",
                "title": title or "",
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

    entries = db.scalars(select(Entry)).all()
    page_counts = {
        entry_id: count
        for entry_id, count in db.execute(
            select(EntryPage.entry_id, func.count())
            .group_by(EntryPage.entry_id)
        ).all()
    }
    series_map = {s.id: s for s in db.scalars(select(Series)).all()}

    # Build lookup by (series_id, display_number)
    entry_lookup: dict[tuple[str, int], dict] = {}
    for entry in entries:
        series_id = entry.series_id or ""
        display_num = entry.display_number
        if display_num is not None:
            key = (series_id, int(display_num))
            entry_lookup[key] = {
                "seriesId": series_id,
                "entryTitle": entry.title or "",
                "pageCount": int(page_counts.get(entry.id) or 0) or None,
                "seriesTitle": (series_map.get(series_id).title if series_id in series_map else None),
            }

    events = db.execute(
        select(
            VisitorEvent.visitor_id,
            VisitorEvent.series_id,
            VisitorEvent.entry_title,
            VisitorEvent.entry_label,
            VisitorEvent.page_number,
        )
        .where(VisitorEvent.created_at >= start)
    ).all()

    stats: dict[tuple[str, int | None], dict] = {}
    for visitor_id, series_id, entry_title, entry_label, page_number in events:
        sid = series_id or ""
        
        # Extract display number from entry_label
        display_num = _extract_display_number(entry_label)
        if display_num is None:
            # Try extracting from entry_title as fallback
            display_num = _extract_display_number(entry_title)
        
        # Skip if we can't identify the entry
        if display_num is None:
            continue
        
        key = (sid, display_num)
        base = entry_lookup.get(key)

        if key not in stats:
            stats[key] = {
                "seriesId": sid,
                "seriesTitle": base.get("seriesTitle") if base else None,
                "entryTitle": base.get("entryTitle") if base else f"Entry {display_num}",
                "displayNumber": display_num,
                "pageCount": base.get("pageCount") if base else None,
                "readsByVisitor": set(),
                "maxPageByVisitor": {},
                "eventCount": 0,
            }

        entry_stat = stats[key]
        entry_stat["eventCount"] += 1
        if visitor_id:
            entry_stat["readsByVisitor"].add(visitor_id)
            if page_number is not None:
                current_max = entry_stat["maxPageByVisitor"].get(visitor_id, 0)
                entry_stat["maxPageByVisitor"][visitor_id] = max(current_max, int(page_number))

    # Build frontend-expected arrays
    entry_views = []
    entry_completions = []
    entry_stops = []
    series_aggregates: dict[str, dict] = {}
    total_reads = 0
    total_finishes = 0
    all_stop_pages: list[int] = []

    for entry_stat in stats.values():
        reads = len(entry_stat["readsByVisitor"])
        max_pages = list(entry_stat["maxPageByVisitor"].values())
        page_count = entry_stat["pageCount"]
        finishes = 0
        if reads and page_count:
            finishes = sum(1 for val in max_pages if val >= page_count)

        avg_stop = (sum(max_pages) / len(max_pages)) if max_pages else 0
        finish_rate = (finishes / reads) if reads else 0

        total_reads += reads
        total_finishes += finishes
        all_stop_pages.extend(max_pages)

        sid = entry_stat["seriesId"]
        label = entry_stat["entryTitle"] or f"Entry {entry_stat['displayNumber']}"

        entry_views.append({
            "label": label,  # Frontend normalizer expects 'label'
            "value": label,  # Also used as value for detail requests
            "entryLabel": label,  # Keep for compatibility
            "displayNumber": entry_stat["displayNumber"],  # For filtering
            "count": reads,
            "seriesId": sid,
            "seriesTitle": entry_stat["seriesTitle"] or "",
        })

        entry_completions.append({
            "label": label,
            "value": label,
            "entryLabel": label,
            "count": finishes,
            "completionRate": round(finish_rate, 4),  # Frontend expects completionRate
            "finishRate": round(finish_rate, 4),
            "seriesId": sid,
        })

        entry_stops.append({
            "label": label,
            "value": label,
            "entryLabel": label,
            "page": round(avg_stop, 2),  # Frontend expects 'page' for display
            "avgStopPage": round(avg_stop, 2),
            "pageCount": page_count,
            "seriesId": sid,
        })

        # Aggregate by series
        if sid not in series_aggregates:
            series_title = entry_stat["seriesTitle"] or sid or "Unknown Series"
            series_aggregates[sid] = {
                "label": series_title,  # Frontend normalizer expects 'label'
                "value": sid,  # Series ID as value for filtering
                "seriesId": sid,
                "seriesTitle": series_title,
                "count": 0,
                "finishes": 0,
            }
        series_aggregates[sid]["count"] += reads
        series_aggregates[sid]["finishes"] += finishes

    # Sort by count descending
    entry_views.sort(key=lambda x: x.get("count", 0), reverse=True)
    entry_completions.sort(key=lambda x: x.get("count", 0), reverse=True)
    entry_stops.sort(key=lambda x: x.get("avgStopPage", 0), reverse=True)
    series_views = sorted(series_aggregates.values(), key=lambda x: x.get("count", 0), reverse=True)

    # Build series completions from aggregates
    series_completions = []
    for agg in series_aggregates.values():
        reads = agg.get("count", 0)
        finishes = agg.get("finishes", 0)
        rate = (finishes / reads) if reads else 0
        series_completions.append({
            "label": agg.get("label", ""),
            "value": agg.get("value", ""),
            "seriesId": agg.get("seriesId", ""),
            "seriesTitle": agg.get("seriesTitle", ""),
            "count": finishes,
            "completionRate": round(rate, 4),
        })
    series_completions.sort(key=lambda x: x.get("count", 0), reverse=True)

    # Calculate overall stats
    overall_finish_rate = (total_finishes / total_reads) if total_reads else 0
    overall_avg_stop = (sum(all_stop_pages) / len(all_stop_pages)) if all_stop_pages else 0

    return {
        "generatedAt": iso_z(now),
        "windowDays": days,
        "entryReadsTotal": total_reads,
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

    # Determine bucket size based on time range
    total_seconds = int((now - start).total_seconds())
    bucket_seconds = max(3600, total_seconds // points)  # Minimum 1 hour buckets

    # Check if we're counting finishes (completions) vs views
    is_finish_metric = event == "reader_entry_complete"

    # For finish metrics, we need page counts to determine completion
    page_counts: dict[tuple[str, int], int] = {}
    if is_finish_metric:
        # Build lookup: (series_id, display_number) -> page_count
        entries = db.scalars(select(Entry)).all()
        entry_page_counts = {
            entry_id: count
            for entry_id, count in db.execute(
                select(EntryPage.entry_id, func.count())
                .group_by(EntryPage.entry_id)
            ).all()
        }
        for entry in entries:
            if entry.display_number is not None:
                sid = entry.series_id or ""
                pc = entry_page_counts.get(entry.id, 0)
                if pc > 0:
                    page_counts[(sid, int(entry.display_number))] = pc

    # Build query - include visitor_id and page_number for finish calculations
    query = select(
        VisitorEvent.created_at,
        VisitorEvent.visitor_id,
        VisitorEvent.entry_title,
        VisitorEvent.entry_label,
        VisitorEvent.series_id,
        VisitorEvent.page_number,
    ).where(VisitorEvent.created_at >= start)

    # Apply property-based filtering if specified
    filter_series_id = None
    filter_display_num = None
    if prop and value:
        normalized_value = value.strip()
        if prop == "entryLabel":
            filter_display_num = _extract_display_number(normalized_value)
            if filter_display_num is None:
                query = query.where(
                    (VisitorEvent.entry_title == normalized_value) |
                    (VisitorEvent.entry_label == normalized_value)
                )
        elif prop == "seriesId":
            filter_series_id = normalized_value
            query = query.where(VisitorEvent.series_id == normalized_value)
        elif prop == "series":
            # Series filter by series_id value
            filter_series_id = normalized_value
            query = query.where(VisitorEvent.series_id == normalized_value)

    events = db.execute(query).all()

    # Create time buckets
    buckets: dict[int, int] = defaultdict(int)

    if is_finish_metric:
        # For finishes: count unique visitor+entry combinations that reached last page
        # Track first finish time per (visitor, series_id, display_num)
        finish_times: dict[tuple[str, str, int], datetime] = {}

        for created_at, visitor_id, entry_title, entry_label, series_id, page_number in events:
            if not visitor_id or page_number is None:
                continue

            sid = series_id or ""
            display_num = _extract_display_number(entry_label) or _extract_display_number(entry_title)
            if display_num is None:
                continue

            # Apply display_number filter if specified
            if filter_display_num is not None and display_num != filter_display_num:
                continue

            # Check if this page view is a completion
            pc = page_counts.get((sid, display_num))
            if pc is None or page_number < pc:
                continue  # Not a finish

            # Track first finish time per visitor+entry
            key = (visitor_id, sid, display_num)
            if key not in finish_times or created_at < finish_times[key]:
                finish_times[key] = created_at

        # Now bucket the finish times
        for finish_time in finish_times.values():
            seconds_since_start = int((finish_time - start).total_seconds())
            bucket_index = seconds_since_start // bucket_seconds
            buckets[bucket_index] += 1
    else:
        # For views: count unique visitors per time bucket
        # Track unique visitors per bucket
        bucket_visitors: dict[int, set] = defaultdict(set)

        for created_at, visitor_id, entry_title, entry_label, series_id, page_number in events:
            # Apply display_number filter if specified
            if filter_display_num is not None:
                display_num = _extract_display_number(entry_label) or _extract_display_number(entry_title)
                if display_num != filter_display_num:
                    continue

            seconds_since_start = int((created_at - start).total_seconds())
            bucket_index = seconds_since_start // bucket_seconds
            if visitor_id:
                bucket_visitors[bucket_index].add(visitor_id)
            else:
                # Anonymous event, count as 1
                buckets[bucket_index] += 1

        # Convert visitor sets to counts
        for bucket_index, visitors in bucket_visitors.items():
            buckets[bucket_index] += len(visitors)

    # Build response with time-series data
    series = []
    for i in range(points):
        bucket_start = start + timedelta(seconds=i * bucket_seconds)
        bucket_end = start + timedelta(seconds=(i + 1) * bucket_seconds)
        if bucket_end > now:
            bucket_end = now

        count = buckets.get(i, 0)
        series.append({
            "start": iso_z(bucket_start),
            "end": iso_z(bucket_end),
            "count": count,
        })

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

    # Fetch all events in range
    query = (
        select(
            VisitorEvent.created_at,
            VisitorEvent.visitor_id,
            VisitorEvent.entry_label,
            VisitorEvent.entry_title,
            VisitorEvent.series_id,
        )
        .where(VisitorEvent.created_at >= start)
    )

    if series_id:
        query = query.where(VisitorEvent.series_id == series_id)

    events = db.execute(query).all()

    # Group by date
    daily_counts: dict[str, dict] = {}
    for created_at, visitor_id, entry_label, entry_title, evt_series_id in events:
        # Apply entry filter if in entry mode
        if mode == "entry" and target_display_num is not None:
            event_display_num = _extract_display_number(entry_label) or _extract_display_number(entry_title)
            if event_display_num != target_display_num:
                continue

        date_str = created_at.date().isoformat()
        if date_str not in daily_counts:
            daily_counts[date_str] = {"count": 0, "visitors": set()}
        daily_counts[date_str]["count"] += 1
        if visitor_id:
            daily_counts[date_str]["visitors"].add(visitor_id)

    # Build response with all dates in range (including zeros)
    series = []
    total_reads = 0
    all_visitors: set[str] = set()

    current = start.date()
    end_date = now.date()
    while current <= end_date:
        date_str = current.isoformat()
        data = daily_counts.get(date_str, {"count": 0, "visitors": set()})
        count = data["count"]
        visitors = data["visitors"]

        total_reads += count
        all_visitors.update(visitors)

        series.append({
            "date": date_str,
            "count": count,
            "uniqueVisitors": len(visitors),
        })
        current += timedelta(days=1)

    return {
        "generatedAt": iso_z(now),
        "range": time_range,
        "mode": mode,
        "entryLabel": entry_label_filter,
        "series": series,
        "totals": {
            "reads": total_reads,
            "uniqueVisitors": len(all_visitors),
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
        today - timedelta(days=days_since_monday),
        datetime.min.time(),
        tzinfo=timezone.utc
    )
    this_week_end = now

    last_week_start = this_week_start - timedelta(days=7)
    last_week_end = this_week_start

    # Get entry page counts for finish calculation
    page_counts = {
        entry_id: count
        for entry_id, count in db.execute(
            select(EntryPage.entry_id, func.count())
            .group_by(EntryPage.entry_id)
        ).all()
    }

    entries = db.scalars(select(Entry)).all()
    entry_lookup: dict[tuple[str, int], dict] = {}
    for entry in entries:
        if entry.display_number is not None:
            key = (entry.series_id or "", int(entry.display_number))
            entry_lookup[key] = {
                "id": entry.id,
                "pageCount": page_counts.get(entry.id, 0),
            }

    def calculate_period_stats(start_dt: datetime, end_dt: datetime) -> dict:
        events = db.execute(
            select(
                VisitorEvent.visitor_id,
                VisitorEvent.series_id,
                VisitorEvent.entry_label,
                VisitorEvent.entry_title,
                VisitorEvent.page_number,
            )
            .where(VisitorEvent.created_at >= start_dt)
            .where(VisitorEvent.created_at < end_dt)
        ).all()

        unique_visitors: set[str] = set()
        reads_by_entry: dict[tuple[str, int], set] = {}
        max_page_by_visitor_entry: dict[tuple[str, str, int], int] = {}

        for visitor_id, series_id, entry_label, entry_title, page_number in events:
            sid = series_id or ""
            display_num = _extract_display_number(entry_label) or _extract_display_number(entry_title)

            if visitor_id:
                unique_visitors.add(visitor_id)

            if display_num is None:
                continue

            key = (sid, display_num)
            if key not in reads_by_entry:
                reads_by_entry[key] = set()
            if visitor_id:
                reads_by_entry[key].add(visitor_id)

            if visitor_id and page_number is not None:
                vkey = (visitor_id, sid, display_num)
                current = max_page_by_visitor_entry.get(vkey, 0)
                max_page_by_visitor_entry[vkey] = max(current, int(page_number))

        total_reads = sum(len(v) for v in reads_by_entry.values())

        # Calculate finishes
        total_finishes = 0
        for (visitor_id, sid, display_num), max_page in max_page_by_visitor_entry.items():
            entry_info = entry_lookup.get((sid, display_num))
            if entry_info and entry_info["pageCount"] > 0:
                if max_page >= entry_info["pageCount"]:
                    total_finishes += 1

        completion_rate = total_finishes / total_reads if total_reads > 0 else 0

        return {
            "reads": total_reads,
            "finishes": total_finishes,
            "completionRate": round(completion_rate, 4),
            "uniqueVisitors": len(unique_visitors),
        }

    this_week = calculate_period_stats(this_week_start, this_week_end)
    this_week["startDate"] = this_week_start.date().isoformat()
    this_week["endDate"] = this_week_end.date().isoformat()

    last_week = calculate_period_stats(last_week_start, last_week_end)
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
