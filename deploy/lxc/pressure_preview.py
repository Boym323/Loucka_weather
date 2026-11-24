#!/usr/bin/env python3
"""Isolated operator-only preview of the immutable pressure audit release.
No database driver, SQL, public API registration, or default deployment.
"""
import argparse
import csv
import datetime as dt
import gzip
import hashlib
import hmac
import json
import math
import os
from pathlib import Path
import re
import shutil
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlsplit, parse_qs

RELEASE_SHA = "2c111a5f4e597ba1bc7133cfab62b394294eff903368ecd02cd9808f481b9122"
RELEASE_ROWS = 1697621
FIRST = dt.date(2009, 1, 1)
LAST = dt.date(2026, 11, 24)
Q1_START = 1514764800
Q1_END = 1522540800
BASE = "/dev/pressure-preview"
ASSETS = Path(__file__).resolve().parent
FIELDS = ["dateTime_utc", "original_pressure_hpa", "original_status",
          "archive_reconstruction_hpa", "archive_reconstruction_status",
          "archive_reconstruction_empirical_p95_hpa", "superseded_legacy_v3_hpa",
          "superseded_legacy_status", "regional_reference_diagnostic_hpa",
          "regional_estimate_hpa", "regional_resolution_seconds", "regional_source",
          "regional_decision_status",
          "regional_interstation_disagreement_p95_hpa_not_prediction_interval",
          "regional_daily_check_p95_abs_hpa_diagnostic", "reference_support",
          "physical_temperature_source"]
COLUMNS = ["epoch", "original", "archiveEstimate", "regionalReference",
           "regionalEstimate", "resolutionSeconds", "source", "decision",
           "referenceSupport", "temperatureSource"]


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def json_bytes(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False,
                      separators=(",", ":")).encode("utf-8")


def pressure(value):
    if value == "":
        return None
    result = float(value)
    if not math.isfinite(result):
        raise ValueError("Non-finite pressure")
    # Preserve even suspicious ORIGINAL values; no filtering, clipping or smoothing.
    return result


def day_from_epoch(epoch):
    return dt.datetime.fromtimestamp(epoch, dt.timezone.utc).date()


def decode(row, previous):
    if None in row or any(row.get(key) is None for key in FIELDS):
        raise ValueError("Malformed audit CSV row")
    epoch = int(row["dateTime_utc"])
    day = day_from_epoch(epoch)
    if not FIRST <= day <= LAST or (previous is not None and epoch <= previous):
        raise ValueError("Unexpected or unordered timestamp")
    original = pressure(row["original_pressure_hpa"])
    archive = pressure(row["archive_reconstruction_hpa"])
    regional = pressure(row["regional_reference_diagnostic_hpa"])
    estimate = pressure(row["regional_estimate_hpa"])
    resolution = int(row["regional_resolution_seconds"]) if row["regional_resolution_seconds"] else None
    source = row["regional_source"]
    decision = row["regional_decision_status"]
    if archive is not None and (original is not None or row["archive_reconstruction_status"] != "ESTIMATED_UNAPPROVED"):
        raise ValueError("Invalid archive reconstruction classification")
    if estimate is not None and (original is not None or regional is None or
                                 not decision.startswith("ESTIMATED_UNAPPROVED")):
        raise ValueError("Invalid regional estimate classification")
    if Q1_START <= epoch < Q1_END and any(v is not None for v in (archive, regional, estimate)):
        raise ValueError("Protected quarter must not contain preview estimates")
    if regional is not None:
        if source == "ERA5_HOURLY_PHYSICAL_REANALYSIS":
            if day.year > 2017 or epoch % 3600 or resolution != 3600:
                raise ValueError("Invalid hourly ERA5 support")
        elif source == "CHMI_10MIN_TRANSFERRED_REFERENCE":
            if not 2018 <= day.year <= 2025 or resolution not in (600, 1200):
                raise ValueError("Invalid CHMI support")
        else:
            raise ValueError("Unknown regional source")
    elif estimate is not None:
        raise ValueError("Estimate without reference")
    return [epoch, original, archive, regional, estimate, resolution, source,
            decision, row["reference_support"], row["physical_temperature_source"]]


def build_index(catalog, target, expected_sha=RELEASE_SHA, expected_rows=RELEASE_ROWS):
    """One streaming import, only into a new isolated filesystem directory."""
    if target.exists():
        raise ValueError("Output directory already exists; never overwrite a release")
    if digest(catalog) != expected_sha:
        raise ValueError("Audit catalog SHA-256 mismatch")
    target.parent.mkdir(parents=True, exist_ok=True)
    scratch = Path(tempfile.mkdtemp(prefix=".pressure-preview-", dir=target.parent))
    index = {"schema": "pressure-preview-index-v1", "releaseSha256": expected_sha,
             "approved": False, "unit": "hPa", "columns": COLUMNS, "days": {}, "rows": 0}
    try:
        previous = None
        active_day = None
        batch = []

        def flush():
            if active_day is None:
                return
            name = active_day.isoformat()
            raw = json_bytes(batch)
            (scratch / (name + ".json")).write_bytes(raw)
            index["days"][name] = {"rows": len(batch), "sha256": hashlib.sha256(raw).hexdigest()}

        with gzip.open(catalog, "rt", encoding="utf-8", newline="") as stream:
            reader = csv.DictReader(stream)
            if reader.fieldnames != FIELDS:
                raise ValueError("Unsupported audit catalog header")
            for row in reader:
                point = decode(row, previous)
                previous = point[0]
                day = day_from_epoch(previous)
                if day != active_day:
                    flush()
                    active_day = day
                    batch = []
                batch.append(point)
                if len(batch) > 1440:
                    raise ValueError("Unexpected daily row count")
                index["rows"] += 1
            flush()
        if index["rows"] != expected_rows or digest(catalog) != expected_sha:
            raise ValueError("Catalog row count or final SHA-256 mismatch")
        (scratch / "index.json").write_bytes(json_bytes(index))
        scratch.rename(target)
        return index
    except BaseException:
        shutil.rmtree(scratch, ignore_errors=True)
        raise


