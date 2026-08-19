#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shutil
import socket
import ssl
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, request
from uuid import uuid4

BASE_DIR = Path(os.environ.get("BWC_BASE_DIR", "/srv/bw-quality"))
ENV_FILE = Path(os.environ.get("BWC_ENV_FILE", BASE_DIR / "deploy" / "bwondercomics.env"))
COMPOSE_FILE = Path(
    os.environ.get("BWC_COMPOSE_FILE", BASE_DIR / "deploy" / "bwondercomics-compose.yml")
)
OUTPUT_PATH = BASE_DIR / "var" / "diagnostics" / "host.json"
API_BASE = os.environ.get("BWC_INTERNAL_API_BASE") or (
    f"http://127.0.0.1:{os.environ.get('BWC_API_PORT', '8000')}"
)
TOKEN = os.environ.get("HOST_AUTOMATION_TOKEN", "").strip()
CONFIG_ERROR_EXIT = 78
DISK_WARNING_PERCENT = 20.0
DISK_ERROR_PERCENT = 10.0
CERT_WARNING_DAYS = 30
CERT_ERROR_DAYS = 7
REQUIRED_CONTAINERS = {"bwondercomics-api", "bwondercomics-db", "caddy"}
REQUIRED_UNITS = (
    "diagnostics-refresh.timer",
    "bwondercomics-ops-worker.service",
    "bwondercomics-backup-db.timer",
    "bwondercomics-backup-files.timer",
)
CERTIFICATE_HOSTS = ("bwondercomics.com", "chat.bwondercomics.com")


def _status_rank(value: str) -> int:
    return {"ok": 1, "warning": 2, "error": 3}.get(str(value or "").lower(), 3)


def _merge_statuses(*values: str) -> str:
    return max((str(value or "error").lower() for value in values), key=_status_rank)


def _run(args: list[str], timeout: int = 20) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=False)


def _space_status(free_percent: float) -> str:
    if free_percent < DISK_ERROR_PERCENT:
        return "error"
    if free_percent < DISK_WARNING_PERCENT:
        return "warning"
    return "ok"


def _mount_details(path: Path) -> dict:
    result = _run(
        ["findmnt", "--json", "--target", str(path), "--output", "TARGET,SOURCE,FSTYPE,OPTIONS"]
    )
    if result.returncode != 0:
        return {"target": "", "source": "", "fstype": "", "options": [], "error": "not_mounted"}
    try:
        filesystems = json.loads(result.stdout).get("filesystems") or []
        item = filesystems[0]
        raw_options = str(item.get("options") or "")
        return {
            "target": str(item.get("target") or ""),
            "source": str(item.get("source") or ""),
            "fstype": str(item.get("fstype") or ""),
            "options": [part for part in raw_options.split(",") if part],
        }
    except (IndexError, KeyError, TypeError, json.JSONDecodeError):
        return {
            "target": "",
            "source": "",
            "fstype": "",
            "options": [],
            "error": "invalid_mount_data",
        }


def _disk_item(identifier: str, path: Path, *, root_device: int | None = None) -> dict:
    if not path.exists():
        return {
            "id": identifier,
            "path": str(path),
            "status": "error",
            "message": f"{path} is missing.",
        }
    try:
        usage = shutil.disk_usage(path)
        free_percent = (usage.free / usage.total * 100.0) if usage.total else 0.0
        mount = _mount_details(path)
        mount_writable = "rw" in mount.get("options", [])
        writable_path = (
            Path("/mnt/archive/backups/bwondercomics") if identifier == "archive" else path
        )
        writable = mount_writable and (identifier != "archive" or os.access(writable_path, os.W_OK))
        distinct = root_device is None or path.stat().st_dev != root_device
        status = _space_status(free_percent)
        problems = []
        if identifier == "archive" and mount.get("target") != str(path):
            status = "error"
            problems.append("not mounted at the canonical target")
        if identifier == "archive" and not distinct:
            status = "error"
            problems.append("not a distinct filesystem")
        if not writable:
            status = "error"
            problems.append("not writable")
        message = f"{free_percent:.1f}% free"
        if problems:
            message = f"{message}; {', '.join(problems)}"
        return {
            "id": identifier,
            "path": str(path),
            "status": status,
            "message": message,
            "totalBytes": usage.total,
            "freeBytes": usage.free,
            "freePercent": round(free_percent, 1),
            "mount": mount,
            "writable": writable,
            "writablePath": str(writable_path),
            "distinctFilesystem": distinct,
        }
    except OSError as exc:
        return {
            "id": identifier,
            "path": str(path),
            "status": "error",
            "message": f"Disk check failed: {exc.__class__.__name__}",
        }


