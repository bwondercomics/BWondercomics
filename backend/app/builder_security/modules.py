"""Module type validation, per-type style/source sanitizers, and module config."""

from __future__ import annotations

from typing import Any

from .appearance import sanitize_appearance
from .html import sanitize_html_fragment
from .links import (
    sanitize_asset_url,
    sanitize_hyperlink,
    sanitize_icon_value,
    sanitize_link_target,
    sanitize_video_url,
)
from .primitives import (
    _clamp_float,
    _clamp_int,
    _coerce_bool,
    _coerce_string,
    _prune_empty_dicts,
    _sanitize_id_like,
    _sanitize_optional_clamped_int,
    sanitize_color,
)
from .reader import (
    READER_DISPLAY_MODES,
    _sanitize_reader_end_of_entry,
    _sanitize_reader_keyword,
    sanitize_reader_controls,
    sanitize_reader_panels,
    sanitize_reader_responsive_branch,
    sanitize_reader_stage,
)
from .responsive import BUILDER_DEVICE_IDS, sanitize_buttons_responsive_branch

ALLOWED_MODULE_TYPES = {
    "header",
    "text",
    "image",
    "gallery",
    "video",
    "social",
    "email-signup",
    "promo",
    "buttons",
    "spacer",
    "divider",
    "reader",
    "entry-gallery",
    "feed",
    "media-gallery",
    "html",
    "account",
    "links-grid",
}


CMS_SOURCE_ACTIVE_PAGE_SERIES = "active-page-series"


CMS_SOURCE_SPECIFIC_SERIES = "specific-series"


CMS_SOURCE_ALL_SERIES = "all-series"


CMS_SOURCE_SITE = "site"


def sanitize_module_responsive(module_type: str, raw: Any) -> dict[str, Any]:
    responsive = raw if isinstance(raw, dict) else {}
    sanitized: dict[str, Any] = {}
    for device_id in BUILDER_DEVICE_IDS:
        branch = responsive.get(device_id)
        if not isinstance(branch, dict):
            continue
        branch_payload: dict[str, Any] = {}
        if "hidden" in branch:
            branch_payload["hidden"] = _coerce_bool(branch.get("hidden"), False)
        if module_type == "text":
            alignment = str(branch.get("alignment") or "").strip().lower()
            if alignment in {"left", "center", "right"}:
                branch_payload["alignment"] = alignment
        elif module_type in {"gallery", "entry-gallery", "media-gallery"}:
            if "columns" in branch:
                branch_payload["columns"] = _clamp_int(branch.get("columns"), 3, 1, 6)
        elif module_type == "spacer":
            if "height" in branch:
                branch_payload["height"] = _clamp_int(branch.get("height"), 40, 0, 600)
        elif module_type == "buttons":
            branch_payload.update(sanitize_buttons_responsive_branch(branch))
        elif module_type == "reader":
            branch_payload.update(sanitize_reader_responsive_branch(branch))
        elif module_type == "feed":
            layout = sanitize_module_layout(branch.get("layout"))
            if layout:
                branch_payload["layout"] = layout
        branch_payload = _prune_empty_dicts(branch_payload)
        if branch_payload:
            sanitized[device_id] = branch_payload
    return sanitized


def validate_module_type(module_type: Any) -> str:
    value = str(module_type or "text").strip()
    if value not in ALLOWED_MODULE_TYPES:
        raise ValueError(f"Unsupported module type '{value}'")
    return value


def sanitize_social_style(raw_style: Any) -> dict[str, Any]:
    style = raw_style if isinstance(raw_style, dict) else {}
    return {
        "bgColor": sanitize_color(style.get("bgColor"), "#00d9ff"),
        "bgOpacity": _clamp_float(style.get("bgOpacity"), 1.0),
        "textColor": sanitize_color(style.get("textColor"), "#ffffff"),
        "borderWidth": _clamp_int(style.get("borderWidth"), 2, 0, 10),
        "borderColor": sanitize_color(style.get("borderColor"), "#00d9ff"),
        "borderOpacity": _clamp_float(style.get("borderOpacity"), 1.0),
        "borderRadius": _clamp_int(style.get("borderRadius"), 8, 0, 80),
    }


