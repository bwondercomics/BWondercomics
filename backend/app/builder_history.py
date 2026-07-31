"""Transaction-owned persistence helpers for builder page recovery history."""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from types import MappingProxyType
from typing import Any, Mapping

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .builder_locking import lock_builder_page_scope
from .builder_security import (
    sanitize_page_meta,
    sanitize_section_settings,
    validate_column_index,
    validate_layout,
    validate_module_type,
    validate_section_type,
    validate_sort_index,
)
from .models import (
    BuilderModule,
    BuilderPage,
    BuilderPageSnapshot,
    BuilderSection,
    Series,
    User,
)
from .reader_bindings import (
    PAGE_SCOPE_GLOBAL,
    PAGE_SCOPE_SERIES,
    PageBuilderValidationError,
    _page_has_reader_binding,
    _raise_for_invalid_reader_binding,
    _sanitize_module_config_for_page,
    sanitize_binding_role,
    sanitize_page_scope,
)
from .series_store import sanitize_series_id

SNAPSHOT_PAYLOAD_VERSION = 1
SNAPSHOT_RETENTION = 30

PAGE_CREATED = "page_created"
PAGE_UPDATED = "page_updated"
PAGE_DELETED = "page_deleted"
PAGE_REORDERED = "page_reordered"
BINDINGS_UPDATED = "bindings_updated"
SECTION_ADDED = "section_added"
SECTION_UPDATED = "section_updated"
SECTION_DELETED = "section_deleted"
SECTIONS_REORDERED = "sections_reordered"
MODULE_ADDED = "module_added"
MODULE_UPDATED = "module_updated"
MODULE_DELETED = "module_deleted"
MODULE_MOVED = "module_moved"
MODULES_REORDERED = "modules_reordered"
MODULE_PLACEMENTS_SAVED = "module_placements_saved"
PRE_RESTORE = "pre_restore"

SNAPSHOT_ACTIONS = frozenset(
    {
        PAGE_CREATED,
        PAGE_UPDATED,
        PAGE_DELETED,
        PAGE_REORDERED,
        BINDINGS_UPDATED,
        SECTION_ADDED,
        SECTION_UPDATED,
        SECTION_DELETED,
        SECTIONS_REORDERED,
        MODULE_ADDED,
        MODULE_UPDATED,
        MODULE_DELETED,
        MODULE_MOVED,
        MODULES_REORDERED,
        MODULE_PLACEMENTS_SAVED,
        PRE_RESTORE,
    }
)