def collect_disks() -> dict:
    root = Path("/")
    root_item = _disk_item("root", root)
    archive_item = _disk_item("archive", Path("/mnt/archive"), root_device=root.stat().st_dev)
    items = [root_item, archive_item]
    status = _merge_statuses(*(item["status"] for item in items))
    return {
        "status": status,
        "message": "; ".join(item["message"] for item in items),
        "items": items,
    }


def _parse_compose_rows(raw: str) -> list[dict]:
    value = raw.strip()
    if not value:
        return []
    try:
        payload = json.loads(value)
        return payload if isinstance(payload, list) else [payload]
    except json.JSONDecodeError:
        rows = []
        for line in value.splitlines():
            item = json.loads(line)
            if isinstance(item, dict):
                rows.append(item)
        return rows


def collect_containers() -> dict:
    result = _run(
        [
            "docker",
            "compose",
            "--env-file",
            str(ENV_FILE),
            "-f",
            str(COMPOSE_FILE),
            "ps",
            "-a",
            "--format",
            "json",
        ],
        timeout=30,
    )
    if result.returncode != 0:
        return {"status": "error", "message": "Unable to inspect Compose containers.", "items": []}
    try:
        rows = _parse_compose_rows(result.stdout)
    except (TypeError, json.JSONDecodeError):
        return {"status": "error", "message": "Compose returned invalid status data.", "items": []}

    items = []
    seen = set()
    for row in rows:
        service = str(row.get("Service") or row.get("service") or "").strip()
        if not service:
            continue
        seen.add(service)
        state = str(row.get("State") or row.get("state") or "unknown").lower()
        health = str(row.get("Health") or row.get("health") or "").lower()
        try:
            exit_code = int(row.get("ExitCode") if row.get("ExitCode") is not None else 0)
        except (TypeError, ValueError):
            exit_code = -1
        required = service in REQUIRED_CONTAINERS
        running = state == "running"
        healthy = health not in {"unhealthy", "starting"}
        clean_optional_stop = not required and state in {"exited", "stopped"} and exit_code == 0
        status = (
            "ok"
            if (running and healthy) or clean_optional_stop
            else ("error" if required or running else "warning")
        )
        items.append(
            {
                "service": service,
                "name": str(row.get("Name") or row.get("name") or service),
                "state": state,
                "health": health,
                "exitCode": exit_code,
                "required": required,
                "status": status,
            }
        )
    for service in sorted(REQUIRED_CONTAINERS - seen):
        items.append(
            {
                "service": service,
                "name": service,
                "state": "missing",
                "health": "",
                "required": True,
                "status": "error",
            }
        )
    items.sort(key=lambda item: item["service"])
    status = _merge_statuses(*(item["status"] for item in items)) if items else "error"
    problem_count = sum(1 for item in items if item["status"] != "ok")
    return {
        "status": status,
        "message": f"{len(items)} containers inspected; {problem_count} need attention.",
        "items": items,
    }


