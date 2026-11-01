#!/usr/bin/env python3
"""Five-minute staging-source watchdog. Does not restart or modify other services."""
from urllib.request import urlopen, Request
import json
import sys

URL = "http://127.0.0.1:3100/api/v1/monitor/status"

def main() -> int:
    try:
        with urlopen(Request(URL, headers={"Accept": "application/json"}), timeout=8) as response:
            data = response.read(32769)
            if len(data) > 32768:
                raise ValueError("Invalid monitoring response")
            report = json.loads(data)
        if report.get("schemaVersion") != "1":
            raise ValueError("Unknown status payload")
        components = report["components"]
        failures = []
        for name in ("api", "archive", "gw3000", "camera", "chmi"):
            status = components[name]["status"]
            # Gateway disabled is a deployment choice, not a failure.
            if status in ("stale", "missing"):
                failures.append(name + "=" + status)
        if failures:
            print("LOUCKA WARNING: " + ", ".join(failures))
            return 1
        print("LOUCKA OK: monitored enabled sources fresh")
        return 0
    except Exception:
        print("LOUCKA WARNING: monitoring endpoint unavailable or invalid", file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main())
