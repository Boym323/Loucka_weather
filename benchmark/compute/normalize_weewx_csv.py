#!/usr/bin/env python3
"""Convert CSV export from a LOCAL/ISOLATED WeeWX archive snapshot to canonical TSV.
NO DB/network code. Never edits original input. Reconstructed rows require source column.
"""
import argparse, csv, datetime as dt, math
from pathlib import Path
from zoneinfo import ZoneInfo
HEADER='endTs\tintervalMin\tlocalDay\ttempC\trainMm\twindMs\twindFromDeg\thumidityPct\tsource\n'
TZ=ZoneInfo('Europe/Prague')

def number(s):
    if s is None or s.strip() in ('','-','NULL','None','null'):return None
    v=float(s)
    if not math.isfinite(v):raise ValueError('non-finite numeric value')
    return v

def unit_values(units, temp, rain, wind):
    if units==1: return ((temp-32)*5/9 if temp is not None else None,
                         rain*25.4 if rain is not None else None,
                         wind*0.44704 if wind is not None else None)
    if units==16:return (temp,rain*10 if rain is not None else None,
                         wind/3.6 if wind is not None else None)
    if units==17:return (temp,rain,wind)
    raise ValueError(f'Unknown WeeWX usUnits {units}; do not guess units')

def fmt(v):return '-' if v is None else format(v,'.8f')

def convert(src:Path,dst:Path):
    if src.resolve()==dst.resolve():raise ValueError('input/output must be different')
    dst.parent.mkdir(parents=True,exist_ok=True)
    n=0;prev=-1
    # Both files are local; never request MariaDB connection or alter the source.
    with src.open('r',encoding='utf-8-sig',newline='') as fi,dst.open('w',encoding='utf-8',newline='') as fo:
        head=fi.readline();fi.seek(0)
        dialect=csv.excel_tab if '\t' in head else csv.excel
        rd=csv.DictReader(fi,dialect=dialect)
        required={'dateTime','interval','usUnits','outTemp','rain','windSpeed','windDir','outHumidity'}
        if not required.issubset(set(rd.fieldnames or [])):
            raise ValueError('missing columns: '+', '.join(sorted(required-set(rd.fieldnames or []))))
        fo.write(HEADER)
        for r in rd:
            ts=int(r['dateTime']);minutes=int(r['interval']);units=int(r['usUnits'])
            if ts<=prev or minutes<1 or minutes>1440:
                raise ValueError(f'row {n+1}: unsorted/duplicate dateTime or invalid interval')
            prev=ts
            temp,rain,wind=unit_values(units,number(r['outTemp']),number(r['rain']),number(r['windSpeed']))
            direction=number(r['windDir']);humid=number(r['outHumidity'])
            source=r.get('source','U').strip().upper() or 'U'
            if source not in ('O','R','U'):raise ValueError(f'row {n+1}: source must be O/R/U')
            # Archive timestamp marks END of interval: 00:00 end belongs to previous day.
            day=dt.datetime.fromtimestamp(ts-1,TZ).strftime('%Y-%m-%d')
            fo.write('\t'.join([str(ts),str(minutes),day,fmt(temp),fmt(rain),fmt(wind),fmt(direction),fmt(humid),source])+'\n')
            n+=1
    print(f'LOCAL snapshot normalized: {n} rows => {dst}; no DB operations')

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('input',type=Path,help='CSV/TSV exported from existing LOCAL snapshot')
    ap.add_argument('output',type=Path,help='Canonical output TSV; never original input')
    a=ap.parse_args();convert(a.input,a.output)
