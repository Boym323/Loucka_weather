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

    def test_separate_rain_array_uses_rate_not_cumulative_total(self):
        packet = sample()
        packet["common_list"] = [x for x in packet["common_list"] if x["id"] != "0x0E"]
        packet["rain"] = [{"id": "0x10", "val": "200 mm"}, {"id": "0x0E", "val": "1.5 mm/Hr"}]
        parsed = mod.parse_live_payload(packet, STAMP)
        self.assertAlmostEqual(parsed["readings"]["rainRate"], 1.5)
        self.assertNotIn("rain", parsed["readings"])

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

    def test_actual_gw3000_payload_wh25_pm25_soil_and_unknown_fields(self):
        # Regression against the actual LAN GET response, supplied 2026-11-01.
        sample_data = {
            "common_list": [
                {"id": "0x02", "val": "6.5", "unit": "C"},
                {"id": "0x07", "val": "80%"},
                {"id": "3", "val": "3.7", "unit": "C"},
                {"id": "5", "val": "0.194 kPa"},
                {"id": "0x03", "val": "3.3", "unit": "C", "battery": "0"},
                {"id": "0x0B", "val": "4.2 m/s"},
                {"id": "0x0C", "val": "5.1 m/s"},
                {"id": "0x19", "val": "10.1 m/s"},
                {"id": "0x15", "val": "0.00 W/m2"},
                {"id": "0x17", "val": "0"},
                {"id": "0x0A", "val": "62", "battery": "5", "voltage": "3.28"},
                {"id": "0x6D", "val": "65"}
            ],
            "rain": [
                {"id": "0x0D", "val": "0.0 mm"},
                {"id": "0x0E", "val": "0.0 mm/Hr"},
                {"id": "0x7D", "val": "0.0 mm"},
                {"id": "0x7C", "val": "0.1 mm"},
                {"id": "0x10", "val": "0.0 mm"},
                {"id": "0x11", "val": "3.4 mm"},
                {"id": "0x12", "val": "0.0 mm"},
                {"id": "0x13", "val": "494.6 mm", "battery": "0"},
                {"id": "0x14", "val": "494.6 mm"}
            ],
            "wh25": [{"intemp": "10.3", "unit": "C", "inhumi": "57%",
                      "abs": "976.3 hPa", "rel": "1027.6 hPa"}],
            "lightning": [{"distance": "20 km", "date": "2026-09-21T17:03:53",
                           "count": "0", "battery": "5"}],
            "ch_pm25": [{"channel": "1", "PM25": "3.0", "PM25_24H": "7.4",
                         "PM25_RealAQI": "13", "battery": "5"}],
            "ch_aisle": [{"channel": "1", "name": "TeplotaPlot", "battery": "0",
                          "temp": "7.1", "unit": "C", "humidity": "None"}],
            "ch_soil": [{"channel": "1", "name": "Půda zahrada",
                         "battery": "2", "voltage": "1.30", "humidity": "48%"}],
            "debug": [{"heap": "137220", "reset_reason": "3"}]
        }
        result = mod.parse_live_payload(sample_data, STAMP)
        measurements = result["readings"]
        expected = {
            "outTemp": 6.5, "outHumidity": 80, "windSpeed": 4.2,
            "windGust": 5.1, "windDir": 62, "radiation": 0,
            "UV": 0, "rainRate": 0, "inTemp": 10.3, "inHumidity": 57,
            "barometer": 1027.6, "pressure": 976.3,
            "pm25_1": 3, "soilMoisture1": 48
        }
        self.assertEqual(measurements, expected)
        # Stale lightning timestamps, raw battery codes and unidentified channels
        # must not be reclassified into current weather measurements.
        for unsafe in ("rain", "lightning_distance", "extraTemp1",
                       "batteryStatus1", "cloudbase"):
            self.assertNotIn(unsafe, measurements)

    def test_channel_identity_and_invalid_sensor_values_are_not_guessed(self):
        data = sample()
        data["wh25"] = [{"intemp": "10.3", "unit": "C", "inhumi": "None",
                          "abs": "9999 hPa", "rel": "not-a-number"}]
        data["ch_pm25"] = [{"channel": "2", "PM25": "3.0"}]
        data["ch_soil"] = [{"channel": "2", "humidity": "48%"}]
        parsed = mod.parse_live_payload(data, STAMP)["readings"]
        for forbidden in ("inHumidity", "pressure", "pm25_1", "soilMoisture1"):
            self.assertNotIn(forbidden, parsed)
        # Valid common_list pressure wins over an invalid WH25 replacement.
        self.assertAlmostEqual(parsed["barometer"], 1015.9166, places=2)
        # Invalid 24h PM2.5 and AQI values are not used as live PM2.5.
        data["ch_pm25"] = [{"channel": "1", "PM25": "None", "PM25_24H": "7.4",
                            "PM25_RealAQI": "13"}]
        parsed = mod.parse_live_payload(data, STAMP)["readings"]
        self.assertNotIn("pm25_1", parsed)

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
