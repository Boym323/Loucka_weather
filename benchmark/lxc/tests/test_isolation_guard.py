"""No MariaDB connection: test fail-closed FULL target attestation."""
import unittest
from benchmark.lxc.isolation_guard import IsolationError, verify_full_snapshot

class Cursor:
    def __init__(self, *, marker="test_snapshot_abc12345", db="weewx_bench_fixture", missing=False):
        self.marker=marker;self.db=db;self.missing=missing;self.state=None
    def execute(self,sql):
        if self.missing and "bench_isolation_attestation" in sql:
            raise RuntimeError("No test-only marker")
        self.state=sql
    def fetchone(self):
        return (self.db,)
    def fetchall(self):
        return [(self.marker,)]

ENV={"BENCH_ISOLATED_DB":"YES","BENCH_DB_NAME":"weewx_bench_fixture","BENCH_EXPECTED_SNAPSHOT_ID":"test_snapshot_abc12345"}

class SnapshotGuardTests(unittest.TestCase):
    def test_valid_attested_snapshot(self):
        self.assertTrue(verify_full_snapshot(Cursor(),ENV))
    def test_flag_only_rejected(self):
        for env in (
            {**ENV,"BENCH_EXPECTED_SNAPSHOT_ID":""},
            {**ENV,"BENCH_EXPECTED_SNAPSHOT_ID":"x"},
            {**ENV,"BENCH_DB_NAME":"pocasi-loucka.eu"},
            {**ENV,"BENCH_DB_NAME":"weewx"},
            {**ENV,"BENCH_ISOLATED_DB":"NO"},
        ):
            with self.subTest(env=env),self.assertRaises(IsolationError):
                verify_full_snapshot(Cursor(),env)
    def test_mismatched_marker(self):
        with self.assertRaises(IsolationError):verify_full_snapshot(Cursor(marker="other_snapshot_abcdef"),ENV)
    def test_wrong_database(self):
        with self.assertRaises(IsolationError):verify_full_snapshot(Cursor(db="production"),ENV)
    def test_marker_missing(self):
        with self.assertRaises(IsolationError):verify_full_snapshot(Cursor(missing=True),ENV)

if __name__=="__main__":
    unittest.main()
