#!/usr/bin/env python3
"""Reprodukovatelný benchmark šesti běžících HTTP serverů proti skutečné struktuře WeeWX.
Bez zápisů do DB. FULL vyžaduje izolovanou kopii a výslovný flag.
"""
import argparse
import asyncio
import datetime as dt
import json
import math
import os
import pathlib
import re
import signal
import statistics
import subprocess
import sys
import time
from zoneinfo import ZoneInfo

import httpx
import psutil
import pymysql

ROOT = pathlib.Path(__file__).resolve().parent
URL = 'http://127.0.0.1:18121'
ENDPOINTS = {'current': '/current', '24h': '/history/24h',
             '30d': '/history/30d', 'yearly': '/statistics/yearly'}
COUNTS = {'light': {'current':20,'24h':10,'30d':3,'yearly':10},
          'full': {'current':300,'24h':150,'30d':24,'yearly':250}}
DANGEROUS = re.compile(r'\b(ALL PRIVILEGES|INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRIGGER|EVENT|FILE|SUPER|RELOAD|GRANT OPTION|REFERENCES|LOCK TABLES|PROCESS|EXECUTE)\b', re.I)


def db_connect():
    return pymysql.connect(host=os.environ['BENCH_DB_HOST'], port=int(os.environ['BENCH_DB_PORT']),
                           user=os.environ['BENCH_DB_USER'], password=os.environ['BENCH_DB_PASSWORD'],
                           database=os.environ['BENCH_DB_NAME'], connect_timeout=5, read_timeout=12,
                           write_timeout=5, autocommit=True)


def preflight():
    with db_connect() as db:
        with db.cursor() as cur:
            cur.execute('SELECT DATABASE(), VERSION()')
            dbname,version = cur.fetchone()
            if dbname != os.environ['BENCH_DB_NAME']:
                raise RuntimeError(f'Incorrect database: {dbname!r}')
            cur.execute('SHOW GRANTS')
            grants = [row[0] for row in cur.fetchall()]
            for grant in grants:
                if DANGEROUS.search(grant):
                    raise RuntimeError('Database user has excessive grants. Use a dedicated SELECT-only user. ' + grant.split(' TO ')[0])
            if not any(re.search(r'\bSELECT\b',g,re.I) for g in grants):
                raise RuntimeError('Missing SELECT grant')
            cur.execute('SELECT MAX(dateTime) FROM archive')
            (end_ts,) = cur.fetchone()
            if not end_ts:
                raise RuntimeError('Empty archive')
            cur.execute('SELECT COUNT(*) FROM archive WHERE dateTime > %s AND dateTime <= %s', (end_ts-86400,end_ts))
            (day_count,) = cur.fetchone()
            cur.execute('SELECT COUNT(*) FROM archive WHERE dateTime > %s AND dateTime <= %s', (end_ts-30*86400,end_ts))
            (month_count,) = cur.fetchone()
            year=int(os.getenv('BENCH_YEAR','2025'))
            tz=ZoneInfo('Europe/Prague')
            y0=int(dt.datetime(year,1,1,tzinfo=tz).timestamp())
            y1=int(dt.datetime(year+1,1,1,tzinfo=tz).timestamp())
            cur.execute('SELECT COUNT(*) FROM archive_day_outTemp WHERE dateTime >= %s AND dateTime < %s',(y0,y1))
            (daily_count,) = cur.fetchone()
    if day_count == 0 or month_count == 0 or daily_count == 0:
        raise RuntimeError('No data in requested time window/year; choose BENCH_YEAR with data')
    for k,v in [('BENCH_END_TS',end_ts),('BENCH_YEAR_START',y0),('BENCH_YEAR_END',y1)]:
        os.environ[k]=str(v)
    print(f'MariaDB={version}; schema={dbname}; posledni epoch={end_ts}; 24h={day_count}, 30d={month_count}, rok {year}: {daily_count} souhrnu', flush=True)
    print('DB prava: kontrolovana, SELECT-only. Zadny SQL zapis.',flush=True)
    return {'schema':dbname,'version':version,'end_ts':end_ts,'year':year,'day_rows':day_count,
            'month_rows':month_count,'daily_rows':daily_count,
            'isolated_copy':os.getenv('BENCH_ISOLATED_DB','NO')=='YES'}


def same(a,b):
    if isinstance(a,dict):
        return isinstance(b,dict) and a.keys()==b.keys() and all(same(a[k],b[k]) for k in a)
    if isinstance(a,list):
        return isinstance(b,list) and len(a)==len(b) and all(same(x,y) for x,y in zip(a,b))
    if isinstance(a,(int,float)) and isinstance(b,(int,float)):
        return math.isclose(a,b,rel_tol=1e-9,abs_tol=1e-5)
    return a==b


