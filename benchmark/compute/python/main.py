#!/usr/bin/env python3
import json, math, pathlib, sys, time

def empty():
    return [0,0,0,0.,0.,None,None,0,0.,0,0.,0.,0.,0,0,0.]
# rows, recon, total minutes, temp weighted sum, temp minutes, temp min,max,
# rain samples,rain sum,wind samples, sin(weighted speed),cos(weighted speed),wind mins,
# humidity samples, humidity minutes, humidity weighted sum

def add(a, parts):
    mins=int(parts[1]); a[0]+=1; a[1]+=parts[8]=='R'; a[2]+=mins
    if parts[3]!='-':
        v=float(parts[3]);a[3]+=v*mins;a[4]+=mins
        a[5]=v if a[5] is None else min(a[5],v)
        a[6]=v if a[6] is None else max(a[6],v)
    if parts[4]!='-': a[7]+=1; a[8]+=float(parts[4])
    if parts[5]!='-' and parts[6]!='-':
        sp=float(parts[5]); angle=float(parts[6])*math.pi/180
        a[9]+=1; a[10]+=math.sin(angle)*sp*mins; a[11]+=math.cos(angle)*sp*mins; a[12]+=mins
    if parts[7]!='-':
        a[13]+=1; a[14]+=mins; a[15]+=float(parts[7])*mins

def clean(a):
    direction=math.degrees(math.atan2(a[10],a[11]))%360 if math.hypot(a[10],a[11])>1e-9 else None
    return {'rows':a[0],'reconstructed':a[1],'minutes':a[2],
      'tempMinutes':round(a[4]),'tempC':a[3]/a[4] if a[4] else None,'tempMin':a[5],'tempMax':a[6],
      'rainN':a[7],'rainMm':a[8] if a[7] else None,
      'windN':a[9],'windVectorMs':math.hypot(a[10],a[11])/a[12] if a[12] else None,
      'windDir':direction,'humidN':a[13], 'humidPct':a[15]/a[14] if a[14] else None}

def compute(src):
    d,m,y,all_a={},{},{},empty()
    for line in src.splitlines()[1:]:
        if not line: continue
        p=line.split('\t')
        if len(p)!=9: raise ValueError('bad row')
        day=p[2]
        for tab,k in [(d,day),(m,day[:7]),(y,day[:4])]:
            a=tab.get(k)
            if a is None:
                a=empty();tab[k]=a
            add(a,p)
        add(all_a,p)
    return {'total':clean(all_a), 'daily':{k:clean(v) for k,v in sorted(d.items())},
            'monthly':{k:clean(v) for k,v in sorted(m.items())},
            'yearly':{k:clean(v) for k,v in sorted(y.items())}}

def main():
    raw=pathlib.Path(sys.argv[1]).read_text()
    runs=int(sys.argv[2]); start=time.perf_counter(); result=None
    for _ in range(runs):result=compute(raw)
    elapsed=(time.perf_counter()-start)*1000/runs
    print(json.dumps({'backend':'python','iterations':runs,'ms_per_iteration':elapsed,'result':result},separators=(',',':'),allow_nan=False))
if __name__=='__main__':main()
