#!/usr/bin/env python3
"""Read-only QC of the localhost-only, unapproved RH 2022 sidecar.

No database connection, no SQL, no mutation endpoint and no production API use.
Requires root only to read the private sidecar token. A single bounded request
(maximum five days / 1440 nominal slots) is sent to 127.0.0.1:3101.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

UTC = timezone.utc
ENV = Path("/etc/loucka-weather/rh-preview.env")
BASE = "http://127.0.0.1:3101"
REPORT_DIR = Path("/var/lib/loucka-qc/rh-preview-audit-reports")
LOWER = int(datetime(2022, 1, 1, tzinfo=UTC).timestamp())
UPPER = int(datetime(2023, 1, 1, tzinfo=UTC).timestamp())
STEP = 300
MAX_BODY = 2_000_000
STATES = {
    "original_missing", "original_measured",
    "experimental_unapproved", "historically_invalidated_unapproved",
}


class AuditError(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise AuditError("Sidecar unexpectedly returned a redirect (refused).")


def iso(epoch: int) -> str:
    return datetime.fromtimestamp(epoch, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def window(day: str, days: int) -> tuple[int, int]:
    if not re.fullmatch(r"2022-\d{2}-\d{2}", day) or days not in (1, 3, 5):
        raise AuditError("Use --start YYYY-MM-DD in 2022 and --days 1, 3 or 5.")
    try:
        beginning = datetime.combine(date.fromisoformat(day), datetime.min.time(), UTC)
    except ValueError as exc:
        raise AuditError("Invalid calendar date.") from exc
    start = int(beginning.timestamp())
    end = start + days * 86400 - STEP
    if start < LOWER or end >= UPPER:
        raise AuditError("Requested UTC window must stay within 2022.")
    # The private route uses (from, to]; never request outside its 2022 guard.
    return max(LOWER, start - STEP), end


def read_private_environment(filename: Path = ENV) -> dict[str, str]:
    if os.geteuid() != 0:
        raise AuditError("Run as root to read the private sidecar token.")
    info = filename.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or (info.st_mode & 0o077):
        raise AuditError("Private environment is not a regular root-only file.")
    env: dict[str, str] = {}
    for line in filename.read_text("utf-8").splitlines():
        if not line or line.lstrip().startswith("#"):
            continue
        key, sep, val = line.partition("=")
        if sep:
            env[key.strip()] = val.strip().strip('"')
    token = env.get("WEATHER_DEV_PREVIEW_TOKEN", "")
    digest = env.get("WEATHER_DEV_PREVIEW_PACKAGE_SHA256", "")
    if not re.fullmatch(r"[a-f0-9]{64}", token):
        raise AuditError("Sidecar token is absent or invalid.")
    if not re.fullmatch(r"[a-f0-9]{64}", digest):
        raise AuditError("Pinned package digest is absent or invalid.")
    if env.get("HOST") != "127.0.0.1" or env.get("PORT") != "3101":
        raise AuditError("Sidecar loopback binding does not match the expected guard.")
    if env.get("WEATHER_DEV_PREVIEW_MODE") != "isolated_dev_only":
        raise AuditError("Expected isolated sidecar mode is missing.")
    return {"token": token, "digest": digest}


def fetch(from_epoch: int, to_epoch: int, private: dict[str, str]) -> tuple[dict, str]:
    query = urlencode({"from": iso(from_epoch), "to": iso(to_epoch), "limit": "2000"})
    url = BASE + "/api/v1/dev/preview/rh-history?" + query
    request = Request(url, headers={
        "Authorization": "Bearer " + private["token"],
        "Accept": "application/json",
        "Cache-Control": "no-store",
    })
    opener = build_opener(ProxyHandler({}), NoRedirect())
    try:
        with opener.open(request, timeout=15) as response:
            if response.status != 200:
                raise AuditError(f"Unexpected sidecar HTTP {response.status}.")
            body = response.read(MAX_BODY + 1)
    except HTTPError as exc:
        raise AuditError(f"Sidecar returned HTTP {exc.code}; no audit was written.") from None
    except URLError as exc:
        raise AuditError("Loopback sidecar is unreachable; no audit was written.") from exc
    if len(body) > MAX_BODY:
        raise AuditError("Sidecar response is larger than the audit limit.")
    try:
        data = json.loads(body)
    except (ValueError, UnicodeDecodeError) as exc:
        raise AuditError("Sidecar did not return valid JSON.") from exc
    if (not isinstance(data, dict) or data.get("approved") is not False
            or data.get("dataset") != "preview_unapproved"
            or data.get("metric") != "outHumidity"
            or data.get("unit") != "percent"
            or data.get("packageSha256") != private["digest"]
            or data.get("schemaVersion") != "1"
            or not isinstance(data.get("points"), list)
            or data.get("range", {}).get("from") != iso(from_epoch)
            or data.get("range", {}).get("to") != iso(to_epoch)):
        raise AuditError("Unrecognized or mismatched RH preview contract.")
    return data, hashlib.sha256(body).hexdigest()


def valid_rh(v: object) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and 1 <= v <= 100


def inspect(data: dict, from_epoch: int, to_epoch: int, response_hash: str) -> dict:
    points = data["points"]
    if len(points) > 2000 or data.get("count") != len(points):
        raise AuditError("Unexpected count or unbounded response.")
    categories = Counter()
    batches = Counter()
    sources = Counter()
    by_day: dict[str, Counter] = defaultdict(Counter)
    unfilled: list[str] = []
    invalidated: list[str] = []
    jumps: list[dict] = []
    seen: set[int] = set()
    previous_epoch = from_epoch
    previous_preview: float | None = None
    previous_stamp: int | None = None
    longest_unfilled = 0
    current_unfilled = 0

    for p in points:
        if not isinstance(p, dict):
            raise AuditError("Malformed point in sidecar response.")
        epoch = p.get("epoch")
        if not isinstance(epoch, int) or isinstance(epoch, bool) or not from_epoch < epoch <= to_epoch:
            raise AuditError("Out-of-window historical timestamp.")
        if epoch <= previous_epoch or epoch in seen:
            raise AuditError("Duplicate or unsorted historical timestamps.")
        if not isinstance(p.get("at"), str) or not p["at"].startswith(iso(epoch)[:-1]):
            raise AuditError("Inconsistent UTC timestamp in sidecar response.")
        if not isinstance(p.get("original"), dict) or not isinstance(p.get("preview"), dict):
            raise AuditError("Missing original/preview separation.")
        original = p["original"]["value"]
        preview = p["preview"]["value"]
        status = p["preview"]["status"]
        if status not in STATES:
            raise AuditError("Unknown RH provenance state.")
        if original is not None and not valid_rh(original):
            raise AuditError("Invalid original RH value.")
        if preview is not None and not valid_rh(preview):
            raise AuditError("Invalid experimental RH value.")

        if status == "experimental_unapproved":
            if not valid_rh(preview):
                raise AuditError("Experiment without a numeric estimate.")
            category = "missing_to_estimate" if original is None else "suspect_to_estimate"
        elif status == "historically_invalidated_unapproved":
            if not valid_rh(original) or preview is not None:
                raise AuditError("Invalidation transition is inconsistent.")
            category = "historically_invalidated"
            invalidated.append(iso(epoch))
        elif status == "original_missing":
            if original is not None or preview is not None:
                raise AuditError("Missing-original transition is inconsistent.")
            category = "unfilled_original_missing"
            unfilled.append(iso(epoch))
        else:
            if original is None or preview != original:
                raise AuditError("Original-measured transition is inconsistent.")
            category = "unchanged_original_measured"

        if status in ("experimental_unapproved", "historically_invalidated_unapproved"):
            batch = p["preview"].get("legacyBatchKey")
            source = p["preview"].get("legacySource")
            if not isinstance(batch, str) or not batch or not isinstance(source, str) or not source:
                raise AuditError("Experiment is missing its audit provenance.")
            batches[batch] += 1
            sources[source] += 1

        categories[category] += 1
        by_day[iso(epoch)[:10]][category] += 1
        if category == "unfilled_original_missing" and previous_stamp == epoch - STEP:
            current_unfilled += 1
        elif category == "unfilled_original_missing":
            current_unfilled = 1
        else:
            current_unfilled = 0
        longest_unfilled = max(longest_unfilled, current_unfilled)

        if (previous_stamp == epoch - STEP and previous_preview is not None
                and preview is not None and abs(preview - previous_preview) >= 20):
            jumps.append({
                "utc": iso(epoch),
                "delta_percentage_points": round(preview - previous_preview, 2),
                "flag": "review_only_not_a_validation_result",
            })
        previous_preview = preview
        previous_stamp = epoch
        previous_epoch = epoch
        seen.add(epoch)

    grid = set(range(from_epoch + STEP, to_epoch + 1, STEP))
    missing_slots = sorted(grid - seen)
    offgrid_rows = sorted(seen - grid)
    counts = dict(sorted(categories.items()))
    return {
        "audit_version": 1,
        "scope": {
            "from_exclusive_utc": iso(from_epoch),
            "to_inclusive_utc": iso(to_epoch),
            "interval_seconds": STEP,
            "only_existing_original_rows": True,
            "read_only": True,
            "approved": False,
        },
        "integrity": {
            "package_sha256": data["packageSha256"],
            "response_sha256": response_hash,
            "server_reported_rows": data["count"],
        },
        "totals": {
            "expected_grid_slots": len(grid),
            "original_archive_rows": len(points),
            "missing_entire_grid_slots": len(missing_slots),
            "offgrid_archive_rows": len(offgrid_rows),
            **counts,
            "modified_records": sum(counts.get(x, 0) for x in (
                "missing_to_estimate", "suspect_to_estimate", "historically_invalidated")),
            "preview_nonnull": sum(p["preview"]["value"] is not None for p in points),
            "suspicious_5m_jumps_ge_20pp": len(jumps),
            "longest_consecutive_unfilled_existing_slots": longest_unfilled,
        },
        "per_day_utc": {d: dict(sorted(c.items())) for d, c in sorted(by_day.items())},
        "legacy_batch_counts": dict(sorted(batches.items())),
        "legacy_source_counts": dict(sorted(sources.items())),
        "missing_entire_grid_slot_utc": [iso(t) for t in missing_slots],
        "offgrid_original_row_utc": [iso(t) for t in offgrid_rows],
        "unchanged_null_original_row_utc": unfilled,
        "historically_invalidated_row_utc": invalidated,
        "suspicious_preview_jumps": jumps[:200],
        "limitations": [
            "The sidecar exposes no reason why an unchanged NULL lacks an estimate.",
            "Historic experimental estimates were NOT independently validated against reference stations.",
            "20 percentage points per five minutes is a review flag, not a quality threshold.",
            "Missing whole archive slots are not equivalent to existing archive rows with NULL RH.",
            "No SQL writes, no source data mutation and no approval were performed.",
        ],
    }


def write_report(report: dict, directory: Path = REPORT_DIR) -> Path:
    directory.mkdir(mode=0o700, parents=False, exist_ok=True)
    folder = directory.lstat()
    if not stat.S_ISDIR(folder.st_mode) or folder.st_uid != 0 or folder.st_mode & 0o077:
        raise AuditError("Refusing to use an untrusted report directory.")
    name = ("rh-qc-" + report["scope"]["to_inclusive_utc"][:10]
            + "-" + datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
            + "-" + str(os.getpid()) + ".json")
    destination = directory / name
    flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(destination, flags, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            json.dump(report, output, indent=2, ensure_ascii=False, sort_keys=True)
            output.write("\n")
    except BaseException:
        destination.unlink(missing_ok=True)
        raise
    return destination


def main() -> int:
    parser = argparse.ArgumentParser(description="Private read-only QC for RH 2022 sidecar")
    parser.add_argument("--start", default="2022-04-26", help="First UTC date in 2022")
    parser.add_argument("--days", type=int, choices=(1, 3, 5), default=5)
    args = parser.parse_args()
    try:
        from_epoch, to_epoch = window(args.start, args.days)
        private = read_private_environment()
        data, digest = fetch(from_epoch, to_epoch, private)
        # Remove the only in-process reference to the token before analysis.
        del private
        report = inspect(data, from_epoch, to_epoch, digest)
        filepath = write_report(report)
        totals = report["totals"]
        print("OK: RH 2022 audit completed (read-only, unapproved).")
        print(f"UTC window (start, end]: {iso(from_epoch)} ... {iso(to_epoch)}")
        print(f"Archive rows: {totals['original_archive_rows']} / grid slots: {totals['expected_grid_slots']}")
        print(f"Missing entire grid slots: {totals['missing_entire_grid_slots']}")
        print(f"Off-grid rows: {totals['offgrid_archive_rows']}")
        print(f"Existing rows still NULL: {totals.get('unfilled_original_missing', 0)}")
        print(f"Missing -> estimate: {totals.get('missing_to_estimate', 0)}")
        print(f"Suspect -> estimate: {totals.get('suspect_to_estimate', 0)}")
        print(f"Historically invalidated: {totals.get('historically_invalidated', 0)}")
        print(f"Potential abrupt preview changes (>=20 pp/5m): {totals['suspicious_5m_jumps_ge_20pp']}")
        print(f"Private report (0600, never commit): {filepath}")
        print("NOTE: This is not an independent meteorological validation or approval.")
        return 0
    except (AuditError, OSError, ValueError, KeyError, TypeError) as exc:
        # Never include authentication headers or the contents of env files.
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
