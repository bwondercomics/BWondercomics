"""Allowlist-based HTML fragment sanitizer for builder text/html content."""

from __future__ import annotations

import html
from html.parser import HTMLParser
from typing import Any

from .links import sanitize_asset_url, sanitize_hyperlink
from .primitives import _coerce_string, _sanitize_class_value, _sanitize_id_like

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
