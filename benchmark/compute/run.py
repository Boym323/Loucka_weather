#!/usr/bin/env python3
"""Offline benchmark runner: six native programs, deep result parity, no DB calls."""
import argparse
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import resource
import shutil
import statistics
import subprocess
import sys
import threading
import time
from generate_fixture import generate, HEADER
ROOT=Path(__file__).resolve().parent
LANGS=('go','rust','python','node','cpp','php')

def build(langs):
    base=ROOT/'build';base.mkdir(exist_ok=True)
    steps={
      'go':(['go','build','-o',str(base/'go-stats'),'.'],ROOT/'go'),
      'rust':(['cargo','build','--release','--offline','--jobs','2'],ROOT/'rust'),
      'cpp':(['g++','-std=c++20','-O2','-Wall','-Wextra','-o',str(base/'cpp-stats'),str(ROOT/'cpp'/'main.cpp')],ROOT),
    }
    for lang in langs:
        if lang in steps:
            cmd,cwd=steps[lang]
            if not shutil.which(cmd[0]):raise RuntimeError(f'Missing {cmd[0]}; use system package manager; Rust stable via rustup')
            print('BUILD:',lang,flush=True)
            subprocess.run(cmd,cwd=cwd,check=True,timeout=480)
    for lang,command in [('node','node'),('php','php')]:
        if lang in langs and not shutil.which(command):raise RuntimeError('Missing '+command)


def command(lang,file,its):
    src=str(file)
    return {'go':[str(ROOT/'build/go-stats'),src,str(its)],
      'rust':[str(ROOT/'rust/target/release/loucka-stats-bench'),src,str(its)],
      'python':[sys.executable,str(ROOT/'python/main.py'),src,str(its)],
      'node':['node',str(ROOT/'node/main.mjs'),src,str(its)],
      'cpp':[str(ROOT/'build/cpp-stats'),src,str(its)],
      'php':['php',str(ROOT/'php/main.php'),src,str(its)]}[lang]


def rss_monitor(pid,stop,observed):
    while not stop.is_set():
        try:
            with open(f'/proc/{pid}/status',encoding='ascii') as f:
                for line in f:
                    if line.startswith('VmRSS:'):
                        observed.append(int(line.split()[1])/1024)
                        break
        except OSError:break
        stop.wait(.02)

