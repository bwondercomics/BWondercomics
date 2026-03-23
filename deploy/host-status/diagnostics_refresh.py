#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
from urllib import error, request


API_BASE = os.environ.get("BWC_INTERNAL_API_BASE") or (
    f"http://127.0.0.1:{os.environ.get('BWC_API_PORT', '8000')}"
)
TOKEN = os.environ.get("HOST_AUTOMATION_TOKEN", "").strip()


def main() -> int:
    if not TOKEN:
        print("diagnostics_refresh: HOST_AUTOMATION_TOKEN is required", file=sys.stderr)
        return 1

    req = request.Request(
        f"{API_BASE}/api/internal/diagnostics/refresh",
        data=b"{}",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=60) as response:
            payload = response.read().decode("utf-8")
            if payload:
                data = json.loads(payload)
                print(data.get("generatedAt", "ok"))
    except error.HTTPError as exc:
        print(f"diagnostics_refresh: HTTP {exc.code}", file=sys.stderr)
        return 1
    except error.URLError as exc:
        print(f"diagnostics_refresh: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
