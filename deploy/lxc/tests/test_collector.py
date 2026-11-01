import importlib.util
import json
import tempfile
from datetime import timedelta
from unittest.mock import patch
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


class TestCameraArchive(unittest.TestCase):
    """Regression: the first successful JPEG must also produce a valid JSON index."""

    def test_save_index_parses_stem_not_jpg_suffix(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(mod, "CAMERA_DIR", Path(temp)):
            frames = Path(temp) / "frames"
            frames.mkdir()
            (frames / "20261101T193736Z.jpg").write_bytes(b"sample")
            mod.save_index()
            index = json.loads((Path(temp) / "index.json").read_text())
            self.assertEqual(index["timestampMeaning"], "downloaded_not_captured")
            self.assertEqual(index["frames"], [{
                "name": "20261101T193736Z.jpg",
                "fetchedAt": "2026-11-01T19:37:36+00:00"
            }])

    def test_capture_and_unchanged_frame_are_published(self):
        jpeg = b"\xff\xd8\xff" + b"sample" + b"\xff\xd9"
        with tempfile.TemporaryDirectory() as temp, patch.object(mod, "CAMERA_DIR", Path(temp)):
            with patch.object(mod, "fetch_bytes", return_value=jpeg), patch.object(mod, "generate_yesterday_video"):
                mod.capture_camera()
                index = json.loads((Path(temp) / "index.json").read_text())
                self.assertEqual(len(index["frames"]), 1)
                filename = index["frames"][0]["name"]
                self.assertTrue((Path(temp) / "frames" / filename).exists())
                mod.capture_camera()
                self.assertEqual(len(list((Path(temp) / "frames").glob("*.jpg"))), 1)
                self.assertEqual(len(json.loads((Path(temp) / "index.json").read_text())["frames"]), 1)

    def test_yesterday_timelapse_uses_existing_frames_not_fake_images(self):
        day = datetime.now(timezone.utc).date() - timedelta(days=1)
        with tempfile.TemporaryDirectory() as temp, patch.object(mod, "CAMERA_DIR", Path(temp)):
            frames = Path(temp) / "frames"
            frames.mkdir()
            prefix = day.strftime("%Y%m%d")
            for hour in range(6):
                (frames / f"{prefix}T{hour:02d}0000Z.jpg").write_bytes(b"jpeg" + bytes([hour]))
            def simulate_ffmpeg(command, **kwargs):
                self.assertIn("-pattern_type", command)
                self.assertEqual(command[-2], "mp4")
                Path(command[-1]).write_bytes(b"0" * 1500)
            with patch.object(mod.shutil, "which", return_value="/usr/bin/ffmpeg"), \
                 patch.object(mod.subprocess, "run", side_effect=simulate_ffmpeg):
                mod.generate_yesterday_video()
            video = Path(temp) / "timelapse" / f"{day.isoformat()}.mp4"
            self.assertTrue(video.exists())
            mod.save_index()
            index = json.loads((Path(temp) / "index.json").read_text())
            self.assertEqual(index["videos"][0]["name"], video.name)


if __name__ == "__main__":
    unittest.main()
