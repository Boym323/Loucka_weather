#!/usr/bin/env python3
"""Dedicated LAN-only Ecowitt custom-server receiver; never writes WeeWX/MariaDB.
Gateway -> fixed-path authenticated HTTP POST -> atomic, permission-restricted JSON.
This process has no public API, no reverse proxy, and no outgoing connections.
"""
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from ipaddress import ip_address
from pathlib import Path
from urllib.parse import parse_qs
import hmac
import json
import os
import re
import sys
import tempfile
import time

STATE = Path(os.environ.get("LOUCKA_LIVE_DIR", "/var/lib/loucka-live"))
MAX_BODY = 16384
# Conversion to METRICWX: Fahrenheit -> Celsius, mph -> m/s, inHg -> hPa,
# in/h -> mm/h. Do NOT treat cumulative rain totals as interval rain.
CONVERSIONS = {
    "tempf": ("outTemp", lambda x: (x - 32) * 5 / 9, -80, 65),
    "humidity": ("outHumidity", float, 0, 100),
    "tempinf": ("inTemp", lambda x: (x - 32) * 5 / 9, -40, 80),
    "humidityin": ("inHumidity", float, 0, 100),
    "baromrelin": ("barometer", lambda x: x * 33.8638866667, 750, 1150),
    "baromabsin": ("pressure", lambda x: x * 33.8638866667, 650, 1150),
    "winddir": ("windDir", float, 0, 360),
    "windspeedmph": ("windSpeed", lambda x: x * 0.44704, 0, 100),
    "windgustmph": ("windGust", lambda x: x * 0.44704, 0, 150),
    "rainratein": ("rainRate", lambda x: x * 25.4, 0, 600),
    "solarradiation": ("radiation", float, 0, 1600),
    "uv": ("UV", float, 0, 20),
}
METRIC_UNITS = {
    "outTemp": "degC", "inTemp": "degC", "outHumidity": "percent",
    "inHumidity": "percent", "barometer": "hPa", "pressure": "hPa",
    "windDir": "degree", "windSpeed": "meter_per_second",
    "windGust": "meter_per_second", "rainRate": "mm_per_hour",
    "radiation": "watt_per_meter_squared", "UV": "uv_index",
}

