#!/usr/bin/env python3
"""Create validated BWonderComics database and durable-file backup artifacts.

The JSON manifest is the commit marker for each artifact set. Production mode
fails closed unless /mnt/archive is a writable, off-repository mount.
"""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path, PurePosixPath
from typing import BinaryIO, Callable, Iterator

SCHEMA_VERSION = 1
ARCHIVE_MOUNT = Path("/mnt/archive")
LOCK_TIMEOUT_SECONDS = 300
LOCK_CONTENTION_EXIT_CODE = 75
STALE_PARTIAL_HOURS = 24
STATUS_HISTORY_LIMIT = 30
CATALOG_LIMIT = 60
STDERR_LIMIT = 4096
ALLOWLIST_VERSION = 1
INCLUDED_ROOTS = (
    "comics",
    "protected/comics",
    "media",
    "protected/media",
    "assets/uploads",
)
EXCLUDED_ROOTS = (
    "media/previews",
    "media/post-assets",
    "protected/media/previews",
    "protected/media/post-assets",
    "dist",
    "var/releases",
    "var/cache",
    "var/log",
    "var/diagnostics",
    "var/ops",
    "tests",
    "test-results",
    "deploy/bwondercomics.env",
)
EXCLUDED_PATTERNS = (
    "**/.env",
    "**/.env.*",
    "**/*.env",
    "**/*.key",
    "**/*.pem",
    "**/credentials.json",
    "**/secrets.json",
)
CRITICAL_TABLES = (
    "users",
    "comments",
    "posts",
    "series",
    "entries",
    "entry_pages",
    "media_items",
    "page_configs",
    "builder_pages",
    "builder_page_snapshots",
    "builder_sections",
    "builder_modules",
)
RETENTION = {
    "database": {"days": 30, "minimum": 30},
    "files": {"days": 56, "minimum": 8},
}
KIND_CONFIG = {
    "database": {"directory": "database", "suffix": ".dump"},
    "files": {"directory": "files", "suffix": ".tar.gz"},
}
PRODUCTION_ROOT_PARTS = ("backups", "bwondercomics")
ARCHIVE_CHILDREN = ("database", "files", "manifests")


