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
    limit: int = Query(100, ge=1, le=500),
):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

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
):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

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

    entry_lookup: dict[tuple[str, str], dict] = {}
    for entry in entries:
        series_id = entry.series_id or ""
        title = entry.title or ""
        key = (series_id, _normalize_key(title))
        entry_lookup[key] = {
            "seriesId": series_id,
            "entryTitle": title,
            "entryLabel": title,
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

    stats: dict[tuple[str, str], dict] = {}
    for visitor_id, series_id, entry_title, entry_label, page_number in events:
        label = entry_title or entry_label
        if not label:
            continue
        sid = series_id or ""
        key = (sid, _normalize_key(label))
        base = entry_lookup.get(key)

        if key not in stats:
            stats[key] = {
                "seriesId": sid,
                "seriesTitle": base.get("seriesTitle") if base else None,
                "entryTitle": base.get("entryTitle") if base else (entry_title or entry_label or ""),
                "entryLabel": base.get("entryLabel") if base else (entry_label or entry_title or ""),
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

    entries_payload = []
    total_reads = 0
    total_finishes = 0

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

        entries_payload.append(
            {
                "seriesId": entry_stat["seriesId"],
                "seriesTitle": entry_stat["seriesTitle"] or "",
                "entryTitle": entry_stat["entryTitle"] or "",
                "entryLabel": entry_stat["entryLabel"] or "",
                "pageCount": page_count,
                "reads": reads,
                "finishes": finishes,
                "finishRate": round(finish_rate, 4),
                "avgStopPage": round(avg_stop, 2),
                "eventCount": int(entry_stat["eventCount"]),
            }
        )

    entries_payload.sort(key=lambda item: (item.get("reads") or 0), reverse=True)

    return {
        "generatedAt": iso_z(now),
        "windowDays": days,
        "totalReads": total_reads,
        "totalFinishes": total_finishes,
        "entries": entries_payload,
    }


@router.get("/api/admin/analytics/reader-series")
def admin_reader_series_analytics(
    request: Request,
    db: Session = Depends(get_db),
    days: int = Query(90, ge=1, le=365),
):
    if not require_admin(request, db):
        return JSONResponse(status_code=403, content={"error": "Admin access required"})

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