class BuilderSnapshotError(ValueError):
    """Structured history/restore error for the admin API boundary."""

    def __init__(
        self,
        message: str,
        *,
        code: str,
        status_code: int,
        path: str | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.path = path


class RecoverySerializationError(ValueError):
    """Internal path-aware failure while serializing a live builder graph."""

    def __init__(self, message: str, *, path: str) -> None:
        super().__init__(message)
        self.path = path


FrozenJson = Mapping[str, Any] | tuple[Any, ...] | str | int | float | bool | None


def _freeze_json(value: Any) -> FrozenJson:
    if isinstance(value, dict):
        return MappingProxyType({key: _freeze_json(item) for key, item in value.items()})
    if isinstance(value, list):
        return tuple(_freeze_json(item) for item in value)
    return value


def _thaw_json(value: FrozenJson) -> Any:
    if isinstance(value, Mapping):
        return {key: _thaw_json(item) for key, item in value.items()}
    if isinstance(value, tuple):
        return [_thaw_json(item) for item in value]
    return value


@dataclass(frozen=True, slots=True)
class RecoveryBinding:
    series_id: str
    role: str

    def to_document(self) -> dict[str, Any]:
        return {"seriesId": self.series_id, "role": self.role}


@dataclass(frozen=True, slots=True)
class RecoveryModule:
    id: uuid.UUID
    module_type: str
    column_index: int
    sort_index: int
    config: FrozenJson

    def to_document(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "moduleType": self.module_type,
            "columnIndex": self.column_index,
            "sortIndex": self.sort_index,
            "config": _thaw_json(self.config),
        }


@dataclass(frozen=True, slots=True)
class RecoverySection:
    id: uuid.UUID
    section_type: str
    layout: str
    sort_index: int
    settings: FrozenJson
    modules: tuple[RecoveryModule, ...]

    def to_document(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "sectionType": self.section_type,
            "layout": self.layout,
            "sortIndex": self.sort_index,
            "settings": _thaw_json(self.settings),
            "modules": [module.to_document() for module in self.modules],
        }


@dataclass(frozen=True, slots=True)
class RecoveryPage:
    id: uuid.UUID
    scope: str
    series_id: str | None
    slug: str
    title: str
    page_type: str
    is_published: bool
    is_homepage: bool
    sort_index: int
    meta: FrozenJson
    sections: tuple[RecoverySection, ...]

    def to_document(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "scope": self.scope,
            "seriesId": self.series_id,
            "slug": self.slug,
            "title": self.title,
            "pageType": self.page_type,
            "isPublished": self.is_published,
            "isHomepage": self.is_homepage,
            "sortIndex": self.sort_index,
            "meta": _thaw_json(self.meta),
            "sections": [section.to_document() for section in self.sections],
        }


@dataclass(frozen=True, slots=True)
class RecoveryDocument:
    snapshot_version: int
    page: RecoveryPage
    bindings: tuple[RecoveryBinding, ...]

    def to_document(self) -> dict[str, Any]:
        return {
            "snapshotVersion": self.snapshot_version,
            "page": self.page.to_document(),
            "bindings": [binding.to_document() for binding in self.bindings],
        }


def _ordered(items: list[Any], *attributes: str) -> list[Any]:
    return sorted(
        items,
        key=lambda item: tuple(getattr(item, attribute) for attribute in attributes)
        + (str(item.id),),
    )


def _serialization_failure(path: str, exc: Exception) -> RecoverySerializationError:
    return RecoverySerializationError(f"Live builder graph is invalid: {exc}", path=path)


def _serialize_builder_page_recovery(db: Session, page: BuilderPage) -> dict[str, Any]:
    del db  # Kept in the API for future payload adapters that need database context.
    try:
        scope = sanitize_page_scope(page.scope)
    except (ValueError, TypeError, AttributeError) as exc:
        raise _serialization_failure("page.scope", exc) from exc
    if (scope == PAGE_SCOPE_GLOBAL and page.series_id is not None) or (
        scope == PAGE_SCOPE_SERIES and not page.series_id
    ):
        raise RecoverySerializationError(
            "Stored page has inconsistent scope and series id",
            path="page.seriesId",
        )
    if page.series_id is not None and type(page.series_id) is not str:
        raise RecoverySerializationError(
            "Stored page series id has an invalid type", path="page.seriesId"
        )
    scalar_types = (
        (page.id, uuid.UUID, "page.id"),
        (page.slug, str, "page.slug"),
        (page.title, str, "page.title"),
        (page.page_type, str, "page.pageType"),
    )
    for value, expected, path in scalar_types:
        if type(value) is not expected:
            raise RecoverySerializationError("Stored page scalar has an invalid type", path=path)
    for value, path in (
        (page.is_published, "page.isPublished"),
        (page.is_homepage, "page.isHomepage"),
    ):
        if type(value) is not bool:
            raise RecoverySerializationError("Stored page boolean has an invalid type", path=path)
    if type(page.sort_index) is not int:
        raise RecoverySerializationError(
            "Stored page sort index has an invalid type", path="page.sortIndex"
        )
    if type(page.meta) is not dict:
        raise RecoverySerializationError("Stored page meta has an invalid type", path="page.meta")
    try:
        page_sort_index = validate_sort_index(page.sort_index)
    except (ValueError, TypeError, AttributeError) as exc:
        raise _serialization_failure("page.sortIndex", exc) from exc
    try:
        page_meta = sanitize_page_meta(page.meta)
    except (ValueError, TypeError, AttributeError) as exc:
        raise _serialization_failure("page.meta", exc) from exc

    try:
        ordered_sections = _ordered(page.sections, "sort_index")
    except (ValueError, TypeError, AttributeError) as exc:
        raise _serialization_failure("page.sections", exc) from exc
    sections: list[dict[str, Any]] = []
    for section_index, section in enumerate(ordered_sections):
        section_path = f"page.sections[{section_index}]"
        if type(section.id) is not uuid.UUID:
            raise RecoverySerializationError(
                "Stored section id has an invalid type", path=f"{section_path}.id"
            )
        for value, expected, path in (
            (section.section_type, str, f"{section_path}.sectionType"),
            (section.layout, str, f"{section_path}.layout"),
            (section.sort_index, int, f"{section_path}.sortIndex"),
            (section.settings, dict, f"{section_path}.settings"),
        ):
            if type(value) is not expected:
                raise RecoverySerializationError(
                    "Stored section field has an invalid type", path=path
                )
        try:
            section_type = validate_section_type(section.section_type)
        except (ValueError, TypeError, AttributeError) as exc:
            raise _serialization_failure(f"{section_path}.sectionType", exc) from exc
        try:
            layout = validate_layout(section.layout)
        except (ValueError, TypeError, AttributeError) as exc:
            raise _serialization_failure(f"{section_path}.layout", exc) from exc
        try:
            sort_index = validate_sort_index(section.sort_index)
        except (ValueError, TypeError, AttributeError) as exc:
            raise _serialization_failure(f"{section_path}.sortIndex", exc) from exc
        try:
            settings = sanitize_section_settings(section.settings, layout)
        except (ValueError, TypeError, AttributeError) as exc:
            raise _serialization_failure(f"{section_path}.settings", exc) from exc
        try:
            ordered_modules = _ordered(section.modules, "column_index", "sort_index")
        except (ValueError, TypeError, AttributeError) as exc:
            raise _serialization_failure(f"{section_path}.modules", exc) from exc
        modules: list[dict[str, Any]] = []
        for module_index, module in enumerate(ordered_modules):
            module_path = f"{section_path}.modules[{module_index}]"
            if type(module.id) is not uuid.UUID:
                raise RecoverySerializationError(
                    "Stored module id has an invalid type", path=f"{module_path}.id"
                )
            for value, expected, path in (
                (module.module_type, str, f"{module_path}.moduleType"),
                (module.column_index, int, f"{module_path}.columnIndex"),
                (module.sort_index, int, f"{module_path}.sortIndex"),
                (module.config, dict, f"{module_path}.config"),
            ):
                if type(value) is not expected:
                    raise RecoverySerializationError(
                        "Stored module field has an invalid type", path=path
                    )
            try:
                module_type = validate_module_type(module.module_type)
            except (ValueError, TypeError, AttributeError) as exc:
                raise _serialization_failure(f"{module_path}.moduleType", exc) from exc
            try:
                column_index = validate_column_index(module.column_index, layout)
            except (ValueError, TypeError, AttributeError) as exc:
                raise _serialization_failure(f"{module_path}.columnIndex", exc) from exc
            try:
                module_sort_index = validate_sort_index(module.sort_index)
            except (ValueError, TypeError, AttributeError) as exc:
                raise _serialization_failure(f"{module_path}.sortIndex", exc) from exc
            try:
                config = _sanitize_module_config_for_page(page, module_type, module.config)
            except (ValueError, TypeError, AttributeError) as exc:
                raise _serialization_failure(f"{module_path}.config", exc) from exc
            modules.append(
                {
                    "id": str(module.id),
                    "moduleType": module_type,
                    "columnIndex": column_index,
                    "sortIndex": module_sort_index,
                    "config": config,
                }
            )
        sections.append(
            {
                "id": str(section.id),
                "sectionType": section_type,
                "layout": layout,
                "sortIndex": sort_index,
                "settings": settings,
                "modules": modules,
            }
        )

    try:
        ordered_bindings = _ordered(page.bindings, "series_id", "role")
    except (ValueError, TypeError, AttributeError) as exc:
        raise _serialization_failure("bindings", exc) from exc
    bindings: list[dict[str, Any]] = []
    for index, binding in enumerate(ordered_bindings):
        path = f"bindings[{index}]"
        if type(binding.series_id) is not str:
            raise RecoverySerializationError(
                "Stored binding series id has an invalid type", path=f"{path}.seriesId"
            )
        if type(binding.role) is not str:
            raise RecoverySerializationError(
                "Stored binding role has an invalid type", path=f"{path}.role"
            )
        try:
            role = sanitize_binding_role(binding.role)
        except (ValueError, TypeError, AttributeError) as exc:
            raise _serialization_failure(f"{path}.role", exc) from exc
        bindings.append({"seriesId": binding.series_id, "role": role})
    return {
        "snapshotVersion": SNAPSHOT_PAYLOAD_VERSION,
        "page": {
            "id": str(page.id),
            "scope": scope,
            "seriesId": page.series_id,
            "slug": page.slug,
            "title": page.title,
            "pageType": page.page_type,
            "isPublished": page.is_published,
            "isHomepage": page.is_homepage,
            "sortIndex": page_sort_index,
            "meta": page_meta,
            "sections": sections,
        },
        "bindings": bindings,
    }


def serialize_builder_page_recovery(db: Session, page: BuilderPage) -> dict[str, Any]:
    """Build a strict, sanitized version-1 recovery document from ORM records."""
    try:
        return _serialize_builder_page_recovery(db, page)
    except RecoverySerializationError:
        raise
    except (ValueError, TypeError, AttributeError) as exc:
        raise _serialization_failure("page", exc) from exc


def hash_recovery_payload(payload: dict[str, Any]) -> str:
    """Return the SHA-256 of compact, sorted-key UTF-8 recovery JSON."""
    serialized = json.dumps(
        payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")
    return hashlib.sha256(serialized).hexdigest()


def capture_page_snapshot(
    db: Session,
    page_id: uuid.UUID | str,
    action: str,
    actor_user_id: uuid.UUID | None = None,
) -> BuilderPageSnapshot | None:
    """Insert and prune one snapshot without committing the owning transaction."""
    if action not in SNAPSHOT_ACTIONS:
        raise ValueError(f"Unsupported builder snapshot action: {action}")
    try:
        parsed_page_id = page_id if isinstance(page_id, uuid.UUID) else uuid.UUID(str(page_id))
    except ValueError as exc:
        raise ValueError("Snapshot page id must be a valid UUID") from exc

    page = db.scalar(
        select(BuilderPage)
        .where(BuilderPage.id == parsed_page_id)
        .options(
            selectinload(BuilderPage.sections).selectinload(BuilderSection.modules),
            selectinload(BuilderPage.bindings),
        )
    )
    if not page:
        raise ValueError("Cannot snapshot a missing builder page")

    payload = serialize_builder_page_recovery(db, page)
    return _insert_serialized_page_snapshot(db, page, payload, action, actor_user_id)


def _insert_serialized_page_snapshot(
    db: Session,
    page: BuilderPage,
    payload: dict[str, Any],
    action: str,
    actor_user_id: uuid.UUID | None,
) -> BuilderPageSnapshot | None:
    """Insert/prune one event from a document serialized by the caller."""
    if action not in SNAPSHOT_ACTIONS:
        raise ValueError(f"Unsupported builder snapshot action: {action}")
    payload_hash = hash_recovery_payload(payload)
    latest = db.scalar(
        select(BuilderPageSnapshot)
        .where(BuilderPageSnapshot.page_id == page.id)
        .order_by(BuilderPageSnapshot.created_at.desc(), BuilderPageSnapshot.id.desc())
        .with_for_update()
        .limit(1)
    )
    if latest and latest.payload_hash == payload_hash and latest.action == action:
        return None

    snapshot = BuilderPageSnapshot(
        page_id=page.id,
        scope=page.scope,
        series_id=page.series_id,
        slug=page.slug,
        action=action,
        created_by_user_id=actor_user_id,
        payload_version=SNAPSHOT_PAYLOAD_VERSION,
        payload=payload,
        payload_hash=payload_hash,
        created_at=datetime.now(timezone.utc),
    )
    db.add(snapshot)
    db.flush()

    expired_ids = db.scalars(
        select(BuilderPageSnapshot.id)
        .where(BuilderPageSnapshot.page_id == page.id)
        .order_by(BuilderPageSnapshot.created_at.desc(), BuilderPageSnapshot.id.desc())
        .offset(SNAPSHOT_RETENTION)
        .with_for_update()
    ).all()
    if expired_ids:
        db.execute(delete(BuilderPageSnapshot).where(BuilderPageSnapshot.id.in_(expired_ids)))
    return snapshot


def _parse_uuid(value: Any, path: str) -> uuid.UUID:
    if type(value) is not str:
        raise BuilderSnapshotError(
            "Snapshot UUID must be a canonical string",
            code="snapshot_validation_failed",
            status_code=400,
            path=path,
        )
    try:
        parsed = uuid.UUID(value)
    except ValueError as exc:
        raise BuilderSnapshotError(
            "Snapshot contains an invalid UUID",
            code="snapshot_validation_failed",
            status_code=400,
            path=path,
        ) from exc
    if str(parsed) != value:
        raise BuilderSnapshotError(
            "Snapshot UUID is not canonical",
            code="snapshot_validation_failed",
            status_code=400,
            path=path,
        )
    return parsed


def _require_exact_keys(value: Any, expected: set[str], path: str) -> dict[str, Any]:
    if type(value) is not dict:
        raise BuilderSnapshotError(
            "Snapshot field must be an object",
            code="snapshot_validation_failed",
            status_code=400,
            path=path,
        )
    keys = set(value)
    if keys != expected:
        unexpected = sorted(keys - expected)
        missing = sorted(expected - keys)
        suffix = unexpected[0] if unexpected else missing[0]
        raise BuilderSnapshotError(
            "Snapshot contains missing or unsupported fields",
            code="snapshot_validation_failed",
            status_code=400,
            path=f"{path}.{suffix}",
        )
    return value


def _first_difference(raw: Any, sanitized: Any, path: str) -> tuple[str, bool] | None:
    """Return the first drift path and whether it reflects contract vocabulary.

    Added/removed object keys indicate that the stored document uses a retired
    or newer sanitizer vocabulary and is therefore incompatible. Type/value/list
    drift is malformed or merely noncanonical stored JSON.
    """
    if type(raw) is not type(sanitized):
        return path, False
    if isinstance(raw, dict):
        for key in raw:
            if key not in sanitized:
                return f"{path}.{key}", True
            difference = _first_difference(raw[key], sanitized[key], f"{path}.{key}")
            if difference:
                return difference
        for key in sanitized:
            if key not in raw:
                return f"{path}.{key}", True
        return None
    if isinstance(raw, list):
        if len(raw) != len(sanitized):
            return path, False
        for index, (raw_item, sanitized_item) in enumerate(zip(raw, sanitized, strict=True)):
            difference = _first_difference(raw_item, sanitized_item, f"{path}[{index}]")
            if difference:
                return difference
        return None
    return None if raw == sanitized else (path, False)


def _raise_sanitizer_difference(difference: tuple[str, bool]) -> None:
    path, vocabulary_drift = difference
    if vocabulary_drift:
        _raise_incompatible(path)
    _raise_validation(path, "Snapshot value is not canonical")


def _raise_incompatible(path: str, message: str = "Snapshot is incompatible") -> None:
    raise BuilderSnapshotError(
        message,
        code="snapshot_incompatible",
        status_code=409,
        path=path,
    )


def _raise_validation(path: str, message: str) -> None:
    raise BuilderSnapshotError(
        message,
        code="snapshot_validation_failed",
        status_code=400,
        path=path,
    )


def _require_string(value: Any, path: str, *, maximum: int | None = None) -> str:
    if type(value) is not str or (maximum is not None and len(value) > maximum):
        _raise_validation(path, "Snapshot string is invalid")
    return value


def _require_bool(value: Any, path: str) -> bool:
    if type(value) is not bool:
        _raise_validation(path, "Snapshot boolean is invalid")
    return value


def _require_int(value: Any, path: str) -> int:
    if type(value) is not int:
        _raise_validation(path, "Snapshot integer is invalid")
    return value


def validate_snapshot_payload(snapshot: BuilderPageSnapshot) -> RecoveryDocument:
    """Validate one stored row into an immutable, typed recovery tree."""
    payload = _require_exact_keys(
        snapshot.payload,
        {"snapshotVersion", "page", "bindings"},
        "payload",
    )
    if type(snapshot.payload_version) is not int:
        _raise_validation("snapshotVersion", "Snapshot version metadata is invalid")
    if snapshot.payload_version != SNAPSHOT_PAYLOAD_VERSION:
        _raise_incompatible("snapshotVersion", "Snapshot version is not supported")
    payload_version = _require_int(payload["snapshotVersion"], "snapshotVersion")
    if payload_version != SNAPSHOT_PAYLOAD_VERSION:
        _raise_incompatible("snapshotVersion", "Snapshot version is not supported")
    if payload_version != snapshot.payload_version:
        _raise_validation("snapshotVersion", "Snapshot version metadata does not agree")
    action = _require_string(snapshot.action, "action")
    if action not in SNAPSHOT_ACTIONS:
        _raise_validation("action", "Snapshot action is invalid")
    payload_hash = _require_string(snapshot.payload_hash, "payloadHash")
    if len(payload_hash) != 64 or any(
        character not in "0123456789abcdef" for character in payload_hash
    ):
        _raise_validation("payloadHash", "Snapshot payload hash is not canonical")
    try:
        actual_hash = hash_recovery_payload(payload)
    except (TypeError, ValueError, AttributeError) as exc:
        raise BuilderSnapshotError(
            "Snapshot payload cannot be hashed",
            code="snapshot_validation_failed",
            status_code=400,
            path="payload",
        ) from exc
    if actual_hash != payload_hash:
        _raise_validation("payload", "Snapshot integrity check failed")

    page = _require_exact_keys(
        payload["page"],
        {
            "id",
            "scope",
            "seriesId",
            "slug",
            "title",
            "pageType",
            "isPublished",
            "isHomepage",
            "sortIndex",
            "meta",
            "sections",
        },
        "page",
    )
    page_id = _parse_uuid(page["id"], "page.id")
    if type(snapshot.page_id) is not uuid.UUID or page_id != snapshot.page_id:
        _raise_validation("page.id", "Snapshot page identity does not agree")

    raw_scope = _require_string(page["scope"], "page.scope")
    try:
        scope = sanitize_page_scope(raw_scope)
    except (ValueError, TypeError, AttributeError) as exc:
        raise BuilderSnapshotError(
            str(exc), code="snapshot_incompatible", status_code=409, path="page.scope"
        ) from exc
    if scope != raw_scope:
        _raise_validation("page.scope", "Snapshot page scope is not canonical")

    series_id = page["seriesId"]
    if series_id is not None:
        series_id = _require_string(series_id, "page.seriesId", maximum=64)
    if (scope == PAGE_SCOPE_GLOBAL and series_id is not None) or (
        scope == PAGE_SCOPE_SERIES and not series_id
    ):
        _raise_validation("page.seriesId", "Snapshot scope and seriesId are inconsistent")
    if series_id is not None and sanitize_series_id(series_id) != series_id:
        _raise_validation("page.seriesId", "Snapshot seriesId is not canonical")

    slug = _require_string(page["slug"], "page.slug", maximum=100)
    title = _require_string(page["title"], "page.title", maximum=200)
    page_type = _require_string(page["pageType"], "page.pageType", maximum=30)
    if not slug or slug != slug.strip().lower():
        _raise_validation("page.slug", "Snapshot slug is not canonical")
    if title != title.strip():
        _raise_validation("page.title", "Snapshot title is not canonical")
    if page_type != page_type.strip() or not page_type:
        _raise_validation("page.pageType", "Snapshot pageType is not canonical")

    copied_values = (
        (scope, snapshot.scope, "page.scope"),
        (series_id, snapshot.series_id, "page.seriesId"),
        (slug, snapshot.slug, "page.slug"),
    )
    for payload_value, row_value, path in copied_values:
        if payload_value != row_value:
            _raise_validation(path, "Snapshot copied metadata does not agree")

    is_published = _require_bool(page["isPublished"], "page.isPublished")
    is_homepage = _require_bool(page["isHomepage"], "page.isHomepage")
    page_sort_index = _require_int(page["sortIndex"], "page.sortIndex")
    try:
        if validate_sort_index(page_sort_index) != page_sort_index:
            _raise_validation("page.sortIndex", "Snapshot sortIndex is not canonical")
    except (ValueError, TypeError, AttributeError) as exc:
        raise BuilderSnapshotError(
            str(exc),
            code="snapshot_validation_failed",
            status_code=400,
            path="page.sortIndex",
        ) from exc
    if type(page["meta"]) is not dict:
        _raise_validation("page.meta", "Snapshot meta must be an object")
    try:
        sanitized_meta = sanitize_page_meta(page["meta"])
    except (ValueError, TypeError, AttributeError) as exc:
        raise BuilderSnapshotError(
            str(exc), code="snapshot_incompatible", status_code=409, path="page.meta"
        ) from exc
    difference = _first_difference(page["meta"], sanitized_meta, "page.meta")
    if difference:
        _raise_sanitizer_difference(difference)

    raw_sections = page["sections"]
    if type(raw_sections) is not list:
        _raise_validation("page.sections", "Snapshot sections must be an array")
    seen_ids = {page_id}
    previous_section_key: tuple[int, str] | None = None
    sections: list[RecoverySection] = []
    page_stub = BuilderPage(scope=scope, series_id=series_id)
    for section_index, raw_section in enumerate(raw_sections):
        section_path = f"page.sections[{section_index}]"
        section = _require_exact_keys(
            raw_section,
            {"id", "sectionType", "layout", "sortIndex", "settings", "modules"},
            section_path,
        )
        section_id = _parse_uuid(section["id"], f"{section_path}.id")
        if section_id in seen_ids:
            _raise_validation(f"{section_path}.id", "Snapshot contains duplicate IDs")
        seen_ids.add(section_id)
        raw_section_type = _require_string(section["sectionType"], f"{section_path}.sectionType")
        raw_layout = _require_string(section["layout"], f"{section_path}.layout")
        try:
            section_type = validate_section_type(raw_section_type)
        except (ValueError, TypeError, AttributeError) as exc:
            raise BuilderSnapshotError(
                str(exc),
                code="snapshot_incompatible",
                status_code=409,
                path=f"{section_path}.sectionType",
            ) from exc
        try:
            layout = validate_layout(raw_layout)
        except (ValueError, TypeError, AttributeError) as exc:
            raise BuilderSnapshotError(
                str(exc),
                code="snapshot_incompatible",
                status_code=409,
                path=f"{section_path}.layout",
            ) from exc
        if section_type != raw_section_type:
            _raise_validation(f"{section_path}.sectionType", "Snapshot string is not canonical")
        if layout != raw_layout:
            _raise_validation(f"{section_path}.layout", "Snapshot string is not canonical")
        section_sort_index = _require_int(section["sortIndex"], f"{section_path}.sortIndex")
        try:
            validate_sort_index(section_sort_index)
        except (ValueError, TypeError, AttributeError) as exc:
            raise BuilderSnapshotError(
                str(exc),
                code="snapshot_validation_failed",
                status_code=400,
                path=f"{section_path}.sortIndex",
            ) from exc
        section_key = (section_sort_index, str(section_id))
        if previous_section_key is not None and section_key < previous_section_key:
            _raise_validation(section_path, "Snapshot sections are not canonically ordered")
        previous_section_key = section_key
        if type(section["settings"]) is not dict:
            _raise_validation(f"{section_path}.settings", "Snapshot settings must be an object")
        try:
            sanitized_settings = sanitize_section_settings(section["settings"], layout)
        except (ValueError, TypeError, AttributeError) as exc:
            raise BuilderSnapshotError(
                str(exc),
                code="snapshot_incompatible",
                status_code=409,
                path=f"{section_path}.settings",
            ) from exc
        difference = _first_difference(
            section["settings"], sanitized_settings, f"{section_path}.settings"
        )
        if difference:
            _raise_sanitizer_difference(difference)

        raw_modules = section["modules"]
        if type(raw_modules) is not list:
            _raise_validation(f"{section_path}.modules", "Snapshot modules must be an array")
        previous_module_key: tuple[int, int, str] | None = None
        modules: list[RecoveryModule] = []
        for module_index, raw_module in enumerate(raw_modules):
            module_path = f"{section_path}.modules[{module_index}]"
            module = _require_exact_keys(
                raw_module,
                {"id", "moduleType", "columnIndex", "sortIndex", "config"},
                module_path,
            )
            module_id = _parse_uuid(module["id"], f"{module_path}.id")
            if module_id in seen_ids:
                _raise_validation(f"{module_path}.id", "Snapshot contains duplicate IDs")
            seen_ids.add(module_id)
            raw_module_type = _require_string(module["moduleType"], f"{module_path}.moduleType")
            try:
                module_type = validate_module_type(raw_module_type)
            except (ValueError, TypeError, AttributeError) as exc:
                raise BuilderSnapshotError(
                    str(exc),
                    code="snapshot_incompatible",
                    status_code=409,
                    path=f"{module_path}.moduleType",
                ) from exc
            if module_type != raw_module_type:
                _raise_validation(f"{module_path}.moduleType", "Snapshot string is not canonical")
            column_index = _require_int(module["columnIndex"], f"{module_path}.columnIndex")
            module_sort_index = _require_int(module["sortIndex"], f"{module_path}.sortIndex")
            try:
                validate_column_index(column_index, layout)
            except (ValueError, TypeError, AttributeError) as exc:
                raise BuilderSnapshotError(
                    str(exc),
                    code="snapshot_validation_failed",
                    status_code=400,
                    path=f"{module_path}.columnIndex",
                ) from exc
            try:
                validate_sort_index(module_sort_index)
            except (ValueError, TypeError, AttributeError) as exc:
                raise BuilderSnapshotError(
                    str(exc),
                    code="snapshot_validation_failed",
                    status_code=400,
                    path=f"{module_path}.sortIndex",
                ) from exc
            module_key = (column_index, module_sort_index, str(module_id))
            if previous_module_key is not None and module_key < previous_module_key:
                _raise_validation(module_path, "Snapshot modules are not canonically ordered")
            previous_module_key = module_key
            if type(module["config"]) is not dict:
                _raise_validation(f"{module_path}.config", "Snapshot config must be an object")
            try:
                sanitized_config = _sanitize_module_config_for_page(
                    page_stub, module_type, module["config"]
                )
            except (ValueError, TypeError, AttributeError) as exc:
                raise BuilderSnapshotError(
                    str(exc),
                    code="snapshot_incompatible",
                    status_code=409,
                    path=f"{module_path}.config",
                ) from exc
            difference = _first_difference(
                module["config"], sanitized_config, f"{module_path}.config"
            )
            if difference:
                _raise_sanitizer_difference(difference)
            modules.append(
                RecoveryModule(
                    id=module_id,
                    module_type=module_type,
                    column_index=column_index,
                    sort_index=module_sort_index,
                    config=_freeze_json(module["config"]),
                )
            )
        sections.append(
            RecoverySection(
                id=section_id,
                section_type=section_type,
                layout=layout,
                sort_index=section_sort_index,
                settings=_freeze_json(section["settings"]),
                modules=tuple(modules),
            )
        )

    raw_bindings = payload["bindings"]
    if type(raw_bindings) is not list:
        _raise_validation("bindings", "Snapshot bindings must be an array")
    previous_binding_key: tuple[str, str] | None = None
    binding_keys: set[tuple[str, str]] = set()
    bindings: list[RecoveryBinding] = []
    for index, raw_binding in enumerate(raw_bindings):
        binding_path = f"bindings[{index}]"
        binding = _require_exact_keys(raw_binding, {"seriesId", "role"}, binding_path)
        binding_series_id = _require_string(
            binding["seriesId"], f"{binding_path}.seriesId", maximum=64
        )
        if not binding_series_id or sanitize_series_id(binding_series_id) != binding_series_id:
            _raise_validation(f"{binding_path}.seriesId", "Snapshot seriesId is not canonical")
        raw_role = _require_string(binding["role"], f"{binding_path}.role")
        try:
            role = sanitize_binding_role(raw_role)
        except (ValueError, TypeError, AttributeError) as exc:
            raise BuilderSnapshotError(
                str(exc),
                code="snapshot_incompatible",
                status_code=409,
                path=f"{binding_path}.role",
            ) from exc
        if role != raw_role:
            _raise_validation(f"{binding_path}.role", "Snapshot role is not canonical")
        binding_key = (binding_series_id, role)
        if binding_key in binding_keys:
            _raise_validation(binding_path, "Snapshot contains duplicate bindings")
        if previous_binding_key is not None and binding_key < previous_binding_key:
            _raise_validation(binding_path, "Snapshot bindings are not canonically ordered")
        binding_keys.add(binding_key)
        previous_binding_key = binding_key
        bindings.append(RecoveryBinding(series_id=binding_series_id, role=role))

    return RecoveryDocument(
        snapshot_version=payload_version,
        page=RecoveryPage(
            id=page_id,
            scope=scope,
            series_id=series_id,
            slug=slug,
            title=title,
            page_type=page_type,
            is_published=is_published,
            is_homepage=is_homepage,
            sort_index=page_sort_index,
            meta=_freeze_json(page["meta"]),
            sections=tuple(sections),
        ),
        bindings=tuple(bindings),
    )


def _snapshot_row(db: Session, snapshot_id: uuid.UUID | str) -> BuilderPageSnapshot:
    parsed_id = (
        snapshot_id
        if isinstance(snapshot_id, uuid.UUID)
        else _parse_uuid(snapshot_id, "snapshotId")
    )
    snapshot = db.get(BuilderPageSnapshot, parsed_id)
    if not snapshot:
        raise BuilderSnapshotError(
            "Snapshot not found",
            code="snapshot_not_found",
            status_code=404,
        )
    return snapshot


def _snapshot_summary(snapshot: BuilderPageSnapshot, display_name: str | None) -> dict[str, Any]:
    return {
        "id": str(snapshot.id),
        "pageId": str(snapshot.page_id),
        "scope": snapshot.scope,
        "seriesId": snapshot.series_id,
        "slug": snapshot.slug,
        "action": snapshot.action,
        "createdAt": snapshot.created_at.isoformat(),
        "createdByDisplayName": display_name,
    }


def list_page_snapshots(db: Session, page_id: uuid.UUID | str) -> list[dict[str, Any]]:
    parsed_page_id = page_id if isinstance(page_id, uuid.UUID) else _parse_uuid(page_id, "pageId")
    rows = db.execute(
        select(BuilderPageSnapshot, User.display_name)
        .outerjoin(User, User.id == BuilderPageSnapshot.created_by_user_id)
        .where(BuilderPageSnapshot.page_id == parsed_page_id)
        .order_by(BuilderPageSnapshot.created_at.desc(), BuilderPageSnapshot.id.desc())
    ).all()
    return [_snapshot_summary(snapshot, display_name) for snapshot, display_name in rows]


def get_snapshot_detail(db: Session, snapshot_id: uuid.UUID | str) -> dict[str, Any]:
    snapshot = _snapshot_row(db, snapshot_id)
    payload = validate_snapshot_payload(snapshot)
    display_name = db.scalar(
        select(User.display_name).where(User.id == snapshot.created_by_user_id)
    )
    return {**_snapshot_summary(snapshot, display_name), "payload": payload.to_document()}


def list_deleted_page_candidates(
    db: Session,
    scope: str | None,
    series_id: str | None,
) -> list[dict[str, Any]]:
    try:
        safe_scope = sanitize_page_scope(scope)
    except ValueError as exc:
        raise BuilderSnapshotError(
            str(exc),
            code="invalid_snapshot_filter",
            status_code=400,
            path="scope",
        ) from exc
    if safe_scope == PAGE_SCOPE_GLOBAL:
        if series_id not in (None, ""):
            raise BuilderSnapshotError(
                "Global snapshot filters cannot include series_id",
                code="invalid_snapshot_filter",
                status_code=400,
                path="series_id",
            )
        safe_series_id = None
    else:
        safe_series_id = str(series_id or "").strip()
        if not safe_series_id:
            raise BuilderSnapshotError(
                "Series snapshot filters require series_id",
                code="invalid_snapshot_filter",
                status_code=400,
                path="series_id",
            )

    existing_ids = set(db.scalars(select(BuilderPage.id)).all())
    rows = db.scalars(
        select(BuilderPageSnapshot)
        .where(
            BuilderPageSnapshot.scope == safe_scope,
            BuilderPageSnapshot.series_id == safe_series_id
            if safe_series_id is not None
            else BuilderPageSnapshot.series_id.is_(None),
        )
        .order_by(BuilderPageSnapshot.created_at.desc(), BuilderPageSnapshot.id.desc())
    ).all()
    candidates: list[dict[str, Any]] = []
    seen_page_ids: set[uuid.UUID] = set()
    for snapshot in rows:
        if snapshot.page_id in existing_ids or snapshot.page_id in seen_page_ids:
            continue
        payload = validate_snapshot_payload(snapshot)
        seen_page_ids.add(snapshot.page_id)
        candidates.append(
            {
                "pageId": str(snapshot.page_id),
                "scope": snapshot.scope,
                "seriesId": snapshot.series_id,
                "slug": snapshot.slug,
                "title": payload.page.title,
                "latestSnapshotId": str(snapshot.id),
                "latestSnapshotAt": snapshot.created_at.isoformat(),
            }
        )
        if len(candidates) == 100:
            break
    return candidates


def _content_document(payload: dict[str, Any]) -> dict[str, Any]:
    page = payload["page"]
    return {
        "title": page["title"],
        "pageType": page["pageType"],
        "meta": page["meta"],
        "sections": page["sections"],
    }


def _recovery_content_document(payload: RecoveryDocument) -> dict[str, Any]:
    page = payload.page
    return {
        "title": page.title,
        "pageType": page.page_type,
        "meta": _thaw_json(page.meta),
        "sections": [section.to_document() for section in page.sections],
    }


def _nested_identity_conflict(
    db: Session,
    payload: RecoveryDocument,
    *,
    current_page_id: uuid.UUID | None,
) -> str | None:
    section_ids = [section.id for section in payload.page.sections]
    module_ids = [module.id for section in payload.page.sections for module in section.modules]
    if section_ids:
        conflict = db.scalar(
            select(BuilderSection.id)
            .where(
                BuilderSection.id.in_(section_ids),
                BuilderSection.page_id != current_page_id if current_page_id is not None else True,
            )
            .limit(1)
        )
        if conflict:
            return f"page.sections[id={conflict}].id"
    if module_ids:
        query = (
            select(BuilderModule.id)
            .join(BuilderSection, BuilderSection.id == BuilderModule.section_id)
            .where(BuilderModule.id.in_(module_ids))
        )
        if current_page_id is not None:
            query = query.where(BuilderSection.page_id != current_page_id)
        conflict = db.scalar(query.limit(1))
        if conflict:
            return f"page.modules[id={conflict}].id"
    return None


def _apply_page_content(
    db: Session,
    page: BuilderPage,
    payload: RecoveryDocument,
) -> None:
    stored_page = payload.page
    existing_sections = {section.id: section for section in page.sections}
    existing_modules = {
        module.id: module for section in page.sections for module in section.modules
    }
    desired_section_ids = {section.id for section in stored_page.sections}
    desired_module_ids = {
        module.id for section in stored_page.sections for module in section.modules
    }

    for module_id, module in existing_modules.items():
        if module_id not in desired_module_ids:
            db.delete(module)
    for recovered_section in stored_page.sections:
        section_id = recovered_section.id
        section = existing_sections.get(section_id)
        if section is None:
            section = BuilderSection(id=section_id, page=page)
            db.add(section)
        section.section_type = recovered_section.section_type
        section.layout = recovered_section.layout
        section.sort_index = recovered_section.sort_index
        section.settings = _thaw_json(recovered_section.settings)
        for recovered_module in recovered_section.modules:
            module_id = recovered_module.id
            module = existing_modules.get(module_id)
            if module is None:
                module = BuilderModule(id=module_id)
                db.add(module)
            module.section = section
            module.module_type = recovered_module.module_type
            module.column_index = recovered_module.column_index
            module.sort_index = recovered_module.sort_index
            module.config = _thaw_json(recovered_module.config)
            module.updated_at = datetime.now(timezone.utc)
    for section_id, section in existing_sections.items():
        if section_id not in desired_section_ids:
            db.delete(section)

    page.title = stored_page.title
    page.page_type = stored_page.page_type
    page.meta = _thaw_json(stored_page.meta)
    page.updated_at = datetime.now(timezone.utc)


def _restore_current_page(
    db: Session,
    snapshot: BuilderPageSnapshot,
    payload: RecoveryDocument,
    actor_user_id: uuid.UUID | None,
) -> uuid.UUID:
    page = db.scalar(
        select(BuilderPage)
        .where(BuilderPage.id == snapshot.page_id)
        .with_for_update()
        .execution_options(populate_existing=True)
        .options(
            selectinload(BuilderPage.sections).selectinload(BuilderSection.modules),
            selectinload(BuilderPage.bindings),
        )
    )
    if not page:
        raise BuilderSnapshotError(
            "Page no longer exists",
            code="snapshot_identity_conflict",
            status_code=409,
            path="page.id",
        )
    locked_snapshot = db.scalar(
        select(BuilderPageSnapshot).where(BuilderPageSnapshot.id == snapshot.id).with_for_update()
    )
    if not locked_snapshot:
        raise BuilderSnapshotError(
            "Snapshot not found",
            code="snapshot_not_found",
            status_code=404,
        )
    snapshot = locked_snapshot
    payload = validate_snapshot_payload(snapshot)
    if page.scope != snapshot.scope or page.series_id != snapshot.series_id:
        raise BuilderSnapshotError(
            "Current page scope does not match the snapshot",
            code="snapshot_scope_conflict",
            status_code=409,
            path="page.scope",
        )
    conflict_path = _nested_identity_conflict(db, payload, current_page_id=page.id)
    if conflict_path:
        raise BuilderSnapshotError(
            "A nested snapshot ID belongs to another page",
            code="snapshot_identity_conflict",
            status_code=409,
            path=conflict_path,
        )

    try:
        current_payload = serialize_builder_page_recovery(db, page)
    except RecoverySerializationError as exc:
        raise BuilderSnapshotError(
            "Current page cannot be serialized safely",
            code="current_page_incompatible",
            status_code=409,
            path=exc.path,
        ) from exc
    if _content_document(current_payload) == _recovery_content_document(payload):
        page_id = page.id
        db.rollback()
        return page_id

    _insert_serialized_page_snapshot(db, page, current_payload, PRE_RESTORE, actor_user_id)
    _apply_page_content(db, page, payload)
    db.flush()
    db.expire(page, ["sections"])
    page = db.scalar(
        select(BuilderPage)
        .where(BuilderPage.id == page.id)
        .execution_options(populate_existing=True)
        .options(selectinload(BuilderPage.sections).selectinload(BuilderSection.modules))
    )
    if _page_has_reader_binding(db, page):
        try:
            _raise_for_invalid_reader_binding(page, str(page.series_id))
        except PageBuilderValidationError as exc:
            raise BuilderSnapshotError(
                str(exc),
                code="snapshot_incompatible",
                status_code=409,
                path="page.sections",
            ) from exc
    db.commit()
    return page.id


def _restore_deleted_page(
    db: Session,
    snapshot: BuilderPageSnapshot,
    payload: RecoveryDocument,
) -> uuid.UUID:
    initial_scope = payload.page.scope
    initial_series_id = payload.page.series_id
    try:
        lock_builder_page_scope(db, initial_scope, initial_series_id)
    except ValueError as exc:
        if initial_scope == PAGE_SCOPE_SERIES:
            raise BuilderSnapshotError(
                "Snapshot series no longer exists",
                code="snapshot_series_missing",
                status_code=409,
                path="page.seriesId",
            ) from exc
        raise
    if initial_scope == PAGE_SCOPE_SERIES and not db.get(Series, initial_series_id):
        raise BuilderSnapshotError(
            "Snapshot series no longer exists",
            code="snapshot_series_missing",
            status_code=409,
            path="page.seriesId",
        )
    histories = list(
        db.scalars(
            select(BuilderPageSnapshot)
            .where(BuilderPageSnapshot.page_id == snapshot.page_id)
            .order_by(BuilderPageSnapshot.id.asc())
            .with_for_update()
        ).all()
    )
    selected = next((item for item in histories if item.id == snapshot.id), None)
    if selected is None:
        raise BuilderSnapshotError(
            "Snapshot not found",
            code="snapshot_not_found",
            status_code=404,
        )
    payload = validate_snapshot_payload(selected)
    stored_page = payload.page
    if stored_page.scope != initial_scope or stored_page.series_id != initial_series_id:
        raise BuilderSnapshotError(
            "Snapshot scope changed while restore was starting",
            code="snapshot_validation_failed",
            status_code=400,
            path="page.scope",
        )

    scope_filters = [BuilderPage.scope == stored_page.scope]
    if stored_page.scope == PAGE_SCOPE_GLOBAL:
        scope_filters.append(BuilderPage.series_id.is_(None))
    else:
        scope_filters.append(BuilderPage.series_id == stored_page.series_id)
    scope_pages = list(
        db.scalars(
            select(BuilderPage)
            .where(*scope_filters)
            .order_by(BuilderPage.id.asc())
            .with_for_update()
        ).all()
    )
    if db.get(BuilderPage, snapshot.page_id):
        raise BuilderSnapshotError(
            "Snapshot page already exists",
            code="snapshot_identity_conflict",
            status_code=409,
            path="page.id",
        )
    if any(page.slug == stored_page.slug for page in scope_pages):
        raise BuilderSnapshotError(
            "Snapshot slug is already in use",
            code="snapshot_slug_conflict",
            status_code=409,
            path="page.slug",
        )
    conflict_path = _nested_identity_conflict(db, payload, current_page_id=None)
    if conflict_path:
        raise BuilderSnapshotError(
            "A nested snapshot ID is already in use",
            code="snapshot_identity_conflict",
            status_code=409,
            path=conflict_path,
        )

    now = datetime.now(timezone.utc)
    next_sort_index = max((page.sort_index for page in scope_pages), default=-1) + 1
    page = BuilderPage(
        id=snapshot.page_id,
        scope=stored_page.scope,
        series_id=stored_page.series_id,
        slug=stored_page.slug,
        title=stored_page.title,
        page_type=stored_page.page_type,
        is_published=False,
        is_homepage=False,
        sort_index=next_sort_index,
        meta=_thaw_json(stored_page.meta),
        created_at=now,
        updated_at=now,
    )
    db.add(page)
    for recovered_section in stored_page.sections:
        section = BuilderSection(
            id=recovered_section.id,
            page=page,
            section_type=recovered_section.section_type,
            layout=recovered_section.layout,
            sort_index=recovered_section.sort_index,
            settings=_thaw_json(recovered_section.settings),
            created_at=now,
        )
        db.add(section)
        for recovered_module in recovered_section.modules:
            module = BuilderModule(
                id=recovered_module.id,
                section=section,
                module_type=recovered_module.module_type,
                column_index=recovered_module.column_index,
                sort_index=recovered_module.sort_index,
                config=_thaw_json(recovered_module.config),
                created_at=now,
                updated_at=now,
            )
            db.add(module)
    db.flush()
    db.commit()
    return page.id


def restore_page_snapshot(
    db: Session,
    snapshot_id: uuid.UUID | str,
    actor_user_id: uuid.UUID | None,
) -> uuid.UUID:
    """Restore one current or deleted page snapshot in one owned transaction."""
    try:
        snapshot = _snapshot_row(db, snapshot_id)
        payload = validate_snapshot_payload(snapshot)
        current_exists = db.scalar(select(BuilderPage.id).where(BuilderPage.id == snapshot.page_id))
        if current_exists is not None:
            return _restore_current_page(db, snapshot, payload, actor_user_id)
        return _restore_deleted_page(db, snapshot, payload)
    except IntegrityError as exc:
        db.rollback()
        detail = str(exc.orig).lower()
        if "slug" in detail:
            raise BuilderSnapshotError(
                "Snapshot slug is already in use",
                code="snapshot_slug_conflict",
                status_code=409,
                path="page.slug",
            ) from exc
        raise BuilderSnapshotError(
            "A snapshot identity is already in use",
            code="snapshot_identity_conflict",
            status_code=409,
            path="page.id",
        ) from exc
    except BuilderSnapshotError:
        db.rollback()
        raise
    except (ValueError, TypeError, AttributeError) as exc:
        db.rollback()
        raise BuilderSnapshotError(
            "Snapshot restore encountered incompatible stored data",
            code="snapshot_incompatible",
            status_code=409,
            path="page",
        ) from exc
    except Exception:
        db.rollback()
        raise
