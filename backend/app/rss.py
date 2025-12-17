from __future__ import annotations

from datetime import datetime, timezone
from xml.dom import minidom
import xml.etree.ElementTree as ET

from .settings import settings


def _parse_dt(raw: str | None) -> datetime | None:
    if not raw:
        return None
    value = raw.strip()
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def build_rss_xml(posts: list[dict], *, base_url: str = "") -> str:
    rss = ET.Element("rss", version="2.0")
    channel = ET.SubElement(rss, "channel")

    ET.SubElement(channel, "title").text = "Battle Bros Comics Updates"
    base = (base_url or "https://bwondercomics.com").rstrip("/")
    ET.SubElement(channel, "link").text = base
    ET.SubElement(channel, "description").text = "Latest updates from the Battle Bros universe."
    ET.SubElement(channel, "language").text = "en-us"

    now = datetime.now(timezone.utc)
    sorted_posts = sorted(
        [
            p
            for p in posts
            if isinstance(p, dict)
            and p.get("share", True)
            and (str(p.get("status") or "published").strip().lower() != "draft")
            and ((dt := _parse_dt(str(p.get("date") or ""))) is None or dt <= now)
        ],
        key=lambda x: x.get("date", "") or "",
        reverse=True,
    )

    for post in sorted_posts:
        item = ET.SubElement(channel, "item")
        ET.SubElement(item, "title").text = post.get("title", "Untitled Update")
        post_id = post.get("id") or ""
        ET.SubElement(item, "link").text = f"{base}/feed.html#{post_id}"
        ET.SubElement(item, "guid").text = post.get("id")

        date_str = post.get("date", "")
        try:
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            pub_date = dt.strftime("%a, %d %b %Y %H:%M:%S +0000")
        except Exception:
            pub_date = date_str
        ET.SubElement(item, "pubDate").text = pub_date

        description = post.get("content", "")
        if post.get("image"):
            description = f'<img src="{post.get("image")}" /><br/>{description}'
        ET.SubElement(item, "description").text = description

    return minidom.parseString(ET.tostring(rss)).toprettyxml(indent="  ")


def generate_rss(posts: list[dict]) -> None:
    xml_str = build_rss_xml(posts, base_url="")
    (settings.base_dir / "rss.xml").write_text(xml_str, encoding="utf-8")
