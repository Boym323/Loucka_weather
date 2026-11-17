"""Offline tests for privacy-safe annual RH QC + existing readiness decision bridge."""
import copy
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "rh-2022-evidence-brief.py"
SPEC = importlib.util.spec_from_file_location("rh_evidence_bridge", SCRIPT)
bridge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bridge)

ROWS = [8499, 8058, 8681, 8633, 8902, 8577, 8893, 8840, 8614, 8892, 8634, 8919]
GAPS = [428, 6, 247, 7, 26, 63, 35, 88, 26, 36, 6, 9]
PREVIEW_NULL = [8485, 8058, 6980, 265, 8851, 8379, 702, 0, 2, 5, 0, 0]
NULL_TO_EST = [0, 0, 1023, 1299, 0, 0, 552, 0, 0, 0, 0, 0]
SUSPECT_TO_EST = [0, 0, 0, 2194, 0, 0, 0, 0, 0, 0, 0, 0]
INVALIDATED = [0, 0, 0, 85, 0, 0, 0, 0, 0, 0, 0, 0]


def examples():
    months = {}
    evidence = []
    for i, month in enumerate(bridge.MONTHS):
        original_null = PREVIEW_NULL[i] + NULL_TO_EST[i] - INVALIDATED[i]
        month_data = {
            "archive_rows": ROWS[i],
            "missing_entire_grid_slots": GAPS[i],
            "expected_grid_slots": ROWS[i] + GAPS[i],
            "original_rh_null": original_null,
            "preview_rh_null": PREVIEW_NULL[i],
            "missing_to_estimate": NULL_TO_EST[i],
            "suspect_to_estimate": SUSPECT_TO_EST[i],
            "historically_invalidated": INVALIDATED[i],
        }
        months[month] = month_data
        evidence.append({
            "month": month,
            "nullRhSlots": original_null,
            "absentOriginalSlots": GAPS[i] + (1 if i == 0 else 0),
            "automaticWriteAllowed": False,
            "reviewState": "needs_manual_review",
            "estimatedReplacementRhPct": None,
            "evidenceStatus": "blocked_no_local_validation" if i < 7 else "no_null_rh",
            "validatedTestDays": 0 if i < 7 else 25,
            "nextAction": "Only independently verify; never approve automatically.",
        })
    annual = {
        "audit_version": 2,
        "dataset": "original_archive_plus_immutable_private_preview_overlay",
        "status": "technical_scan_complete_not_meteorologically_approved",
        "package_sha256": "c" * 64,
        "scope": {
            "year_utc": 2022,
            "query_windows": 73,
            "reference_station_validation_performed": False,
            "data_writes": 0,
        },
        "totals": {
            "expected_grid_slots": 105119,
            "original_archive_rows": 104142,
            "missing_entire_grid_slots": 977,
            "offgrid_archive_rows": 0,
            "unfilled_original_missing": 41642,
            "unchanged_original_measured": 57347,
            "missing_to_estimate": 2874,
            "suspect_to_estimate": 2194,
            "historically_invalidated": 85,
            "modified_records": 5153,
        },
        "per_month_utc": months,
    }
    readiness = {
        "schemaVersion": "1",
        "readinessVersion": "rh-2022-evidence-gates-v1",
        "status": "screening_only",
        "complete": True,
        "period": "2022",
        "safety": {
            "databaseWrites": 0, "automaticApprovals": False,
            "automaticCorrections": False, "proposedReconstruction": False,
        },
        "totals": {"nullRhSlots": 44516, "absentOriginalSlots": 978},
        "months": evidence,
    }
    return annual, readiness


class EvidenceBridgeTests(unittest.TestCase):
    def setUp(self):
        self.annual, self.readiness = examples()

    def test_reconcile_real_counts_and_boundary_difference(self):
        brief = bridge.join_evidence(self.annual, self.readiness)
        self.assertEqual(brief["original_rows"], 104142)
        self.assertEqual(brief["original_rh_null"], 44516)
        self.assertEqual(brief["unapproved_preview_rh_null"], 41727)
        self.assertEqual(brief["whole_archive_gaps_all_2022"], 978)
        self.assertEqual(len(brief["review_by_month"]), 12)
        self.assertEqual(brief["review_by_month"][3]["historical_changes"], 3578)
        self.assertEqual(brief["review_by_month"][6]["preview_null"], 702)
        self.assertFalse(brief["automatic_approval_or_write"])

    def test_mismatch_historical_reference_absences_fail_closed(self):
        self.readiness["totals"]["absentOriginalSlots"] = 977
        with self.assertRaises(bridge.EvidenceError):
            bridge.join_evidence(self.annual, self.readiness)

    def test_reference_null_month_mismatch_fails(self):
        self.readiness["months"][1]["nullRhSlots"] += 1
        with self.assertRaises(bridge.EvidenceError):
            bridge.join_evidence(self.annual, self.readiness)

    def test_approval_and_write_gate_cannot_be_bypassed(self):
        for file, path, value in (
            ("readiness", ("safety", "automaticApprovals"), True),
            ("readiness", ("months", 3, "automaticWriteAllowed"), True),
            ("annual", ("scope", "data_writes"), 1),
        ):
            with self.subTest(file=file, path=path):
                annual, readiness = examples()
                obj = annual if file == "annual" else readiness
                for key in path[:-1]:
                    obj = obj[key]
                obj[path[-1]] = value
                with self.assertRaises(bridge.EvidenceError):
                    bridge.join_evidence(annual, readiness)

    def test_no_db_access_and_no_mutation_calls(self):
        src = SCRIPT.read_text(encoding="utf-8")
        self.assertNotIn("mysql.connector", src)
        self.assertNotIn("pymysql", src)
        self.assertNotIn("mariadb.connect", src)
        self.assertNotIn("urlopen(", src)
        self.assertNotIn("requests.get", src)
        self.assertNotIn("requests.post", src)
        self.assertNotIn("write_text(", src)
        self.assertNotIn("systemctl", src)
        self.assertNotIn("subprocess", src)


if __name__ == "__main__":
    unittest.main()
