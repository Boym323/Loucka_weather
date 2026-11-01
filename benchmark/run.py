"""Actual live HTTP benchmark; all three servers execute identical MariaDB SELECTs.
Produces results.json, logs and validates responses, including 1/10/50 concurrent clients.
"""
import asyncio
import json
import math
import os
import pathlib
import statistics
import subprocess
import sys
import time

import httpx
import psutil

ROOT = pathlib.Path(__file__).resolve().parent
ENDPOINTS = {
    "current": ("/current", 300),
    "history24h": ("/history/24h", 150),
    "history30d": ("/history/30d", 24),
    "yearly": ("/statistics/yearly", 250),
}
CONCURRENCIES = (1, 10, 50)
BASE_URL = "http://127.0.0.1:8121"
EXPECTED = {}
RESULTS = []

def nearly_equal(x, y):
    if isinstance(x, dict):
        return isinstance(y, dict) and x.keys() == y.keys() and all(nearly_equal(x[k], y[k]) for k in x)
    if isinstance(x, list):
        return isinstance(y, list) and len(x) == len(y) and all(nearly_equal(a,b) for a,b in zip(x,y))
    if isinstance(x,(float,int)) and isinstance(y,(float,int)):
        return math.isclose(x,y,rel_tol=1e-11,abs_tol=1e-5)
    return x == y

def pct(vals, p):
    vals = sorted(vals)
    return round(vals[min(len(vals)-1,max(0,math.ceil(len(vals)*p)-1))], 3)

async def bench(path, requests, concurrency, process):
    latency = []
    errors = []
    sem = asyncio.Semaphore(concurrency)
    conn_limits = httpx.Limits(max_connections=concurrency+5, max_keepalive_connections=concurrency+5)
    async with httpx.AsyncClient(timeout=20.0, limits=conn_limits) as client:
        async def one():
            async with sem:
                t = time.perf_counter()
                try:
                    response = await client.get(BASE_URL+path)
                    response.raise_for_status()
                    if not response.headers.get("content-type","").startswith("application/json"):
                        raise ValueError("not JSON")
                    if len(response.content) < 10:
                        raise ValueError("empty response")
                    latency.append((time.perf_counter()-t)*1000)
                except Exception as e:
                    errors.append(str(e))
        # Establish keep-alive and JIT/server startup baseline before measurement.
        for _ in range(12):
            reply=await client.get(BASE_URL+path)
            reply.raise_for_status()
        cpu_before=process.cpu_times()
        memory_before=process.memory_info().rss
        started=time.perf_counter()
        await asyncio.gather(*(one() for _ in range(requests)))
        elapsed=time.perf_counter()-started
        cpu_after=process.cpu_times()
        memory_after=process.memory_info().rss
    return {
        "path": path, "requests": requests, "concurrency": concurrency,
        "ok": len(latency), "errors": errors[:5],
        "duration_s": round(elapsed,3),
        "throughput_rps": round(len(latency)/elapsed,1),
        "p50_ms": pct(latency,.5) if latency else None,
        "p95_ms": pct(latency,.95) if latency else None,
        "p99_ms": pct(latency,.99) if latency else None,
        "server_cpu_s": round(cpu_after.user+cpu_after.system-cpu_before.user-cpu_before.system,3),
        "server_rss_mib": round(max(memory_before,memory_after)/1024/1024,2)
    }

async def test_server(language, command):
    log_path=ROOT / f"{language}.log"
    with log_path.open("w") as f:
        proc=subprocess.Popen(command,stdout=f,stderr=subprocess.STDOUT,env=os.environ.copy(),cwd=ROOT)
        ps=psutil.Process(proc.pid)
        try:
            async with httpx.AsyncClient(timeout=1.5) as client:
                for n in range(120):
                    if proc.poll() is not None:
                        raise RuntimeError(f"{language} exited {proc.returncode}, see {log_path}")
                    try:
                        r=await client.get(BASE_URL+"/current")
                        if r.status_code==200:
                            break
                    except Exception:
                        pass
                    await asyncio.sleep(.5)
                else:
                    raise TimeoutError(f"{language} did not start")
                for key,(url,_) in ENDPOINTS.items():
                    resp=await client.get(BASE_URL+url,timeout=20)
                    resp.raise_for_status()
                    obj=resp.json()
                    if key not in EXPECTED:
                        EXPECTED[key] = obj
                    elif not nearly_equal(EXPECTED[key],obj):
                        raise ValueError(f"response mismatch language={language} endpoint={key}")
                print(f"VALIDATED {language}: all four endpoint responses match reference",flush=True)
            for name,(path,count) in ENDPOINTS.items():
                for conc in CONCURRENCIES:
                    data=await bench(path,count,conc,ps)
                    data.update(language=language,endpoint=name)
                    RESULTS.append(data)
                    print(f"{language:6} {name:12} c={conc:2d} "
                        f"rps={data['throughput_rps']:8.1f} "
                        f"p50={data['p50_ms']:8.2f} p95={data['p95_ms']:8.2f} "
                        f"p99={data['p99_ms']:8.2f} ms; RSS={data['server_rss_mib']:6.1f}MiB "
                        f"errors={len(data['errors'])}", flush=True)
                    if data["errors"]:
                        raise RuntimeError("HTTP benchmark returned errors")
        finally:
            proc.terminate()
            try: proc.wait(timeout=6)
            except subprocess.TimeoutExpired: proc.kill();proc.wait(timeout=5)

async def main():
    specs = [
        ("go", [str(ROOT/"bin"/"bench_go")]),
        ("rust", [str(ROOT/"rust"/"target"/"release"/"loucka-bench-rust")]),
        ("python", [sys.executable,"-m","uvicorn","server:app","--host","127.0.0.1","--port","8121","--no-access-log"]),
    ]
    try:
        for name,command in specs:
            if name=="python":
                command=[sys.executable,"-m","uvicorn","python.server:app","--host","127.0.0.1","--port","8121","--no-access-log"]
            await test_server(name,command)
    finally:
        (ROOT/"results.json").write_text(json.dumps({
            "benchmark":"weewx-like-mariadb-fixture",
            "database":"MariaDB 11.8 service, synthetic 200 days x 288 five-minute rows",
            "note":"not user's production MariaDB; host runner shared with DB container",
            "measurements":RESULTS
        },indent=2),encoding="utf-8")
    if len(RESULTS)!=3*4*3:
        raise RuntimeError(f"Incomplete benchmark: {len(RESULTS)} of 36 scenarios")

if __name__=="__main__":
    asyncio.run(main())
