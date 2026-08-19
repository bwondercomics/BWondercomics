#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ipaddress
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, request

BASE_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = BASE_DIR / "deploy" / "bwondercomics.env"
COMPOSE_FILE = BASE_DIR / "deploy" / "bwondercomics-compose.yml"
EXPECTED_UMAMI_DIGEST = "sha256:28f263fe06f79ebffa5a6a6e9bd33b7a278e9342a88e0bdac812416c9f9e4361"
REQUIRED_HEADERS = {
    "strict-transport-security": "max-age=31536000",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "SAMEORIGIN",
    "content-security-policy": "frame-ancestors 'self'",
}
UNIT_PATHS = {
    "diagnostics-refresh.service": BASE_DIR
    / "deploy"
    / "host-status"
    / "diagnostics-refresh.service",
    "diagnostics-refresh.timer": BASE_DIR / "deploy" / "host-status" / "diagnostics-refresh.timer",
    "bwondercomics-ops-worker.service": BASE_DIR
    / "deploy"
    / "ops"
    / "bwondercomics-ops-worker.service",
    "bwondercomics-backup-db.service": BASE_DIR / "deploy" / "bwondercomics-backup-db.service",
    "bwondercomics-backup-db.timer": BASE_DIR / "deploy" / "bwondercomics-backup-db.timer",
    "bwondercomics-backup-files.service": BASE_DIR
    / "deploy"
    / "bwondercomics-backup-files.service",
    "bwondercomics-backup-files.timer": BASE_DIR / "deploy" / "bwondercomics-backup-files.timer",
}
ACTIVE_UNITS = (
    "diagnostics-refresh.timer",
    "bwondercomics-ops-worker.service",
    "bwondercomics-backup-db.timer",
    "bwondercomics-backup-files.timer",
)
SNAPSHOT_MAX_AGE_SECONDS = 2 * 60 * 60


def load_env(path: Path) -> dict[str, str]:
    values = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def normalized_networks(value: str) -> set[str]:
    entries = value.replace(",", " ").split()
    return {str(ipaddress.ip_network(entry, strict=False)) for entry in entries}


def run(args: list[str], timeout: int = 20) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=False)


def check_configuration(env: dict[str, str]) -> list[tuple[bool, str]]:
    token = env.get("HOST_AUTOMATION_TOKEN", "")
    try:
        backend_allowlist = normalized_networks(env.get("OPS_ALLOWED_IPS", ""))
        caddy_allowlist = normalized_networks(env.get("CADDY_OPS_ALLOWED_IPS", ""))
    except ValueError:
        backend_allowlist = set()
        caddy_allowlist = {"invalid"}
    return [
        (ENV_FILE.stat().st_mode & 0o777 == 0o600, "production environment file is mode 0600"),
        (bool(token and token != "CHANGE_ME"), "host automation token is configured"),
        (
            env.get("ADMIN_COMMANDS_ENABLED", "").lower() == "true",
            "browser Ops commands are enabled",
        ),
        (bool(backend_allowlist), "backend Ops allowlist is configured"),
        (backend_allowlist == caddy_allowlist, "backend and Caddy Ops allowlists match"),
    ]


def check_directories(env: dict[str, str]) -> list[tuple[bool, str]]:
    expected_uid = int(env.get("BWC_UID") or 1000)
    expected_gid = int(env.get("BWC_GID") or 1000)
    results = []
    for relative in (
        "var/diagnostics/admin",
        "var/diagnostics/backups",
        "var/ops/queue",
        "var/ops/logs",
    ):
        path = BASE_DIR / relative
        valid = (
            path.is_dir()
            and path.stat().st_uid == expected_uid
            and path.stat().st_gid == expected_gid
            and path.stat().st_mode & 0o777 == 0o750
            and os.access(path, os.W_OK)
        )
        results.append((valid, f"{relative} is API-owned, writable, and mode 0750"))
    return results


def check_units() -> list[tuple[bool, str]]:
    results = []
    for name, source in UNIT_PATHS.items():
        installed = Path("/etc/systemd/system") / name
        matches = installed.is_file() and installed.read_bytes() == source.read_bytes()
        results.append((matches, f"installed {name} matches the repository"))
    for name in ACTIVE_UNITS:
        enabled = run(["systemctl", "is-enabled", name]).stdout.strip() == "enabled"
        active = run(["systemctl", "is-active", name]).stdout.strip() == "active"
        results.append((enabled and active, f"{name} is enabled and active"))
    return results


def _snapshot_age_seconds(payload: dict, now: datetime) -> float:
    generated = datetime.fromisoformat(str(payload["generatedAt"]).replace("Z", "+00:00"))
    return (now - generated.astimezone(timezone.utc)).total_seconds()


def _has_recent_timer_snapshot(latest: dict, history_dir: Path, now: datetime) -> bool:
    candidates = [latest]
    for path in history_dir.glob("*.json"):
        try:
            candidates.append(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, TypeError, json.JSONDecodeError):
            continue
    for payload in candidates:
        try:
            age = _snapshot_age_seconds(payload, now)
        except (ValueError, TypeError, KeyError):
            continue
        if payload.get("source") == "timer" and 0 <= age <= SNAPSHOT_MAX_AGE_SECONDS:
            return True
    return False