def percentile(vals,p):
    vals=sorted(vals)
    return round(vals[max(0,min(len(vals)-1,math.ceil(len(vals)*p)-1))],2)


async def wait_ready(client,proc,name):
    for _ in range(80):
        if proc.poll() is not None:
            raise RuntimeError(f'{name} ended with {proc.returncode}; log: results/{name}.log')
        try:
            r=await client.get(URL+'/current')
            if r.status_code==200:
                return
        except (httpx.HTTPError, OSError):
            pass
        await asyncio.sleep(.35)
    raise RuntimeError(f'{name} did not bind 127.0.0.1:18121')


async def sample_rss(pid,stop,samples):
    ps=psutil.Process(pid)
    while not stop.is_set():
        try:
            processes = [ps] + ps.children(recursive=True)
            samples.append(sum(p.memory_info().rss for p in processes if p.is_running()))
        except psutil.Error:
            pass
        try:
            await asyncio.wait_for(stop.wait(),timeout=.025)
        except asyncio.TimeoutError:
            pass


async def run_one(client,path,total,concurrency,proc):
    times=[]; errors=[]; sem=asyncio.Semaphore(concurrency)
    for _ in range(5):  # warmup, not timed; fail explicitly rather than silently
        warmup = await client.get(URL+path)
        warmup.raise_for_status()
    cpu0=proc.cpu_times(); rss=[]; stop=asyncio.Event()
    monitor=asyncio.create_task(sample_rss(proc.pid,stop,rss))
    async def one():
        async with sem:
            start=time.perf_counter()
            try:
                r=await client.get(URL+path)
                r.raise_for_status()
                if 'application/json' not in r.headers.get('content-type',''):
                    raise ValueError('unexpected content-type')
                times.append((time.perf_counter()-start)*1000)
            except httpx.HTTPStatusError as exc:
                errors.append(f'HTTP status={exc.response.status_code}; body={exc.response.text[:200]!r}; url={exc.request.url}')
            except httpx.TimeoutException as exc:
                errors.append(f'HTTP timeout: {type(exc).__name__}: {exc!s}')
            except httpx.RequestError as exc:
                errors.append(f'HTTP transport: {type(exc).__name__}: {exc!s}')
            except Exception as exc:
                errors.append(f'{type(exc).__name__}: {exc!s}')
    t0=time.perf_counter()
    try:
        await asyncio.gather(*(one() for _ in range(total)))
    finally:
        stop.set();await monitor
    elapsed=time.perf_counter()-t0
    cpu1=proc.cpu_times()
    return {'requests':total,'concurrency':concurrency,'ok':len(times),'error_count':len(errors),
            'errors':errors[:2],'rps':round(len(times)/elapsed,2),'p50_ms':percentile(times,.5) if times else None,
            'p95_ms':percentile(times,.95) if times else None,'p99_ms':percentile(times,.99) if times else None,
            'cpu_seconds':round(cpu1.user+cpu1.system-cpu0.user-cpu0.system,3),
            'rss_peak_mib':round(max(rss)/1048576,2) if rss else None}


async def server_test(name,cmd,reference,mode,result_rows):
    logstamp=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    logfile=ROOT/'results'/f'{name}_{logstamp}.log'
    print(f'{name}: detailni log {logfile}', flush=True)
    with logfile.open('w') as out:
        env = os.environ.copy()
        if name == 'php':
            workers = int(env.get('BENCH_DB_POOL_MAX','1'))
            if workers > 1:
                env['PHP_CLI_SERVER_WORKERS'] = str(workers)
            else:
                env.pop('PHP_CLI_SERVER_WORKERS', None)
        proc=subprocess.Popen(cmd,cwd=ROOT,env=env,stdout=out,stderr=subprocess.STDOUT,start_new_session=True)
        ps=psutil.Process(proc.pid)
        try:
            timeout=httpx.Timeout(15.0,connect=2.0)
            async with httpx.AsyncClient(timeout=timeout,limits=httpx.Limits(max_connections=55,max_keepalive_connections=55)) as client:
                await wait_ready(client,proc,name)
                for key,path in ENDPOINTS.items():
                    r=await client.get(URL+path)
                    r.raise_for_status()
                    obj=r.json()
                    if key in reference:
                        if not same(reference[key],obj):
                            raise RuntimeError(f'{name}: odlisna odpoved {key} oproti Go (ukladani reportu zastaveno)')
                    else:
                        reference[key]=obj
                print(f'{name}: 4/4 API odpovedi se shoduji',flush=True)
                if mode=='smoke':return
                for key,path in ENDPOINTS.items():
                    for c in ([1] if mode=='light' else [1,10,50]):
                        row=await run_one(client,path,COUNTS[mode][key],c,ps)
                        row.update(language=name,endpoint=key)
                        result_rows.append(row)
                        print(f'  {name:6} {key:6} c={c:2} RPS={row["rps"]:7.2f} p95={row["p95_ms"]:8.2f}ms RSS_peak={row["rss_peak_mib"]:6}MiB err={row["error_count"]}',flush=True)
                        if row['error_count']:
                            for err_text in row['errors']:
                                print(f'  CHYBA [{name}/{key}]: {err_text}',file=sys.stderr,flush=True)
                            print(f'  LOG: {logfile}',file=sys.stderr,flush=True)
                            raise RuntimeError(f'{name} HTTP errors on {key}')
        finally:
            try: os.killpg(proc.pid, signal.SIGTERM)
            except ProcessLookupError: pass
            try: proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try: os.killpg(proc.pid,signal.SIGKILL)
                except ProcessLookupError: pass
                proc.wait(timeout=5)


