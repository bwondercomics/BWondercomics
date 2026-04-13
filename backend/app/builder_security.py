"""Validation and sanitization helpers for page-builder payloads."""

from __future__ import annotations

import copy
import html
import re
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urlparse, urlunparse

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
    "html",
}

ALLOWED_LAYOUTS = {"1", "1-1", "1-2", "2-1", "1-1-1", "1-3-1"}
LAYOUT_COLUMN_COUNTS = {layout: len(layout.split("-")) for layout in ALLOWED_LAYOUTS}
ALLOWED_SECTION_TYPES = {"row"}
HEADER_BLOCK_IDS = {"brand", "patron", "status", "entryControls", "nav"}
HEADER_REGIONS = ("left", "center", "right")

TEXT_HTML_TAGS = {
    "p",
    "br",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "s",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "pre",
    "a",
    "h2",
    "h3",
    "h4",
}

ADVANCED_HTML_TAGS = TEXT_HTML_TAGS | {
    "div",
    "span",
    "section",
    "article",
    "figure",
    "figcaption",
    "hr",
    "h1",
    "h5",
    "h6",
    "img",
}

SELF_CLOSING_TAGS = {"br", "hr", "img"}
DROP_CONTENT_TAGS = {
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "option",
    "link",
    "meta",
}

PAGE_SLUG_RE = re.compile(r"[^a-z0-9_-]+")
ANCHOR_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_:\-\.]*$")
CLASS_TOKEN_RE = re.compile(r"[^A-Za-z0-9_-]+")
ID_TOKEN_RE = re.compile(r"[^A-Za-z0-9_:\-\.]+")
FOCUS_RE = re.compile(
    r"^(center|top|bottom|left|right|top left|left top|top right|right top|"
    r"bottom left|left bottom|bottom right|right bottom|"
    r"(?:\d{1,3}%\s+\d{1,3}%))$",
    re.IGNORECASE,
)
HEX_COLOR_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
FUNCTION_COLOR_RE = re.compile(
    r"^(?:rgb|rgba|hsl|hsla)\(\s*[-\d.%\s,]+\s*\)$",
    re.IGNORECASE,
)
NAMED_COLOR_RE = re.compile(r"^[a-zA-Z]+$")
URL_UNSAFE_RE = re.compile(r"[\x00-\x1f\x7f\s\"'<>`\\]")
YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "www.youtu.be",
}
VIMEO_HOSTS = {"vimeo.com", "www.vimeo.com", "player.vimeo.com"}


def _deepcopy(value: Any) -> Any:
    return copy.deepcopy(value)


def _coerce_string(value: Any, fallback: str = "", max_length: int = 5000) -> str:
    text = str(value or "").strip()
    if not text:
        return fallback
    return text[:max_length]


def _coerce_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, str):
        raw = value.strip().lower()
        if raw in {"true", "1", "yes", "on"}:
            return True
        if raw in {"false", "0", "no", "off"}:
            return False
    return bool(value)


def _clamp_int(value: Any, default: int, minimum: int = 0, maximum: int = 10_000) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, number))


def _clamp_float(
    value: Any, default: float, minimum: float = 0.0, maximum: float = 1.0
) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, number))


def _sanitize_slug(value: Any) -> str:
    raw = str(value or "").strip().lower()
    cleaned = PAGE_SLUG_RE.sub("-", raw).strip("-")
    return cleaned[:100]


