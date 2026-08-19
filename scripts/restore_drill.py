#!/usr/bin/env python3
"""Verify backup artifacts through isolated database and file restore drills."""

from __future__ import annotations

import argparse
import getpass
import json
import re
import secrets
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import BinaryIO, Sequence

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts import backup_artifacts as backup  # noqa: E402

DEFAULT_ARCHIVE_ROOT = Path("/mnt/archive/backups/bwondercomics")
POSTGRES_IMAGE = "postgres:16-alpine"
SCRATCH_DATABASE = "bwc_restore_drill"
SCRATCH_USER = "bwc_drill"
DRILL_LOG_SCHEMA_VERSION = 1
ARTIFACT_ID_PATTERN = re.compile(r"(database|files)-\d{8}T\d{6}Z-[0-9a-f]{12}")
SNAPSHOT_CONSTRAINTS = {
    "builder_page_snapshots_pkey",
    "ck_builder_page_snapshots_payload_version",
    "ck_builder_page_snapshots_scope",
    "ck_builder_page_snapshots_scope_series_id",
    "fk_builder_page_snapshots_created_by_user_id",
}
SNAPSHOT_INDEXES = {
    "ix_builder_page_snapshots_created_at",
    "ix_builder_page_snapshots_page_created_at",
    "ix_builder_page_snapshots_scope_series_created_at",
}


class DrillError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class ArtifactSet:
    kind: str
    artifact_id: str
    manifest: dict
    manifest_path: Path
    artifact_path: Path
    checksum_path: Path


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_z(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _safe_message(value: object) -> str:
    return backup._safe_message(value if isinstance(value, (str, bytes)) else str(value))


def _regular_file(path: Path, *, code: str, label: str) -> None:
    try:
        path_stat = path.lstat()
    except OSError as exc:
        raise DrillError(code, f"{label} is missing or inaccessible.") from exc
    if not stat.S_ISREG(path_stat.st_mode):
        raise DrillError(code, f"{label} must be a regular file.")


def _safe_relative_path(value: object, *, code: str, label: str) -> PurePosixPath:
    path = PurePosixPath(str(value or ""))
    if not path.parts or path.is_absolute() or ".." in path.parts or "." in path.parts:
        raise DrillError(code, f"{label} is unsafe.")
    return path


def load_artifact(archive_root: Path, kind: str, artifact_id: str) -> ArtifactSet:
    archive_root = archive_root.resolve(strict=True)
    if kind not in backup.KIND_CONFIG:
        raise DrillError("manifest_invalid", "Unsupported artifact kind.")
    if not ARTIFACT_ID_PATTERN.fullmatch(artifact_id) or not artifact_id.startswith(f"{kind}-"):
        raise DrillError("artifact_id_invalid", "Artifact ID does not match the requested kind.")

    config = backup.KIND_CONFIG[kind]
    expected_relative = PurePosixPath(config["directory"], f"{artifact_id}{config['suffix']}")
    expected_checksum = PurePosixPath("manifests", f"{artifact_id}.sha256")
    manifest_path = archive_root / "manifests" / f"{artifact_id}.json"
    _regular_file(manifest_path, code="manifest_missing", label="Artifact manifest")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, ValueError) as exc:
        raise DrillError("manifest_invalid", "Artifact manifest is not valid JSON.") from exc

    if (
        manifest.get("schemaVersion") != backup.SCHEMA_VERSION
        or manifest.get("artifactKind") != kind
        or manifest.get("artifactId") != artifact_id
        or not isinstance(manifest.get("validation"), dict)
        or manifest["validation"].get("result") != "ok"
    ):
        raise DrillError("manifest_invalid", "Artifact manifest contract is invalid.")

    relative = _safe_relative_path(
        manifest.get("relativePath"), code="manifest_invalid", label="Artifact path"
    )
    checksum_relative = _safe_relative_path(
        manifest.get("checksumPath"), code="manifest_invalid", label="Checksum path"
    )
    if relative != expected_relative or checksum_relative != expected_checksum:
        raise DrillError("manifest_invalid", "Artifact manifest paths do not match its ID.")

    artifact_path = archive_root.joinpath(*relative.parts)
    checksum_path = archive_root.joinpath(*checksum_relative.parts)
    _regular_file(artifact_path, code="artifact_missing", label="Backup artifact")
    _regular_file(checksum_path, code="checksum_missing", label="Checksum file")

    digest = str(manifest.get("sha256") or "")
    if not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise DrillError("manifest_invalid", "Artifact checksum metadata is invalid.")
    try:
        expected_size = int(manifest["sizeBytes"])
    except (KeyError, TypeError, ValueError) as exc:
        raise DrillError("manifest_invalid", "Artifact size metadata is invalid.") from exc
    if artifact_path.stat().st_size != expected_size:
        raise DrillError("artifact_size_mismatch", "Artifact size does not match its manifest.")

    expected_line = f"{digest}  {relative.as_posix()}\n"
    try:
        checksum_line = checksum_path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise DrillError("checksum_invalid", "Checksum file is unreadable.") from exc
    if checksum_line != expected_line:
        raise DrillError("checksum_invalid", "Checksum file does not match the manifest.")
    if backup._sha256_file(artifact_path) != digest:
        raise DrillError("checksum_mismatch", "Artifact SHA-256 verification failed.")

    if kind == "database":
        _validate_database_manifest(manifest)
    else:
        _validate_file_manifest(manifest)
    return ArtifactSet(
        kind=kind,
        artifact_id=artifact_id,
        manifest=manifest,
        manifest_path=manifest_path,
        artifact_path=artifact_path,
        checksum_path=checksum_path,
    )


