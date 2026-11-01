"""Reference polling/SSE tests. No WeeWX MariaDB connections or background processes."""
import copy
import json
from pathlib import Path
import pytest
from jsonschema import Draft202012Validator, FormatChecker

from contracts.archive_refresh import ArchiveObserver, ArchiveRefreshError, serialize_sse

ROOT = Path(__file__).resolve().parents[1]
FEATURES = json.loads((ROOT/"schemas/features.schema.json").read_text())
def validator(name):
    return Draft202012Validator({"$defs":FEATURES["$defs"],"$ref":"#/$defs/"+name},format_checker=FormatChecker())

def observer():
    return ArchiveObserver("offline-spec")

def scan(o, rows, status="pending", window=100, now=500):
    return o.inspect(rows, window_start=window, summary_status=status, emitted_at=now)

def test_event_fixture_and_union_schema():
    archive=json.loads((ROOT/"tests/fixtures/archive-updated.json").read_text())
    live=json.loads((ROOT/"tests/fixtures/live.json").read_text())
    validator("ArchiveUpdatedEvent").validate(archive)
    validator("LiveMessage").validate(archive)
    validator("LiveMessage").validate(live)
    assert not validator("LiveEvent").is_valid(archive)
    bad=copy.deepcopy(archive); bad["summaryStatus"]="completed"
    assert not validator("LiveMessage").is_valid(bad)
    bad=copy.deepcopy(archive); bad["readings"]={}
    assert not validator("LiveMessage").is_valid(bad)

def test_first_snapshot_is_baseline_not_false_archive_event():
    o=observer()
    assert scan(o,[(300,"a")]) is None
    assert scan(o,[(300,"a")]) is None

def test_committed_append_sent_only_once():
    o=observer();scan(o,[(300,"a")])
    event=scan(o,[(300,"a"),(600,"b")])
    validator("ArchiveUpdatedEvent").validate(event)
    assert event["changeType"]=="appended"
    assert event["summaryStatus"]=="pending"
    assert event["affectedEndTimeFrom"]=="1970-01-01T00:10:00Z"
    assert event["latestArchiveAt"]=="1970-01-01T00:10:00Z"
    assert scan(o,[(300,"a"),(600,"b")]) is None

def test_ready_emitted_only_after_confirmation():
    o=observer();scan(o,[(300,"a")])
    pending=scan(o,[(300,"a"),(600,"b")],status="pending")
    ready=scan(o,[(300,"a"),(600,"b")],status="ready")
    assert ready["summaryStatus"]=="ready"
    assert ready["dataRevision"]!=pending["dataRevision"]
    assert ready["affectedEndTimeFrom"]==pending["affectedEndTimeFrom"]
    assert scan(o,[(300,"a"),(600,"b")],status="ready") is None

def test_if_summary_ready_on_first_seen_only_one_event():
    o=observer();scan(o,[(300,"a")],status="pending")
    event=scan(o,[(300,"a"),(600,"b")],status="ready")
    assert event["summaryStatus"]=="ready"
    assert scan(o,[(300,"a"),(600,"b")],status="ready") is None

def test_outage_multiple_rows_batch_instead_of_missing_data():
    o=observer();scan(o,[(300,"a")])
    event=scan(o,[(300,"a"),(600,"b"),(900,"c"),(1200,"d")],now=1250)
    assert event["changedRecords"]==3
    assert event["affectedEndTimeFrom"]=="1970-01-01T00:10:00Z"
    assert event["affectedEndTimeTo"]=="1970-01-01T00:20:00Z"

def test_late_backfill_and_original_row_revision():
    o=observer();scan(o,[(300,"a"),(900,"c")])
    backfill=scan(o,[(300,"a"),(600,"b"),(900,"c")],status="ready")
    assert backfill["changeType"]=="backfilled"
    revised=scan(o,[(300,"a2"),(600,"b"),(900,"c")],status="ready")
    assert revised["changeType"]=="revised"
    assert revised["affectedEndTimeFrom"]=="1970-01-01T00:05:00Z"

def test_deletion_within_overlap_is_detected_but_pruning_is_not():
    o=observer();scan(o,[(300,"a"),(600,"b")])
    delete=scan(o,[(300,"a")],status="ready")
    assert delete["changeType"]=="deleted"
    assert delete["latestArchiveAt"]=="1970-01-01T00:05:00Z"
    assert scan(o,[(600,"b")],window=600) is None

def test_window_shift_does_not_fake_deletion():
    o=observer();scan(o,[(300,"a"),(600,"b")])
    assert scan(o,[(600,"b")],window=600) is None

def test_pending_batch_merge_and_unknown_readiness():
    o=observer();scan(o,[(300,"a")])
    scan(o,[(300,"a"),(600,"b")],status="pending")
    event=scan(o,[(300,"a"),(600,"b"),(900,"c")],status="unknown")
    assert event["changedRecords"]==2
    assert event["summaryStatus"]=="unknown"
    assert scan(o,[(300,"a"),(600,"b"),(900,"c")],status="unknown") is None
    ready=scan(o,[(300,"a"),(600,"b"),(900,"c")],status="ready")
    assert ready["summaryStatus"]=="ready"
    assert ready["changedRecords"]==2

def test_duplicate_primary_key_and_bad_input_fail_closed():
    o=observer()
    with pytest.raises(ArchiveRefreshError):scan(o,[(300,"a"),(300,"different")])
    with pytest.raises(ArchiveRefreshError):scan(o,[(300,"a")],status="guessed")
    with pytest.raises(ArchiveRefreshError):scan(o,[(300,"a")],window=500)
    with pytest.raises(ArchiveRefreshError):ArchiveObserver("injected\nSSE")

def test_sse_frame_is_single_json_data_payload():
    fixture=json.loads((ROOT/"tests/fixtures/archive-updated.json").read_text())
    frame=serialize_sse(fixture)
    assert frame.startswith("id: archive-session-001-2\nevent: archive-updated\nretry: 5000\ndata: ")
    body=frame.split("data: ",1)[1].split("\n\n",1)[0]
    validator("LiveMessage").validate(json.loads(body))
    assert frame.endswith("\n\n")

def test_normal_live_event_still_supported_and_wrong_payload_rejected():
    live=json.loads((ROOT/"tests/fixtures/live.json").read_text())
    assert serialize_sse(live).startswith("id: boot-1\nevent: status\n")
    bad=copy.deepcopy(live);bad["eventType"]="archive-updated"
    assert not validator("LiveMessage").is_valid(bad)

def test_dst_epoch_is_utc_not_local_clock_repeated_hour():
    o=observer()
    # First epoch = fall-back transition, next epoch = distinct UTC archive row.
    assert scan(o,[(1792890000,"a")],window=1792880000,now=1792900000) is None
    event=scan(o,[(1792890000,"a"),(1792890300,"b")],window=1792880000,now=1792900001)
    assert event["latestArchiveAt"].endswith("Z")
    assert event["affectedEndTimeFrom"]==event["affectedEndTimeTo"]