def sanitize_email_style(raw_style: Any) -> dict[str, Any]:
    style = raw_style if isinstance(raw_style, dict) else {}
    return {
        "headingColor": sanitize_color(style.get("headingColor"), "#ffffff"),
        "headingFont": str(style.get("headingFont") or "default").strip()
        if str(style.get("headingFont") or "default").strip() in {"default", "display", "mono"}
        else "default",
        "headingGlow": _coerce_bool(style.get("headingGlow"), False),
        "inputStyle": str(style.get("inputStyle") or "bubble").strip()
        if str(style.get("inputStyle") or "bubble").strip() in {"bubble", "flat"}
        else "bubble",
        "buttonColor": sanitize_color(style.get("buttonColor"), "#00d9ff"),
        "buttonGlow": _coerce_bool(style.get("buttonGlow"), False),
    }


def sanitize_feed_style(raw_style: Any) -> dict[str, Any]:
    style = raw_style if isinstance(raw_style, dict) else {}
    defaults = {
        "headingBgColor": "#ffed00",
        "headingTextColor": "#0a0a12",
        "authorColor": "#7ef5e3",
        "buttonBgColor": "#00d9ff",
        "buttonTextColor": "#0a0a12",
        "itemTitleColor": "#ffed00",
        "itemDateColor": "#00d9ff",
        "itemBorderColor": "#00d9ff",
        "borderColor": "#ffed00",
    }
    return {key: sanitize_color(style.get(key), default) for key, default in defaults.items()}


def sanitize_cms_source(module_type: str, raw_source: Any) -> dict[str, Any]:
    source = raw_source if isinstance(raw_source, dict) else {}
    raw_mode = str(source.get("mode") or "").strip()
    allowed_modes: set[str]
    default_mode: str
    if module_type == "reader":
        allowed_modes = {CMS_SOURCE_ACTIVE_PAGE_SERIES, CMS_SOURCE_SPECIFIC_SERIES}
        default_mode = CMS_SOURCE_ACTIVE_PAGE_SERIES
    elif module_type == "entry-gallery":
        allowed_modes = {
            CMS_SOURCE_ACTIVE_PAGE_SERIES,
            CMS_SOURCE_SPECIFIC_SERIES,
            CMS_SOURCE_ALL_SERIES,
        }
        default_mode = CMS_SOURCE_ACTIVE_PAGE_SERIES
    elif module_type in {"feed", "media-gallery"}:
        allowed_modes = {CMS_SOURCE_SITE, CMS_SOURCE_ALL_SERIES}
        default_mode = CMS_SOURCE_SITE
    else:
        allowed_modes = set()
        default_mode = ""

    mode = raw_mode if raw_mode in allowed_modes else default_mode
    sanitized: dict[str, Any] = {"mode": mode}
    if mode == CMS_SOURCE_SPECIFIC_SERIES:
        series_id = _sanitize_id_like(source.get("seriesId"))
        if series_id:
            sanitized["seriesId"] = series_id

    raw_filters = source.get("filters") if isinstance(source.get("filters"), dict) else {}
    filters: dict[str, Any] = {}
    if module_type == "entry-gallery":
        label = _sanitize_id_like(raw_filters.get("labelId") or raw_filters.get("entryLabelId"))
        if label:
            filters["labelId"] = label
        status = str(raw_filters.get("status") or "").strip().lower()
        if status in {"published", "draft", "scheduled"}:
            filters["status"] = status
        access = str(raw_filters.get("access") or "").strip().lower()
        if access in {"all", "public", "premium"}:
            filters["access"] = access
        if "showInGallery" in raw_filters:
            filters["showInGallery"] = _coerce_bool(raw_filters.get("showInGallery"), True)
    elif module_type == "media-gallery":
        access = str(raw_filters.get("access") or "").strip().lower()
        if access in {"public", "premium", "all"}:
            filters["access"] = access
        raw_tags = raw_filters.get("tags")
        if isinstance(raw_tags, list):
            tags = [_coerce_string(tag, "", 80) for tag in raw_tags[:12]]
            tags = [tag for tag in tags if tag]
            if tags:
                filters["tags"] = tags
        elif isinstance(raw_tags, str):
            tags = [_coerce_string(tag, "", 80) for tag in raw_tags.split(",")[:12]]
            tags = [tag for tag in tags if tag]
            if tags:
                filters["tags"] = tags

    if filters:
        sanitized["filters"] = filters

    if module_type in {"entry-gallery", "media-gallery"}:
        sort = str(source.get("sort") or "").strip().lower()
        allowed_sorts = (
            {"sort-index", "title", "newest"}
            if module_type == "entry-gallery"
            else {"path", "newest"}
        )
        if sort in allowed_sorts:
            sanitized["sort"] = sort
    if "limit" in source and module_type in {"entry-gallery", "feed", "media-gallery"}:
        sanitized["limit"] = _clamp_int(source.get("limit"), 24, 1, 200)

    return sanitized


