#!/usr/bin/env python3
import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path


BASE_DIR = os.environ.get("BWC_BASE_DIR", "/srv/bw-quality")
OUTPUT_PATH = Path(BASE_DIR) / "var" / "diagnostics" / "fail2ban.json"


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def parse_value(line, label):
    if label not in line:
        return None
    return line.split(label, 1)[-1].strip()


def load_jails(status_output):
    for line in status_output.splitlines():
        if "Jail list:" in line:
            raw = line.split("Jail list:", 1)[-1].strip()
            return [item.strip() for item in raw.split(",") if item.strip()]
    return []


def build_payload():
    if not shutil.which("fail2ban-client"):
        return {
            "status": "warning",
            "message": "fail2ban-client not found on host.",
            "jails": "",
            "jailBreakdown": "",
        }

    base = run(["fail2ban-client", "status"])
    output = f"{base.stdout}\n{base.stderr}".strip()
    if base.returncode != 0:
        message = output.splitlines()[0] if output else f"fail2ban status failed ({base.returncode})"
        return {"status": "warning", "message": message}

    jails = load_jails(output)
    totals = {"current": 0, "total": 0}
    breakdown = []

    for jail in jails:
        detail = run(["fail2ban-client", "status", jail])
        detail_output = f"{detail.stdout}\n{detail.stderr}".strip()
        current = 0
        total = 0
        for line in detail_output.splitlines():
            if "Currently banned:" in line:
                value = parse_value(line, "Currently banned:")
                current = int(value) if value and value.isdigit() else current
            if "Total banned:" in line:
                value = parse_value(line, "Total banned:")
                total = int(value) if value and value.isdigit() else total
        totals["current"] += current
        totals["total"] += total
        breakdown.append(f"{jail} {current}/{total}")

    return {
        "status": "ok",
        "message": "fail2ban running",
        "jails": ", ".join(jails) if jails else "",
        "currentlyBanned": totals["current"],
        "totalBanned": totals["total"],
        "jailBreakdown": "; ".join(breakdown),
    }


def main():
    payload = build_payload()
    payload["updatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