def parse_day(value):
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("Use YYYY-MM-DD UTC")
    return dt.date.fromisoformat(value)


class Preview:
    def __init__(self, path, expected_sha=RELEASE_SHA, expected_rows=RELEASE_ROWS):
        self.path = path
        self.index = json.loads((path / "index.json").read_text(encoding="utf-8"))
        if (self.index.get("schema") != "pressure-preview-index-v1" or
                self.index.get("releaseSha256") != expected_sha or
                self.index.get("approved") is not False or self.index.get("unit") != "hPa" or
                self.index.get("columns") != COLUMNS or self.index.get("rows") != expected_rows or
                sum(v["rows"] for v in self.index["days"].values()) != expected_rows):
            raise ValueError("Invalid preview index")
        for key in self.index["days"]:
            if not FIRST <= parse_day(key) <= LAST:
                raise ValueError("Invalid indexed date")

    def read(self, date, days):
        if not FIRST <= date <= LAST or not 1 <= days <= 7 or date + dt.timedelta(days=days-1) > LAST:
            raise ValueError("Select 1–7 days within snapshot")
        points = []
        for offset in range(days):
            key = (date + dt.timedelta(days=offset)).isoformat()
            entry = self.index["days"].get(key)
            if entry is None:
                continue
            raw = (self.path / (key + ".json")).read_bytes()
            if hashlib.sha256(raw).hexdigest() != entry["sha256"]:
                raise RuntimeError("Preview day SHA-256 mismatch")
            data = json.loads(raw)
            if len(data) != entry["rows"] or len(data) > 1440:
                raise RuntimeError("Preview day row count mismatch")
            points.extend(data)
        return {"schema": "pressure-preview-v1", "approved": False, "unit": "hPa",
                "releaseSha256": self.index["releaseSha256"], "timezone": "UTC",
                "from": date.isoformat(), "days": days, "columns": COLUMNS, "points": points}


def handler(preview, token):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Do not log token or requested paths.

        def send(self, status, content, media="application/json; charset=utf-8"):
            self.send_response(status)
            self.send_header("Content-Type", media)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Robots-Tag", "noindex, nofollow")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
            self.end_headers()
            self.wfile.write(content)

        def do_GET(self):
            url = urlsplit(self.path)
            assets = {BASE: ("pressure-preview.html", "text/html"),
                      BASE + "/": ("pressure-preview.html", "text/html"),
                      BASE + "/app.js": ("pressure-preview.js", "application/javascript"),
                      BASE + "/style.css": ("pressure-preview.css", "text/css")}
            if url.path in assets and not url.query:
                name, media = assets[url.path]
                return self.send(200, (ASSETS / name).read_bytes(), media + "; charset=utf-8")
            if url.path != BASE + "/data":
                return self.send(404, b'{"error":"not_found"}')
            supplied = self.headers.get("Authorization", "")
            if not hmac.compare_digest(supplied.encode("utf-8"), ("Bearer " + token).encode("utf-8")):
                return self.send(401, b'{"error":"unauthorized"}')
            try:
                params = parse_qs(url.query, strict_parsing=True, max_num_fields=2)
                if set(params) != {"from", "days"} or any(len(v) != 1 for v in params.values()):
                    raise ValueError("Invalid query")
                date = parse_day(params["from"][0])
                if not re.fullmatch("[1-7]", params["days"][0]):
                    raise ValueError("Invalid range")
                payload = preview.read(date, int(params["days"][0]))
                return self.send(200, json_bytes(payload))
            except ValueError:
                return self.send(422, b'{"error":"invalid_range"}')
            except (OSError, RuntimeError, KeyError):
                return self.send(503, b'{"error":"preview_unavailable"}')

        def do_POST(self):
            return self.send(405, b'{"error":"read_only"}')

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    build = sub.add_parser("prepare")
    build.add_argument("--catalog", type=Path, required=True)
    build.add_argument("--out", type=Path, required=True)
    serve = sub.add_parser("serve")
    serve.add_argument("--index", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "prepare":
        index = build_index(args.catalog, args.out)
        print(json.dumps({"rows": index["rows"], "days": len(index["days"]),
                          "releaseSha256": index["releaseSha256"], "approved": False}))
        return
    token = os.environ.get("WEATHER_PRESSURE_PREVIEW_TOKEN", "")
    if os.environ.get("WEATHER_PRESSURE_PREVIEW_ENABLED") != "YES" or len(token) < 32:
        parser.error("Explicit dev-only opt-in and a 32+ character private token required")
    # No configurable external bind, no automatic reverse proxy or production route.
    with HTTPServer(("127.0.0.1", 3102), handler(Preview(args.index), token)) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
