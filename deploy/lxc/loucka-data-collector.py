#!/usr/bin/env python3
"""Opt-in read-only remote collection: public JPEG & official CHMI CAP.
Writes local staging files only. No DB connection, no modification of origin.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

CAMERA_URL = "https://webcam.pocasi-loucka.eu/zapadni_kamera.jpg"
CAP_URL = "https://vystrahy-cr.chmi.cz/data/XOCZ50_OKPR.xml"
CAMERA_DIR = Path(os.environ.get("LOUCKA_CAMERA_ARCHIVE_DIR", "/var/lib/loucka-camera"))
ALERTS_DIR = Path(os.environ.get("LOUCKA_ALERTS_DIR", "/var/lib/loucka-alerts"))
ORP = "7209"  # Loucka 585432, district Zlin, SO ORP Valasske Klobouky
UTC = timezone.utc


def fetch_bytes(url: str, max_bytes: int, media: str) -> bytes:
    with urlopen(Request(url, headers={"User-Agent": "LouckaWeather/1.0 (public-data-collector)"}), timeout=15) as reply:
        mimetype = reply.headers.get("Content-Type", "").split(";")[0].strip().lower()
        if media == "image" and mimetype not in ("image/jpeg", "image/pjpeg"):
            raise ValueError("Public camera did not return JPEG")
        if media == "xml" and mimetype not in ("application/xml", "text/xml", "application/octet-stream"):
            raise ValueError("CHMI did not return XML")
        payload = reply.read(max_bytes + 1)
    if not payload or len(payload) > max_bytes:
        raise ValueError("Invalid size from external provider")
    return payload


def atomic_write(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".partial")
    try:
        temp.write_bytes(data)
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)


def save_index() -> None:
    frames = sorted((CAMERA_DIR / "frames").glob("????????T??????Z.jpg"), reverse=True)[:120]
    videos = sorted((CAMERA_DIR / "timelapse").glob("????-??-??.mp4"), reverse=True)[:45]
    index = {
        "schemaVersion": "1",
        "timestampMeaning": "downloaded_not_captured",
        "updatedAt": datetime.now(UTC).isoformat(),
        "frames": [{"name": f.name, "fetchedAt": datetime.strptime(f.stem, "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC).isoformat()} for f in frames],
        "videos": [{"name": v.name, "date": v.stem} for v in videos],
    }
    atomic_write(CAMERA_DIR / "index.json", json.dumps(index, ensure_ascii=False).encode())


def capture_camera() -> None:
    data = fetch_bytes(CAMERA_URL, 8_000_000, "image")
    if not (data.startswith(b"\xff\xd8\xff") and data.endswith(b"\xff\xd9")):
        raise ValueError("Invalid JPEG markers")
    folder = CAMERA_DIR / "frames"
    folder.mkdir(parents=True, exist_ok=True)
    previous = sorted(folder.glob("????????T??????Z.jpg"), reverse=True)[:1]
    # A stuck camera may return identical images. Do not invent a new frame.
    if previous and sha256(previous[0].read_bytes()).digest() == sha256(data).digest():
        print("Unchanged JPEG; no duplicate frame stored")
    else:
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        atomic_write(folder / (stamp + ".jpg"), data)
    cutoff = datetime.now(UTC) - timedelta(days=35)
    for frame in folder.glob("????????T??????Z.jpg"):
        if datetime.strptime(frame.stem, "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC) < cutoff:
            frame.unlink()
    generate_yesterday_video()
    save_index()


def generate_yesterday_video() -> None:
    if not shutil.which("ffmpeg"):
        print("ffmpeg missing: JPEG archive works; MP4 creation unavailable")
        return
    day = (datetime.now(UTC) - timedelta(days=1)).date()
    folder = CAMERA_DIR / "timelapse"
    folder.mkdir(parents=True, exist_ok=True)
    destination = folder / f"{day.isoformat()}.mp4"
    if not destination.exists():
        pattern = str(CAMERA_DIR / "frames" / (day.strftime("%Y%m%d") + "T*.jpg"))
        if len(list((CAMERA_DIR / "frames").glob(day.strftime("%Y%m%d") + "T*.jpg"))) >= 6:
            temp = destination.with_suffix(".partial")
            try:
                subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                    "-framerate", "10", "-pattern_type", "glob", "-i", pattern,
                    "-vf", "scale=min(1280\\,iw):-2", "-c:v", "libx264", "-preset", "veryfast",
                    "-crf", "31", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                    "-f", "mp4", str(temp)], check=True, timeout=140)
                if 1000 < temp.stat().st_size <= 60_000_000:
                    temp.replace(destination)
            finally:
                temp.unlink(missing_ok=True)
    for video in folder.glob("????-??-??.mp4"):
        if datetime.fromisoformat(video.stem).date() < day - timedelta(days=34):
            video.unlink()


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def children(element: ET.Element, name: str):
    return [e for e in element if local(e.tag) == name]


def one(element: ET.Element, name: str) -> str:
    return next((e.text.strip() for e in children(element, name) if e.text), "")


def is_target_code(code: str) -> bool:
    # Exact CISORP membership, never a substring. 07209 is equivalent to 7209.
    tokens = re.findall(r"\d+", code)
    return any(int(t) == 7209 for t in tokens)


def parse_alerts(data: bytes, checked_at: datetime) -> dict:
    root = ET.fromstring(data)
    if local(root.tag) != "alert":
        raise ValueError("Not an OASIS CAP alert")
    if one(root, "status") not in ("Actual", "Exercise"):
        raise ValueError("CAP status is not recognized")
    # Exercise/test warnings may not be published as genuine local warnings.
    if one(root, "status") != "Actual":
        raise ValueError("CAP feed is not Actual")
    if one(root, "msgType") == "Cancel":
        # Cancellation should still have geographically coded info.
        pass
    areas_with_cisorp = 0
    alerts = []
    infos = children(root, "info")
    for info in infos:
        language = one(info, "language")
        if language and not language.lower().startswith("cs"):
            continue
        is_local = False
        for area in children(info, "area"):
            for geocode in children(area, "geocode"):
                code_name = one(geocode, "valueName").upper()
                if "ORP" not in code_name and "CISORP" not in code_name:
                    continue
                areas_with_cisorp += 1
                if is_target_code(one(geocode, "value")):
                    is_local = True
        if not is_local:
            continue
        onset, expires = one(info, "onset") or one(info, "effective"), one(info, "expires")
        try:
            expiry = datetime.fromisoformat(expires.replace("Z", "+00:00"))
            if expiry.tzinfo is None:
                raise ValueError("Missing timezone")
        except ValueError:
            continue
        if expiry <= checked_at:
            continue
        alerts.append({k: one(info,k)[:2500] for k in
            ("event", "severity", "onset", "expires", "headline", "description", "instruction")})
    if areas_with_cisorp == 0:
        raise ValueError("CAP feed lacks recognizable ORP geocoding; cannot claim local all-clear")
    return {"schemaVersion": "1", "source": "CHMI_CAP", "orp": ORP, "status": "verified",
            "checkedAt": checked_at.isoformat(), "feedIdentifier": one(root, "identifier"),
            "alerts": alerts}


def capture_alerts():
    xml = fetch_bytes(CAP_URL, 6_000_000, "xml")
    result = parse_alerts(xml, datetime.now(UTC))
    atomic_write(ALERTS_DIR / "alerts.json", json.dumps(result, ensure_ascii=False).encode())
    print("Verified CAP ORP", ORP, "alerts:", len(result["alerts"]))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", choices=("camera", "alerts"))
    args = parser.parse_args()
    if args.source == "camera":
        capture_camera()
    else:
        capture_alerts()
