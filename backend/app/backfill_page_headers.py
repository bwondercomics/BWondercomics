from __future__ import annotations

import argparse
import json
from copy import deepcopy
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from .builder_security import sanitize_appearance, sanitize_header_shell_appearance
from .db import SessionLocal
from .models import BuilderPage, BuilderSection, PageConfig
from .page_store import update_page

HEADER_REGION_ORDER = ("left", "center", "right")
HEADER_BLOCK_IDS = ("brand", "patron", "status", "entryControls", "nav")


def _clone(value: Any) -> Any:
    return deepcopy(value)


def serialize_raw_page(page: BuilderPage) -> dict[str, Any]:
    return {
        "id": str(page.id),
        "seriesId": page.series_id,
        "slug": page.slug,
        "title": page.title,
        "pageType": page.page_type,
        "isPublished": page.is_published,
        "isHomepage": page.is_homepage,
        "sortIndex": page.sort_index,
        "meta": _clone(page.meta or {}),
        "sections": [
            {
                "id": str(section.id),
                "sectionType": section.section_type,
                "layout": section.layout,
                "sortIndex": section.sort_index,
                "settings": _clone(section.settings or {}),
                "modules": [
                    {
                        "id": str(module.id),
                        "moduleType": module.module_type,
                        "columnIndex": module.column_index,
                        "sortIndex": module.sort_index,
                        "config": _clone(module.config or {}),
                    }
                    for module in sorted(
                        section.modules,
                        key=lambda current: (current.column_index, current.sort_index),
                    )
                ],
            }
            for section in sorted(page.sections, key=lambda current: current.sort_index)
        ],
    }


def create_default_header_config() -> dict[str, Any]:
    return {
        "version": 2,
        "regions": {
            "left": ["brand"],
            "center": ["patron", "status"],
            "right": ["entryControls", "nav"],
        },
        "blocks": {block_id: {"enabled": True} for block_id in HEADER_BLOCK_IDS},
        "nav": {
            "items": [
                {
                    "id": "comics",
                    "label": "Comics",
                    "enabled": True,
                    "style": "primary",
                    "link": {
                        "kind": "url",
                        "url": "comics.html",
                        "openInNewTab": False,
                    },
                }
            ]
        },
    }


def create_default_header_copy(page: dict[str, Any] | None = None) -> dict[str, Any]:
    title = str((page or {}).get("title") or "").strip() or "Page Title"
    return {
        "title": title,
        "subtitle": "",
        "subtitles": [],
    }


def normalize_header_copy(
    raw_copy: dict[str, Any] | None = None, fallback: dict[str, Any] | None = None
) -> dict[str, Any]:
    copy_block = raw_copy if isinstance(raw_copy, dict) else {}
    fallback_block = fallback if isinstance(fallback, dict) else {}
    fallback_title = str(fallback_block.get("title") or "").strip() or "Page Title"
    fallback_subtitle = str(fallback_block.get("subtitle") or "").strip()
    fallback_subtitles = [
        str(item or "").strip()
        for item in (fallback_block.get("subtitles") or [])
        if str(item or "").strip()
    ]
    subtitles = copy_block.get("subtitles")
    return {
        "title": str(copy_block.get("title") or "").strip() or fallback_title,
        "subtitle": str(copy_block.get("subtitle") or "").strip() or fallback_subtitle,
        "subtitles": [
            str(item or "").strip()
            for item in (subtitles if isinstance(subtitles, list) else fallback_subtitles)
            if str(item or "").strip()
        ],
    }


def normalize_header_nav_items(items: Any) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    if not isinstance(items, list):
        return normalized
    for index, item in enumerate(items):
        current = item if isinstance(item, dict) else {}
        style = str(current.get("style") or "primary").strip()
        nav_item = {
            "id": str(current.get("id") or f"nav-{index + 1}").strip() or f"nav-{index + 1}",
            "label": str(current.get("label") or current.get("text") or "").strip() or "Link",
            "enabled": current.get("enabled") is not False,
            "style": style if style in {"primary", "secondary"} else "primary",
            "link": _clone(current.get("link") or {}),
        }
        appearance = sanitize_appearance(current.get("appearance"))
        if appearance is not None:
            nav_item["appearance"] = appearance
        normalized.append(nav_item)
    return normalized


