#!/usr/bin/env python3
"""Synthetic deterministic LOCAL benchmark data; no DB/network access.
Columnar canonical format UTF-8 TSV, sorted by end timestamp; all units normalized.
"""
import argparse
import datetime as dt
import math
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo('Europe/Prague')
HEADER = 'endTs\tintervalMin\tlocalDay\ttempC\trainMm\twindMs\twindFromDeg\thumidityPct\tsource\n'

def generate(out: Path, count: int, start: int):
    out.parent.mkdir(parents=True, exist_ok=True)
    end = start
    with out.open('w', encoding='utf-8', newline='') as f:
        f.write(HEADER)
        for n in range(count):
            interval = 10 if n % 15731 == 0 else 15 if n % 35719 == 0 else 5
            end += interval * 60
            day = dt.datetime.fromtimestamp(end - 1, TZ).strftime('%Y-%m-%d')
            doy = (n % 105120) / 105120
            temp = 12 + 15*math.sin(2*math.pi*(doy-0.23)) + 4*math.sin(n/288*2*math.pi) + 0.6*math.sin(n*0.177)
            rain = 0.2 + (n%7)*0.1 if n % 271 == 0 else 0.0
            wind = 0.3 + abs(4*math.sin(n*.0347))
            dire = (n*13.7 + 35*math.sin(n/100)) % 360
            hum = 65 + 25*math.sin(n*.013)
            values = [str(end),str(interval),day,
                      '-' if n%41 == 0 else f'{temp:.4f}',
                      '-' if n%73 == 0 else f'{rain:.4f}',
                      '-' if n%53 == 0 else f'{wind:.4f}',
                      '-' if n%59 == 0 else f'{dire:.4f}',
                      '-' if n%37 == 0 else f'{hum:.4f}',
                      'R' if n%199 == 0 else 'O']
            f.write('\t'.join(values)+'\n')
    print(f'Fixture: {out} rows={count} bytes={out.stat().st_size}', flush=True)

if __name__ == '__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--rows',type=int,default=10000)
    ap.add_argument('--output',type=Path,default=Path('data/fixture_10000.tsv'))
    ap.add_argument('--start',default='2010-01-01T00:00:00+00:00')
    a=ap.parse_args()
    if not 1<=a.rows<=3000000: ap.error('rows must be 1..3000000')
    start=dt.datetime.fromisoformat(a.start)
    if start.tzinfo is None: ap.error('start must have timezone')
    generate(a.output,a.rows,int(start.timestamp()))
