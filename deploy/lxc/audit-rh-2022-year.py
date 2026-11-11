#!/usr/bin/env python3
"""Bounded annual RH 2022 QC, using the existing private loopback sidecar only.

Seventy-three sequential 5-day GETs; read-only, no DB credentials or mutations.
The script never approves reconstruction or publishes data.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
import sys
import time

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("rh_preview_qc", HERE / "audit-rh-preview.py")
assert SPEC is not None and SPEC.loader is not None
qc = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(qc)

YEAR = 2022
WINDOW_DAYS = 5
WINDOWS = 73
MIN_DELAY_SECONDS = 1.5
EXPECTED_CHANGES = {
    "missing_to_estimate": 2874,
    "suspect_to_estimate": 2194,
    "historically_invalidated": 85,
}
CATEGORIES = (
    "unchanged_original_measured",
    "unfilled_original_missing",
    "missing_to_estimate",
    "suspect_to_estimate",
    "historically_invalidated",
)
SENSITIVE_KEYS = (
    "missing_entire_grid_slot_utc",
    "offgrid_original_row_utc",
    "nonfive_minute_archive_interval_end_utc",
    "unchanged_null_original_row_utc",
    "historically_invalidated_row_utc",
)


def windows() -> list[tuple[str, int, int]]:
    """Full 2022, no overlap. 2022-01-01T00:00Z is outside the API's exclusive start."""
    out: list[tuple[str, int, int]] = []
    start_day = date(YEAR, 1, 1)
    for i in range(WINDOWS):
        day = (start_day + timedelta(days=i * WINDOW_DAYS)).isoformat()
        left, right = qc.window(day, WINDOW_DAYS)
        if i > 0 and left != out[-1][2]:
            raise qc.AuditError("Annual five-day windows overlap or contain a gap.")
        out.append((day, left, right))
    if out[0][1] != qc.LOWER or out[-1][2] != qc.UPPER - qc.STEP:
        raise qc.AuditError("Annual scan boundaries do not cover the permitted API range.")
    if sum((right - left) // qc.STEP for _, left, right in out) != 365 * 288 - 1:
        raise qc.AuditError("Annual scan does not cover the expected number of UTC slots.")
    return out


def grouped_runs(iso_stamps: list[str], min_points: int = 1) -> list[dict]:
    """Summarize contiguous 5-minute UTC timestamps without inventing rows."""
    stamps = sorted({int(datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()) for s in iso_stamps})
    if not stamps:
        return []
    runs: list[dict] = []
    start = prev = stamps[0]
    count = 1
    for epoch in stamps[1:]:
        if epoch == prev + qc.STEP:
            count += 1
        else:
            if count >= min_points:
                runs.append({"first_utc": qc.iso(start), "last_utc": qc.iso(prev), "slots": count})
            start, count = epoch, 1
        prev = epoch
    if count >= min_points:
        runs.append({"first_utc": qc.iso(start), "last_utc": qc.iso(prev), "slots": count})
    return runs


def audit_all(fetch_chunk, progress=lambda _index, _day, _count: None) -> dict:
    """Pure orchestrator. fetch_chunk returns the private sidecar's (JSON, body_sha)."""
    totals: Counter = Counter()
    monthly: dict[str, Counter] = defaultdict(Counter)
    daily: dict[str, Counter] = defaultdict(Counter)
    batches: Counter = Counter()
    sources: Counter = Counter()
    times: dict[str, list[str]] = {key: [] for key in SENSITIVE_KEYS}
    jumps: list[dict] = []
    response_digests: list[dict] = []
    pinned_package: str | None = None
    completed_windows = 0
    for index, (day, left, right) in enumerate(windows(), 1):
        data, digest = fetch_chunk(left, right)
        sub = qc.inspect(data, left, right, digest)
        current_digest = sub["integrity"]["package_sha256"]
        if pinned_package is None:
            pinned_package = current_digest
        elif current_digest != pinned_package:
            raise qc.AuditError("Private RH package changed during annual scan.")
        for key, value in sub["totals"].items():
            if key != "longest_consecutive_unfilled_existing_slots":
                totals[key] += value
        for key in SENSITIVE_KEYS:
            times[key].extend(sub[key])
        jumps.extend(sub["suspicious_preview_jumps"])
        for d, counts in sub["per_day_utc"].items():
            daily[d].update(counts)
        # Track exact day slots rather than estimating from returned archive rows.
        for epoch in range(left + qc.STEP, right + 1, qc.STEP):
            daily[qc.iso(epoch)[:10]]["expected_grid_slots"] += 1
        for key, field in (("missing_entire_grid_slot_utc", "missing_entire_grid_slots"),
                           ("offgrid_original_row_utc", "offgrid_archive_rows"),
                           ("nonfive_minute_archive_interval_end_utc", "nonfive_minute_archive_intervals")):
            for t in sub[key]:
                daily[t[:10]][field] += 1
        batches.update(sub["legacy_batch_counts"])
        sources.update(sub["legacy_source_counts"])
        response_digests.append({
            "utc_first": day,
            "utc_last": qc.iso(right)[:10],
            "records": sub["totals"]["original_archive_rows"],
            "response_sha256": digest,
        })
        # Adjacent scan boundaries can contain a jump that single-window QC misses.
        # The yearly check below derives all such boundary jumps explicitly.
        completed_windows = index
        progress(index, day, sub["totals"]["original_archive_rows"])

    for utc_day, values in daily.items():
        mon = utc_day[:7]
        monthly[mon].update(values)
    if completed_windows != WINDOWS or len(daily) != 365:
        raise qc.AuditError("Annual scan did not complete all 73 windows / 365 UTC days.")
    if totals["expected_grid_slots"] != 365 * 288 - 1:
        raise qc.AuditError("Unexpected year-wide time grid length.")
    if sum(totals[c] for c in CATEGORIES) != totals["original_archive_rows"]:
        raise qc.AuditError("Year-wide RH classifications do not match archive row count.")
    if (totals["expected_grid_slots"] - totals["missing_entire_grid_slots"]
            + totals["offgrid_archive_rows"] != totals["original_archive_rows"]):
        raise qc.AuditError("Year-wide archive row count is inconsistent with time grid.")
    if totals["modified_records"] != sum(totals[c] for c in EXPECTED_CHANGES):
        raise qc.AuditError("Year-wide historical change count is inconsistent.")
    # The immutable RH 2022 package has 5153 changes. A mismatch cannot be
    # silently labeled complete (e.g. lost first slot, drift or a bad overlay).
    changes_match = all(totals[key] == value for key, value in EXPECTED_CHANGES.items())
    if not changes_match:
        raise qc.AuditError(
            "Annual change totals differ from pinned 5153-record package. "
            "Check the inaccessible 2022-01-01T00:00Z boundary and immutable provenance."
        )

    missing_runs = grouped_runs(times["missing_entire_grid_slot_utc"])
    null_runs = grouped_runs(times["unchanged_null_original_row_utc"])
    totals["longest_consecutive_unfilled_existing_slots"] = max(
        (run["slots"] for run in null_runs), default=0
    )
    # Cross-window jumps are recorded as a separate QC count; the single-window
    # count above refers to genuinely consecutive observations within windows.
    # We never imply a continuous time-series where a row is absent.
    by_month = {}
    for month, counts in sorted(monthly.items()):
        archive_rows = sum(counts[c] for c in CATEGORIES)
        preview_present = (counts["unchanged_original_measured"]
                           + counts["missing_to_estimate"] + counts["suspect_to_estimate"])
        by_month[month] = {
            "expected_grid_slots": counts["expected_grid_slots"],
            "archive_rows": archive_rows,
            "missing_entire_grid_slots": counts["missing_entire_grid_slots"],
            "original_rh_null": (counts["unfilled_original_missing"]
                                + counts["missing_to_estimate"]),
            "preview_rh_null": (counts["unfilled_original_missing"]
                               + counts["historically_invalidated"]),
            "preview_rh_coverage_pct_of_existing_rows": (
                round(100 * preview_present / archive_rows, 2) if archive_rows else None
            ),
            **{key: counts[key] for key in EXPECTED_CHANGES},
        }
    priority_days = sorted(
        ({
            "utc_day": d,
            "unfilled_existing_rh_null": c["unfilled_original_missing"],
            "missing_entire_grid_slots": c["missing_entire_grid_slots"],
            "historically_invalidated": c["historically_invalidated"],
            "estimated_rh": c["missing_to_estimate"] + c["suspect_to_estimate"],
        } for d, c in daily.items()),
        key=lambda row: (row["unfilled_existing_rh_null"] +
                         row["missing_entire_grid_slots"], row["historically_invalidated"]),
        reverse=True,
    )
    return {
        "audit_version": 2,
        "dataset": "original_archive_plus_immutable_private_preview_overlay",
        "status": "technical_scan_complete_not_meteorologically_approved",
        "scope": {
            "year_utc": YEAR,
            "query_windows": completed_windows,
            "five_day_window_requests": WINDOWS,
            "first_inclusive_observable_utc": qc.iso(qc.LOWER + qc.STEP),
            "last_inclusive_observable_utc": qc.iso(qc.UPPER - qc.STEP),
            "inaccessible_first_boundary_utc": qc.iso(qc.LOWER),
            "production_archive_only_select": True,
            "reference_station_validation_performed": False,
            "data_writes": 0,
        },
        "package_sha256": pinned_package,
        "totals": dict(sorted(totals.items())),
        "per_month_utc": by_month,
        "per_day_utc": {k: dict(sorted(v.items())) for k, v in sorted(daily.items())},
        "top_20_days_to_review": priority_days[:20],
        "legacy_batch_counts": dict(sorted(batches.items())),
        "legacy_source_counts": dict(sorted(sources.items())),
        "missing_entire_grid_slot_runs": missing_runs,
        "unfilled_existing_rh_null_runs": null_runs,
        "historical_invalidations": times["historically_invalidated_row_utc"],
        "nonfive_minute_archive_intervals": times["nonfive_minute_archive_interval_end_utc"],
        "offgrid_archive_rows": times["offgrid_original_row_utc"],
        "possible_abrupt_preview_jumps_in_chunk_only": jumps,
        "response_hashes": response_digests,
        "methodology": [
            "One bounded GET per five-day window to private loopback sidecar, with pacing.",
            "No original or reconstruction DB writes; no server restart.",
            "Every 2022 UTC 5-minute slot is checked except 2022-01-01T00:00Z, forbidden by preview API's exclusive FROM guard.",
            "The 5153 historical experimental transitions must match pinned package counts.",
            "Missing whole timestamp rows and existing timestamp rows with NULL RH are separate.",
            "A technical presence check is NOT a reference-station validation or approval.",
            "20 percentage points/5-minute flags are heuristic; chunk boundary jumps require further review.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Single safe RH 2022 whole-year audit")
    parser.add_argument("--year", type=int, choices=(2022,), default=2022)
    args = parser.parse_args()
    del args
    try:
        private = qc.read_private_environment()
        count = 0
        def request(left: int, right: int):
            nonlocal count
            if count:
                time.sleep(MIN_DELAY_SECONDS)
            count += 1
            return qc.fetch(left, right, private)

        def progress(n: int, day: str, rows: int):
            if n == 1 or n % 10 == 0 or n == WINDOWS:
                print(f"Progress: {n}/{WINDOWS} bounded windows; start {day}; last rows {rows}",
                      flush=True)

        report = audit_all(request, progress=progress)
        del private
        target = qc.write_report(report)
        t = report["totals"]
        print("OK: COMPLETE yearly RH 2022 technical QC (read-only, NOT approved).")
        print(f"Scanned windows: {report['scope']['query_windows']}")
        print(f"Expected grid slots (excludes first forbidden boundary): {t['expected_grid_slots']}")
        print(f"Original archive rows: {t['original_archive_rows']}")
        print(f"Missing entire archive slots: {t['missing_entire_grid_slots']}")
        print(f"Existing original RH NULL without estimate: {t['unfilled_original_missing']}")
        print(f"Existing original measured RH unchanged: {t['unchanged_original_measured']}")
        print(f"NULL -> estimate: {t['missing_to_estimate']}")
        print(f"Suspect -> estimate: {t['suspect_to_estimate']}")
        print(f"Historically invalidated: {t['historically_invalidated']}")
        print(f"Unapproved historical transitions: {t['modified_records']}")
        print(f"Off-grid rows: {t['offgrid_archive_rows']}")
        print(f"Non-five-minute archive intervals: {t['nonfive_minute_archive_intervals']}")
        print(f"Potential RH jumps >= 20pp / 5min (within windows): {t['suspicious_5m_jumps_ge_20pp']}")
        print(f"Longest unfilled contiguous RH run (5min slots): {t['longest_consecutive_unfilled_existing_slots']}")
        print("Monthly breakdown (UTC; original archive rows / still NULL / changed / whole-slot gaps):")
        for month, m in report["per_month_utc"].items():
            changed = (m["missing_to_estimate"] + m["suspect_to_estimate"]
                       + m["historically_invalidated"])
            print(f"  {month}: {m['archive_rows']} / {m['preview_rh_null']} / {changed} / {m['missing_entire_grid_slots']}")
        print("Top days to review (UTC; existing unfilled / missing whole slots):")
        for day in report["top_20_days_to_review"][:10]:
            print(f"  {day['utc_day']}: {day['unfilled_existing_rh_null']} / {day['missing_entire_grid_slots']}")
        print(f"Private report (root-only; DO NOT COMMIT): {target}")
        print("NEXT: validate causes and independent reference station accuracy before approval.")
        return 0
    except (qc.AuditError, OSError, KeyError, ValueError, TypeError) as exc:
        print(f"ERROR: Annual audit stopped; no complete report was issued. {exc}",
              file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