def normalize_regions(raw_regions: Any) -> dict[str, list[str]]:
    defaults = create_default_header_config()["regions"]
    source = raw_regions if isinstance(raw_regions, dict) else {}
    normalized = {
        "left": list(source.get("left"))
        if isinstance(source.get("left"), list)
        else list(defaults["left"]),
        "center": list(source.get("center"))
        if isinstance(source.get("center"), list)
        else list(defaults["center"]),
        "right": list(source.get("right"))
        if isinstance(source.get("right"), list)
        else list(defaults["right"]),
    }
    seen: set[str] = set()
    for region in HEADER_REGION_ORDER:
        filtered: list[str] = []
        for block_id in normalized[region]:
            current = str(block_id or "").strip()
            if current not in HEADER_BLOCK_IDS or current in seen:
                continue
            filtered.append(current)
            seen.add(current)
        normalized[region] = filtered
    for block_id in HEADER_BLOCK_IDS:
        if block_id in seen:
            continue
        if block_id == "brand":
            fallback_region = "left"
        elif block_id in {"patron", "status"}:
            fallback_region = "center"
        else:
            fallback_region = "right"
        normalized[fallback_region].append(block_id)
    return normalized


def normalize_blocks(raw_blocks: Any, raw_nav: Any) -> dict[str, dict[str, bool]]:
    source_blocks = raw_blocks if isinstance(raw_blocks, dict) else {}
    source_nav = raw_nav if isinstance(raw_nav, dict) else {}
    blocks: dict[str, dict[str, bool]] = {}
    for block_id in HEADER_BLOCK_IDS:
        block = source_blocks.get(block_id) if isinstance(source_blocks.get(block_id), dict) else {}
        enabled_fallback = source_nav.get("enabled") is not False if block_id == "nav" else True
        blocks[block_id] = {
            "enabled": block.get("enabled") is not False if "enabled" in block else enabled_fallback
        }
    return blocks


def normalize_header_config(raw_config: Any) -> dict[str, Any]:
    source = raw_config if isinstance(raw_config, dict) else {}
    defaults = create_default_header_config()
    normalized = {
        "version": 2,
        "regions": normalize_regions(source.get("regions")),
        "blocks": normalize_blocks(source.get("blocks"), source.get("nav")),
        "nav": {
            "items": normalize_header_nav_items(
                (source.get("nav") or {}).get("items")
                if isinstance(source.get("nav"), dict)
                else defaults["nav"]["items"]
            )
        },
    }
    appearance = sanitize_header_shell_appearance(source.get("appearance"))
    if appearance is not None:
        normalized["appearance"] = appearance
    return normalized


def normalize_header_overrides(raw_overrides: Any) -> dict[str, list[str]]:
    overrides = raw_overrides if isinstance(raw_overrides, dict) else {}
    hidden = overrides.get("hiddenBlockIds")
    return {
        "hiddenBlockIds": [
            block_id
            for block_id in (
                str(item or "").strip() for item in (hidden if isinstance(hidden, list) else [])
            )
            if block_id in HEADER_BLOCK_IDS
        ]
    }


def get_legacy_header_module_copy(page: dict[str, Any] | None = None) -> dict[str, Any] | None:
    for section in (page or {}).get("sections") or []:
        for module in section.get("modules") or []:
            if module.get("moduleType") == "header" and isinstance(module.get("config"), dict):
                return module["config"]
    return None


def get_legacy_header_copy_fallback(
    page: dict[str, Any] | None = None, page_config: dict[str, Any] | None = None
) -> dict[str, Any]:
    legacy_page_header = {}
    if isinstance((page_config or {}).get("content"), dict) and isinstance(
        (page_config or {}).get("content", {}).get("header"), dict
    ):
        legacy_page_header = (page_config or {}).get("content", {}).get("header") or {}
    return normalize_header_copy(
        get_legacy_header_module_copy(page),
        {
            "title": legacy_page_header.get("title")
            or create_default_header_copy(page).get("title"),
            "subtitle": legacy_page_header.get("subtitle") or "",
            "subtitles": legacy_page_header.get("subtitles")
            if isinstance(legacy_page_header.get("subtitles"), list)
            else [],
        },
    )


def create_page_header_meta(
    raw_header: Any,
    raw_copy: Any,
    page: dict[str, Any] | None = None,
    copy_fallback: dict[str, Any] | None = None,
) -> dict[str, Any]:
    layout = normalize_header_config(raw_header)
    copy = normalize_header_copy(raw_copy, copy_fallback or create_default_header_copy(page))
    header = {
        "version": 3,
        "copy": copy,
        "regions": layout["regions"],
        "blocks": layout["blocks"],
        "nav": layout["nav"],
    }
    if layout.get("appearance") is not None:
        header["appearance"] = layout["appearance"]
    return header


