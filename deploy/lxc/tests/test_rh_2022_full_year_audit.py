"""Offline contract tests for the full RH 2022 private annual audit.

All 73 windows and exactly 5153 synthetic changes, but no HTTP/SQL/systemd calls.
"""
from datetime import datetime, timezone
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("rh_year_audit", ROOT / "audit-rh-2022-year.py")
year = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(year)


def point(epoch, kind):
    original = None if kind == "missing_to_estimate" else 54.0
    preview = None if kind == "historically_invalidated" else 61.0
    status = ("historically_invalidated_unapproved"
              if kind == "historically_invalidated" else "experimental_unapproved")
    return {
        "epoch": epoch,
        "at": datetime.fromtimestamp(epoch, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "intervalMinutes": 5,
        "original": {"value": original},
        "preview": {
            "value": preview,
            "status": status,
            "legacyBatchKey": "synthetic-2022",
            "legacySource": "offline-fixture",
        },
    }


class RhWholeYearReadOnlyAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.year_windows = year.windows()
        cls.data = {}
        remaining = []
        for kind in ("missing_to_estimate", "suspect_to_estimate",
                     "historically_invalidated"):
            remaining.extend([kind] * year.EXPECTED_CHANGES[kind])
        index = 0
        for day, left, right in cls.year_windows:
            rows = []
            for epoch in range(left + 300, right + 1, 300):
                if index >= len(remaining):
                    break
                rows.append(point(epoch, remaining[index]))
                index += 1
            cls.data[left] = {
                "points": rows,
                "count": len(rows),
                "packageSha256": "a" * 64,
            }
        assert index == 5153

    def test_all_73_five_day_requests_nonoverlapping(self):
        self.assertEqual(len(self.year_windows), 73)
        self.assertEqual(self.year_windows[0][0], "2022-01-01")
        self.assertEqual(self.year_windows[-1][0], "2022-12-27")
        self.assertEqual(self.year_windows[0][1], year.qc.LOWER)
        self.assertEqual(self.year_windows[-1][2], year.qc.UPPER - 300)
        for (_, a, b), (_, c, d) in zip(self.year_windows, self.year_windows[1:]):
            self.assertEqual(b, c)
            self.assertEqual((d-c)//300, 1440)

    def test_complete_synthetic_year_and_expected_5153(self):
        calls = []
        def load(left, right):
            calls.append((left, right))
            return self.data[left], "d" * 64
        report = year.audit_all(load)
        t = report["totals"]
        self.assertEqual(len(calls), 73)
        self.assertEqual(t["expected_grid_slots"], 105119)
        self.assertEqual(t["original_archive_rows"], 5153)
        self.assertEqual(t["missing_entire_grid_slots"], 105119-5153)
        self.assertEqual(t["unfilled_original_missing"], 0)
        self.assertEqual(t["missing_to_estimate"], 2874)
        self.assertEqual(t["suspect_to_estimate"], 2194)
        self.assertEqual(t["historically_invalidated"], 85)
        self.assertEqual(t["modified_records"], 5153)
        self.assertEqual(len(report["per_month_utc"]), 12)
        self.assertEqual(len(report["per_day_utc"]), 365)
        self.assertIn("2022-01", report["per_month_utc"])
        self.assertIn("2022-12", report["per_month_utc"])
        self.assertFalse(report["scope"]["reference_station_validation_performed"])
        self.assertEqual(report["scope"]["data_writes"], 0)

    def test_reject_partial_package_coverage(self):
        # No silently 'complete' annual scan if even one historical change vanishes.
        left = self.year_windows[0][1]
        removed = self.data[left]["points"].pop()
        self.data[left]["count"] -= 1
        try:
            with self.assertRaisesRegex(year.qc.AuditError, "5153-record package"):
                year.audit_all(lambda start, end: (self.data[start], "d" * 64))
        finally:
            self.data[left]["points"].append(removed)
            self.data[left]["count"] += 1

    def test_reject_package_swap_during_year(self):
        first = self.year_windows[0][1]
        def changed(left, right):
            source = self.data[left]
            return ({**source, "packageSha256": "b"*64} if left != first else source,
                    "d"*64)
        with self.assertRaisesRegex(year.qc.AuditError, "changed during annual scan"):
            year.audit_all(changed)

    def test_safety_boundaries_and_no_db_client(self):
        source = (ROOT / "audit-rh-2022-year.py").read_text(encoding="utf-8")
        self.assertIn("MIN_DELAY_SECONDS = 1.5", source)
        self.assertIn("qc.fetch(left, right, private)", source)
        self.assertIn("qc.read_private_environment()", source)
        self.assertIn("qc.write_report(report)", source)
        self.assertNotIn("mysql.connector", source)
        self.assertNotIn("pymysql", source)
        self.assertNotIn("sqlite3.connect", source)
        self.assertNotIn("subprocess.run", source)
        self.assertNotIn("requests.post", source)


if __name__ == "__main__":
    unittest.main()