class BackupError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class PublishedArtifact:
    kind: str
    artifact_id: str
    manifest: dict


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_z(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _bounded(value: str | bytes | None, limit: int = STDERR_LIMIT) -> str:
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")
    text = str(value or "").strip()
    return text[-limit:]


def _safe_message(value: str) -> str:
    text = re.sub(r"(?i)(password|secret|token)=\S+", r"\1=[redacted]", _bounded(value))
    return text or "Backup command failed."


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _fsync_file(path: Path) -> None:
    with path.open("rb") as handle:
        os.fsync(handle.fileno())


def _fsync_dir(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _write_json(path: Path, payload: dict, mode: int = 0o640) -> None:
    with path.open("x", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    path.chmod(mode)


def _atomic_status_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
    path.parent.chmod(0o750)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.partial")
    try:
        _write_json(temporary, payload)
        os.replace(temporary, path)
        path.chmod(0o640)
        _fsync_dir(path.parent)
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass


def _parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        raise BackupError("env_missing", f"Environment file is missing: {path}")
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, raw_value = line.split("=", 1)
        key = key.removeprefix("export ").strip()
        value = raw_value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        values[key] = value
    return values


def _allowlist_hash() -> str:
    payload = json.dumps(
        {
            "version": ALLOWLIST_VERSION,
            "includedRoots": INCLUDED_ROOTS,
            "excludedRoots": EXCLUDED_ROOTS,
            "excludedPatterns": EXCLUDED_PATTERNS,
        },
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def _is_sensitive_path(path: PurePosixPath) -> bool:
    name = path.name.lower()
    return (
        name == ".env"
        or name.startswith(".env.")
        or name.endswith(".env")
        or path.suffix.lower() in {".key", ".pem"}
        or name in {"credentials.json", "secrets.json"}
    )


def _real_directory(path: Path, *, code: str, label: str) -> os.stat_result:
    try:
        path_stat = path.lstat()
    except OSError as exc:
        raise BackupError(code, f"{label} is missing or inaccessible: {path}") from exc
    if stat.S_ISLNK(path_stat.st_mode) or not stat.S_ISDIR(path_stat.st_mode):
        raise BackupError(code, f"{label} must be a real directory: {path}")
    return path_stat


def _production_destination_check(root: Path, repo_root: Path) -> None:
    try:
        resolved_mount = ARCHIVE_MOUNT.resolve(strict=True)
    except OSError as exc:
        raise BackupError("archive_mount_missing", "/mnt/archive is not available.") from exc
    if not os.path.ismount(resolved_mount):
        raise BackupError("archive_mount_missing", "/mnt/archive is not a mount point.")
    mount_device = os.stat(resolved_mount).st_dev
    primary_device = os.stat(repo_root.resolve()).st_dev
    if mount_device == primary_device:
        raise BackupError("archive_same_device", "/mnt/archive is on the repository filesystem.")

    canonical_root = ARCHIVE_MOUNT.joinpath(*PRODUCTION_ROOT_PARTS).absolute()
    requested_root = root.absolute()
    if requested_root != canonical_root:
        raise BackupError(
            "archive_layout_unsafe",
            f"Production backup root must be exactly {canonical_root}.",
        )

    targets = (requested_root, *(requested_root / child for child in ARCHIVE_CHILDREN))
    resolved_root: Path | None = None
    for index, target in enumerate(targets):
        _real_directory(
            target,
            code="archive_layout_unsafe",
            label="Production backup root" if index == 0 else "Production backup directory",
        )
        try:
            resolved = target.resolve(strict=True)
        except OSError as exc:
            raise BackupError(
                "archive_layout_unsafe", f"Production backup path cannot be resolved: {target}"
            ) from exc
        if index == 0:
            resolved_root = resolved
            if (
                not _is_relative_to(resolved_root, resolved_mount)
                or resolved_root == resolved_mount
            ):
                raise BackupError(
                    "archive_layout_unsafe",
                    "Production backup root resolves outside the archive mount.",
                )
        elif resolved_root is None or resolved != resolved_root / target.name:
            raise BackupError(
                "archive_layout_unsafe",
                f"Production backup directory resolves outside the canonical root: {target}",
            )
        target_device = os.stat(resolved).st_dev
        if target_device != mount_device or target_device == primary_device:
            raise BackupError(
                "archive_layout_unsafe",
                f"Production backup path is not on the archive device: {target}",
            )

    assert resolved_root is not None
    for target in targets:
        probe = target / f".bwondercomics-write-probe-{uuid.uuid4().hex}.partial"
        try:
            fd = os.open(probe, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            try:
                os.write(fd, b"backup-write-probe\n")
                os.fsync(fd)
            finally:
                os.close(fd)
            _fsync_dir(target)
        except OSError as exc:
            raise BackupError(
                "archive_not_writable",
                f"Archive write probe failed for {target}: {exc.strerror or exc}",
            ) from exc
        finally:
            try:
                probe.unlink(missing_ok=True)
            except OSError:
                pass


def _prepare_root(root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True, mode=0o750)
    for directory in (
        root,
        *(root / child for child in ARCHIVE_CHILDREN),
    ):
        directory.mkdir(parents=True, exist_ok=True, mode=0o750)
        directory.chmod(0o750)


@contextmanager
def _archive_lock(root: Path, timeout: int = LOCK_TIMEOUT_SECONDS) -> Iterator[None]:
    lock_path = root / ".backup.lock"
    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o640)
    started = time.monotonic()
    try:
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError as exc:
                if time.monotonic() - started >= timeout:
                    raise BackupError(
                        "lock_timeout", f"Backup lock remained busy for {timeout} seconds."
                    ) from exc
                time.sleep(min(0.25, max(0.01, timeout / 20)))
        yield
    finally:
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
        finally:
            os.close(fd)


def _cleanup_stale_partials(root: Path, now: datetime) -> None:
    cutoff = now.timestamp() - (STALE_PARTIAL_HOURS * 3600)
    for path in root.glob(".staging-*.partial"):
        try:
            if path.lstat().st_mtime >= cutoff:
                continue
            if path.is_dir() and not path.is_symlink():
                shutil.rmtree(path)
            else:
                path.unlink(missing_ok=True)
        except OSError:
            continue


def _run_checked(
    argv: list[str],
    *,
    cwd: Path,
    stdin: BinaryIO | None = None,
    stdout: BinaryIO | int | None = subprocess.PIPE,
    timeout: int,
    error_code: str,
) -> subprocess.CompletedProcess:
    try:
        result = subprocess.run(
            argv,
            cwd=cwd,
            stdin=stdin,
            stdout=stdout,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise BackupError(error_code, _safe_message(str(exc))) from exc
    if result.returncode != 0:
        raise BackupError(error_code, _safe_message(result.stderr))
    return result


class BackupEngine:
    def __init__(
        self,
        *,
        repo_root: Path,
        backup_root: Path,
        status_dir: Path | None,
        require_archive_mount: bool,
        env_file: Path,
        compose_file: Path,
        lock_timeout_seconds: int = LOCK_TIMEOUT_SECONDS,
        now: Callable[[], datetime] = utc_now,
    ):
        self.repo_root = repo_root.resolve()
        self.backup_root = backup_root.absolute()
        self.status_dir = status_dir.resolve(strict=False) if status_dir else None
        self.require_archive_mount = require_archive_mount
        self.env_file = env_file.resolve(strict=False)
        self.compose_file = compose_file.resolve(strict=False)
        self.lock_timeout_seconds = lock_timeout_seconds
        self.now = now
        self._integrity: dict[str, dict] = {}
        self._verified_manifests: dict[str, list[dict]] = {}

    def run(self, kinds: tuple[str, ...]) -> list[PublishedArtifact]:
        preflight_started = {kind: self.now() for kind in kinds}
        try:
            if self.require_archive_mount:
                _production_destination_check(self.backup_root, self.repo_root)
            _prepare_root(self.backup_root)
        except BackupError as exc:
            for kind in kinds:
                self._record_attempt(kind, preflight_started[kind], error=exc)
            raise
        except Exception as exc:
            wrapped = BackupError("preflight_failed", _safe_message(str(exc)))
            for kind in kinds:
                self._record_attempt(kind, preflight_started[kind], error=wrapped)
            raise wrapped from exc
        published: list[PublishedArtifact] = []
        locked = False
        job_started = False
        try:
            with _archive_lock(self.backup_root, timeout=self.lock_timeout_seconds):
                locked = True
                self._recheck_production_layout()
                try:
                    _cleanup_stale_partials(self.backup_root, self.now())
                    self._cleanup_orphaned_sets(self.now())
                except OSError as exc:
                    raise BackupError("orphan_cleanup_failed", _safe_message(str(exc))) from exc
                for kind in kinds:
                    job_started = True
                    published.append(self._run_one(kind))
        except BackupError as exc:
            if not locked or not job_started:
                for kind in kinds:
                    self._record_attempt(kind, preflight_started[kind], error=exc)
            raise
        except Exception as exc:
            wrapped = BackupError("lock_failed", _safe_message(str(exc)))
            if not job_started:
                for kind in kinds:
                    self._record_attempt(kind, preflight_started[kind], error=wrapped)
            raise wrapped from exc
        return published

    def _run_one(self, kind: str) -> PublishedArtifact:
        started = self.now()
        result: PublishedArtifact | None = None
        failure_code = "internal_error"
        try:
            result = (
                self._create_database(started)
                if kind == "database"
                else self._create_files(started)
            )
            failure_code = "retention_failed"
            self._integrity[kind] = self._prune(kind, self.now())
            failure_code = "catalog_write_failed"
            self._write_catalog()
            failure_code = "status_write_failed"
            self._record_attempt(kind, started, result=result)
            return result
        except BackupError as exc:
            self._record_attempt(kind, started, result=result, error=exc)
            raise
        except Exception as exc:
            wrapped = BackupError(failure_code, _safe_message(str(exc)))
            if failure_code != "status_write_failed":
                self._record_attempt(kind, started, result=result, error=wrapped)
            raise wrapped from exc

    def _recheck_production_layout(self) -> None:
        if self.require_archive_mount:
            _production_destination_check(self.backup_root, self.repo_root)

    def _artifact_id(self, kind: str, started: datetime) -> str:
        timestamp = started.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        return f"{kind}-{timestamp}-{uuid.uuid4().hex[:12]}"

    def _staging_dir(self, artifact_id: str) -> Path:
        path = self.backup_root / f".staging-{artifact_id}-{uuid.uuid4().hex}.partial"
        path.mkdir(mode=0o700)
        path.chmod(0o700)
        return path

    def _compose_prefix(self) -> list[str]:
        return [
            "docker",
            "compose",
            "--env-file",
            str(self.env_file),
            "-f",
            str(self.compose_file),
            "exec",
            "-T",
            "bwondercomics-db",
        ]

    def _database_connection(self):
        try:
            import psycopg
        except ImportError as exc:  # pragma: no cover - deployment dependency guard
            raise BackupError(
                "database_driver_missing", "psycopg is required for database backups."
            ) from exc

        values = _parse_env_file(self.env_file)
        password = os.environ.get("BWC_DB_PASSWORD") or values.get("BWC_DB_PASSWORD", "")
        if not password:
            raise BackupError("database_credentials_missing", "BWC_DB_PASSWORD is not configured.")
        host = os.environ.get("BWC_DB_HOST", "127.0.0.1")
        if host == "bwondercomics-db":
            host = "127.0.0.1"
        port = int(os.environ.get("BWC_DB_PORT") or values.get("BWC_DB_PORT") or "5433")
        name = os.environ.get("BWC_DB_NAME") or values.get("BWC_DB_NAME") or "bwondercomics"
        user = os.environ.get("BWC_DB_USER") or values.get("BWC_DB_USER") or "bwondercomics"
        try:
            return psycopg.connect(host=host, port=port, dbname=name, user=user, password=password)
        except Exception as exc:
            raise BackupError("database_connect_failed", _safe_message(str(exc))) from exc

    def _create_database(self, started: datetime) -> PublishedArtifact:
        artifact_id = self._artifact_id("database", started)
        stage = self._staging_dir(artifact_id)
        partial = stage / f"{artifact_id}.dump.partial"
        try:
            with self._database_connection() as connection:
                with connection.transaction():
                    cursor = connection.cursor()
                    cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
                    cursor.execute("SELECT pg_export_snapshot()")
                    snapshot_id = str(cursor.fetchone()[0])
                    cursor.execute("SELECT current_database(), current_setting('server_version')")
                    database_name, server_version = cursor.fetchone()
                    cursor.execute("SELECT version_num FROM alembic_version")
                    alembic_version = str(cursor.fetchone()[0])
                    row_counts = {}
                    missing_tables = []
                    for table_name in CRITICAL_TABLES:
                        cursor.execute("SELECT to_regclass(%s)", (f"public.{table_name}",))
                        if cursor.fetchone()[0] is None:
                            missing_tables.append(table_name)
                            continue
                        cursor.execute(f'SELECT count(*) FROM "{table_name}"')
                        row_counts[table_name] = int(cursor.fetchone()[0])

                    with partial.open("xb") as output:
                        _run_checked(
                            self._compose_prefix()
                            + [
                                "sh",
                                "-c",
                                'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump --host=localhost --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --snapshot="$1"',
                                "backup",
                                snapshot_id,
                            ],
                            cwd=self.repo_root,
                            stdout=output,
                            timeout=7200,
                            error_code="dump_failed",
                        )
                        output.flush()
                        os.fsync(output.fileno())

            with partial.open("rb") as archive:
                listing = _run_checked(
                    self._compose_prefix() + ["pg_restore", "--list"],
                    cwd=self.repo_root,
                    stdin=archive,
                    timeout=600,
                    error_code="database_validation_failed",
                )
            if not _bounded(listing.stdout):
                raise BackupError(
                    "database_validation_failed", "pg_restore returned an empty archive listing."
                )
            version_result = _run_checked(
                self._compose_prefix() + ["pg_dump", "--version"],
                cwd=self.repo_root,
                timeout=60,
                error_code="database_version_failed",
            )
            client_version = _bounded(version_result.stdout, 256)
            client_match = re.search(r"\b(\d+)(?:\.\d+)+\b", client_version)
            server_match = re.match(r"(\d+)(?:\.\d+)+", str(server_version))
            if (
                not client_match
                or not server_match
                or client_match.group(1) != server_match.group(1)
                or client_match.group(1) != "16"
            ):
                raise BackupError(
                    "database_version_mismatch",
                    "Database backups require matching PostgreSQL 16 client and server versions.",
                )
            database_metadata = {
                "name": str(database_name),
                "clientVersion": client_version,
                "serverVersion": str(server_version),
                "alembicVersion": alembic_version,
                "criticalTableRowCounts": row_counts,
                "missingCriticalTables": missing_tables,
            }
            return self._publish(
                "database", artifact_id, partial, started, database=database_metadata
            )
        finally:
            shutil.rmtree(stage, ignore_errors=True)

    def _file_members(self) -> tuple[list[tuple[Path, str]], dict[str, int]]:
        members: list[tuple[Path, str]] = []
        root_file_counts = {root_name: 0 for root_name in INCLUDED_ROOTS}
        excluded = tuple(PurePosixPath(value) for value in EXCLUDED_ROOTS)
        for root_name in INCLUDED_ROOTS:
            source_root = self.repo_root / root_name
            try:
                source_stat = source_root.lstat()
            except FileNotFoundError as exc:
                if self.require_archive_mount:
                    raise BackupError(
                        "file_root_missing", f"Allowlisted source root is missing: {root_name}"
                    ) from exc
                continue
            except OSError as exc:
                raise BackupError(
                    "file_root_unsafe", f"Allowlisted source root is inaccessible: {root_name}"
                ) from exc
            if stat.S_ISLNK(source_stat.st_mode) or not stat.S_ISDIR(source_stat.st_mode):
                raise BackupError(
                    "file_root_unsafe",
                    f"Allowlisted source root must be a real directory: {root_name}",
                )
            if not os.access(source_root, os.R_OK | os.X_OK):
                raise BackupError(
                    "file_root_unsafe", f"Allowlisted source root is unreadable: {root_name}"
                )

            def walk_failed(exc: OSError) -> None:
                raise BackupError(
                    "file_walk_failed",
                    f"Unable to traverse allowlisted source root {root_name}: {_safe_message(str(exc))}",
                ) from exc

            for directory, dirnames, filenames in os.walk(
                source_root, followlinks=False, onerror=walk_failed
            ):
                current = Path(directory)
                safe_dirs = []
                for dirname in sorted(dirnames):
                    child = current / dirname
                    relative = PurePosixPath(child.relative_to(self.repo_root).as_posix())
                    if child.is_symlink():
                        raise BackupError(
                            "file_allowlist_unsafe", f"Symlink is not allowed: {relative}"
                        )
                    if any(relative == item or item in relative.parents for item in excluded):
                        continue
                    safe_dirs.append(dirname)
                dirnames[:] = safe_dirs
                for filename in sorted(filenames):
                    source = current / filename
                    relative = PurePosixPath(source.relative_to(self.repo_root).as_posix())
                    if any(relative == item or item in relative.parents for item in excluded):
                        continue
                    if _is_sensitive_path(relative):
                        continue
                    if source.is_symlink():
                        raise BackupError(
                            "file_allowlist_unsafe", f"Symlink is not allowed: {relative}"
                        )
                    if not source.is_file():
                        raise BackupError(
                            "file_allowlist_unsafe", f"Non-regular file is not allowed: {relative}"
                        )
                    members.append((source, relative.as_posix()))
                    root_file_counts[root_name] += 1
        members.sort(key=lambda item: item[1])
        return members, root_file_counts

    def _create_files(self, started: datetime) -> PublishedArtifact:
        artifact_id = self._artifact_id("files", started)
        stage = self._staging_dir(artifact_id)
        partial = stage / f"{artifact_id}.tar.gz.partial"
        try:
            members, root_file_counts = self._file_members()
            captured_sizes: dict[str, int] = {}
            with partial.open("xb") as raw_output:
                with tarfile.open(
                    fileobj=raw_output, mode="w:gz", format=tarfile.PAX_FORMAT
                ) as archive:
                    for source, relative in members:
                        try:
                            fd = os.open(
                                source,
                                os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0),
                            )
                        except OSError as exc:
                            raise BackupError(
                                "file_read_failed", f"Unable to open allowlisted file: {relative}"
                            ) from exc
                        try:
                            source_stat = os.fstat(fd)
                            if not stat.S_ISREG(source_stat.st_mode):
                                raise BackupError(
                                    "file_allowlist_unsafe",
                                    f"Non-regular file is not allowed: {relative}",
                                )
                            info = tarfile.TarInfo(relative)
                            info.size = int(source_stat.st_size)
                            info.mode = stat.S_IMODE(source_stat.st_mode)
                            info.mtime = int(source_stat.st_mtime)
                            info.uid = 0
                            info.gid = 0
                            info.uname = ""
                            info.gname = ""
                            with os.fdopen(fd, "rb", closefd=False) as source_handle:
                                archive.addfile(info, source_handle)
                            captured_sizes[relative] = info.size
                        finally:
                            os.close(fd)
                raw_output.flush()
                os.fsync(raw_output.fileno())

            expected = captured_sizes
            seen: dict[str, int] = {}
            try:
                with tarfile.open(partial, mode="r:gz") as archive:
                    for member in archive.getmembers():
                        path = PurePosixPath(member.name)
                        if path.is_absolute() or ".." in path.parts or not member.isfile():
                            raise BackupError(
                                "file_validation_failed", f"Unsafe archive member: {member.name}"
                            )
                        if member.name in seen:
                            raise BackupError(
                                "file_validation_failed", f"Duplicate archive member: {member.name}"
                            )
                        seen[member.name] = int(member.size)
            except (tarfile.TarError, OSError) as exc:
                raise BackupError("file_validation_failed", _safe_message(str(exc))) from exc
            if seen != expected:
                raise BackupError(
                    "file_validation_failed",
                    "Archive members do not match the durable-file allowlist.",
                )

            file_metadata = {
                "allowlistVersion": ALLOWLIST_VERSION,
                "allowlistSha256": _allowlist_hash(),
                "includedRoots": list(INCLUDED_ROOTS),
                "excludedRoots": list(EXCLUDED_ROOTS),
                "excludedPatterns": list(EXCLUDED_PATTERNS),
                "archiveMemberCount": len(seen),
                "fileCount": len(members),
                "rootFileCounts": root_file_counts,
                "uncompressedBytes": sum(expected.values()),
            }
            return self._publish("files", artifact_id, partial, started, files=file_metadata)
        finally:
            shutil.rmtree(stage, ignore_errors=True)

    def _publish(
        self, kind: str, artifact_id: str, partial: Path, started: datetime, **extra: dict
    ) -> PublishedArtifact:
        completed = self.now()
        config = KIND_CONFIG[kind]
        relative_artifact = Path(config["directory"]) / f"{artifact_id}{config['suffix']}"
        relative_checksum = Path("manifests") / f"{artifact_id}.sha256"
        relative_manifest = Path("manifests") / f"{artifact_id}.json"
        final_artifact = self.backup_root / relative_artifact
        final_checksum = self.backup_root / relative_checksum
        final_manifest = self.backup_root / relative_manifest
        checksum = _sha256_file(partial)
        partial.chmod(0o640)
        _fsync_file(partial)

        checksum_partial = partial.parent / f"{artifact_id}.sha256.partial"
        with checksum_partial.open("x", encoding="utf-8") as handle:
            handle.write(f"{checksum}  {relative_artifact.as_posix()}\n")
            handle.flush()
            os.fsync(handle.fileno())
        checksum_partial.chmod(0o640)

        validation_method = (
            "pg_restore --list" if kind == "database" else "tar member allowlist comparison"
        )
        manifest = {
            "schemaVersion": SCHEMA_VERSION,
            "artifactKind": kind,
            "artifactId": artifact_id,
            "startedAt": iso_z(started),
            "completedAt": iso_z(completed),
            "relativePath": relative_artifact.as_posix(),
            "checksumPath": relative_checksum.as_posix(),
            "sizeBytes": partial.stat().st_size,
            "sha256": checksum,
            "validation": {
                "method": validation_method,
                "result": "ok",
                "validatedAt": iso_z(completed),
            },
            **extra,
        }
        manifest_partial = partial.parent / f"{artifact_id}.json.partial"
        _write_json(manifest_partial, manifest)

        renamed: list[Path] = []
        try:
            self._recheck_production_layout()
            os.replace(partial, final_artifact)
            renamed.append(final_artifact)
            os.replace(checksum_partial, final_checksum)
            renamed.append(final_checksum)
            _fsync_dir(final_artifact.parent)
            _fsync_dir(final_checksum.parent)
            os.replace(manifest_partial, final_manifest)
            renamed.append(final_manifest)
            _fsync_dir(final_manifest.parent)
        except OSError as exc:
            for path in reversed(renamed):
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    pass
            raise BackupError("publication_failed", _safe_message(str(exc))) from exc
        return PublishedArtifact(kind=kind, artifact_id=artifact_id, manifest=manifest)

    def _validated_manifests(self, kind: str | None = None) -> list[dict]:
        results = []
        for path in sorted((self.backup_root / "manifests").glob("*.json")):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                artifact_kind = payload.get("artifactKind")
                if (
                    payload.get("schemaVersion") != SCHEMA_VERSION
                    or artifact_kind not in KIND_CONFIG
                ):
                    continue
                if kind and artifact_kind != kind:
                    continue
                artifact_id = str(payload.get("artifactId") or "")
                if path.name != f"{artifact_id}.json":
                    continue
                artifact = self.backup_root / str(payload["relativePath"])
                checksum_path = self.backup_root / str(payload["checksumPath"])
                expected_artifact = (
                    self.backup_root
                    / KIND_CONFIG[artifact_kind]["directory"]
                    / f"{artifact_id}{KIND_CONFIG[artifact_kind]['suffix']}"
                )
                expected_checksum = self.backup_root / "manifests" / f"{artifact_id}.sha256"
                if (
                    artifact.resolve(strict=False) != expected_artifact.resolve(strict=False)
                    or checksum_path.resolve(strict=False)
                    != expected_checksum.resolve(strict=False)
                    or not _is_relative_to(artifact.resolve(strict=False), self.backup_root)
                    or not _is_relative_to(checksum_path.resolve(strict=False), self.backup_root)
                ):
                    continue
                if not artifact.is_file() or not checksum_path.is_file():
                    continue
                digest = str(payload.get("sha256") or "")
                validation = payload.get("validation")
                if (
                    not re.fullmatch(r"[0-9a-f]{64}", digest)
                    or not isinstance(validation, dict)
                    or validation.get("result") != "ok"
                ):
                    continue
                results.append(payload)
            except (OSError, ValueError, KeyError, TypeError):
                continue
        results.sort(key=lambda item: str(item.get("completedAt") or ""), reverse=True)
        return results

    def _manifest_bytes_are_valid(self, payload: dict) -> bool:
        try:
            artifact = self.backup_root / str(payload["relativePath"])
            checksum_path = self.backup_root / str(payload["checksumPath"])
            digest = str(payload["sha256"])
            expected_line = f"{digest}  {payload['relativePath']}\n"
            completed = datetime.fromisoformat(str(payload["completedAt"]).replace("Z", "+00:00"))
            if completed.tzinfo is None:
                return False
            if not stat.S_ISREG(artifact.lstat().st_mode) or not stat.S_ISREG(
                checksum_path.lstat().st_mode
            ):
                return False
            if artifact.stat().st_size != int(payload["sizeBytes"]):
                return False
            if checksum_path.read_text(encoding="utf-8") != expected_line:
                return False
            return _sha256_file(artifact) == digest
        except (OSError, UnicodeError, KeyError, TypeError, ValueError):
            return False

    def _inspect_integrity(self, kind: str) -> tuple[list[dict], dict]:
        manifests = self._validated_manifests(kind)
        examined = manifests[:CATALOG_LIMIT]
        verified: list[dict] = []
        corrupt_ids: list[str] = []
        for payload in examined:
            if self._manifest_bytes_are_valid(payload):
                verified.append(payload)
            else:
                corrupt_ids.append(str(payload.get("artifactId") or ""))
        integrity = {
            "examinedSets": len(examined),
            "verifiedSets": len(verified),
            "corruptSets": len(corrupt_ids),
            "scanLimit": CATALOG_LIMIT,
            "scanComplete": len(manifests) <= CATALOG_LIMIT,
            "availableManifestSets": len(manifests),
        }
        return verified, integrity

    def _cleanup_orphaned_sets(self, now: datetime) -> None:
        cutoff = now.timestamp() - (STALE_PARTIAL_HOURS * 3600)
        valid_ids = {str(item["artifactId"]) for item in self._validated_manifests()}
        commit_marker_ids = {
            path.name.removesuffix(".json")
            for path in (self.backup_root / "manifests").glob("*.json")
            if path.name.startswith(("database-", "files-"))
        }
        candidates: dict[str, list[Path]] = {}
        patterns = (
            (self.backup_root / "database", "database-*.dump", ".dump"),
            (self.backup_root / "files", "files-*.tar.gz", ".tar.gz"),
            (self.backup_root / "manifests", "*.sha256", ".sha256"),
            (self.backup_root / "manifests", "*.json", ".json"),
        )
        for directory, pattern, suffix in patterns:
            for path in directory.glob(pattern):
                artifact_id = path.name[: -len(suffix)]
                if not artifact_id.startswith(("database-", "files-")):
                    continue
                candidates.setdefault(artifact_id, []).append(path)
        for artifact_id, paths in candidates.items():
            if (
                artifact_id in valid_ids
                or artifact_id in commit_marker_ids
                or any(path.stat().st_mtime >= cutoff for path in paths)
            ):
                continue
            paths.sort(key=lambda path: 0 if path.suffix == ".json" else 1)
            touched_dirs = set()
            for path in paths:
                path.unlink(missing_ok=True)
                touched_dirs.add(path.parent)
            for directory in touched_dirs:
                _fsync_dir(directory)

    def _prune(self, kind: str, now: datetime) -> dict:
        policy = RETENTION[kind]
        manifests, integrity = self._inspect_integrity(kind)
        self._integrity[kind] = integrity
        self._verified_manifests[kind] = manifests
        if not integrity["scanComplete"] and len(manifests) < policy["minimum"]:
            raise BackupError(
                "retention_integrity_failed",
                f"Unable to prove the protected {kind} retention floor within "
                f"{CATALOG_LIMIT} examined sets.",
            )
        cutoff = now - timedelta(days=policy["days"])
        deletion_candidates = []
        for index, payload in enumerate(manifests):
            if index < policy["minimum"]:
                continue
            try:
                completed = datetime.fromisoformat(
                    str(payload["completedAt"]).replace("Z", "+00:00")
                )
            except (ValueError, TypeError):
                continue
            if completed >= cutoff:
                continue
            deletion_candidates.append(payload)

        if deletion_candidates:
            self._recheck_production_layout()
        for payload in deletion_candidates:
            artifact_id = str(payload["artifactId"])
            manifest_path = self.backup_root / "manifests" / f"{artifact_id}.json"
            checksum_path = self.backup_root / str(payload["checksumPath"])
            artifact_path = self.backup_root / str(payload["relativePath"])
            manifest_path.unlink(missing_ok=True)
            _fsync_dir(manifest_path.parent)
            checksum_path.unlink(missing_ok=True)
            artifact_path.unlink(missing_ok=True)
        integrity["deletedSets"] = len(deletion_candidates)
        if deletion_candidates:
            deleted_ids = {str(payload["artifactId"]) for payload in deletion_candidates}
            self._verified_manifests[kind] = [
                payload for payload in manifests if str(payload["artifactId"]) not in deleted_ids
            ]
        return integrity

    def _record_attempt(
        self,
        kind: str,
        started: datetime,
        *,
        result: PublishedArtifact | None = None,
        error: BackupError | None = None,
    ) -> None:
        if self.status_dir is None:
            return
        path = self.status_dir / f"{kind}.json"
        previous: dict = {}
        try:
            previous = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
        except (OSError, ValueError):
            previous = {}
        finished = self.now()
        attempt = {
            "startedAt": iso_z(started),
            "finishedAt": iso_z(finished),
            "status": "error" if error else "ok",
            "errorCode": error.code if error else None,
        }
        if error:
            attempt["message"] = _safe_message(str(error))
        if result:
            attempt.update(
                {
                    "artifactId": result.artifact_id,
                    "validation": result.manifest["validation"],
                }
            )
        history = [attempt, *(previous.get("history") or [])][:STATUS_HISTORY_LIMIT]
        payload = {
            "schemaVersion": SCHEMA_VERSION,
            "kind": kind,
            "updatedAt": iso_z(finished),
            "lastAttempt": attempt,
            "lastSuccess": (
                {
                    "artifactId": result.artifact_id,
                    "completedAt": result.manifest["completedAt"],
                    "relativePath": result.manifest["relativePath"],
                    "sizeBytes": result.manifest["sizeBytes"],
                    "sha256": result.manifest["sha256"],
                    "validation": result.manifest["validation"],
                }
                if result
                else previous.get("lastSuccess")
            ),
            "history": history,
        }
        _atomic_status_json(path, payload)

    def _write_catalog(self) -> None:
        if self.status_dir is None:
            return
        grouped = {"database": [], "files": []}
        validated_counts = {"database": 0, "files": 0}
        integrity = {}
        for kind in grouped:
            manifests = self._verified_manifests.get(kind)
            if manifests is None:
                manifests, kind_integrity = self._inspect_integrity(kind)
                self._verified_manifests[kind] = manifests
                self._integrity[kind] = kind_integrity
            integrity[kind] = self._integrity[kind]
            validated_counts[kind] = len(manifests)
            for payload in manifests[:CATALOG_LIMIT]:
                grouped[kind].append(
                    {
                        "artifactId": payload["artifactId"],
                        "name": Path(str(payload["relativePath"])).name,
                        "relativePath": payload["relativePath"],
                        "createdAt": payload["completedAt"],
                        "sizeBytes": payload["sizeBytes"],
                        "sha256": payload["sha256"],
                        "validation": payload["validation"],
                    }
                )
        _atomic_status_json(
            self.status_dir / "catalog.json",
            {
                "schemaVersion": SCHEMA_VERSION,
                "root": str(self.backup_root),
                "updatedAt": iso_z(self.now()),
                "database": grouped["database"],
                "files": grouped["files"],
                "validatedCounts": {
                    "database": validated_counts["database"],
                    "files": validated_counts["files"],
                    "total": validated_counts["database"] + validated_counts["files"],
                },
                "integrity": integrity,
            },
        )


def _bool_env(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _nonnegative_int_env(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = int(raw.strip())
    except ValueError as exc:
        raise BackupError(
            "configuration_invalid", f"{name} must be a nonnegative integer."
        ) from exc
    if value < 0:
        raise BackupError("configuration_invalid", f"{name} must be a nonnegative integer.")
    return value


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("database", "files", "all"))
    return parser


def main(argv: list[str] | None = None) -> int:
    os.umask(0o027)
    args = build_parser().parse_args(argv)
    repo_root = Path(os.environ.get("BWC_REPO_ROOT") or Path(__file__).resolve().parents[1])
    backup_root = Path(os.environ.get("BACKUP_DIR") or repo_root / "var" / "backups")
    status_raw = os.environ.get("BACKUP_STATUS_DIR", "").strip()
    kinds = ("database", "files") if args.command == "all" else (args.command,)
    try:
        engine = BackupEngine(
            repo_root=repo_root,
            backup_root=backup_root,
            status_dir=Path(status_raw) if status_raw else None,
            require_archive_mount=_bool_env("REQUIRE_ARCHIVE_MOUNT"),
            env_file=Path(os.environ.get("ENV_FILE") or repo_root / "deploy" / "bwondercomics.env"),
            compose_file=Path(
                os.environ.get("COMPOSE_FILE") or repo_root / "deploy" / "bwondercomics-compose.yml"
            ),
            lock_timeout_seconds=_nonnegative_int_env(
                "BACKUP_LOCK_TIMEOUT_SECONDS", LOCK_TIMEOUT_SECONDS
            ),
        )
        results = engine.run(kinds)
    except BackupError as exc:
        print(f"ERROR [{exc.code}]: {exc}", file=sys.stderr)
        return LOCK_CONTENTION_EXIT_CODE if exc.code == "lock_timeout" else 1
    except Exception as exc:  # pragma: no cover - final operational safety net
        print(f"ERROR [internal_error]: {_safe_message(str(exc))}", file=sys.stderr)
        return 1
    for result in results:
        print(f"Published {result.artifact_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
