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
            "entryLabel": label,
            "count": reads,
            "seriesId": sid,
            "seriesTitle": entry_stat["seriesTitle"] or "",
        })

        entry_completions.append({
            "entryLabel": label,
            "count": finishes,
            "finishRate": round(finish_rate, 4),
            "seriesId": sid,
        })

        entry_stops.append({
            "entryLabel": label,
            "avgStopPage": round(avg_stop, 2),
            "pageCount": page_count,
            "seriesId": sid,
        })

        # Aggregate by series
        if sid not in series_aggregates:
            series_aggregates[sid] = {
                "seriesId": sid,
                "seriesTitle": entry_stat["seriesTitle"] or "",
                "count": 0,
            }
        series_aggregates[sid]["count"] += reads

    # Sort by count descending
    entry_views.sort(key=lambda x: x.get("count", 0), reverse=True)
    entry_completions.sort(key=lambda x: x.get("count", 0), reverse=True)
    entry_stops.sort(key=lambda x: x.get("avgStopPage", 0), reverse=True)
    series_views = sorted(series_aggregates.values(), key=lambda x: x.get("count", 0), reverse=True)

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
    }


@router.get("/api/admin/analytics/reader-series")
def admin_reader_series_analytics(
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

    series_map = {s.id: s.title for s in db.scalars(select(Series)).all()}

    events = db.execute(
        select(
            VisitorEvent.visitor_id,
            VisitorEvent.series_id,
            VisitorEvent.entry_label,
            VisitorEvent.entry_title,
            VisitorEvent.page_number,
        )
        .where(VisitorEvent.created_at >= start)
    ).all()

    per_series: dict[str, dict] = defaultdict(lambda: {"readsByVisitor": set(), "maxPageByVisitor": {}, "eventCount": 0})

    for visitor_id, series_id, entry_label, entry_title, page_number in events:
        sid = series_id or "unknown"
        per_series[sid]["eventCount"] += 1
        if visitor_id:
            per_series[sid]["readsByVisitor"].add(visitor_id)
            if page_number is not None:
                current_max = per_series[sid]["maxPageByVisitor"].get(visitor_id, 0)
                per_series[sid]["maxPageByVisitor"][visitor_id] = max(current_max, int(page_number))

    payload = []
    for sid, data in per_series.items():
        reads = len(data["readsByVisitor"])
        max_pages = list(data["maxPageByVisitor"].values())
        avg_stop = (sum(max_pages) / len(max_pages)) if max_pages else 0
        payload.append(
            {
                "seriesId": sid,
                "seriesTitle": series_map.get(sid) or "",
                "reads": reads,
                "avgStopPage": round(avg_stop, 2),
                "eventCount": int(data["eventCount"]),
            }
        )

    payload.sort(key=lambda item: (item.get("reads") or 0), reverse=True)

    return {
        "generatedAt": iso_z(now),
        "windowDays": days,
        "series": payload,
    }
