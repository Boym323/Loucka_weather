#!/usr/bin/env python3
"""Sequential read-only localhost smoke benchmark, not a load test.

Never contacts GW3000, modifies services, or performs DB writes.
Samples four HTTP GET endpoints (8 cycles, <= 4 req/s) and reports p50/p95,
cache ETag/304 and failures; no background monitoring or writes.
"""
import json
import math
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
import urllib.error
import urllib.request
from collections import defaultdict

BASE = "http://127.0.0.1:3100"
PATHS = (
    "/api/v1/readyz",
    "/api/v1/live/current",
    "/api/v1/sensors/channels",
    "/api/v1/climate/records",
)
SAMPLES = 8
SPACING_SEC = 0.3
TIMEOUT_SEC = 8


def call(path, etag=None):
    headers = {"Accept": "application/json"}
    if etag:
        headers["If-None-Match"] = etag
    request = urllib.request.Request(BASE + path, headers=headers)
    start = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SEC) as response:
            payload = response.read(256_000)
            status = response.status
            tag = response.headers.get("ETag")
            cache_control = response.headers.get("Cache-Control")
    except urllib.error.HTTPError as exc:
        payload = exc.read(2000)
        status = exc.code
        tag = exc.headers.get("ETag")
        cache_control = exc.headers.get("Cache-Control")
    except (urllib.error.URLError, TimeoutError) as exc:
        return {"status": 0, "elapsed_ms": round((time.monotonic()-start)*1000, 2),
                "error": type(exc).__name__}
    elapsed_ms = round((time.monotonic()-start)*1000, 2)
    if status == 200:
        try:
            doc = json.loads(payload)
            if doc.get("schemaVersion") != "1":
                return {"status": status, "elapsed_ms": elapsed_ms, "error": "invalid_schema"}
        except (ValueError, TypeError):
            return {"status": status, "elapsed_ms": elapsed_ms, "error": "invalid_json"}
    return {"status": status, "elapsed_ms": elapsed_ms,
            "etag": tag, "cache_control": cache_control}


def memory_snapshot():
    """One local systemd/procfs sample. No privileged operations or credentials."""
    try:
        cmd = subprocess.run(
            ["systemctl", "show", "-P", "MainPID", "loucka-weather-api.service"],
            capture_output=True, text=True, timeout=3, check=False,
        )
        pid = int(cmd.stdout.strip())
        if cmd.returncode or pid <= 0:
            return {"status": "not_available"}
        status_text = Path(f"/proc/{pid}/status").read_text(encoding="utf-8")
        source = {}
        for line in status_text.splitlines():
            if ":" in line:
                key, value = line.split(":", 1)
                source[key] = value.strip()
        snapshot = {"status": "sampled"}
        for name, label in (("VmRSS", "rss_mib"), ("RssAnon", "anon_mib"),
                            ("RssFile", "file_mib"), ("VmSwap", "swap_mib")):
            raw = source.get(name, "").split()
            snapshot[label] = round(int(raw[0]) / 1024, 2) if raw and raw[0].isdigit() else None
        snapshot["threads"] = int(source["Threads"]) if source.get("Threads", "").isdigit() else None
        return snapshot
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return {"status": "not_available"}


def percentile(values, pct):
    values = sorted(values)
    if not values:
        return None
    return round(values[min(len(values)-1, math.ceil(len(values)*pct)-1)], 2)


def run():
    measured_at = datetime.now(timezone.utc).isoformat()
    memory_before = memory_snapshot()
    results = defaultdict(list)
    for _ in range(SAMPLES):
        for path in PATHS:
            results[path].append(call(path))
            time.sleep(SPACING_SEC)
    report = {}
    failures = False
    for path, readings in results.items():
        times = [sample["elapsed_ms"] for sample in readings if sample["status"] == 200
                 and not sample.get("error")]
        problems = [sample for sample in readings if sample["status"] != 200 or sample.get("error")]
        report[path] = {"requests": len(readings), "errors": len(problems),
                        "p50_ms": percentile(times, .5), "p95_ms": percentile(times, .95),
                        "max_ms": max(times, default=None)}
        if path == "/api/v1/climate/records":
            report[path]["first_observed_ms"] = readings[0]["elapsed_ms"]
            report[path]["later_p50_ms"] = percentile(times[1:], .5)
            report[path]["first_is_not_guaranteed_cold"] = True
        if problems:
            report[path]["error_samples"] = problems[:2]
            failures = True
    initial = results["/api/v1/sensors/channels"][-1]
    if initial.get("etag"):
        conditional = call("/api/v1/sensors/channels", initial["etag"])
        report["sensor_cache_etag"] = {
            "status": conditional["status"],
            "cache_control": conditional.get("cache_control"),
            "expected_status": 304,
        }
        if conditional["status"] != 304:
            failures = True
    else:
        report["sensor_cache_etag"] = {"status": "no_etag"}
        failures = True
    records_tag = results["/api/v1/climate/records"][-1].get("etag")
    if records_tag:
        conditional = call("/api/v1/climate/records", records_tag)
        report["records_cache_etag"] = {
            "status": conditional["status"], "expected_status": 304,
            "cache_control": conditional.get("cache_control"),
        }
        if conditional["status"] != 304:
            failures = True
    else:
        report["records_cache_etag"] = {"status": "no_etag"}
        failures = True
    memory_after = memory_snapshot()
    print(json.dumps({"source": BASE, "read_only": True, "samples_per_endpoint": SAMPLES,
                      "measured_at_utc": measured_at,
                      "process_memory_before": memory_before,
                      "process_memory_after": memory_after,
                      "elapsed_window_seconds_estimate": SAMPLES*len(PATHS)*SPACING_SEC,
                      "results": report, "sampling_warning": "8 samples: p95 is max; first request may already be cached; not a concurrency/load test or memory-leak proof"},
                     indent=2, ensure_ascii=False))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    run()