def sanitize_promo_item_style(raw_style: Any) -> dict[str, Any]:
    style = raw_style if isinstance(raw_style, dict) else {}
    return {
        "topTextColor": sanitize_color(style.get("topTextColor"), "#ffed00"),
        "topTextFont": str(style.get("topTextFont") or "default").strip()
        if str(style.get("topTextFont") or "default").strip() in {"default", "display", "mono"}
        else "default",
        "topTextGlow": _coerce_bool(style.get("topTextGlow"), False),
        "topTextGlowColor": sanitize_color(style.get("topTextGlowColor"), "#ffed00"),
        "bottomTextColor": sanitize_color(style.get("bottomTextColor"), "#ffffff"),
        "bottomTextFont": str(style.get("bottomTextFont") or "default").strip()
        if str(style.get("bottomTextFont") or "default").strip() in {"default", "display", "mono"}
        else "default",
        "bottomTextGlow": _coerce_bool(style.get("bottomTextGlow"), False),
        "bottomTextGlowColor": sanitize_color(style.get("bottomTextGlowColor"), "#00d9ff"),
        "backgroundColor": sanitize_color(style.get("backgroundColor"), "transparent"),
        "backgroundOpacity": _clamp_float(style.get("backgroundOpacity"), 0.6),
        "backgroundBlur": _coerce_bool(style.get("backgroundBlur"), False),
        "backgroundGlow": _coerce_bool(style.get("backgroundGlow"), False),
        "imageBorder": _coerce_bool(style.get("imageBorder"), False),
        "imageBorderColor": sanitize_color(style.get("imageBorderColor"), "#00d9ff"),
        "imageGlow": _coerce_bool(style.get("imageGlow"), False),
        "imageGlowColor": sanitize_color(style.get("imageGlowColor"), "#00d9ff"),
        "imageGlowIntensity": _clamp_float(style.get("imageGlowIntensity"), 0.5, 0.0, 2.0),
    }


def sanitize_module_layout(raw: Any) -> dict[str, Any] | None:
    """Shared per-module layout (width/height/alignment) applied to the .pb-module wrapper.

    Sparse: returns None when nothing is authored; the defaults (full width, auto height,
    stretch alignment) are implicit so existing modules round-trip unchanged.
    """
    if not isinstance(raw, dict):
        return None
    result: dict[str, Any] = {}
    mode = str(raw.get("widthMode") or "").strip().lower()
    if mode == "percent":
        width = _sanitize_optional_clamped_int(raw, "width", 5, 100)
        if width is not None:
            result["widthMode"] = mode
            result["width"] = width
    elif mode == "px":
        width = _sanitize_optional_clamped_int(raw, "width", 40, 2000)
        if width is not None:
            result["widthMode"] = mode
            result["width"] = width
    max_width = _sanitize_optional_clamped_int(raw, "maxWidth", 40, 2400)
    if max_width is not None:
        result["maxWidth"] = max_width
    height = _sanitize_optional_clamped_int(raw, "height", 40, 4000)
    if height is not None:
        result["height"] = height
    align = str(raw.get("align") or "").strip().lower()
    if align in {"start", "center", "end"}:
        result["align"] = align
    return result or None


