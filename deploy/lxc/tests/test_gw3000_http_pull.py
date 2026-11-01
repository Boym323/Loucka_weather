import importlib.util
import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "loucka-gw3000-http-pull.py"
spec = importlib.util.spec_from_file_location("gw3000_http_pull", SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
STAMP = datetime(2026, 11, 1, 20, 0, tzinfo=timezone.utc)

def sample():
    return {"common_list": [
        {"id": "0x02", "val": "54.5", "unit": "F"},
        {"id": "0x07", "val": "68%"},
        {"id": "0x09", "val": "30.00 inHg"},
        {"id": "0x0B", "val": "7.2 km/h"},
        {"id": "0x0C", "val": "1.12 mph"},
        {"id": "0x0A", "val": "270"},
        {"id": "0x0E", "val": "0.05 in/Hr"},
        {"id": "0x15", "val": "255 W/m2"},
        {"id": "0x17", "val": "2"},
        {"id": "0x10", "val": "22 mm"}
    ]}

class GW3000HTTPTests(unittest.TestCase):
    def test_convert_only_supported_units_and_never_invent_interval_rain(self):
        data = mod.parse_live_payload(sample(), STAMP)
        self.assertEqual(data["source"], "ecowitt_gw3000_lan_http")
        self.assertEqual(data["timestampMeaning"], "gateway_polled_at")
        m = data["readings"]
        self.assertAlmostEqual(m["outTemp"], 12.5)
        self.assertAlmostEqual(m["windSpeed"], 2)
        self.assertAlmostEqual(m["rainRate"], 1.27)
        self.assertAlmostEqual(m["barometer"], 1015.9166, places=2)
        self.assertEqual(m["radiation"], 255)
        self.assertEqual(m["UV"], 2)
        self.assertNotIn("rain", m)

    def test_missing_units_and_lux_are_not_guessed(self):
        raw = sample()
        raw["common_list"][0].pop("unit")
        raw["common_list"][3]["val"] = "7.2"
        raw["common_list"][7]["val"] = "200 lux"
        data = mod.parse_live_payload(raw, STAMP)
        for missing in ("outTemp", "windSpeed", "radiation"):
            self.assertNotIn(missing, data["readings"])

    def test_unknown_payload_and_empty_readings_fail_closed(self):
        for source in ({"common_list": []}, {"unexpected": 2}, "invalid"):
            with self.assertRaises(ValueError):
                mod.parse_live_payload(source, STAMP)

    def test_only_explicit_private_lan_ips(self):
        for ip in ("8.8.8.8", "127.0.0.1", "169.254.3.1", "0.0.0.0", "::1"):
            with self.assertRaises(ValueError):
                mod.private_ip(ip)
        self.assertEqual(mod.private_ip("192.168.1.50"), "192.168.1.50")

    def test_publishes_only_atomically_to_local_state(self):
        with tempfile.TemporaryDirectory() as folder:
            snapshot = mod.parse_live_payload(sample(), STAMP)
            mod.publish(snapshot, Path(folder))
            output = Path(folder) / "latest.json"
            self.assertEqual(json.loads(output.read_text())["readings"]["outTemp"], 12.5)
            self.assertEqual(output.stat().st_mode & 0o777, 0o640)

    def test_requires_opt_in_local_ip(self):
        with patch.dict(mod.os.environ, {}, clear=True):
            self.assertEqual(mod.main(), 2)

if __name__ == "__main__":
    unittest.main()
