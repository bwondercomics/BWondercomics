from __future__ import annotations

from datetime import datetime
from xml.dom import minidom
import xml.etree.ElementTree as ET

from .settings import settings


def generate_rss(posts: list[dict]) -> None:
    rss = ET.Element("rss", version="2.0")
    channel = ET.SubElement(rss, "channel")

    ET.SubElement(channel, "title").text = "Battle Bros Comics Updates"
    ET.SubElement(channel, "link").text = "https://bwondercomics.com"
    ET.SubElement(channel, "description").text = "Latest updates from the Battle Bros universe."
    ET.SubElement(channel, "language").text = "en-us"

    sorted_posts = sorted(
        [p for p in posts if isinstance(p, dict) and p.get("share", True)],
        key=lambda x: x.get("date", ""),
        reverse=True,
    )

    for post in sorted_posts:
        item = ET.SubElement(channel, "item")
        ET.SubElement(item, "title").text = post.get("title", "Untitled Update")
        ET.SubElement(item, "link").text = f"https://bwondercomics.com/feed.html#{post.get('id')}"
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

    xml_str = minidom.parseString(ET.tostring(rss)).toprettyxml(indent="  ")
    (settings.base_dir / "rss.xml").write_text(xml_str, encoding="utf-8")

