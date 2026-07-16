"""Page scope/binding primitives and the reader-binding invariants.

Extracted from page_store (Phase F of
docs/completed-builder-plans/BUILDER_REFACTOR_PLAN.md). Owns the page-scope and
binding-role vocabulary, the reader-binding warning codes, and the rules for when
a page may hold the series reader binding; page_store re-exports these names so
existing imports keep working.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .builder_security import (
    CMS_SOURCE_ACTIVE_PAGE_SERIES,
    CMS_SOURCE_SPECIFIC_SERIES,
    sanitize_module_config,
)
from .models import BuilderModule, BuilderPage, BuilderPageBinding

PAGE_SCOPE_SERIES = "series"
PAGE_SCOPE_GLOBAL = "global"
PAGE_SCOPES = {PAGE_SCOPE_SERIES, PAGE_SCOPE_GLOBAL}
BINDING_ROLE_READER = "reader"
BINDING_ROLES = {BINDING_ROLE_READER, "feed", "gallery"}
READER_BINDING_DEFAULT_DEVICE = "desktop"
READER_MODULE_MISSING = "reader_module_missing"
READER_MODULE_DUPLICATE = "reader_module_duplicate"
READER_MODULE_HIDDEN_DEFAULT_DEVICE = "reader_module_hidden_default_device"
READER_MODULE_WRONG_SOURCE = "reader_module_wrong_source"


class PageBuilderValidationError(ValueError):
    """Structured validation failure returned by page-builder admin routes."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "page_builder_validation_failed",
        warnings: list[dict[str, str]] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.warnings = warnings or []


def _now() -> datetime:
    return datetime.now(timezone.utc)


def sanitize_page_scope(raw: str | None) -> str:
    scope = str(raw or PAGE_SCOPE_SERIES).strip().lower()
    if scope not in PAGE_SCOPES:
        raise ValueError("Page scope must be 'series' or 'global'")
    return scope


def sanitize_binding_role(raw: str | None) -> str:
    role = str(raw or "").strip().lower()
    if role not in BINDING_ROLES:
        raise ValueError("Binding role must be reader, feed, or gallery")
    return role


def _sanitize_module_config_for_page(
    page: BuilderPage | None, module_type: str, raw_config: Any
) -> dict[str, Any]:
    config = sanitize_module_config(module_type, raw_config)
    if module_type != "reader" or not isinstance(config, dict):
        return config

    scope = (
        sanitize_page_scope(getattr(page, "scope", PAGE_SCOPE_SERIES))
        if page
        else PAGE_SCOPE_SERIES
    )
    next_config = dict(config)
    if scope == PAGE_SCOPE_GLOBAL:
        source = next_config.get("source") if isinstance(next_config.get("source"), dict) else {}
        next_source = {"mode": CMS_SOURCE_SPECIFIC_SERIES}
        series_id = str(source.get("seriesId") or "").strip()
        if series_id:
            next_source["seriesId"] = series_id
        next_config["source"] = next_source
    else:
        next_config["source"] = {"mode": CMS_SOURCE_ACTIVE_PAGE_SERIES}
    return next_config


def _page_can_bind_to_series(page: BuilderPage, series_id: str, role: str | None = None) -> bool:
    scope = sanitize_page_scope(page.scope)
    if role == BINDING_ROLE_READER:
        return scope == PAGE_SCOPE_SERIES and page.series_id == series_id
    return scope == PAGE_SCOPE_GLOBAL or (
        scope == PAGE_SCOPE_SERIES and page.series_id == series_id
    )


def _reader_warning(code: str, message: str) -> dict[str, str]:
    return {
        "role": BINDING_ROLE_READER,
        "code": code,
        "message": message,
    }


def _reader_modules_for_page(page: BuilderPage) -> list[BuilderModule]:
    modules: list[BuilderModule] = []
    for section in sorted(page.sections, key=lambda item: item.sort_index):
        for module in sorted(
            section.modules, key=lambda item: (item.column_index, item.sort_index)
        ):
            if str(module.module_type or "").strip() == "reader":
                modules.append(module)
    return modules


