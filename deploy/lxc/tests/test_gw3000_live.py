import importlib.util
import json
from datetime import datetime, timedelta, timezone
from http.client import HTTPConnection
from pathlib import Path
from threading import Thread
from tempfile import TemporaryDirectory
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "loucka-gw3000-live.py"
spec = importlib.util.spec_from_file_location("loucka_gw3000_live", SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def sample(now=None):
    now = now or datetime.now(timezone.utc)
    return ("PASSKEY=TESTPASS&stationtype=GW3000_V1.0&dateutc=" +
        now.strftime("%Y-%m-%d+%H%3A%M%3A%S") +
        "&tempf=50&humidity=68&baromrelin=30&winddir=270&windgustmph=4.5" +
        "&windspeedmph=2&rainratein=0.1&solarradiation=200&uv=2").encode()

class TestGW3000Protocol(unittest.TestCase):
    def test_metricwx_and_no_fabricated_interval_rain(self):
        s = mod.parse_packet(sample(), datetime.now(timezone.utc))
        self.assertAlmostEqual(s["readings"]["outTemp"], 10)
        self.assertAlmostEqual(s["readings"]["windSpeed"], .89408)
        self.assertAlmostEqual(s["readings"]["rainRate"], 2.54)
        self.assertAlmostEqual(s["readings"]["barometer"], 1015.9166, places=2)
        self.assertNotIn("rain", s["readings"])
        self.assertEqual(s["source"], "ecowitt_gw3000_custom")

    def test_stale_timestamp_fails_closed(self):
        packet = sample(datetime.now(timezone.utc) - timedelta(minutes=12))
        with self.assertRaisesRegex(ValueError, "Stale"):
            mod.parse_packet(packet, datetime.now(timezone.utc))

    def test_invalid_readings_are_not_published(self):
        packet = sample().replace(b"tempf=50", b"tempf=-9999")
        s = mod.parse_packet(packet, datetime.now(timezone.utc))
        self.assertNotIn("outTemp", s["readings"])

    def test_network_token_and_source_auth(self):
        with TemporaryDirectory() as dirname:
            server=mod.PrivateGatewayServer(("127.0.0.1", 0), "a"*40, "127.0.0.1", "TESTPASS", Path(dirname))
            t=Thread(target=server.serve_forever, daemon=True)
            t.start()
            try:
                def post(path, data=sample()):
                    conn=HTTPConnection("127.0.0.1",server.server_port,timeout=2)
                    conn.request("POST",path,data,{"Content-Type":"application/x-www-form-urlencoded"})
                    result=conn.getresponse();code=result.status;result.read();conn.close()
                    return code
                self.assertEqual(post("/gw3000/"+"a"*40+"wrong"),404)
                self.assertFalse((Path(dirname)/"latest.json").exists())
                self.assertEqual(post("/gw3000/"+"a"*40,sample().replace(b"TESTPASS",b"WRONG")),403)
                self.assertEqual(post("/gw3000/"+"a"*40),200)
                data=json.loads((Path(dirname)/"latest.json").read_text())
                self.assertEqual(data["units"],"metricwx")
                self.assertIn("windSpeed",data["readings"])
            finally:
                server.shutdown();server.server_close();t.join(timeout=2)

if __name__ == "__main__":
    unittest.main()