def report(meta,rows,mode):
    stamp=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    payload={'mode':mode,'environment':{'python':sys.version,'cpu_count':os.cpu_count(),
        'host_system':os.uname().sysname,'pool_max':os.getenv('BENCH_DB_POOL_MAX','1'),'note':'LXC; actual DB credentials deliberately not recorded'},
        'db':meta,'measurements':rows}
    out=ROOT/'results'/f'benchmark_{stamp}.json'
    out.write_text(json.dumps(payload,indent=2,ensure_ascii=False)+'\n')
    m=['# Loučka Weather: benchmark LXC',f'Režim: **{mode}**, čas UTC: {stamp}',
       f"MariaDB {meta['version']}, schéma {meta['schema']}, roční statistika {meta['year']}",
       'RSS sleduje HTTP proces a potomky (PHP workery), ne MariaDB. Nulove chyby podminkou PASS.','',
       '| Jazyk | Endpoint | Souběžnost | RPS | p50 ms | p95 ms | p99 ms | RSS MiB |','|---|---|---:|---:|---:|---:|---:|---:|']
    for r in rows:
        m.append(f"| {r['language']} | {r['endpoint']} | {r['concurrency']} | {r['rps']} | {r['p50_ms']} | {r['p95_ms']} | {r['p99_ms']} | {r['rss_peak_mib']} |")
    m+=['','**Pozor:** jeden běh není definitivní měření; opakuj aspoň 5× na izolované kopii DB.']
    out.with_suffix('.md').write_text('\n'.join(m)+'\n')
    print(f'Hotovo. JSON: {out}\nMD: {out.with_suffix(".md")}',flush=True)


async def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('mode',choices=['probe','smoke','light','full'])
    args=parser.parse_args()
    if args.mode=='full' and os.getenv('BENCH_ISOLATED_DB')!='YES':
        raise RuntimeError('FULL povolen jen na IZOlOVANE kopii DB: BENCH_ISOLATED_DB=YES (nepouzivat na produkci!)')
    metadata=preflight()
    if args.mode=='probe':return
    commands=[('go',[str(ROOT/'go'/'loucka-bench-go')]),
              ('rust',[str(ROOT/'rust'/'target'/'release'/'loucka-lxc-bench-rust')]),
              ('python',[sys.executable,'-m','uvicorn','python.app:app','--host','127.0.0.1','--port','18121','--no-access-log']),
              ('node',['node',str(ROOT/'node'/'server.mjs')]),
              ('cpp',[str(ROOT/'cpp'/'loucka-bench-cpp')]),
              ('php',['php','-S','127.0.0.1:18121','-t',str(ROOT/'php'),str(ROOT/'php'/'index.php')])]
    enabled={x.strip() for x in os.getenv('BENCH_LANGUAGES','go,rust,python,node,cpp,php').split(',') if x.strip()}
    unknown=enabled-{name for name,_ in commands}
    if not enabled or unknown: raise ValueError(f'BENCH_LANGUAGES invalid: {unknown}')
    commands=[(name,cmd) for name,cmd in commands if name in enabled]
    reference={};rows=[]
    try:
        for name,cmd in commands:
            await server_test(name,cmd,reference,args.mode,rows)
    finally:
        report(metadata,rows,args.mode)
    print(f'PASS: {len(commands)} HTTP serveru konzistentnich; zadne SQL mutace.',flush=True)

if __name__=='__main__':
    try:
        asyncio.run(main())
    except Exception as exc:
        print(f'ERROR: {exc}',file=sys.stderr)
        sys.exit(1)