def _reader_module_hidden_for_default_device(page: BuilderPage, module: BuilderModule) -> bool:
    config = _sanitize_module_config_for_page(page, "reader", module.config)
    responsive = config.get("responsive") if isinstance(config.get("responsive"), dict) else {}
    branch = responsive.get(READER_BINDING_DEFAULT_DEVICE)
    return isinstance(branch, dict) and branch.get("hidden") is True


def _reader_module_has_wrong_source(module: BuilderModule) -> bool:
    config = module.config if isinstance(module.config, dict) else {}
    source = config.get("source") if isinstance(config.get("source"), dict) else {}
    raw_mode = str(source.get("mode") or "").strip()
    if not raw_mode:
        return False
    return raw_mode != CMS_SOURCE_ACTIVE_PAGE_SERIES


def _reader_binding_module_warnings(
    page: BuilderPage, series_id: str | None
) -> list[dict[str, str]]:
    if sanitize_page_scope(page.scope) != PAGE_SCOPE_SERIES or page.series_id != series_id:
        return [
            _reader_warning(
                "reader_binding_invalid",
                "The reader page binding must point to a same-series page.",
            )
        ]

    reader_modules = _reader_modules_for_page(page)
    if not reader_modules:
        return [
            _reader_warning(
                READER_MODULE_MISSING,
                "The bound reader page must contain one Comic Reader module.",
            )
        ]
    if len(reader_modules) > 1:
        return [
            _reader_warning(
                READER_MODULE_DUPLICATE,
                "The bound reader page must contain exactly one Comic Reader module.",
            )
        ]

    [reader_module] = reader_modules
    warnings: list[dict[str, str]] = []
    if _reader_module_hidden_for_default_device(page, reader_module):
        warnings.append(
            _reader_warning(
                READER_MODULE_HIDDEN_DEFAULT_DEVICE,
                "The bound reader page's Comic Reader module cannot be hidden on Desktop.",
            )
        )
    if _reader_module_has_wrong_source(reader_module):
        warnings.append(
            _reader_warning(
                READER_MODULE_WRONG_SOURCE,
                "The bound reader page's Comic Reader module must use the active page series.",
            )
        )
    return warnings


def _raise_for_invalid_reader_binding(page: BuilderPage, series_id: str) -> None:
    warnings = _reader_binding_module_warnings(page, series_id)
    if not warnings:
        return
    first = warnings[0]
    raise PageBuilderValidationError(first["message"], code=first["code"], warnings=warnings)


def _page_has_reader_binding(db: Session, page: BuilderPage) -> bool:
    if sanitize_page_scope(page.scope) != PAGE_SCOPE_SERIES or not page.series_id:
        return False
    existing = db.scalar(
        select(BuilderPageBinding).where(
            BuilderPageBinding.series_id == page.series_id,
            BuilderPageBinding.role == BINDING_ROLE_READER,
            BuilderPageBinding.page_id == page.id,
        )
    )
    return existing is not None


def _ensure_reader_binding_for_page(db: Session, page: BuilderPage) -> None:
    if sanitize_page_scope(page.scope) != PAGE_SCOPE_SERIES or not page.series_id:
        return
    if page.slug != "reader" and page.page_type != "reader":
        return
    if _reader_binding_module_warnings(page, page.series_id):
        return
    existing = db.scalar(
        select(BuilderPageBinding).where(
            BuilderPageBinding.series_id == page.series_id,
            BuilderPageBinding.role == BINDING_ROLE_READER,
        )
    )
    if existing:
        return
    now = _now()
    db.add(
        BuilderPageBinding(
            series_id=page.series_id,
            role=BINDING_ROLE_READER,
            page_id=page.id,
            created_at=now,
            updated_at=now,
        )
    )