def check_snapshot() -> list[tuple[bool, str]]:
    path = BASE_DIR / "var" / "diagnostics" / "admin" / "latest.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        now = datetime.now(timezone.utc)
        age = _snapshot_age_seconds(payload, now)
        timer_snapshot_current = _has_recent_timer_snapshot(payload, path.parent / "history", now)
        host_status = payload.get("hostStatus") or {}
        sections_present = all(
            isinstance(host_status.get(key), dict)
            for key in ("disks", "containers", "units", "certificates")
        )
        sections_acceptable = sections_present and all(
            (host_status.get(key) or {}).get("status") != "error"
            for key in ("disks", "containers", "units", "certificates")
        )
        files_restricted = all(
            candidate.is_file() and candidate.stat().st_mode & 0o777 == 0o640
            for candidate in (
                BASE_DIR / "var" / "diagnostics" / "host.json",
                path,
            )
        )
        return [
            (
                0 <= age <= SNAPSHOT_MAX_AGE_SECONDS,
                "diagnostics snapshot is no more than two hours old",
            ),
            (
                timer_snapshot_current,
                "a timer-sourced diagnostics snapshot exists within two hours",
            ),
            (sections_present, "diagnostics snapshot contains every host-status section"),
            (sections_acceptable, "host-status sections contain no errors"),
            (files_restricted, "host and combined diagnostics snapshots are mode 0640"),
        ]
    except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError):
        return [(False, "diagnostics snapshot is readable and valid")]


def compose_command(*parts: str) -> list[str]:
    return [
        "docker",
        "compose",
        "--env-file",
        str(ENV_FILE),
        "-f",
        str(COMPOSE_FILE),
        *parts,
    ]


def check_runtime() -> list[tuple[bool, str]]:
    port = run(compose_command("port", "bwondercomics-api", "8000")).stdout.strip()
    container_id = run(compose_command("ps", "-q", "umami")).stdout.strip()
    image_id = (
        run(["docker", "inspect", container_id, "--format", "{{.Image}}"]).stdout.strip()
        if container_id
        else ""
    )
    api_has_token = (
        run(
            compose_command(
                "exec", "-T", "bwondercomics-api", "sh", "-c", 'test -n "$HOST_AUTOMATION_TOKEN"'
            )
        ).returncode
        == 0
    )
    expected_heads = {
        line.split()[0]
        for line in run(
            compose_command(
                "exec",
                "-T",
                "bwondercomics-api",
                "alembic",
                "-c",
                "backend/alembic.ini",
                "heads",
            )
        ).stdout.splitlines()
        if line.strip()
    }
    current_revisions = {
        line.split()[0]
        for line in run(
            compose_command(
                "exec",
                "-T",
                "bwondercomics-api",
                "alembic",
                "-c",
                "backend/alembic.ini",
                "current",
            )
        ).stdout.splitlines()
        if line.strip()
    }
    return [
        (
            bool(port) and all(line.startswith("127.0.0.1:") for line in port.splitlines()),
            "API host port is loopback-only",
        ),
        (api_has_token, "running API received the host automation token"),
        (
            bool(expected_heads) and current_revisions == expected_heads,
            "database is at every repository Alembic head",
        ),
        (image_id == EXPECTED_UMAMI_DIGEST, "running Umami image matches the pinned 3.0.3 digest"),
    ]


def _response_headers(url: str) -> dict[str, str]:
    req = request.Request(url, method="HEAD")
    try:
        with request.urlopen(req, timeout=10) as response:
            return {key.lower(): value for key, value in response.headers.items()}
    except error.HTTPError as exc:
        return {key.lower(): value for key, value in exc.headers.items()}


def check_headers() -> list[tuple[bool, str]]:
    results = []
    for url in (
        "https://bwondercomics.com/",
        "https://bwondercomics.com/admin/",
        "https://bwondercomics.com/ops/",
        "https://chat.bwondercomics.com/",
    ):
        try:
            headers = _response_headers(url)
            valid = all(
                expected in headers.get(name, "") for name, expected in REQUIRED_HEADERS.items()
            )
        except (OSError, error.URLError):
            valid = False
        results.append((valid, f"security headers are present at {url}"))
    return results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only Admin/Ops production acceptance check")
    parser.add_argument(
        "--skip-http", action="store_true", help="Skip public response-header checks"
    )
    args = parser.parse_args(argv)
    if not ENV_FILE.is_file():
        print(f"FAIL missing {ENV_FILE}")
        return 1

    env = load_env(ENV_FILE)
    checks = [
        *check_configuration(env),
        *check_directories(env),
        *check_units(),
        *check_snapshot(),
        *check_runtime(),
    ]
    if not args.skip_http:
        checks.extend(check_headers())
    for passed, description in checks:
        print(f"{'PASS' if passed else 'FAIL'} {description}")
    failed = sum(1 for passed, _description in checks if not passed)
    print(f"Admin/Ops check: {len(checks) - failed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