def parse_packet(raw: bytes, now: datetime) -> dict:
    if not raw or len(raw) > MAX_BODY or b"\x00" in raw:
        raise ValueError("Invalid body")
    fields = parse_qs(raw.decode("ascii"), strict_parsing=True, keep_blank_values=True, max_num_fields=130)
    if any(len(v) != 1 for v in fields.values()):
        raise ValueError("Duplicate fields")
    version = fields.get("stationtype", [""])[0]
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,70}", version):
        raise ValueError("Unknown station type")
    timestamp = fields.get("dateutc", [""])[0]
    try:
        observed = datetime.strptime(timestamp, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    except ValueError as error:
        raise ValueError("Invalid station timestamp") from error
    # Do not publish delayed uploads, invalid station clocks, or future readings as live.
    age = (now - observed).total_seconds()
    if age < -60 or age > 180:
        raise ValueError("Stale or future station packet")
    readings = {}
    for key, (metric, convert, low, high) in CONVERSIONS.items():
        if key not in fields:
            continue
        try:
            numeric = float(fields[key][0])
            value = convert(numeric)
        except (ValueError, OverflowError):
            continue
        if not (low <= value <= high) or value != value or value in (float("inf"), -float("inf")):
            continue
        readings[metric] = round(value, 5)
    if len(readings) < 3 or not any(k in readings for k in ("outTemp", "windSpeed", "barometer")):
        raise ValueError("Insufficient usable weather readings")
    return {
        "schemaVersion": "1", "source": "ecowitt_gw3000_custom",
        "observedAt": observed.isoformat().replace("+00:00", "Z"),
        "receivedAt": now.isoformat().replace("+00:00", "Z"),
        "stationType": version, "units": "metricwx",
        "readings": readings,
    }

def save_snapshot(snapshot: dict, state: Path = STATE):
    state.mkdir(mode=0o750, parents=True, exist_ok=True)
    payload = json.dumps(snapshot, separators=(",", ":"), ensure_ascii=True).encode()
    tmp = None
    try:
        with tempfile.NamedTemporaryFile(dir=state, prefix=".live-", delete=False) as out:
            tmp = Path(out.name)
            os.fchmod(out.fileno(), 0o640)
            out.write(payload)
            out.flush()
            os.fsync(out.fileno())
        os.replace(tmp, state / "latest.json")
    finally:
        if tmp:
            tmp.unlink(missing_ok=True)

class Receiver(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, format, *args):
        # Never put tokenized URLs, PASSKEYs, gateway serial numbers or IPs in logs.
        return
    def respond(self, code: int, payload: bytes = b""):
        self.send_response(code)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Connection", "close")
        self.end_headers()
        if payload:
            self.wfile.write(payload)
        self.close_connection = True
    def do_POST(self):
        valid_token = hmac.compare_digest(self.path, self.server.upload_path)
        valid_source = ip_address(self.client_address[0]) == self.server.allowed_ip
        if not (valid_token and valid_source):
            return self.respond(404)
        if self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/x-www-form-urlencoded":
            return self.respond(415)
        try:
            count = int(self.headers.get("Content-Length", ""))
        except ValueError:
            return self.respond(411)
        if count < 1 or count > MAX_BODY:
            return self.respond(413)
        body = self.rfile.read(count)
        expected_passkey = self.server.passkey
        if expected_passkey:
            try:
                fields = parse_qs(body.decode("ascii"), max_num_fields=130)
                sender = fields.get("PASSKEY", [""])[0]
            except (ValueError, UnicodeDecodeError):
                return self.respond(400)
            if not hmac.compare_digest(sender.upper(), expected_passkey.upper()):
                return self.respond(403)
        try:
            snapshot = parse_packet(body, datetime.now(timezone.utc))
            save_snapshot(snapshot, self.server.state_dir)
        except (ValueError, UnicodeDecodeError):
            return self.respond(422)
        except OSError:
            print("Failed to save gateway snapshot", file=sys.stderr)
            return self.respond(503)
        return self.respond(200, b'{"errcode":"0","errmsg":"ok"}')
    def do_GET(self):
        self.respond(404)

class PrivateGatewayServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    def __init__(self, address, token: str, source_ip: str, passkey: str, state_dir: Path):
        super().__init__(address, Receiver)
        self.upload_path = "/gw3000/" + token
        self.allowed_ip = ip_address(source_ip)
        self.passkey = passkey
        self.state_dir = state_dir

def main():
    bind = os.environ.get("LOUCKA_GW3000_BIND", "")
    allowed = os.environ.get("LOUCKA_GW3000_ALLOWED_IP", "")
    token = os.environ.get("LOUCKA_GW3000_TOKEN", "")
    port = int(os.environ.get("LOUCKA_GW3000_PORT", "3102"))
    passkey = os.environ.get("LOUCKA_GW3000_PASSKEY", "")
    if not bind or not allowed or not re.fullmatch(r"[a-fA-F0-9]{32,64}", token):
        raise SystemExit("Gateway listener disabled until LAN bind, allowed IP and 32+ hex token are configured")
    addr = ip_address(bind)
    src = ip_address(allowed)
    if addr.version != 4 or src.version != 4 or addr.is_unspecified or addr.is_global:
        raise SystemExit("Bind to a specific private/LAN IPv4 address, not 0.0.0.0 or public Internet")
    if port < 1024 or port > 65535:
        raise SystemExit("Invalid gateway listener port")
    os.umask(0o027)
    with PrivateGatewayServer((bind, port), token, allowed, passkey, STATE) as server:
        print("GW3000 live receiver active on explicitly configured LAN interface", flush=True)
        server.serve_forever(poll_interval=1)

if __name__ == "__main__":
    main()
