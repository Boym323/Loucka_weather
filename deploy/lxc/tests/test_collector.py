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
            with patch.object(mod, "fetch_bytes", return_value=jpeg), patch.object(mod, "generate_timelapses"):
                mod.capture_camera()
                index = json.loads((Path(temp) / "index.json").read_text())
                self.assertEqual(len(index["frames"]), 1)
                filename = index["frames"][0]["name"]
                self.assertTrue((Path(temp) / "frames" / filename).exists())
                mod.capture_camera()
                self.assertEqual(len(list((Path(temp) / "frames").glob("*.jpg"))), 1)
                self.assertEqual(len(json.loads((Path(temp) / "index.json").read_text())["frames"]), 1)

    def test_capture_index_survives_failed_ffmpeg_transcode(self):
        jpeg = b"\xff\xd8\xff" + b"verified-data" + b"\xff\xd9"
        with tempfile.TemporaryDirectory() as temp, patch.object(mod, "CAMERA_DIR", Path(temp)):
            with patch.object(mod, "fetch_bytes", return_value=jpeg), \
                 patch.object(mod, "generate_timelapses", side_effect=RuntimeError("mock ffmpeg fail")):
                with self.assertRaisesRegex(RuntimeError, "mock ffmpeg fail"):
                    mod.capture_camera()
            index = json.loads((Path(temp) / "index.json").read_text())
            self.assertEqual(index["schemaVersion"], "1")
            self.assertEqual(len(index["frames"]), 1)
            self.assertTrue((Path(temp) / "frames" / index["frames"][0]["name"]).is_file())

    def test_local_day_includes_previous_utc_date_and_handles_dst(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(mod, "CAMERA_DIR", Path(temp)):
            folder = Path(temp) / "frames"
            folder.mkdir()
            for stamp in (
                "20261117T225900Z",  # Nov 17 in Prague
                "20261117T230000Z",  # Nov 18 00:00 in Prague
                "20261118T010000Z",
                "20261118T225959Z",  # Nov 18 23:59:59 in Prague
                "20261118T230000Z",  # Nov 19 00:00 in Prague
                "20260328T225900Z",  # Before Prague spring DST day
                "20260328T230000Z",  # Spring DST day starts
                "20260329T215959Z",  # Last UTC second of spring day
                "20260329T220000Z",  # Next local day
                "20261024T215959Z",  # Before Prague fall DST day
                "20261024T220000Z",  # Fall DST day starts
                "20261025T225959Z",  # Last UTC second of fall day
                "20261025T230000Z",  # Next local day
            ):
                (folder / f"{stamp}.jpg").write_bytes(b"jpeg")
            november = [p.stem for p in mod.frames_for_local_day(datetime(2026, 11, 18).date())]
            self.assertEqual(november, [
                "20261117T230000Z", "20261118T010000Z", "20261118T225959Z"
            ])
            spring = mod.frames_for_local_day(datetime(2026, 3, 29).date())
            self.assertEqual(len(spring), 2)
            self.assertEqual(spring[0].stem, "20260328T230000Z")
            autumn = mod.frames_for_local_day(datetime(2026, 10, 25).date())
            self.assertEqual(len(autumn), 2)
            self.assertEqual(autumn[-1].stem, "20261025T225959Z")

    def test_current_day_preview_is_versioned_and_updated_at_most_every_15_minutes(self):
        now = datetime(2026, 11, 18, 7, 0, tzinfo=timezone.utc)
        with tempfile.TemporaryDirectory() as temp, patch.object(mod, "CAMERA_DIR", Path(temp)):
            frames = Path(temp) / "frames"
            frames.mkdir()
            for minute in range(6):
                (frames / f"20261118T06{minute * 10:02d}00Z.jpg").write_bytes(b"jpeg")
            commands = []
            def simulate_ffmpeg(command, **kwargs):
                self.assertIn("concat", command)
                self.assertIn("-safe", command)
                listing = Path(command[command.index("-i") + 1]).read_text()
                self.assertIn("20261118T060000Z.jpg", listing)
                self.assertIn("duration 0.1", listing)
                Path(command[-1]).write_bytes(b"0" * 1500)
                commands.append(command)
            with patch.object(mod.shutil, "which", return_value="/usr/bin/ffmpeg"), \
                 patch.object(mod.subprocess, "run", side_effect=simulate_ffmpeg):
                mod.generate_timelapses(now)
                mod.generate_timelapses(now + timedelta(minutes=10))
                self.assertEqual(len(commands), 1)
                (frames / "20261118T071900Z.jpg").write_bytes(b"fresh-jpeg")
                mod.generate_timelapses(now + timedelta(minutes=20))
                self.assertEqual(len(commands), 2)
            video_dir = Path(temp) / "timelapse"
            previews = sorted(video_dir.glob("2026-11-18-v*.mp4"))
            self.assertEqual(len(previews), 2)
            self.assertNotEqual(previews[0].name, previews[1].name)
            mod.save_index()
            index = json.loads((Path(temp) / "index.json").read_text())
            self.assertEqual(index["dayTimezone"], "Europe/Prague")
            self.assertEqual(index["videos"][0], {
                "name": previews[1].name, "date": "2026-11-18", "state": "live"
            })

    def test_yesterday_finalization_is_once_only_and_supersedes_preview(self):
        now = datetime(2026, 11, 17, 23, 5, tzinfo=timezone.utc)  # Prague Nov 18
        day = "2026-11-17"
        with tempfile.TemporaryDirectory() as temp, patch.object(mod, "CAMERA_DIR", Path(temp)):
            frames = Path(temp) / "frames"
            frames.mkdir()
            folder = Path(temp) / "timelapse"
            folder.mkdir()
            for hour in range(6):
                (frames / f"20261117T{hour:02d}0000Z.jpg").write_bytes(b"jpeg")
            old_preview = folder / f"{day}-v{int(now.timestamp())-1200}.mp4"
            old_preview.write_bytes(b"old" * 500)
            commands = []
            def simulate_ffmpeg(command, **kwargs):
                commands.append(command)
                Path(command[-1]).write_bytes(b"1" * 1500)
            with patch.object(mod.shutil, "which", return_value="/usr/bin/ffmpeg"), \
                 patch.object(mod.subprocess, "run", side_effect=simulate_ffmpeg):
                mod.generate_timelapses(now)
                mod.generate_timelapses(now + timedelta(minutes=10))
            self.assertEqual(len(commands), 1)
            self.assertTrue((folder / f"{day}.mp4").exists())
            self.assertTrue((folder / f".{day}.finalized").exists())
            mod.save_index()
            index = json.loads((Path(temp) / "index.json").read_text())
            self.assertEqual(index["videos"][0], {
                "name": f"{day}.mp4", "date": day, "state": "complete"
            })

    def test_failed_render_does_not_publish_partial_video(self):
        now = datetime(2026, 11, 18, 7, 0, tzinfo=timezone.utc)
        with tempfile.TemporaryDirectory() as temp, patch.object(mod, "CAMERA_DIR", Path(temp)):
            frames = Path(temp) / "frames"
            frames.mkdir()
            for minute in range(6):
                (frames / f"20261118T06{minute * 10:02d}00Z.jpg").write_bytes(b"jpeg")
            with patch.object(mod.shutil, "which", return_value="/usr/bin/ffmpeg"), \
                 patch.object(mod.subprocess, "run", side_effect=RuntimeError("ffmpeg failed")):
                with self.assertRaisesRegex(RuntimeError, "ffmpeg failed"):
                    mod.generate_timelapses(now)
            self.assertEqual(list((Path(temp) / "timelapse").glob("*.mp4")), [])
            self.assertEqual(list((Path(temp) / "timelapse").glob(".render-*")), [])

if __name__ == "__main__":
    unittest.main()