def create_effective_page_header(
    page: dict[str, Any] | None = None, page_config: dict[str, Any] | None = None
) -> dict[str, Any]:
    meta = (page or {}).get("meta") or {}
    raw_header = meta.get("header") if isinstance(meta.get("header"), dict) else None
    built_in_copy = create_default_header_copy(page)
    legacy_copy = get_legacy_header_copy_fallback(page, page_config)

    if raw_header:
        return create_page_header_meta(
            raw_header,
            raw_header.get("copy"),
            page=page,
            copy_fallback=built_in_copy
            if int(raw_header.get("version") or 0) >= 3
            else legacy_copy,
        )

    if isinstance((page_config or {}).get("site"), dict) and (
        isinstance((page_config or {}).get("site", {}).get("header"), dict)
        or isinstance(meta.get("headerOverrides"), dict)
    ):
        header = create_page_header_meta(
            (page_config or {}).get("site", {}).get("header"),
            legacy_copy,
            page=page,
            copy_fallback=legacy_copy,
        )
        hidden_block_ids = normalize_header_overrides(meta.get("headerOverrides")).get(
            "hiddenBlockIds", []
        )
        for block_id in hidden_block_ids:
            if block_id in header["blocks"]:
                header["blocks"][block_id]["enabled"] = False
        return header

    return create_page_header_meta(
        create_default_header_config(),
        legacy_copy,
        page=page,
        copy_fallback=legacy_copy,
    )


def page_needs_header_backfill(page: dict[str, Any] | None) -> bool:
    meta = (page or {}).get("meta") or {}
    raw_header = meta.get("header") if isinstance(meta.get("header"), dict) else None
    if not raw_header:
        return True
    if int(raw_header.get("version") or 0) < 3:
        return True
    return isinstance(meta.get("headerOverrides"), dict)


def build_backfilled_page_meta(
    page: dict[str, Any], page_config: dict[str, Any] | None = None
) -> dict[str, Any] | None:
    if not page_needs_header_backfill(page):
        return None
    next_meta = _clone((page or {}).get("meta") or {})
    next_meta["header"] = create_effective_page_header(page, page_config)
    next_meta.pop("headerOverrides", None)
    return next_meta


def get_header_version(meta: dict[str, Any] | None) -> int | None:
    raw_header = (meta or {}).get("header") if isinstance(meta, dict) else None
    if not isinstance(raw_header, dict):
        return None
    try:
        return int(raw_header.get("version") or 0)
    except (TypeError, ValueError):
        return 0


def get_disabled_blocks(header: dict[str, Any] | None) -> list[str]:
    blocks = header.get("blocks") if isinstance(header, dict) else {}
    if not isinstance(blocks, dict):
        return []
    return [
        block_id
        for block_id in HEADER_BLOCK_IDS
        if isinstance(blocks.get(block_id), dict) and blocks[block_id].get("enabled") is False
    ]


def summarize_page_report(page: dict[str, Any], next_meta: dict[str, Any] | None) -> dict[str, Any]:
    before_meta = (page or {}).get("meta") if isinstance((page or {}).get("meta"), dict) else {}
    after_meta = next_meta if isinstance(next_meta, dict) else before_meta
    header = after_meta.get("header") if isinstance(after_meta.get("header"), dict) else {}
    nav_items = (
        (header.get("nav") or {}).get("items") if isinstance(header.get("nav"), dict) else []
    )
    nav_items = nav_items if isinstance(nav_items, list) else []
    return {
        "pageId": page.get("id"),
        "slug": page.get("slug"),
        "beforeHeaderVersion": get_header_version(before_meta),
        "afterHeaderVersion": get_header_version(after_meta),
        "overridesCleared": isinstance(before_meta.get("headerOverrides"), dict)
        and "headerOverrides" not in after_meta,
        "navItemCount": len(nav_items),
        "navStyles": [
            str(item.get("style") or "primary") for item in nav_items if isinstance(item, dict)
        ],
        "disabledBlocks": get_disabled_blocks(header),
        "regions": _clone(header.get("regions") if isinstance(header, dict) else {}),
        "hasAppearance": isinstance(header.get("appearance"), dict),
        "hasNavItemAppearance": any(
            isinstance(item, dict) and isinstance(item.get("appearance"), dict)
            for item in nav_items
        ),
    }


