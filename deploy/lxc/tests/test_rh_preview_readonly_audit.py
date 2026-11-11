"""Offline tests for bounded, read-only RH preview QC. No DB or HTTP calls."""
import importlib.util
from pathlib import Path
import unittest
from datetime import datetime, timezone

SOURCE = Path(__file__).resolve().parents[1] / "audit-rh-preview.py"
SPEC = importlib.util.spec_from_file_location("rh_qc_audit", SOURCE)
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)


def point(epoch, original, preview, status, batch=None):
    return {
        "at": datetime.fromtimestamp(epoch, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "epoch": epoch,
        "original": {"value": original},
        "preview": {
            "value": preview,
            "status": status,
            "legacyBatchKey": batch,
            "legacySource": "historical_reconstruction" if batch else None,
        },
    }


class RhPreviewReadOnlyAuditTests(unittest.TestCase):
    def setUp(self):
        self.left, _ = audit.window("2022-04-26", 1)
        self.right = self.left + 5 * 300
        self.data = {
            "count": 4,
            "packageSha256": "a" * 64,
            "points": [
                point(self.left + 300, None, 86.5, "experimental_unapproved", "batch-1"),
                point(self.left + 600, None, None, "original_missing"),
                # The third time slot is absent from the original archive.
                point(self.left + 1200, 70.0, 65.0, "experimental_unapproved", "batch-2"),
                point(self.left + 1500, 75.0, None, "historically_invalidated_unapproved", "batch-3"),
            ],
        }

    def test_window_exact_five_days_and_utc_boundary(self):
        start, end = audit.window("2022-04-26", 5)
        self.assertEqual(audit.iso(start), "2022-04-25T23:55:00Z")
        self.assertEqual(audit.iso(end), "2022-04-30T23:55:00Z")
        self.assertEqual((end - start) // 300, 1440)

    def test_window_2022_edges_and_rejection(self):
        first, last = audit.window("2022-01-01", 1)
        self.assertEqual(audit.iso(first), "2022-01-01T00:00:00Z")
        self.assertEqual((last - first) // 300, 287)
        for params in (("2022-02-30", 1), ("2023-01-01", 1),
                       ("2022-12-30", 3), ("2022-04-26", 7)):
            with self.subTest(params=params), self.assertRaises(audit.AuditError):
                audit.window(*params)

    def test_missing_whole_slot_not_confused_with_null_rh(self):
        report = audit.inspect(self.data, self.left, self.right, "f" * 64)
        counts = report["totals"]
        self.assertEqual(counts["expected_grid_slots"], 5)
        self.assertEqual(counts["original_archive_rows"], 4)
        self.assertEqual(counts["missing_entire_grid_slots"], 1)
        self.assertEqual(report["missing_entire_grid_slot_utc"], [audit.iso(self.left + 900)])
        self.assertEqual(counts["unfilled_original_missing"], 1)
        self.assertEqual(report["unchanged_null_original_row_utc"], [audit.iso(self.left + 600)])
        self.assertEqual(counts["missing_to_estimate"], 1)
        self.assertEqual(counts["suspect_to_estimate"], 1)
        self.assertEqual(counts["historically_invalidated"], 1)
        self.assertEqual(counts["modified_records"], 3)
        self.assertEqual(counts["preview_nonnull"], 2)
        self.assertEqual(counts["suspicious_5m_jumps_ge_20pp"], 0)
        self.assertFalse(report["scope"]["approved"])

    def test_reject_duplicated_timestamp(self):
        self.data["points"][1]["epoch"] = self.data["points"][0]["epoch"]
        with self.assertRaises(audit.AuditError):
            audit.inspect(self.data, self.left, self.right, "f" * 64)

    def test_reject_malformed_invalidation(self):
        self.data["points"][-1]["preview"]["value"] = 30
        with self.assertRaises(audit.AuditError):
            audit.inspect(self.data, self.left, self.right, "f" * 64)

    def test_flag_only_true_consecutive_five_minute_jump(self):
        self.data["points"][1] = point(self.left + 600, None, 45.0,
                                       "experimental_unapproved", "batch-1")
        report = audit.inspect(self.data, self.left, self.right, "f" * 64)
        self.assertEqual(report["totals"]["suspicious_5m_jumps_ge_20pp"], 1)
        self.assertEqual(report["suspicious_preview_jumps"][0]["delta_percentage_points"], -41.5)

    def test_no_sql_or_nonlocal_network_dependency(self):
        code = SOURCE.read_text(encoding="utf-8")
        self.assertIn('BASE = "http://127.0.0.1:3101"', code)
        self.assertIn("ProxyHandler({})", code)
        self.assertIn("NoRedirect()", code)
        self.assertNotIn("mysql.connector", code)
        self.assertNotIn("pymysql", code)
        self.assertNotIn("mariadb.connect", code)
        self.assertNotIn("sqlite3.connect", code)
        self.assertNotIn("requests.post", code)


if __name__ == "__main__":
    unittest.main()
