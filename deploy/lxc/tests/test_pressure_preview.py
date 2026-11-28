import csv
import datetime as dt
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

PATH = Path(__file__).resolve().parents[1] / "pressure_preview.py"
SPEC = importlib.util.spec_from_file_location("pressure_preview", PATH)
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


class PressurePreviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.catalog = self.root / "source.csv.gz"
        self.index = self.root / "index"
        self.t = int(dt.datetime(2018, 10, 1, tzinfo=dt.timezone.utc).timestamp())

    def row(self, epoch, original="", archive="", ref="", estimate=""):
        row = dict.fromkeys(m.FIELDS, "")
        row.update(dateTime_utc=str(epoch), original_pressure_hpa=original,
                   archive_reconstruction_hpa=archive,
                   archive_reconstruction_status="ESTIMATED_UNAPPROVED" if archive else "",
                   regional_reference_diagnostic_hpa=ref, regional_estimate_hpa=estimate,
                   regional_resolution_seconds="600" if ref else "",
                   regional_source="CHMI_10MIN_TRANSFERRED_REFERENCE" if ref else "",
                   regional_decision_status="ESTIMATED_UNAPPROVED_CHMI_REFERENCE" if estimate else "")
        return row

    def write(self, rows):
        with gzip.open(self.catalog, "wt", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=m.FIELDS)
            w.writeheader()
            w.writerows(rows)
        return m.digest(self.catalog)

    def build(self):
        sha = self.write([self.row(self.t, original="935.2", ref="959.5"),
                          self.row(self.t+300, archive="935.4", ref="959.6", estimate="959.6"),
                          self.row(self.t+600)])
        m.build_index(self.catalog, self.index, sha, 3)
        return m.Preview(self.index, sha, 3)

    def test_three_distinct_layers_no_fill_and_no_superseded(self):
        preview = self.build()
        result = preview.read(dt.date(2018, 10, 1), 1)
        self.assertFalse(result["approved"])
        self.assertEqual(result["points"][0][1:5], [935.2, None, 959.5, None])
        self.assertEqual(result["points"][1][1:5], [None, 935.4, 959.6, 959.6])
        self.assertEqual(result["points"][2][1:5], [None]*4)
        self.assertEqual(preview.read(dt.date(2018, 10, 2), 1)["points"], [])
        with self.assertRaises(ValueError):
            preview.read(dt.date(2018, 10, 1), 8)

    def test_hash_duplicates_and_protected_fail_closed(self):
        sha = self.write([self.row(self.t)])
        with self.assertRaises(ValueError):
            m.build_index(self.catalog, self.index, "0"*64, 1)
        self.assertFalse(self.index.exists())
        sha = self.write([self.row(self.t), self.row(self.t)])
        with self.assertRaises(ValueError):
            m.build_index(self.catalog, self.index, sha, 2)
        self.assertFalse(self.index.exists())
        sha = self.write([self.row(m.Q1_START, archive="950")])
        with self.assertRaises(ValueError):
            m.build_index(self.catalog, self.index, sha, 1)
        self.assertFalse(self.index.exists())
        sha = self.write([self.row(self.t, original="950", archive="951")])
        with self.assertRaises(ValueError):
            m.build_index(self.catalog, self.index, sha, 1)

    def test_pinned_index_day_tampering(self):
        preview = self.build()
        (self.index / "2018-10-01.json").write_text("[]")
        with self.assertRaises(RuntimeError):
            preview.read(dt.date(2018, 10, 1), 1)

    def test_http_auth_no_store_and_bounded_query(self):
        preview = self.build()
        token = "t"*32
        server = m.HTTPServer(("127.0.0.1", 0), m.handler(preview, token))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        base = f"http://127.0.0.1:{server.server_port}"
        route = base + m.BASE + "/data?from=2018-10-01&days=1"
        with self.assertRaises(HTTPError) as unauthorized:
            urlopen(route, timeout=5)
        self.assertEqual(unauthorized.exception.code, 401)
        with urlopen(Request(route, headers={"Authorization": "Bearer " + token}), timeout=5) as r:
            self.assertEqual(r.headers["Cache-Control"], "no-store")
            self.assertFalse(json.load(r)["approved"])
        with self.assertRaises(HTTPError) as invalid:
            urlopen(Request(route.replace("days=1", "days=8"), headers={"Authorization": "Bearer " + token}), timeout=5)
        self.assertEqual(invalid.exception.code, 422)
        with urlopen(base + m.BASE, timeout=5) as r:
            self.assertIn("frame-ancestors 'none'", r.headers["Content-Security-Policy"])
            self.assertIn("Historický staniční tlak", r.read().decode())
        with self.assertRaises(HTTPError) as public:
            urlopen(base + "/api/v1/history", timeout=5)
        self.assertEqual(public.exception.code, 404)


if __name__ == "__main__":
    unittest.main()
