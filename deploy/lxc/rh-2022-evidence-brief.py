#!/usr/bin/env python3
"""Offline decision brief: join already-validated RH 2022 annual and readiness reports.

Reads only two private local JSON files. No network, SQL, token, restart, writes,
automatic correction or approval. Execute as root on the development LXC.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys

ROOT = Path("/var/lib/loucka-qc")
REPORTS = ROOT / "rh-preview-audit-reports"
READINESS = ROOT / "qc-rh-2022-readiness.json"
ANNUAL_PATTERN = "rh-qc-2022-12-31-*.json"
EXPECTED_CHANGES = {
    "missing_to_estimate": 2874,
    "suspect_to_estimate": 2194,
    "historically_invalidated": 85,
}
MONTHS = [f"2022-{n:02d}" for n in range(1, 13)]


class EvidenceError(Exception):
    pass


def secure_json(path: Path, parent: Path) -> tuple[dict, str]:
    if path.parent != parent:
        raise EvidenceError("Unexpected private report path.")
    directory = parent.lstat()
    file = path.lstat()
    if (not stat.S_ISDIR(directory.st_mode) or stat.S_ISLNK(directory.st_mode)
            or directory.st_mode & 0o077):
        raise EvidenceError("Private report directory is not restricted to its owner.")
    if (not stat.S_ISREG(file.st_mode) or stat.S_ISLNK(file.st_mode)
            or file.st_mode & 0o077 or file.st_size > 3_000_000):
        raise EvidenceError("Private report file has unsafe type, size or permissions.")
    if parent == REPORTS and (file.st_uid != 0 or directory.st_uid != 0):
        raise EvidenceError("Annual private report is not root owned.")
    raw = path.read_bytes()
    try:
        result = json.loads(raw)
    except ValueError as exc:
        raise EvidenceError("Invalid private JSON report.") from exc
    if not isinstance(result, dict):
        raise EvidenceError("Invalid private report format.")
    return result, hashlib.sha256(raw).hexdigest()


def latest_annual() -> Path:
    try:
        files = sorted(REPORTS.glob(ANNUAL_PATTERN), reverse=True)
    except OSError as exc:
        raise EvidenceError("Cannot enumerate private annual reports.") from exc
    if not files:
        raise EvidenceError("No completed RH 2022 annual report found.")
    return files[0]


def nonneg(value) -> bool:
    return type(value) is int and value >= 0


def parse_annual(annual: dict) -> dict:
    scope = annual.get("scope") or {}
    totals = annual.get("totals") or {}
    monthly = annual.get("per_month_utc")
    if (annual.get("audit_version") != 2 or
        annual.get("status") != "technical_scan_complete_not_meteorologically_approved"
        or scope.get("year_utc") != 2022 or scope.get("query_windows") != 73
        or scope.get("reference_station_validation_performed") is not False
        or scope.get("data_writes") != 0
        or annual.get("dataset") != "original_archive_plus_immutable_private_preview_overlay"
        or not isinstance(annual.get("package_sha256"), str)
        or not re.fullmatch(r"[0-9a-f]{64}", annual["package_sha256"])
        or not isinstance(monthly, dict) or list(monthly) != MONTHS):
        raise EvidenceError("Annual report is not the complete unapproved 2022 scan.")
    required = (
        "expected_grid_slots", "original_archive_rows",
        "missing_entire_grid_slots", "offgrid_archive_rows",
        "unfilled_original_missing", "unchanged_original_measured",
        "modified_records", *EXPECTED_CHANGES,
    )
    if not all(nonneg(totals.get(k)) for k in required):
        raise EvidenceError("Invalid annual totals.")
    if (totals["expected_grid_slots"] != 105119 or
        totals["expected_grid_slots"] - totals["missing_entire_grid_slots"]
        + totals["offgrid_archive_rows"] != totals["original_archive_rows"] or
        totals["modified_records"] != 5153 or
        any(totals[k] != v for k, v in EXPECTED_CHANGES.items())):
        raise EvidenceError("Annual totals do not match the pinned RH 2022 contract.")
    if (totals["original_archive_rows"] !=
        totals["unfilled_original_missing"] + totals["unchanged_original_measured"]
        + sum(totals[k] for k in EXPECTED_CHANGES)):
        raise EvidenceError("Annual original rows are not fully classified.")
    original_null = totals["unfilled_original_missing"] + totals["missing_to_estimate"]
    return {"totals": totals, "monthly": monthly, "original_null": original_null}


def join_evidence(annual: dict, readiness: dict) -> dict:
    a = parse_annual(annual)
    if (readiness.get("schemaVersion") != "1"
        or readiness.get("readinessVersion") != "rh-2022-evidence-gates-v1"
        or readiness.get("status") != "screening_only"
        or readiness.get("complete") is not True
        or readiness.get("period") != "2022"
        or readiness.get("safety", {}).get("databaseWrites") != 0
        or readiness.get("safety", {}).get("automaticApprovals") is not False
        or readiness.get("safety", {}).get("automaticCorrections") is not False
        or readiness.get("safety", {}).get("proposedReconstruction") is not False):
        raise EvidenceError("Missing or unsafe validated RH readiness evidence.")
    rs = readiness.get("totals") or {}
    if (rs.get("nullRhSlots") != a["original_null"] or
        rs.get("absentOriginalSlots") != a["totals"]["missing_entire_grid_slots"] + 1):
        raise EvidenceError(
            "Annual archive and previous independent RH readiness totals disagree. "
            "Check the first 2022-01-01T00:00Z slot without silently reconciling."
        )
    items = readiness.get("months")
    if not isinstance(items, list) or len(items) != 12:
        raise EvidenceError("Incomplete monthly readiness.")
    result = []
    for idx, m in enumerate(items):
        month = MONTHS[idx]
        y = a["monthly"].get(month)
        if not isinstance(m, dict) or not isinstance(y, dict) or m.get("month") != month:
            raise EvidenceError("Missing/misordered monthly readiness evidence.")
        for key in (
            "archive_rows", "expected_grid_slots", "missing_entire_grid_slots",
            "original_rh_null", "preview_rh_null",
            *EXPECTED_CHANGES,
        ):
            if not nonneg(y.get(key)):
                raise EvidenceError("Invalid month-level annual audit data.")
        if (m.get("nullRhSlots") != y["original_rh_null"]
            or m.get("absentOriginalSlots") != y["missing_entire_grid_slots"] + (1 if idx == 0 else 0)
            or m.get("automaticWriteAllowed") is not False
            or m.get("reviewState") != "needs_manual_review"
            or m.get("estimatedReplacementRhPct") is not None):
            raise EvidenceError(f"QC/annual mismatch or unsafe status in {month}.")
        if y["archive_rows"] + y["missing_entire_grid_slots"] != y["expected_grid_slots"]:
            raise EvidenceError("Annual monthly slot count is inconsistent.")
        count_est = sum(y[k] for k in EXPECTED_CHANGES)
        if y["original_rh_null"] < y["missing_to_estimate"]:
            raise EvidenceError("Estimated NULL exceeds original NULL.")
        if y["original_rh_null"] - y["missing_to_estimate"] + y["historically_invalidated"] != y["preview_rh_null"]:
            raise EvidenceError("Monthly NULL changes do not reconcile.")
        evidence = m.get("evidenceStatus")
        if not isinstance(evidence, str) or not evidence:
            raise EvidenceError("Invalid monthly evidence gate.")
        days = m.get("validatedTestDays")
        if not nonneg(days):
            raise EvidenceError("Invalid holdout day count.")
        result.append({
            "month": month,
            "rows": y["archive_rows"],
            "original_null": y["original_rh_null"],
            "preview_null": y["preview_rh_null"],
            "absent_slots": m["absentOriginalSlots"],
            "historical_changes": count_est,
            "holdout_test_days": days,
            "evidence_gate": evidence,
            "next_action": m.get("nextAction"),
        })
    return {
        "status": "needs_manual_review",
        "technical_annual_complete": True,
        "independent_meteorological_validation_of_5153_changes": False,
        "automatic_approval_or_write": False,
        "original_rows": a["totals"]["original_archive_rows"],
        "original_rh_null": a["original_null"],
        "unapproved_preview_rh_null": (
            a["totals"]["unfilled_original_missing"] + a["totals"]["historically_invalidated"]),
        "whole_archive_gaps_all_2022": rs["absentOriginalSlots"],
        "review_by_month": result,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="RH 2022: offline annual-to-readiness decision bridge")
    parser.add_argument("--brief", action="store_true", help="Print non-sensitive monthly action matrix")
    args = parser.parse_args()
    try:
        if os.geteuid() != 0:
            raise EvidenceError("Run as root to read both private QC evidence files.")
        annual_path = latest_annual()
        annual, annual_hash = secure_json(annual_path, REPORTS)
        readiness, readiness_hash = secure_json(READINESS, ROOT)
        combined = join_evidence(annual, readiness)
        print("OK: RH 2022 annual archive and historical independent readiness reconciled.")
        print(f"Evidence file hashes (not tokens): annual={annual_hash[:16]} readiness={readiness_hash[:16]}")
        print(f"Original archive rows: {combined['original_rows']}; original RH NULL: {combined['original_rh_null']}")
        print(f"Unapproved preview RH NULL: {combined['unapproved_preview_rh_null']}; total missing whole slots: {combined['whole_archive_gaps_all_2022']} (including API-inaccessible first slot).")
        print("No new database query or reconstruction approval. Decisions still require independent review.")
        if args.brief:
            print("Month | original NULL | preview NULL | changes | absent | holdout days | evidence gate")
            for m in combined["review_by_month"]:
                print(f"{m['month']} | {m['original_null']:5d} | {m['preview_null']:5d} | "
                      f"{m['historical_changes']:4d} | {m['absent_slots']:3d} | "
                      f"{m['holdout_test_days']:3d} | {m['evidence_gate']}")
            print("Next: prioritize unavailable local RH originals for blocked months; separately review the 3578 April changes and 7 flagged jumps.")
        return 0
    except (EvidenceError, OSError, ValueError, TypeError, KeyError) as exc:
        print(f"ERROR: Incomplete or inconsistent evidence: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
