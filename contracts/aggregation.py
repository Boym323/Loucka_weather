"""Small deterministic reference algorithms for contract fixtures; never runs in production.

Backend implementations must independently match verified WeeWX semantics.
All time weighted values are normalized into canonical units BEFORE aggregation.
"""
from __future__ import annotations
from datetime import date, datetime, timedelta, timezone
from math import atan2, cos, degrees, isfinite, radians, sin, hypot
from zoneinfo import ZoneInfo

ZONE = ZoneInfo("Europe/Prague")

def weighted_mean(samples):
    """[(value_or_none, archive_duration_seconds)] -> null if no covered duration."""
    num = den = 0.0
    for value, seconds in samples:
        if not isinstance(seconds, (int,float)) or isinstance(seconds,bool) or not isfinite(seconds) or seconds <= 0:
            raise ValueError("Invalid archival duration")
        if value is None:
            continue
        if not isinstance(value,(int,float)) or isinstance(value,bool) or not isfinite(value):
            raise ValueError("Invalid archive value")
        num += value * seconds
        den += seconds
    return num / den if den else None

def interval_sum(values):
    """Sum additive interval values only, not rainRate or cumulative counters."""
    total = 0.0
    seen = False
    for value in values:
        if value is None:
            continue
        if not isinstance(value,(int,float)) or isinstance(value,bool) or not isfinite(value):
            raise ValueError("Invalid additive value")
        total += value
        seen = True
    return total if seen else None

def vector_wind_direction(samples):
    """[(direction_degrees, speed, duration_seconds)] -> degrees or null if calm."""
    east=north=0.0
    for direction,speed,seconds in samples:
        if direction is None or speed is None:
            continue
        if any(not isinstance(v,(int,float)) or isinstance(v,bool) or not isfinite(v) for v in (direction,speed,seconds)):
            raise ValueError("Invalid wind vector")
        if seconds<=0 or speed<0 or not 0<=direction<=360:
            raise ValueError("Invalid wind sample")
        east += speed*seconds*sin(radians(direction))
        north += speed*seconds*cos(radians(direction))
    if hypot(east,north)<1e-9: return None
    angle = degrees(atan2(east,north)) % 360
    # Floating-point -0 and tiny negative bearings wrap to 360; normalize North to 0.
    return 0.0 if min(abs(angle),abs(360.0-angle))<1e-9 else angle

def local_day_bounds(day):
    if isinstance(day,str): day=date.fromisoformat(day)
    start=datetime(day.year,day.month,day.day,tzinfo=ZONE)
    end=datetime.combine(day+timedelta(days=1),datetime.min.time(),tzinfo=ZONE)
    return start.astimezone(timezone.utc),end.astimezone(timezone.utc)

def archive_record_start(end_epoch,interval_minutes):
    if not isinstance(end_epoch,int) or not isinstance(interval_minutes,int) or interval_minutes<=0:
        raise ValueError("Invalid WeeWX time metadata")
    return end_epoch-interval_minutes*60