def _validate_database_manifest(manifest: dict) -> None:
    metadata = manifest.get("database")
    if not isinstance(metadata, dict):
        raise DrillError("manifest_invalid", "Database metadata is missing.")
    counts = metadata.get("criticalTableRowCounts")
    missing = metadata.get("missingCriticalTables")
    if (
        not isinstance(metadata.get("alembicVersion"), str)
        or not metadata["alembicVersion"]
        or missing != []
        or not isinstance(counts, dict)
        or set(counts) != set(backup.CRITICAL_TABLES)
        or any(not isinstance(value, int) or value < 0 for value in counts.values())
    ):
        raise DrillError(
            "database_manifest_incomplete",
            "Database drill requires a current artifact with every critical table.",
        )


def _validate_file_manifest(manifest: dict) -> None:
    metadata = manifest.get("files")
    if not isinstance(metadata, dict):
        raise DrillError("manifest_invalid", "File metadata is missing.")
    root_counts = metadata.get("rootFileCounts")
    if (
        metadata.get("allowlistVersion") != backup.ALLOWLIST_VERSION
        or metadata.get("allowlistSha256") != backup._allowlist_hash()
        or metadata.get("includedRoots") != list(backup.INCLUDED_ROOTS)
        or metadata.get("excludedRoots") != list(backup.EXCLUDED_ROOTS)
        or metadata.get("excludedPatterns") != list(backup.EXCLUDED_PATTERNS)
        or not isinstance(root_counts, dict)
        or set(root_counts) != set(backup.INCLUDED_ROOTS)
        or any(not isinstance(value, int) or value < 0 for value in root_counts.values())
        or metadata.get("fileCount") != sum(root_counts.values())
        or metadata.get("archiveMemberCount") != metadata.get("fileCount")
        or not isinstance(metadata.get("uncompressedBytes"), int)
        or metadata["uncompressedBytes"] < 0
    ):
        raise DrillError("file_manifest_incomplete", "File manifest allowlist metadata is invalid.")