def collect_units() -> dict:
    items = []
    for unit in REQUIRED_UNITS:
        result = _run(
            [
                "systemctl",
                "show",
                unit,
                "--no-pager",
                "--property=LoadState,UnitFileState,ActiveState,SubState,Result",
            ]
        )
        values = {}
        if result.returncode == 0:
            for line in result.stdout.splitlines():
                key, separator, value = line.partition("=")
                if separator:
                    values[key] = value
        active = values.get("ActiveState") == "active"
        enabled = values.get("UnitFileState") == "enabled"
        items.append(
            {
                "name": unit,
                "loadState": values.get("LoadState") or "not-found",
                "unitFileState": values.get("UnitFileState") or "",
                "activeState": values.get("ActiveState") or "inactive",
                "subState": values.get("SubState") or "dead",
                "result": values.get("Result") or "unknown",
                "status": "ok" if active and enabled else "error",
            }
        )
    status = _merge_statuses(*(item["status"] for item in items))
    problem_count = sum(1 for item in items if item["status"] != "ok")
    return {
        "status": status,
        "message": f"{len(items)} required units inspected; {problem_count} need attention.",
        "items": items,
    }


def _certificate_item(host: str, now: datetime) -> dict:
    try:
        context = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=10) as raw_socket:
            with context.wrap_socket(raw_socket, server_hostname=host) as tls_socket:
                certificate = tls_socket.getpeercert()
        not_after = datetime.fromtimestamp(
            ssl.cert_time_to_seconds(str(certificate.get("notAfter") or "")), tz=timezone.utc
        )
        days_remaining = (not_after - now).total_seconds() / 86400
        if days_remaining < CERT_ERROR_DAYS:
            status = "error"
        elif days_remaining < CERT_WARNING_DAYS:
            status = "warning"
        else:
            status = "ok"
        return {
            "host": host,
            "status": status,
            "notAfter": not_after.isoformat().replace("+00:00", "Z"),
            "daysRemaining": round(days_remaining, 1),
            "message": f"Certificate expires in {days_remaining:.1f} days.",
        }
    except (OSError, ValueError, ssl.SSLError) as exc:
        return {
            "host": host,
            "status": "error",
            "notAfter": None,
            "daysRemaining": None,
            "message": f"Certificate check failed: {exc.__class__.__name__}",
        }


def collect_certificates(now: datetime | None = None) -> dict:
    current = now or datetime.now(timezone.utc)
    items = [_certificate_item(host, current) for host in CERTIFICATE_HOSTS]
    status = _merge_statuses(*(item["status"] for item in items))
    return {
        "status": status,
        "message": "; ".join(item["message"] for item in items),
        "items": items,
    }


def collect_host_status(now: datetime | None = None) -> dict:
    current = now or datetime.now(timezone.utc)
    disks = collect_disks()
    containers = collect_containers()
    units = collect_units()
    certificates = collect_certificates(current)
    return {
        "schemaVersion": 1,
        "generatedAt": current.isoformat().replace("+00:00", "Z"),
        "status": _merge_statuses(
            disks["status"], containers["status"], units["status"], certificates["status"]
        ),
        "disks": disks,
        "containers": containers,
        "units": units,
        "certificates": certificates,
    }


def write_host_status(payload: dict) -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT_PATH.parent / f".{OUTPUT_PATH.name}.{uuid4().hex}.tmp"
    descriptor: int | None = None
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o640)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            descriptor = None
            json.dump(payload, handle, ensure_ascii=True, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, OUTPUT_PATH)
        directory_fd = os.open(OUTPUT_PATH.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        temporary.unlink(missing_ok=True)


def refresh_api_snapshot() -> str:
    req = request.Request(
        f"{API_BASE}/api/internal/diagnostics/refresh",
        data=b"{}",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with request.urlopen(req, timeout=60) as response:
        payload = response.read().decode("utf-8")
        if not payload:
            return "ok"
        data = json.loads(payload)
        return str(data.get("generatedAt") or "ok")


def main() -> int:
    if not TOKEN:
        print("diagnostics_refresh: HOST_AUTOMATION_TOKEN is required", file=sys.stderr)
        return CONFIG_ERROR_EXIT

    try:
        write_host_status(collect_host_status())
        print(refresh_api_snapshot())
    except error.HTTPError as exc:
        print(f"diagnostics_refresh: HTTP {exc.code}", file=sys.stderr)
        return 1
    except (error.URLError, OSError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
        print(f"diagnostics_refresh: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