def run_command(lang,file,its):
    start_cpu=resource.getrusage(resource.RUSAGE_CHILDREN)
    start=time.perf_counter()
    proc=subprocess.Popen(command(lang,file,its),cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    samples=[];stop=threading.Event()
    thread=threading.Thread(target=rss_monitor,args=(proc.pid,stop,samples),daemon=True);thread.start()
    try:stdout,stderr=proc.communicate(timeout=900)
    except subprocess.TimeoutExpired:
        proc.kill();proc.communicate();raise RuntimeError(f'{lang} timeout')
    finally:stop.set();thread.join(timeout=1)
    wall_ms=(time.perf_counter()-start)*1000
    end_cpu=resource.getrusage(resource.RUSAGE_CHILDREN)
    cpu_s=(end_cpu.ru_utime-start_cpu.ru_utime)+(end_cpu.ru_stime-start_cpu.ru_stime)
    if proc.returncode!=0:raise RuntimeError(f'{lang}: exit={proc.returncode}, stderr={stderr[:3000]}')
    try:data=json.loads(stdout)
    except ValueError as e:raise RuntimeError(f'{lang}: invalid JSON stdout={stdout[:500]} stderr={stderr[:200]}') from e
    if data.get('backend')!=lang or data.get('iterations')!=its:raise RuntimeError(f'{lang}: wrong backend/iterations')
    return {'backend':lang,'ms_per_iteration':data['ms_per_iteration'],
            'wall_ms':wall_ms,'cpu_seconds':cpu_s,'rss_peak_mib':max(samples,default=None),
            'result':data['result']}

def compare(a,b,path='result'):
    if isinstance(a,dict):
        if not isinstance(b,dict) or a.keys()!=b.keys():raise AssertionError(f'{path}: different keys')
        for k in a:compare(a[k],b[k],path+'.'+k)
    elif isinstance(a,(int,float)) and not isinstance(a,bool):
        if isinstance(a,int):
            if a!=b:raise AssertionError(f'{path}: {a}!={b}')
        elif not isinstance(b,(float,int)) or not math.isclose(a,b,rel_tol=1e-7,abs_tol=1e-6):
            raise AssertionError(f'{path}: {a}!={b}')
    elif a!=b:raise AssertionError(f'{path}: {a}!={b}')

def dataset(path,rows=None):
    if not path.exists():
        if rows is None:raise RuntimeError(f'Missing local dataset {path}')
        generate(path,rows,int(dt.datetime(2010,1,1,tzinfo=dt.timezone.utc).timestamp()))
    with path.open('rb') as f:
        if f.readline().decode()!=HEADER:raise ValueError(f'Bad canonical TSV header: {path}')
    h=hashlib.sha256();n=0
    with path.open('rb') as f:
        for buf in iter(lambda:f.read(1024*1024),b''):h.update(buf);n+=buf.count(b'\n')
    return n-1,h.hexdigest()

def main():
    p=argparse.ArgumentParser(description='OFFLINE calculations only. NO database connections.')
    p.add_argument('mode',choices=('smoke','light','full'))
    p.add_argument('--data',type=Path,help='Existing local canonical TSV. No MariaDB connection.')
    p.add_argument('--languages',default=','.join(LANGS))
    p.add_argument('--trials',type=int,default=3)
    p.add_argument('--iterations',type=int,help='Compute repetitions within each process')
    a=p.parse_args()
    langs=[x.strip() for x in a.languages.split(',')]
    if len(set(langs))!=len(langs) or not langs or any(x not in LANGS for x in langs):p.error('invalid --languages')
    if not 1<=a.trials<=20:p.error('--trials 1..20')
    if a.iterations is not None and not 1<=a.iterations<=100:p.error('--iterations 1..100')
    profiles={'smoke':[(ROOT/'data/fixture_288.tsv',288,1)],
              'light':[(ROOT/'data/fixture_10000.tsv',10000,2)],
              'full':[(ROOT/'data/fixture_105120.tsv',105120,1),(ROOT/'data/fixture_1680000.tsv',1680000,1)]}
    cases=[(a.data.resolve(),None,a.iterations or 1)] if a.data else profiles[a.mode]
    print('OFFLINE ONLY: benchmark has no database driver and never calls MariaDB.',flush=True)
    print('Only local TSV files are read. File read happens before each timed compute loop.',flush=True)
    build(langs)
    allrows=[];datasets=[]
    for file,count,default_iterations in cases:
        file=file.resolve();its=a.iterations or default_iterations
        n,digest=dataset(file,count)
        if n<=0:raise RuntimeError('empty dataset')
        info={'file':str(file),'rows':n,'sha256':digest,'bytes':file.stat().st_size}
        datasets.append(info)
        print(f'DATA {n:,} rows SHA256={digest} iterations={its}',flush=True)
        # Reference result produced independently of timed measurements.
        reference=run_command('python',file,1)['result']
        if reference['total']['rows']!=n:raise RuntimeError('reference row count mismatch')
        for trial in range(1,a.trials+1):
            # Rotate order across runs to mitigate CPU cache and thermal bias.
            order=langs[(trial-1)%len(langs):]+langs[:(trial-1)%len(langs)]
            for lang in order:
                res=run_command(lang,file,its)
                compare(reference,res.pop('result'))
                row={'dataset_sha256':digest,'rows':n,'trial':trial,'iterations':its,**res}
                allrows.append(row)
                print(f'  {trial}/{a.trials} {lang:6} {row["ms_per_iteration"]:10.2f} ms/iter '
                      f'RSS={row["rss_peak_mib"]} MiB CPU={row["cpu_seconds"]:.2f}s PARITY PASS',flush=True)
    stamp=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    outdir=ROOT/'results';outdir.mkdir(exist_ok=True)
    metadata={'mode':a.mode,'utc':stamp,'algorithm':'canonical interval-weighted stats, raw string to aggregates',
              'offline':True,'datasets':datasets,'trials':a.trials,'languages':langs}
    output={'metadata':metadata,'measurements':allrows}
    path=outdir/f'compute_{stamp}.json'
    path.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
    md=['# Loučka Weather: offline benchmark vlastních statistik','',
        '**Výpočty proběhly výhradně nad lokálními TSV. Žádné SQL dotazy ani zápisy.**','',
        f'UTC: {stamp}; trials={a.trials}; order rotated; parity PASS','',
        '| Dataset rows | Language | Median compute ms/iter | Range ms | Max RSS MiB |',
        '|---:|---|---:|---:|---:|']
    for ds in datasets:
        for lang in langs:
            cells=[r for r in allrows if r['dataset_sha256']==ds['sha256'] and r['backend']==lang]
            tm=[r['ms_per_iteration'] for r in cells]
            ram=[r['rss_peak_mib'] for r in cells if r['rss_peak_mib'] is not None]
            md.append(f"| {ds['rows']} | {lang} | {statistics.median(tm):.2f} | {min(tm):.2f}–{max(tm):.2f} | {max(ram) if ram else 'n/a'} |")
    md.extend(['','Timing = TSV parsing from already-read memory + native calculation + aggregation + result construction; **no disk read or JSON serialization** in timed region. Python, Node, Go, C++ and Rust read TSV once outside timing. No DB/network. RAM includes input and runtime, not database.','',
               'Numeric parity compares daily/monthly/yearly/global summaries across all languages, allowing normal floating-point tolerance.','',
               'Synthetic fixture does **not** represent actual historical sensor distributions; for real data use normalize_weewx_csv.py on an existing offline exported dataset.'])
    path.with_suffix('.md').write_text('\n'.join(md)+'\n')
    print(f'PASS. Results: {path} and {path.with_suffix(".md")}',flush=True)

if __name__=='__main__':
    try:main()
    except (RuntimeError,ValueError,AssertionError,subprocess.CalledProcessError) as e:
        print('FAILED:',e,file=sys.stderr);sys.exit(1)
