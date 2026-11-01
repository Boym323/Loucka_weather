#!/usr/bin/env python3
"""Read-only polling of GW3000 local HTTP API. No gateway settings, WeeWX or DB writes."""
from datetime import datetime, timezone
from ipaddress import ip_address, ip_network
from pathlib import Path
from urllib.request import build_opener, ProxyHandler, HTTPRedirectHandler, Request
import json
import math
import os
import re
import sys
import tempfile

MAX_RESPONSE = 256 * 1024
STATE = Path(os.environ.get("LOUCKA_LIVE_DIR", "/var/lib/loucka-live"))
FIELDS = {
    0x01: ("inTemp", -40, 80),
    0x02: ("outTemp", -80, 65),
    0x06: ("inHumidity", 0, 100),
    0x07: ("outHumidity", 0, 100),
    0x08: ("pressure", 650, 1150),
    0x09: ("barometer", 750, 1150),
    0x0A: ("windDir", 0, 360),
    0x0B: ("windSpeed", 0, 100),
    0x0C: ("windGust", 0, 150),
    0x0E: ("rainRate", 0, 600),
    0x15: ("radiation", 0, 1600),
    0x17: ("UV", 0, 20),
}
TEMP = {"inTemp", "outTemp"}
HUMIDITY = {"inHumidity", "outHumidity"}
WIND = {"windSpeed", "windGust"}
PRESSURE = {"pressure", "barometer"}
VALUE = re.compile(r"^\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+))\s*(.*?)\s*$")

def normalize_unit(unit: str) -> str:
    return unit.lower().strip().replace("°", "").replace(" ", "")

def number_and_unit(value: object, raw_unit: object):
    if not isinstance(value, (str, int, float)):
        return None
    match = VALUE.fullmatch(str(value))
    if not match:
        return None
    number = float(match.group(1))
    if not math.isfinite(number):
        return None
    explicit = raw_unit if isinstance(raw_unit, str) else ""
    return number, normalize_unit(match.group(2) or explicit)

def convert(metric: str, value: float, unit: str):
    if metric in TEMP:
        if unit in {"c", "celsius"}: return value
        if unit in {"f", "fahrenheit"}: return (value - 32) * 5 / 9
    elif metric in HUMIDITY:
        if unit in {"", "%", "percent"}: return value
    elif metric in PRESSURE:
        if unit in {"hpa", "mbar"}: return value
        if unit == "inhg": return value * 33.8638866667
        if unit == "mmhg": return value * 1.33322387415
    elif metric in WIND:
        if unit in {"m/s", "mps"}: return value
        if unit == "km/h": return value / 3.6
        if unit == "mph": return value * 0.44704
        if unit in {"knot", "knots", "kt", "kts"}: return value * 0.514444
    elif metric == "windDir":
        if unit in {"", "deg", "degree", "degrees"}: return value
    elif metric == "rainRate":
        if unit in {"mm/h", "mm/hr", "mm/hour"}: return value
        if unit in {"in/h", "in/hr", "in/hour", "inch/h", "inch/hr"}: return value * 25.4
    elif metric == "radiation":
        # Ecowitt ITEM_LIGHT may be W/m² or lux. Never pretend lux == W/m².
        if unit in {"w/m2", "w/m²", "watt/m2"}: return value
    elif metric == "UV":
        if unit in {"", "uvi", "index"}: return value
    return None

def parse_live_payload(data: object, fetched: datetime) -> dict:
    if not isinstance(data, dict) or not isinstance(data.get("common_list"), list):
        raise ValueError("Missing Ecowitt common_list")
    readings = {}
    for item in data["common_list"]:
        if not isinstance(item, dict): continue
        try: ident = int(str(item.get("id", "")), 0)
        except (TypeError, ValueError): continue
        spec = FIELDS.get(ident)
        if not spec: continue
        metric, minimum, maximum = spec
        parsed = number_and_unit(item.get("val"), item.get("unit"))
        if parsed is None: continue
        value = convert(metric, *parsed)
        if value is not None and math.isfinite(value) and minimum <= value <= maximum:
            readings[metric] = round(value, 5)
    # Some firmware puts the tipping-bucket rain rate in a separate "rain" array.
    # Do not substitute piezo rain or daily totals for interval rain.
    if "rainRate" not in readings and isinstance(data.get("rain"), list):
        for item in data["rain"]:
            if not isinstance(item, dict): continue
            try: ident = int(str(item.get("id", "")), 0)
            except (TypeError, ValueError): continue
            if ident != 0x0E: continue
            parsed = number_and_unit(item.get("val"), item.get("unit"))
            if parsed is not None:
                value = convert("rainRate", *parsed)
                if value is not None and math.isfinite(value) and 0 <= value <= 600:
                    readings["rainRate"] = round(value, 5)
            break
    if len(readings) < 3 or not any(k in readings for k in ("outTemp", "barometer", "windSpeed")):
        raise ValueError("Insufficient usable Ecowitt measurements")
    timestamp = fetched.isoformat().replace("+00:00", "Z")
    return {
        "schemaVersion": "1", "source": "ecowitt_gw3000_lan_http",
        "stationType": "GW3000_LAN_HTTP", "units": "metricwx",
        "observedAt": timestamp, "receivedAt": timestamp,
        "timestampMeaning": "gateway_polled_at", "readings": readings
    }

def private_ip(value: str) -> str:
    ip = ip_address(value)
    networks = [ip_network(x) for x in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")]
    if ip.version != 4 or not any(ip in network for network in networks):
        raise ValueError("Expected an RFC1918 IPv4 address")
    return str(ip)

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Gateway redirects are not allowed")

def fetch_gateway(ip: str) -> dict:
    ip = private_ip(ip)
    opener = build_opener(ProxyHandler({}), NoRedirect())
    request = Request("http://" + ip + "/get_livedata_info?",
                      headers={"Accept": "application/json",
                               "User-Agent": "LouckaWeather-ReadOnly/1.0"})
    with opener.open(request, timeout=4) as response:
        if response.status != 200:
            raise ValueError("Gateway responded with non-200 status")
        raw = response.read(MAX_RESPONSE + 1)
    if not raw or len(raw) > MAX_RESPONSE:
        raise ValueError("Invalid response size")
    result = json.loads(raw)
    if not isinstance(result, dict):
        raise ValueError("Unexpected gateway JSON format")
    return result

def publish(snapshot: dict, folder: Path = STATE):
    folder.mkdir(parents=True, exist_ok=True, mode=0o750)
    tmp = None
    try:
        with tempfile.NamedTemporaryFile(dir=folder, prefix=".gw3000-lan-", delete=False) as out:
            tmp = Path(out.name)
            os.fchmod(out.fileno(), 0o640)
            out.write(json.dumps(snapshot, separators=(",", ":")).encode())
            out.flush()
            os.fsync(out.fileno())
        os.replace(tmp, folder / "latest.json")
    finally:
        if tmp: tmp.unlink(missing_ok=True)

def main() -> int:
    gateway_ip = os.environ.get("LOUCKA_GW3000_HTTP_IP", "")
    if not gateway_ip:
        print("GW3000 LAN read-only poller not configured", file=sys.stderr)
        return 2
    try:
        payload = fetch_gateway(gateway_ip)
        snapshot = parse_live_payload(payload, datetime.now(timezone.utc))
        publish(snapshot)
        print("GW3000 read-only poll: %s valid values" % len(snapshot["readings"]))
        return 0
    except Exception as error:
        # Never print private IP, raw gateway response or settings.
        print("GW3000 LAN read-only poll unavailable (%s)" % type(error).__name__, file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main())