def summarize_runtime_readiness(pages: list[dict[str, Any]]) -> dict[str, Any]:
    bucket_summary: dict[str, dict[str, Any]] = {}
    has_published_reader_page = any(
        str(page.get("slug") or "").strip() == "reader" and page.get("isPublished") is True
        for page in pages
    )
    for page in pages:
        meta = (page or {}).get("meta") or {}
        raw_header = meta.get("header") if isinstance(meta.get("header"), dict) else None
        issues: list[tuple[str, str]] = []
        if not raw_header:
            issues.append(
                (
                    "missingHeader",
                    "Bulk backfill writes page.meta.header.version = 3 for all builder pages.",
                )
            )
        elif int(raw_header.get("version") or 0) < 3:
            issues.append(
                (
                    "staleHeaderVersion",
                    "Header saves and backfill normalise older stored headers to v3.",
                )
            )
        if isinstance(meta.get("headerOverrides"), dict):
            issues.append(
                (
                    "headerOverrides",
                    "Backfill must clear page.meta.headerOverrides once the effective header is written to page meta.",
                )
            )

        for bucket, gate in issues:
            if bucket not in bucket_summary:
                bucket_summary[bucket] = {"count": 0, "gate": gate, "pageIds": []}
            bucket_summary[bucket]["count"] += 1
            bucket_summary[bucket]["pageIds"].append(page.get("id"))

    if not has_published_reader_page:
        bucket_summary["missingPublishedReaderPage"] = {
            "count": 1,
            "gate": "Runtime fallback can only be removed after the series has a published builder page with slug 'reader'.",
            "pageIds": [],
        }

    return {
        "bucketSummary": bucket_summary,
        "removalReadiness": {
            "hasPublishedReaderPage": has_published_reader_page,
            "canRemoveLegacyReaderFallback": not bucket_summary,
        },
    }


def backfill_series_page_headers(db, series_id: str, *, write: bool = False) -> dict[str, Any]:
    page_config_record = db.get(PageConfig, series_id)
    page_config = page_config_record.content if page_config_record else None
    pages = db.scalars(
        select(BuilderPage)
        .where(BuilderPage.series_id == series_id)
        .order_by(BuilderPage.sort_index.asc(), BuilderPage.created_at.asc())
        .options(selectinload(BuilderPage.sections).selectinload(BuilderSection.modules))
    ).all()
    changed_page_ids: list[str] = []
    updated_page_ids: list[str] = []
    page_reports: list[dict[str, Any]] = []
    projected_pages: list[dict[str, Any]] = []

    for page_record in pages:
        page = serialize_raw_page(page_record)
        next_meta = build_backfilled_page_meta(page, page_config)
        if next_meta is not None:
            changed_page_ids.append(page["id"])
            page_reports.append(summarize_page_report(page, next_meta))
        projected_page = _clone(page)
        if next_meta is not None:
            projected_page["meta"] = _clone(next_meta)
            if write:
                updated = update_page(db, page["id"], {"meta": next_meta})
                if updated:
                    projected_page = updated
                    updated_page_ids.append(page["id"])
        projected_pages.append(projected_page)

    readiness = summarize_runtime_readiness(projected_pages)
    return {
        "seriesId": series_id,
        "dryRun": not write,
        "scannedPages": len(pages),
        "pagesNeedingChanges": len(changed_page_ids),
        "updatedPages": len(updated_page_ids),
        "skippedPages": len(pages) - len(changed_page_ids),
        "changedPageIds": changed_page_ids,
        "updatedPageIds": updated_page_ids,
        "pageReports": page_reports,
        "blockingBucketSummary": readiness["bucketSummary"],
        "removalReadiness": readiness["removalReadiness"],
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backfill builder pages so effective legacy header state is stored in page.meta.header.version = 3."
    )
    parser.add_argument("--series", required=True, help="Series id to backfill.")
    parser.add_argument(
        "--write",
        action="store_true",
        help="Persist the backfill. Without this flag the command only reports the projected changes.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    db = SessionLocal()
    try:
        existing = db.scalar(select(BuilderPage.id).where(BuilderPage.series_id == args.series))
        if existing is None:
            print(
                json.dumps(
                    {
                        "seriesId": args.series,
                        "dryRun": not args.write,
                        "error": "No builder pages found for series.",
                    },
                    ensure_ascii=True,
                    indent=2,
                    sort_keys=True,
                )
            )
            return 1
        summary = backfill_series_page_headers(db, args.series, write=args.write)
        print(json.dumps(summary, ensure_ascii=True, indent=2, sort_keys=True))
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