def sanitize_module_config(module_type: str, raw_config: Any) -> dict[str, Any]:
    config = raw_config if isinstance(raw_config, dict) else {}

    def with_responsive(sanitized: dict[str, Any]) -> dict[str, Any]:
        # Shared wrapper layout rides every module type's config.
        layout = sanitize_module_layout(config.get("layout"))
        if layout:
            sanitized["layout"] = layout
        responsive = sanitize_module_responsive(module_type, config.get("responsive"))
        if responsive:
            sanitized["responsive"] = responsive
        return sanitized

    if module_type == "header":
        return with_responsive(
            {
                "title": _coerce_string(config.get("title"), "", 200),
                "subtitle": _coerce_string(config.get("subtitle"), "", 300),
            }
        )

    if module_type == "text":
        alignment = str(config.get("alignment") or "left").strip().lower()
        return with_responsive(
            {
                "content": sanitize_html_fragment(config.get("content"), "text"),
                "alignment": alignment if alignment in {"left", "center", "right"} else "left",
            }
        )

    if module_type == "image":
        return with_responsive(
            {
                "src": sanitize_asset_url(config.get("src")),
                "alt": _coerce_string(config.get("alt"), "", 300),
                "caption": _coerce_string(config.get("caption"), "", 300),
            }
        )

    if module_type == "gallery":
        images = config.get("images")
        normalized_images = []
        if isinstance(images, list):
            for image in images[:24]:
                if isinstance(image, dict):
                    src = sanitize_asset_url(image.get("src"))
                    alt = _coerce_string(image.get("alt"), "", 300)
                else:
                    src = sanitize_asset_url(image)
                    alt = ""
                if src:
                    normalized_images.append({"src": src, "alt": alt})
        return with_responsive(
            {
                "images": normalized_images,
                "columns": _clamp_int(config.get("columns"), 3, 1, 6),
            }
        )

    if module_type == "video":
        return with_responsive({"url": sanitize_video_url(config.get("url"))})

    if module_type == "social":
        buttons = []
        for item in config.get("buttons") if isinstance(config.get("buttons"), list) else []:
            current = item if isinstance(item, dict) else {}
            buttons.append(
                {
                    "id": _sanitize_id_like(current.get("id")) or "social",
                    "icon": sanitize_icon_value(current.get("icon")),
                    "text": _coerce_string(current.get("text"), "", 120),
                    "url": sanitize_hyperlink(current.get("url")) or "#",
                    "style": sanitize_social_style(current.get("style")),
                }
            )
        return with_responsive({"buttons": buttons[:20]})

    if module_type == "email-signup":
        return with_responsive(
            {
                "heading": _coerce_string(config.get("heading"), "Join the List", 120),
                "subtext": _coerce_string(config.get("subtext"), "", 240),
                "placeholder": _coerce_string(config.get("placeholder"), "your@email.com", 120),
                "buttonText": _coerce_string(config.get("buttonText"), "Subscribe", 60),
                "style": sanitize_email_style(config.get("style")),
            }
        )

    if module_type == "promo":
        items = []
        raw_items = config.get("items") if isinstance(config.get("items"), list) else []
        for item in raw_items[:12]:
            current = item if isinstance(item, dict) else {}
            items.append(
                {
                    "image": sanitize_asset_url(current.get("image")),
                    "topText": _coerce_string(current.get("topText"), "", 200),
                    "bottomText": sanitize_html_fragment(current.get("bottomText"), "text"),
                    "linkUrl": sanitize_hyperlink(current.get("linkUrl")),
                    "textPosition": str(current.get("textPosition") or "overlay").strip()
                    if str(current.get("textPosition") or "overlay").strip()
                    in {"overlay", "outside"}
                    else "overlay",
                    "imageFit": str(current.get("imageFit") or "cover").strip()
                    if str(current.get("imageFit") or "cover").strip() in {"cover", "contain"}
                    else "cover",
                    "style": sanitize_promo_item_style(current.get("style")),
                }
            )
        return with_responsive(
            {
                "items": items,
                "height": _clamp_int(config.get("height"), 400, 160, 1200),
                "showNavigation": _coerce_bool(config.get("showNavigation"), True),
                "showIndicators": _coerce_bool(config.get("showIndicators"), True),
                "autoRotate": _coerce_bool(config.get("autoRotate"), True),
                "interval": _clamp_int(config.get("interval"), 5000, 1000, 60_000),
                "transition": str(config.get("transition") or "fade").strip()
                if str(config.get("transition") or "fade").strip() in {"fade", "slide"}
                else "fade",
            }
        )

    if module_type == "buttons":
        buttons = []
        raw_buttons = config.get("buttons") if isinstance(config.get("buttons"), list) else []
        for item in raw_buttons[:20]:
            current = item if isinstance(item, dict) else {}
            style = str(current.get("style") or "primary").strip()
            appearance = sanitize_appearance(current.get("appearance"))
            item_payload = {
                "id": _sanitize_id_like(current.get("id")) or "btn",
                "text": _coerce_string(current.get("text"), "Button", 120),
                "enabled": _coerce_bool(current.get("enabled"), True),
                "style": style if style in {"primary", "secondary"} else "primary",
                "link": sanitize_link_target(current.get("link"), current.get("url")),
            }
            if appearance is not None:
                item_payload["appearance"] = appearance
            buttons.append(item_payload)
        sanitized = {"buttons": buttons}
        defaults_source = config.get("defaults") if isinstance(config.get("defaults"), dict) else {}
        defaults_appearance = sanitize_appearance(defaults_source.get("appearance"))
        if defaults_appearance is not None:
            sanitized["defaults"] = {"appearance": defaults_appearance}
        return with_responsive(sanitized)

    if module_type == "spacer":
        return with_responsive({"height": _clamp_int(config.get("height"), 40, 0, 600)})

    if module_type == "divider":
        style = str(config.get("style") or "solid").strip()
        return with_responsive(
            {
                "style": style if style in {"solid", "dashed", "dotted"} else "solid",
                "color": sanitize_color(config.get("color")),
            }
        )

    if module_type == "reader":
        show_panels = _coerce_bool(config.get("showPanels"), True)
        sanitized = {
            "source": sanitize_cms_source(module_type, config.get("source")),
            "displayMode": _sanitize_reader_keyword(
                config.get("displayMode"), READER_DISPLAY_MODES, "paged"
            ),
            "showPanels": show_panels,
            "showComments": _coerce_bool(config.get("showComments"), True),
            "controls": sanitize_reader_controls(config.get("controls")),
            "stage": sanitize_reader_stage(config.get("stage")),
            "endOfEntry": _sanitize_reader_end_of_entry(config.get("endOfEntry")),
        }
        if isinstance(config.get("panels"), dict):
            sanitized["panels"] = sanitize_reader_panels(
                config.get("panels"), show_panels=show_panels
            )
        return with_responsive(sanitized)

    if module_type == "entry-gallery":
        return with_responsive(
            {
                "source": sanitize_cms_source(module_type, config.get("source")),
                "columns": _clamp_int(config.get("columns"), 3, 1, 6),
                "showLabels": _coerce_bool(config.get("showLabels"), True),
            }
        )

    if module_type == "feed":
        return with_responsive(
            {
                "source": sanitize_cms_source(module_type, config.get("source")),
                "limit": _clamp_int(config.get("limit"), 5, 1, 25),
                "heading": _coerce_string(config.get("heading"), "BWC FEED", 120),
                "author": _coerce_string(config.get("author"), "", 120),
                "showAuthor": _coerce_bool(config.get("showAuthor"), True),
                "showDropdown": _coerce_bool(config.get("showDropdown"), True),
                "feedLabel": _coerce_string(config.get("feedLabel"), "Open feed", 120),
                "feedHref": sanitize_hyperlink(config.get("feedHref")) or "feed.html",
                "showMediaButton": _coerce_bool(config.get("showMediaButton"), True),
                "mediaLabel": _coerce_string(config.get("mediaLabel"), "Media", 120),
                "mediaHref": sanitize_hyperlink(config.get("mediaHref")) or "media.html",
                "style": sanitize_feed_style(config.get("style")),
            }
        )

    if module_type == "media-gallery":
        return with_responsive(
            {
                "source": sanitize_cms_source(module_type, config.get("source")),
                "columns": _clamp_int(config.get("columns"), 3, 1, 6),
                "limit": _clamp_int(config.get("limit"), 24, 1, 100),
                "showCaptions": _coerce_bool(config.get("showCaptions"), True),
                "includePremium": _coerce_bool(config.get("includePremium"), True),
            }
        )

    if module_type == "html":
        return with_responsive({"code": sanitize_html_fragment(config.get("code"), "html")})

    if module_type in {"account", "links-grid"}:
        # Shell chrome as blocks (Phase 6): the gear / 9-dot buttons.
        sanitized = {"iconColor": sanitize_color(config.get("iconColor"))}
        appearance = sanitize_appearance(config.get("appearance"))
        if appearance is not None:
            sanitized["appearance"] = appearance
        return with_responsive(sanitized)

    return with_responsive({})
