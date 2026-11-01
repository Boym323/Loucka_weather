import importlib.util
from datetime import datetime, timezone
from pathlib import Path
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "loucka-data-collector.py"
spec = importlib.util.spec_from_file_location("loucka_data_collector", SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def document(codes):
    areas = "".join(
      f"<area><areaDesc>ORP</areaDesc><geocode><valueName>CISORP</valueName><value>{code}</value></geocode></area>"
      for code in codes
    )
    return f"""<?xml version="1.0" encoding="utf-8"?>
    <alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
      <identifier>verified-message-001</identifier><status>Actual</status><msgType>Alert</msgType>
      <info><language>cs-CZ</language><event>Silný vítr</event><severity>Severe</severity>
      <onset>2026-11-01T15:00:00+01:00</onset>
      <expires>2026-11-05T20:00:00+01:00</expires>
      <headline>Výstraha pro vítr</headline>{areas}</info>
    </alert>""".encode()


class TestCAPFiltering(unittest.TestCase):
    now = datetime(2026, 11, 1, 19, 0, tzinfo=timezone.utc)

    def test_exact_orp_only(self):
        alert = mod.parse_alerts(document(["7209", "7208"]), self.now)
        self.assertEqual(alert["orp"], "7209")
        self.assertEqual(len(alert["alerts"]), 1)

    def test_neighbour_orp_not_local(self):
        alert = mod.parse_alerts(document(["7208"]), self.now)
        self.assertEqual(alert["alerts"], [])
        self.assertEqual(alert["status"], "verified")

    def test_similar_number_does_not_match(self):
        self.assertFalse(mod.is_target_code("17209"))
        self.assertTrue(mod.is_target_code("07209"))

    def test_no_orp_means_unknown_not_all_clear(self):
        with self.assertRaisesRegex(ValueError, "ORP"):
            mod.parse_alerts(document([]), self.now)

    def test_outdated_warning_excluded(self):
        future = datetime(2027, 11, 1, tzinfo=timezone.utc)
        self.assertEqual(mod.parse_alerts(document(["7209"]), future)["alerts"], [])

    def test_non_cap_rejected(self):
        with self.assertRaises(ValueError):
            mod.parse_alerts(b"<html></html>", self.now)


if __name__ == "__main__":
    unittest.main()
