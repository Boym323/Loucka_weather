"""Offline reference model for the read-only archive refresh contract.

No MariaDB access, network connections, scheduled tasks or WeeWX integration.
A production worker must supply a COMPLETE bounded overlap snapshot of committed
archive rows and separately verify WeeWX day summaries. See docs/ARCHIVE_REFRESH_CONTRACT.md.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional


class ArchiveRefreshError(ValueError):
    pass


def iso_utc(epoch: int) -> str:
    if type(epoch) is not int or epoch < 0:
        raise ArchiveRefreshError("Timestamp must be a non-negative Unix second")
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class ArchiveObserver:
    """Observe snapshots with at-least-once input, exactly-once per local revision.

    Session generation must be unique per process start; no persistent claim is made.
    A snapshot covers ALL archive rows with dateTime >= window_start; the caller
    additionally pages older missed records after downtime before advancing its cursor.
    """

    def __init__(self, session: str):
        if not session or len(session) > 60 or not all(c.isascii() and (c.isalnum() or c in "-_") for c in session):
            raise ArchiveRefreshError("Unsafe or empty session identifier")
        self.session = session
        self.sequence = 0
        self.initialized = False
        self.known: dict[int, str] = {}
        self.latest: Optional[int] = None
        self.pending = None
        self.last_summary_status = None

    def inspect(
        self,
        rows: list[tuple[int, str]],
        *,
        window_start: int,
        summary_status: str,
        emitted_at: int,
    ) -> Optional[dict]:
        if summary_status not in ("pending", "ready", "unknown"):
            raise ArchiveRefreshError("Invalid summary readiness")
        if type(window_start) is not int or type(emitted_at) is not int:
            raise ArchiveRefreshError("Invalid timestamps")
        iso_utc(emitted_at)
        # Input must be the complete overlap window, not one batch or a partial
        # page; otherwise missing rows could be mistaken for deletions.
        current: dict[int, str] = {}
        for end, fingerprint in rows:
            if type(end) is not int or type(fingerprint) is not str or not fingerprint or len(fingerprint) > 128:
                raise ArchiveRefreshError("Invalid row metadata")
            if end < window_start:
                raise ArchiveRefreshError("Snapshot must be bounded by window_start")
            if end in current:
                raise ArchiveRefreshError("Duplicate archive primary key")
            current[end] = fingerprint

        if not self.initialized:
            self.known = current
            self.latest = max(current, default=None)
            self.initialized = True
            return None

        old_window = {end: fp for end, fp in self.known.items() if end >= window_start}
        changed = [end for end, fp in current.items() if old_window.get(end) != fp]
        deleted = [end for end in old_window if end not in current]
        changed.extend(deleted)
        modified = any(end in old_window and end in current for end in changed)
        new_older = any(end not in old_window and end in current and self.latest is not None and end <= self.latest for end in changed)
        self.known = current
        self.latest = max(current, default=None)

        if changed:
            kind = "revised" if modified else "deleted" if deleted else "backfilled" if new_older else "appended"
            if self.pending:
                prior = self.pending
                changed_min = min(min(changed), prior["lo"])
                changed_max = max(max(changed), prior["hi"])
                changed_count = len(changed) + prior["count"]
            else:
                changed_min, changed_max, changed_count = min(changed), max(changed), len(changed)
            self.pending = {"lo": changed_min, "hi": changed_max, "count": changed_count, "kind": kind}
            return self._emit(summary_status, emitted_at)

        if self.pending and summary_status != self.last_summary_status:
            return self._emit(summary_status, emitted_at)
        return None

    def _emit(self, status, emitted_at):
        pending = self.pending
        if pending is None or self.latest is None:
            raise ArchiveRefreshError("No archival data left; publish status/reset instead")
        self.sequence += 1
        revision = f"{self.session}-{self.sequence}"
        event = {
            "schemaVersion":"1", "eventId":revision, "eventType":"archive-updated",
            "emittedAt":iso_utc(emitted_at), "stationId":"loucka",
            "dataset":"original", "dataRevision":revision,
            "changeType":pending["kind"],
            "affectedEndTimeFrom":iso_utc(pending["lo"]),
            "affectedEndTimeTo":iso_utc(pending["hi"]),
            "latestArchiveAt":iso_utc(self.latest),
            "changedRecords":pending["count"],
            "summaryStatus":status,
        }
        self.last_summary_status = status
        if status == "ready":
            self.pending = None
            self.last_summary_status = None
        return event


def serialize_sse(event: dict) -> str:
    """Reference SSE serialization; data is JSON validated by consumer schema."""
    event_type = event.get("eventType")
    event_id = event.get("eventId")
    if event_type not in ("snapshot","observation","status","reset","archive-updated"):
        raise ArchiveRefreshError("Invalid SSE type")
    if not isinstance(event_id, str) or not event_id or any(ch in event_id for ch in "\r\n\0"):
        raise ArchiveRefreshError("Unsafe SSE ID")
    payload = json.dumps(event, separators=(",",":"),ensure_ascii=False,allow_nan=False)
    return f"id: {event_id}\nevent: {event_type}\nretry: 5000\ndata: {payload}\n\n"