def sanitize_anchor(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    anchor = raw[1:] if raw.startswith("#") else raw
    anchor = anchor.strip()
    if not ANCHOR_RE.fullmatch(anchor):
        return ""
    return f"#{anchor}"


def _sanitize_class_value(value: Any) -> str:
    tokens = []
    for token in str(value or "").split():
        cleaned = CLASS_TOKEN_RE.sub("", token)
        if cleaned:
            tokens.append(cleaned)
    return " ".join(tokens[:12])


def _sanitize_id_like(value: Any) -> str:
    cleaned = ID_TOKEN_RE.sub("", str(value or "").strip())
    return cleaned[:120]


def sanitize_color(value: Any, fallback: str = "") -> str:
    raw = str(value or "").strip()
    if not raw:
        return fallback
    if raw.lower() == "transparent":
        return "transparent"
    if HEX_COLOR_RE.fullmatch(raw) or FUNCTION_COLOR_RE.fullmatch(raw) or NAMED_COLOR_RE.fullmatch(raw):
        return raw
    return fallback


def sanitize_focus(value: Any, fallback: str = "center") -> str:
    raw = str(value or "").strip()
    if not raw:
        return fallback
    if not FOCUS_RE.fullmatch(raw):
        return fallback
    return raw.lower() if "%" not in raw else raw


def sanitize_simple_url(
    value: Any,
    *,
    allowed_schemes: set[str],
    allow_root_relative: bool = True,
    allow_relative: bool = True,
    allow_anchor: bool = False,
) -> str:
    raw = str(value or "").strip()
    if not raw or URL_UNSAFE_RE.search(raw):
        return ""
    if raw.startswith("//"):
        return ""
    if allow_anchor and raw.startswith("#"):
        return sanitize_anchor(raw)
    if raw.startswith("/"):
        return raw if allow_root_relative else ""

    parsed = urlparse(raw)
    if parsed.scheme:
        scheme = parsed.scheme.lower()
        if scheme not in allowed_schemes:
            return ""
        if scheme in {"mailto", "tel"}:
            return raw
        if not parsed.netloc:
            return ""
        return urlunparse(
            (
                scheme,
                parsed.netloc,
                parsed.path or "",
                "",
                parsed.query or "",
                parsed.fragment or "",
            )
        )

    if parsed.netloc:
        return ""
    if not allow_relative:
        return ""
    return raw


def sanitize_hyperlink(value: Any) -> str:
    return sanitize_simple_url(
        value,
        allowed_schemes={"http", "https", "mailto", "tel"},
        allow_root_relative=True,
        allow_relative=True,
        allow_anchor=True,
    )


def sanitize_asset_url(value: Any) -> str:
    return sanitize_simple_url(
        value,
        allowed_schemes={"http", "https"},
        allow_root_relative=True,
        allow_relative=True,
        allow_anchor=False,
    )


def sanitize_video_url(value: Any) -> str:
    candidate = sanitize_simple_url(
        value,
        allowed_schemes={"https"},
        allow_root_relative=False,
        allow_relative=False,
        allow_anchor=False,
    )
    if not candidate:
        return ""
    parsed = urlparse(candidate)
    host = (parsed.netloc or "").lower()
    if host in YOUTUBE_HOSTS or host in VIMEO_HOSTS:
        return candidate
    return ""


def sanitize_icon_value(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if any(ch in raw for ch in ("/", ".")) or raw.startswith("http"):
        return sanitize_asset_url(raw)
    return raw[:120]


def sanitize_link_target(raw_target: Any, legacy_url: Any = "") -> dict[str, Any]:
    target = raw_target if isinstance(raw_target, dict) else {}
    fallback_url = str(legacy_url or target.get("url") or "").strip()
    raw_kind = target.get("kind") or ("anchor" if fallback_url.startswith("#") else "url")
    kind = raw_kind if raw_kind in {"builder-page", "url", "anchor"} else "url"

    page_slug = _sanitize_slug(target.get("pageSlug")) if kind == "builder-page" else ""
    url = sanitize_hyperlink(target.get("url") or fallback_url) if kind == "url" else ""
    anchor = sanitize_anchor(target.get("hash") or fallback_url) if kind == "anchor" else ""
    open_in_new_tab = bool(kind == "url" and target.get("openInNewTab") is True and url.startswith(("http://", "https://")))

    if kind == "builder-page" and not page_slug:
        kind = "url"

    if kind == "builder-page":
        return {
            "kind": "builder-page",
            "pageSlug": page_slug,
            "url": "",
            "hash": "",
            "openInNewTab": False,
        }
    if kind == "anchor":
        return {
            "kind": "anchor",
            "pageSlug": "",
            "url": "",
            "hash": anchor or "#",
            "openInNewTab": False,
        }
    return {
        "kind": "url",
        "pageSlug": "",
        "url": url or "#",
        "hash": "",
        "openInNewTab": open_in_new_tab,
    }


class _BuilderHtmlSanitizer(HTMLParser):
    def __init__(self, allowed_tags: set[str]):
        super().__init__(convert_charrefs=True)
        self.allowed_tags = allowed_tags
        self.output: list[str] = []
        self.stack: list[str] = []
        self.drop_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        normalized = tag.lower()
        if self.drop_depth:
            if normalized in DROP_CONTENT_TAGS:
                self.drop_depth += 1
            return
        if normalized in DROP_CONTENT_TAGS:
            self.drop_depth = 1
            return
        if normalized not in self.allowed_tags:
            return
        attr_html = self._serialize_attrs(normalized, attrs)
        if normalized in SELF_CLOSING_TAGS:
            self.output.append(f"<{normalized}{attr_html}>")
            return
        self.output.append(f"<{normalized}{attr_html}>")
        self.stack.append(normalized)

    def handle_endtag(self, tag: str) -> None:
        normalized = tag.lower()
        if self.drop_depth:
            if normalized in DROP_CONTENT_TAGS:
                self.drop_depth = max(0, self.drop_depth - 1)
            return
        if normalized in SELF_CLOSING_TAGS or normalized not in self.allowed_tags:
            return
        if normalized not in self.stack:
            return
        while self.stack:
            current = self.stack.pop()
            self.output.append(f"</{current}>")
            if current == normalized:
                break

    def handle_data(self, data: str) -> None:
        if self.drop_depth or not data:
            return
        self.output.append(html.escape(data, quote=False))

    def handle_comment(self, data: str) -> None:
        return

    def handle_decl(self, decl: str) -> None:
        return

    def unknown_decl(self, data: str) -> None:
        return

    def close(self) -> None:
        super().close()
        while self.stack:
            self.output.append(f"</{self.stack.pop()}>")

    def get_html(self) -> str:
        return "".join(self.output)

    def _serialize_attrs(self, tag: str, attrs: list[tuple[str, str | None]]) -> str:
        serialized: list[str] = []
        for name, value in attrs:
            normalized_name = (name or "").lower()
            if normalized_name.startswith("on") or normalized_name == "style":
                continue

            sanitized_value = ""
            if normalized_name == "href" and tag == "a":
                sanitized_value = sanitize_hyperlink(value)
            elif normalized_name == "src" and tag == "img":
                sanitized_value = sanitize_asset_url(value)
            elif normalized_name == "class":
                sanitized_value = _sanitize_class_value(value)
            elif normalized_name in {"id", "role"}:
                sanitized_value = _sanitize_id_like(value)
            elif normalized_name in {"title", "alt"}:
                sanitized_value = _coerce_string(value, max_length=300)
            elif normalized_name.startswith("data-") or normalized_name.startswith("aria-"):
                sanitized_value = _coerce_string(value, max_length=300)
            else:
                continue

            if not sanitized_value:
                continue
            serialized.append(f' {normalized_name}="{html.escape(sanitized_value, quote=True)}"')
        return "".join(serialized)


def sanitize_html_fragment(value: Any, mode: str = "text") -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    allowed_tags = TEXT_HTML_TAGS if mode == "text" else ADVANCED_HTML_TAGS
    parser = _BuilderHtmlSanitizer(allowed_tags)
    parser.feed(raw)
    parser.close()
    return parser.get_html()


def _sanitize_header_blocks(blocks: Any) -> dict[str, dict[str, bool]]:
    source = blocks if isinstance(blocks, dict) else {}
    return {
        block_id: {"enabled": _coerce_bool((source.get(block_id) or {}).get("enabled"), True)}
        for block_id in HEADER_BLOCK_IDS
    }


def _sanitize_header_regions(regions: Any) -> dict[str, list[str]]:
    source = regions if isinstance(regions, dict) else {}
    remaining = set(HEADER_BLOCK_IDS)
    normalized: dict[str, list[str]] = {region: [] for region in HEADER_REGIONS}

    for region in HEADER_REGIONS:
        items = source.get(region)
        if not isinstance(items, list):
            continue
        for item in items:
            block_id = str(item or "").strip()
            if block_id in remaining:
                normalized[region].append(block_id)
                remaining.remove(block_id)

    for block_id in ("brand", "patron", "status", "entryControls", "nav"):
        if block_id not in remaining:
            continue
        fallback = "left" if block_id == "brand" else "center" if block_id in {"patron", "status"} else "right"
        normalized[fallback].append(block_id)
        remaining.remove(block_id)

    return normalized


def sanitize_header_meta(raw_header: Any) -> dict[str, Any]:
    header = raw_header if isinstance(raw_header, dict) else {}
    copy_block = header.get("copy") if isinstance(header.get("copy"), dict) else {}
    subtitles = copy_block.get("subtitles")
    return {
        "version": 3,
        "copy": {
            "title": _coerce_string(copy_block.get("title"), "Page Title", 200),
            "subtitle": _coerce_string(copy_block.get("subtitle"), "", 300),
            "subtitles": [
                _coerce_string(item, max_length=200)
                for item in (subtitles if isinstance(subtitles, list) else [])
                if _coerce_string(item, max_length=200)
            ][:10],
        },
        "regions": _sanitize_header_regions(header.get("regions")),
        "blocks": _sanitize_header_blocks(header.get("blocks")),
        "nav": {
            "items": sanitize_header_nav_items((header.get("nav") or {}).get("items")),
        },
    }


def sanitize_header_nav_items(items: Any) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []
    normalized: list[dict[str, Any]] = []
    for item in items[:20]:
        entry = item if isinstance(item, dict) else {}
        normalized.append(
            {
                "id": _sanitize_id_like(entry.get("id")) or "nav",
                "label": _coerce_string(entry.get("label") or entry.get("text"), "Link", 120),
                "enabled": _coerce_bool(entry.get("enabled"), True),
                "link": sanitize_link_target(entry.get("link"), entry.get("url")),
            }
        )
    return normalized


def sanitize_header_overrides(raw_overrides: Any) -> dict[str, Any]:
    overrides = raw_overrides if isinstance(raw_overrides, dict) else {}
    hidden = overrides.get("hiddenBlockIds")
    hidden_block_ids = []
    if isinstance(hidden, list):
        for item in hidden:
            block_id = str(item or "").strip()
            if block_id in HEADER_BLOCK_IDS and block_id not in hidden_block_ids:
                hidden_block_ids.append(block_id)
    return {"hiddenBlockIds": hidden_block_ids}


def sanitize_theme_meta(raw_theme: Any) -> dict[str, str]:
    theme = raw_theme if isinstance(raw_theme, dict) else {}
    sanitized: dict[str, str] = {}
    for key, value in theme.items():
        clean = sanitize_color(value)
        if clean:
            sanitized[str(key)] = clean
    return sanitized


def sanitize_panel_backgrounds(raw_backgrounds: Any) -> dict[str, Any]:
    backgrounds = raw_backgrounds if isinstance(raw_backgrounds, dict) else {}
    sanitized: dict[str, Any] = {}
    for side in ("left", "right"):
        current = backgrounds.get(side)
        if not isinstance(current, dict):
            continue
        path = sanitize_asset_url(current.get("path"))
        panel = {
            "opacity": _clamp_float(current.get("opacity"), 0.18),
            "fit": "contain" if str(current.get("fit") or "").strip().lower() == "contain" else "cover",
            "focus": sanitize_focus(current.get("focus"), "center"),
            "hideEmptyText": _coerce_bool(current.get("hideEmptyText"), False),
        }
        if path:
            panel["path"] = path
        if path or panel["hideEmptyText"]:
            sanitized[side] = panel
    return sanitized


def sanitize_panel_spacing(raw_spacing: Any) -> dict[str, int]:
    spacing = raw_spacing if isinstance(raw_spacing, dict) else {}
    sanitized: dict[str, int] = {}
    for side in ("left", "right"):
        value = spacing.get(side)
        if value in (None, ""):
            continue
        sanitized[side] = _clamp_int(value, 0, 0, 240)
    return sanitized


def sanitize_page_meta(raw_meta: Any) -> dict[str, Any]:
    meta = raw_meta if isinstance(raw_meta, dict) else {}
    sanitized = {
        key: _deepcopy(value)
        for key, value in meta.items()
        if key not in {"header", "headerOverrides", "theme", "panelBackgrounds", "panelSpacing"}
    }
    if "header" in meta:
        sanitized["header"] = sanitize_header_meta(meta.get("header"))
    if "headerOverrides" in meta:
        sanitized["headerOverrides"] = sanitize_header_overrides(meta.get("headerOverrides"))
    if "theme" in meta:
        sanitized["theme"] = sanitize_theme_meta(meta.get("theme"))
    if "panelBackgrounds" in meta:
        sanitized["panelBackgrounds"] = sanitize_panel_backgrounds(meta.get("panelBackgrounds"))
    if "panelSpacing" in meta:
        sanitized["panelSpacing"] = sanitize_panel_spacing(meta.get("panelSpacing"))
    return sanitized


def sanitize_section_settings(raw_settings: Any) -> dict[str, Any]:
    settings = raw_settings if isinstance(raw_settings, dict) else {}
    sanitized: dict[str, Any] = {}

    background_color = sanitize_color(settings.get("backgroundColor"))
    if background_color:
        sanitized["backgroundColor"] = background_color

    for key in ("paddingTop", "paddingBottom", "moduleGap", "columnGap", "sectionGap"):
        if key in settings:
            sanitized[key] = _clamp_int(settings.get(key), 0, 0, 600)

    panel_enabled = settings.get("panelEnabled")
    if isinstance(panel_enabled, dict):
        sanitized["panelEnabled"] = {
            "left": _coerce_bool(panel_enabled.get("left"), True),
            "right": _coerce_bool(panel_enabled.get("right"), True),
        }

    return sanitized


def validate_section_type(section_type: Any) -> str:
    value = str(section_type or "row").strip()
    if value not in ALLOWED_SECTION_TYPES:
        raise ValueError(f"Unsupported section type '{value}'")
    return value


def validate_layout(layout: Any) -> str:
    value = str(layout or "1").strip()
    if value not in ALLOWED_LAYOUTS:
        raise ValueError(f"Unsupported section layout '{value}'")
    return value


def validate_sort_index(value: Any) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("sortIndex must be an integer") from exc
    if number < 0:
        raise ValueError("sortIndex must be non-negative")
    return number


def validate_column_index(column_index: Any, layout: str | None = None) -> int:
    try:
        number = int(column_index)
    except (TypeError, ValueError) as exc:
        raise ValueError("columnIndex must be an integer") from exc
    if number < 0:
        raise ValueError("columnIndex must be non-negative")
    if layout and number >= LAYOUT_COLUMN_COUNTS.get(layout, 1):
        raise ValueError(f"columnIndex {number} is out of range for layout '{layout}'")
    return number


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
    return {
        key: sanitize_color(style.get(key), default)
        for key, default in defaults.items()
    }


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


def sanitize_module_config(module_type: str, raw_config: Any) -> dict[str, Any]:
    config = raw_config if isinstance(raw_config, dict) else {}

    if module_type == "header":
        return {
            "title": _coerce_string(config.get("title"), "", 200),
            "subtitle": _coerce_string(config.get("subtitle"), "", 300),
        }

    if module_type == "text":
        alignment = str(config.get("alignment") or "left").strip().lower()
        return {
            "content": sanitize_html_fragment(config.get("content"), "text"),
            "alignment": alignment if alignment in {"left", "center", "right"} else "left",
        }

    if module_type == "image":
        return {
            "src": sanitize_asset_url(config.get("src")),
            "alt": _coerce_string(config.get("alt"), "", 300),
            "caption": _coerce_string(config.get("caption"), "", 300),
        }

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
        return {
            "images": normalized_images,
            "columns": _clamp_int(config.get("columns"), 3, 1, 6),
        }

    if module_type == "video":
        return {"url": sanitize_video_url(config.get("url"))}

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
        return {"buttons": buttons[:20]}

    if module_type == "email-signup":
        return {
            "heading": _coerce_string(config.get("heading"), "Join the List", 120),
            "subtext": _coerce_string(config.get("subtext"), "", 240),
            "placeholder": _coerce_string(config.get("placeholder"), "your@email.com", 120),
            "buttonText": _coerce_string(config.get("buttonText"), "Subscribe", 60),
            "style": sanitize_email_style(config.get("style")),
        }

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
                    if str(current.get("imageFit") or "cover").strip()
                    in {"cover", "contain"}
                    else "cover",
                    "style": sanitize_promo_item_style(current.get("style")),
                }
            )
        return {
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

    if module_type == "buttons":
        buttons = []
        raw_buttons = config.get("buttons") if isinstance(config.get("buttons"), list) else []
        for item in raw_buttons[:20]:
            current = item if isinstance(item, dict) else {}
            style = str(current.get("style") or "primary").strip()
            buttons.append(
                {
                    "id": _sanitize_id_like(current.get("id")) or "btn",
                    "text": _coerce_string(current.get("text"), "Button", 120),
                    "enabled": _coerce_bool(current.get("enabled"), True),
                    "style": style if style in {"primary", "secondary"} else "primary",
                    "link": sanitize_link_target(current.get("link"), current.get("url")),
                }
            )
        return {"buttons": buttons}

    if module_type == "spacer":
        return {"height": _clamp_int(config.get("height"), 40, 0, 600)}

    if module_type == "divider":
        style = str(config.get("style") or "solid").strip()
        return {
            "style": style if style in {"solid", "dashed", "dotted"} else "solid",
            "color": sanitize_color(config.get("color")),
        }

    if module_type == "reader":
        return {
            "showPanels": _coerce_bool(config.get("showPanels"), True),
            "showComments": _coerce_bool(config.get("showComments"), True),
        }

    if module_type == "entry-gallery":
        return {
            "columns": _clamp_int(config.get("columns"), 3, 1, 6),
            "showLabels": _coerce_bool(config.get("showLabels"), True),
        }

    if module_type == "feed":
        return {
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

    if module_type == "html":
        return {"code": sanitize_html_fragment(config.get("code"), "html")}

    return {}
