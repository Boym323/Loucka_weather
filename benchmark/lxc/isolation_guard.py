"""Fail-closed attestation of a SEPARATE benchmark snapshot database.

BENCH_ISOLATED_DB=YES is NEVER proof of isolation. FULL requires the target
schema's unique test-only marker. Marker must be created on a different
MariaDB instance in a separate LXC, after snapshot import.
"""
import os
import re

class IsolationError(RuntimeError):
    pass

def verify_full_snapshot(cur, env=None):
    env = env if env is not None else os.environ
    if env.get("BENCH_ISOLATED_DB") != "YES":
        raise IsolationError("FULL requires BENCH_ISOLATED_DB=YES")
    dbname = env.get("BENCH_DB_NAME", "")
    if not re.fullmatch(r"weewx_bench_[A-Za-z0-9_]{1,40}", dbname):
        raise IsolationError("FULL only allowed in dedicated weewx_bench_* schema")
    expected = env.get("BENCH_EXPECTED_SNAPSHOT_ID", "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,64}", expected):
        raise IsolationError("FULL requires a non-placeholder snapshot attestation ID")
    try:
        cur.execute("SELECT DATABASE()")
        row = cur.fetchone()
        if row != (dbname,):
            raise IsolationError("Connected to the wrong database schema")
        cur.execute("SELECT snapshot_id FROM bench_isolation_attestation LIMIT 2")
        records = cur.fetchall()
    except IsolationError:
        raise
    except Exception as exc:
        raise IsolationError("Snapshot marker missing/inaccessible: target not attested") from exc
    if len(records) != 1 or records[0] != (expected,):
        raise IsolationError("Snapshot attestation mismatch: refusing FULL")
    return True