def _run_process(
    argv: Sequence[str],
    *,
    error_code: str,
    timeout: int,
    stdin: BinaryIO | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess[bytes]:
    try:
        result = subprocess.run(
            list(argv),
            stdin=stdin,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise DrillError(error_code, _safe_message(exc)) from exc
    if check and result.returncode != 0:
        message = _safe_message(result.stderr or result.stdout)
        raise DrillError(error_code, message)
    return result


def _wait_for_postgres(container: str, timeout: int = 60) -> None:
    deadline = time.monotonic() + timeout
    command = [
        "docker",
        "exec",
        container,
        "pg_isready",
        "--username",
        SCRATCH_USER,
        "--dbname",
        "postgres",
    ]
    while time.monotonic() < deadline:
        if (
            _run_process(
                command,
                error_code="scratch_start_failed",
                timeout=10,
                check=False,
            ).returncode
            == 0
        ):
            return
        time.sleep(1)
    raise DrillError("scratch_start_failed", "Scratch PostgreSQL did not become ready.")


def _verification_sql() -> str:
    counts = ", ".join(
        f"'{table}', (SELECT count(*) FROM \"{table}\")" for table in backup.CRITICAL_TABLES
    )
    return f"""
SELECT json_build_object(
  'serverVersion', current_setting('server_version'),
  'alembicVersion', (SELECT version_num FROM alembic_version),
  'criticalTableRowCounts', json_build_object({counts}),
  'snapshotPayloads', (
    SELECT json_build_object(
      'total', count(*),
      'readable', count(*) FILTER (
        WHERE payload_version > 0
          AND json_typeof(payload) = 'object'
          AND payload->>'snapshotVersion' = payload_version::text
          AND json_typeof(payload->'page') = 'object'
          AND json_typeof(payload->'bindings') = 'array'
      )
    )
    FROM builder_page_snapshots
  ),
  'builderGraph', json_build_object(
    'pages', (SELECT count(*) FROM builder_pages),
    'sections', (SELECT count(*) FROM builder_sections),
    'modules', (SELECT count(*) FROM builder_modules),
    'orderedProbePages', (
      SELECT count(*) FROM (
        SELECT bp.id
        FROM builder_pages bp
        LEFT JOIN builder_sections bs ON bs.page_id = bp.id
        LEFT JOIN builder_modules bm ON bm.section_id = bs.id
        GROUP BY bp.id
        ORDER BY min(bp.sort_index), bp.id
        LIMIT 5
      ) probe
    )
  ),
  'snapshotConstraints', (
    SELECT coalesce(json_agg(conname ORDER BY conname), '[]'::json)
    FROM pg_constraint
    WHERE conrelid = 'builder_page_snapshots'::regclass
  ),
  'snapshotIndexes', (
    SELECT coalesce(json_agg(indexname ORDER BY indexname), '[]'::json)
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'builder_page_snapshots'
  )
)::text;
""".strip()


def _decode_json_output(result: subprocess.CompletedProcess[bytes]) -> dict:
    try:
        value = json.loads(result.stdout.decode("utf-8").strip())
    except (UnicodeError, ValueError) as exc:
        raise DrillError(
            "database_verification_failed", "Scratch verification was not JSON."
        ) from exc
    if not isinstance(value, dict):
        raise DrillError("database_verification_failed", "Scratch verification shape is invalid.")
    return value


def _check_database_verification(artifact: ArtifactSet, verification: dict) -> dict:
    expected_counts = artifact.manifest["database"]["criticalTableRowCounts"]
    actual_counts = verification.get("criticalTableRowCounts")
    snapshot_payloads = verification.get("snapshotPayloads")
    graph = verification.get("builderGraph")
    constraints = set(verification.get("snapshotConstraints") or [])
    indexes = set(verification.get("snapshotIndexes") or [])
    if not str(verification.get("serverVersion") or "").startswith("16."):
        raise DrillError("database_version_mismatch", "Scratch server is not PostgreSQL 16.")
    if verification.get("alembicVersion") != artifact.manifest["database"]["alembicVersion"]:
        raise DrillError("database_verification_failed", "Restored Alembic version does not match.")
    if actual_counts != expected_counts:
        raise DrillError(
            "database_verification_failed", "Restored critical row counts do not match."
        )
    if not isinstance(snapshot_payloads, dict) or snapshot_payloads.get(
        "total"
    ) != snapshot_payloads.get("readable"):
        raise DrillError("database_verification_failed", "Snapshot payload verification failed.")
    if (
        not isinstance(graph, dict)
        or graph.get("pages") != expected_counts["builder_pages"]
        or graph.get("sections") != expected_counts["builder_sections"]
        or graph.get("modules") != expected_counts["builder_modules"]
        or graph.get("orderedProbePages") != min(expected_counts["builder_pages"], 5)
    ):
        raise DrillError("database_verification_failed", "Builder graph verification failed.")
    if not SNAPSHOT_CONSTRAINTS.issubset(constraints) or not SNAPSHOT_INDEXES.issubset(indexes):
        raise DrillError("database_verification_failed", "Snapshot schema verification failed.")
    return {
        "postgresMajor": 16,
        "alembicVersion": verification["alembicVersion"],
        "criticalTables": len(actual_counts),
        "criticalRowCountsMatched": True,
        "builderGraphLoaded": True,
        "snapshotPayloads": snapshot_payloads,
        "snapshotSchemaVerified": True,
        "analyzed": True,
    }


def run_database_drill(artifact: ArtifactSet) -> dict:
    started = utc_now()
    container = f"bwc-restore-drill-{uuid.uuid4().hex[:12]}"
    password = secrets.token_urlsafe(24)
    created = False
    cleanup_error: DrillError | None = None
    verification_summary: dict | None = None
    try:
        _run_process(
            [
                "docker",
                "run",
                "--detach",
                "--pull=never",
                "--name",
                container,
                "--network",
                "none",
                "--env",
                f"POSTGRES_PASSWORD={password}",
                "--env",
                f"POSTGRES_USER={SCRATCH_USER}",
                "--env",
                "POSTGRES_DB=postgres",
                POSTGRES_IMAGE,
            ],
            error_code="scratch_start_failed",
            timeout=120,
        )
        created = True
        _wait_for_postgres(container)
        _run_process(
            [
                "docker",
                "exec",
                container,
                "createdb",
                "--username",
                SCRATCH_USER,
                "--template",
                "template0",
                SCRATCH_DATABASE,
            ],
            error_code="scratch_database_failed",
            timeout=60,
        )
        with artifact.artifact_path.open("rb") as archive:
            _run_process(
                [
                    "docker",
                    "exec",
                    "--interactive",
                    container,
                    "pg_restore",
                    "--exit-on-error",
                    "--single-transaction",
                    "--no-owner",
                    "--no-privileges",
                    "--no-tablespaces",
                    "--username",
                    SCRATCH_USER,
                    "--dbname",
                    SCRATCH_DATABASE,
                ],
                stdin=archive,
                error_code="database_restore_failed",
                timeout=7200,
            )
        _run_process(
            [
                "docker",
                "exec",
                container,
                "psql",
                "--no-psqlrc",
                "--set=ON_ERROR_STOP=1",
                "--username",
                SCRATCH_USER,
                "--dbname",
                SCRATCH_DATABASE,
                "--command=ANALYZE",
            ],
            error_code="database_analyze_failed",
            timeout=600,
        )
        verification = _decode_json_output(
            _run_process(
                [
                    "docker",
                    "exec",
                    container,
                    "psql",
                    "--no-psqlrc",
                    "--tuples-only",
                    "--no-align",
                    "--set=ON_ERROR_STOP=1",
                    "--username",
                    SCRATCH_USER,
                    "--dbname",
                    SCRATCH_DATABASE,
                    f"--command={_verification_sql()}",
                ],
                error_code="database_verification_failed",
                timeout=600,
            )
        )
        verification_summary = _check_database_verification(artifact, verification)
    finally:
        if created:
            try:
                _run_process(
                    ["docker", "rm", "--force", "--volumes", container],
                    error_code="scratch_cleanup_failed",
                    timeout=120,
                )
            except DrillError as exc:
                cleanup_error = exc
        if cleanup_error is not None:
            raise cleanup_error
    if verification_summary is None:
        raise DrillError("database_verification_failed", "Database drill produced no result.")
    finished = utc_now()
    return {
        "kind": "database",
        "artifactId": artifact.artifact_id,
        "sha256": artifact.manifest["sha256"],
        "startedAt": iso_z(started),
        "finishedAt": iso_z(finished),
        "durationSeconds": round((finished - started).total_seconds(), 3),
        "scratch": {
            "image": POSTGRES_IMAGE,
            "network": "none",
            "database": "fixed-isolated-scratch",
            "containerAndVolumeRemoved": True,
        },
        "verification": verification_summary,
    }


def _member_root(path: PurePosixPath) -> str | None:
    for root in backup.INCLUDED_ROOTS:
        root_path = PurePosixPath(root)
        if path == root_path or root_path in path.parents:
            return root
    return None


def run_file_drill(artifact: ArtifactSet) -> dict:
    started = utc_now()
    scratch = Path(tempfile.mkdtemp(prefix="bwc-file-restore-drill-"))
    extracted: dict[str, int] = {}
    root_counts = {root: 0 for root in backup.INCLUDED_ROOTS}
    try:
        try:
            with tarfile.open(artifact.artifact_path, mode="r:gz") as archive:
                for member in archive.getmembers():
                    path = PurePosixPath(member.name)
                    root = _member_root(path)
                    if (
                        path.is_absolute()
                        or ".." in path.parts
                        or "." in path.parts
                        or not member.isfile()
                        or member.name in extracted
                        or root is None
                        or backup._is_sensitive_path(path)
                    ):
                        raise DrillError(
                            "file_restore_unsafe", f"Unsafe archive member: {member.name}"
                        )
                    target = scratch.joinpath(*path.parts)
                    if not backup._is_relative_to(target.resolve(strict=False), scratch):
                        raise DrillError(
                            "file_restore_unsafe", f"Unsafe archive member: {member.name}"
                        )
                    target.parent.mkdir(parents=True, exist_ok=True)
                    source = archive.extractfile(member)
                    if source is None:
                        raise DrillError(
                            "file_restore_failed", f"Archive member is unreadable: {member.name}"
                        )
                    with source, target.open("xb") as output:
                        shutil.copyfileobj(source, output)
                    target.chmod(0o600)
                    size = target.stat().st_size
                    if size != member.size:
                        raise DrillError(
                            "file_restore_failed", f"Extracted size mismatch: {member.name}"
                        )
                    extracted[member.name] = size
                    root_counts[root] += 1
        except (OSError, tarfile.TarError) as exc:
            raise DrillError("file_restore_failed", _safe_message(exc)) from exc

        metadata = artifact.manifest["files"]
        if (
            len(extracted) != metadata["fileCount"]
            or sum(extracted.values()) != metadata["uncompressedBytes"]
            or root_counts != metadata["rootFileCounts"]
        ):
            raise DrillError("file_verification_failed", "Extracted file metadata does not match.")
        disk_files = {
            path.relative_to(scratch).as_posix(): path.stat().st_size
            for path in scratch.rglob("*")
            if path.is_file() and not path.is_symlink()
        }
        if disk_files != extracted:
            raise DrillError("file_verification_failed", "Temporary tree contents do not match.")
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
        if scratch.exists():
            raise DrillError("file_cleanup_failed", "Temporary restore tree was not removed.")
    finished = utc_now()
    return {
        "kind": "files",
        "artifactId": artifact.artifact_id,
        "sha256": artifact.manifest["sha256"],
        "startedAt": iso_z(started),
        "finishedAt": iso_z(finished),
        "durationSeconds": round((finished - started).total_seconds(), 3),
        "scratch": {"temporaryTreeRemoved": True},
        "verification": {
            "allowlistVersion": artifact.manifest["files"]["allowlistVersion"],
            "fileCount": len(extracted),
            "uncompressedBytes": sum(extracted.values()),
            "rootFileCounts": root_counts,
            "memberPathsSafe": True,
            "sensitivePatternsAbsent": True,
        },
    }


def _operator_name(value: str | None) -> str:
    operator = (value or getpass.getuser() or "unknown").strip()
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", operator):
        raise DrillError("operator_invalid", "Operator must be a non-sensitive account label.")
    return operator


def _write_drill_log(archive_root: Path, payload: dict) -> Path:
    log_dir = archive_root / "drill-logs"
    log_dir.mkdir(mode=0o750, parents=False, exist_ok=True)
    log_dir.chmod(0o750)
    log_path = log_dir / f"{payload['drillId']}.json"
    backup._write_json(log_path, payload)
    return log_path


def run_selected(
    *,
    command: str,
    archive_root: Path,
    database_artifact_id: str | None,
    file_artifact_id: str | None,
    operator: str | None,
) -> tuple[dict, Path]:
    archive_root = archive_root.resolve(strict=True)
    started = utc_now()
    drill_id = f"restore-drill-{started:%Y%m%dT%H%M%SZ}-{uuid.uuid4().hex[:12]}"
    results: list[dict] = []
    error_payload: dict | None = None
    try:
        if command in {"database", "all"}:
            if not database_artifact_id:
                raise DrillError("artifact_required", "Database artifact ID is required.")
            results.append(
                run_database_drill(load_artifact(archive_root, "database", database_artifact_id))
            )
        if command in {"files", "all"}:
            if not file_artifact_id:
                raise DrillError("artifact_required", "File artifact ID is required.")
            results.append(run_file_drill(load_artifact(archive_root, "files", file_artifact_id)))
        status = "ok"
    except DrillError as exc:
        status = "error"
        error_payload = {"code": exc.code, "message": _safe_message(exc)}
    finished = utc_now()
    payload = {
        "schemaVersion": DRILL_LOG_SCHEMA_VERSION,
        "drillId": drill_id,
        "status": status,
        "operator": _operator_name(operator),
        "startedAt": iso_z(started),
        "finishedAt": iso_z(finished),
        "durationSeconds": round((finished - started).total_seconds(), 3),
        "mode": command,
        "results": results,
    }
    if error_payload is not None:
        payload["error"] = error_payload
    log_path = _write_drill_log(archive_root, payload)
    if error_payload is not None:
        raise DrillError(error_payload["code"], f"{error_payload['message']} Log: {log_path}")
    return payload, log_path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Restore validated artifacts into isolated scratch targets."
    )
    parser.add_argument(
        "command",
        choices=("database", "files", "all"),
        help="Drill kind to run.",
    )
    parser.add_argument(
        "--archive-root",
        type=Path,
        default=DEFAULT_ARCHIVE_ROOT,
        help="Manifest-backed archive root.",
    )
    parser.add_argument("--database-artifact-id", help="Validated database artifact ID.")
    parser.add_argument("--file-artifact-id", help="Validated file artifact ID.")
    parser.add_argument("--operator", help="Non-sensitive operator account label.")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        payload, log_path = run_selected(
            command=args.command,
            archive_root=args.archive_root,
            database_artifact_id=args.database_artifact_id,
            file_artifact_id=args.file_artifact_id,
            operator=args.operator,
        )
    except (DrillError, OSError) as exc:
        code = exc.code if isinstance(exc, DrillError) else "drill_failed"
        print(f"ERROR [{code}]: {_safe_message(exc)}", file=sys.stderr)
        return 1
    artifact_ids = ", ".join(result["artifactId"] for result in payload["results"])
    print(f"Restore drill passed: {artifact_ids}")
    print(f"Drill log: {log_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
