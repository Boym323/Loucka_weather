"""Run actual Fastify, Go, Rust API v1 black-box parity on the SAME isolated test snapshot.
No backend is silently skipped. Never point this script at production for load testing.
"""
import argparse, json, math, sys
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen
from urllib.error import HTTPError
from jsonschema import Draft202012Validator,FormatChecker

ROOT=Path(__file__).resolve().parents[1]
S=json.loads((ROOT/"schemas/weather.schema.json").read_text())
C=json.loads((ROOT/"schemas/metrics.json").read_text())
CASES=[
 ("/api/v1/current",{"asOf":"2026-10-30T20:00:00Z"},"CurrentResponse",200),
 ("/api/v1/history",{"metric":"outTemp","from":"2026-10-29T20:00:00Z","to":"2026-10-30T20:00:00Z","resolution":"raw","limit":"500"},"HistoryResponse",200),
 ("/api/v1/statistics/yearly",{"metric":"rain","year":"2025","aggregation":"sum"},"YearlyResponse",200),
 ("/api/v1/history",{"metric":"_invalid_","from":"2026-10-29T20:00:00Z","to":"2026-10-30T20:00:00Z"},"ErrorResponse",400)
]
def fetch(base,path,params):
    try:
        with urlopen(base.rstrip("/")+path+"?"+urlencode(params),timeout=15) as r:
            return r.status,json.load(r)
    except HTTPError as e: return e.code,json.load(e)
def canonical(x):
    if isinstance(x,dict):return {k:canonical(v) for k,v in x.items() if k not in ("requestId","checkedAt")}
    if isinstance(x,list):return [canonical(v) for v in x]
    return x
def compare(a,b,path=""):
    if type(a)!=type(b):raise AssertionError(path+": type mismatch")
    if isinstance(a,dict):
        if a.keys()!=b.keys():raise AssertionError(path+": keys mismatch")
        for k in a:compare(a[k],b[k],path+"/"+k)
    elif isinstance(a,list):
        if len(a)!=len(b):raise AssertionError(path+": array size mismatch")
        for i,(x,y) in enumerate(zip(a,b)):compare(x,y,path+"/"+str(i))
    elif isinstance(a,float):
        if not math.isclose(a,b,rel_tol=1e-6,abs_tol=1e-6):raise AssertionError(path+": numerical mismatch")
    elif a!=b:raise AssertionError(path+": value mismatch "+repr(a)+" != "+repr(b))
def main():
    p=argparse.ArgumentParser()
    for n in ("fastify","go","rust"):p.add_argument("--"+n,required=True)
    p.add_argument("--expected-dataset-id",required=True,help="All three must read the same isolated snapshot")
    a=p.parse_args()
    urls={n:getattr(a,n) for n in ("fastify","go","rust")}
    if len(set(urls.values()))!=3:p.error("Three distinct backend URLs required")
    print("Isolated test dataset:",a.expected_dataset_id)
    for path,params,schema,expected in CASES:
        results={}
        for name,base in urls.items():
            status,data=fetch(base,path,params)
            if status!=expected:raise AssertionError(f"{name} {path}: HTTP {status} != {expected}")
            Draft202012Validator({"$defs":S["$defs"],"$ref":"#/$defs/"+schema},format_checker=FormatChecker()).validate(data)
            if schema=="HistoryResponse":
                if data["count"]!=len(data["points"]):raise AssertionError(name+": count mismatch")
                if C["columns"][data["metric"]]["apiUnit"]!=data["unit"]:raise AssertionError(name+": unit mismatch")
            if schema=="ErrorResponse" and data["error"]["code"]!="UNKNOWN_METRIC":raise AssertionError(name+": wrong error code")
            results[name]=canonical(data)
        for other in ("go","rust"):compare(results["fastify"],results[other],path)
        print("PASS",path,params)
    print("PASS Fastify=Go=Rust on actual HTTP responses")
if __name__=="__main__":
    try:main()
    except Exception as e:
        print("FAIL:",str(e),file=sys.stderr)
        sys.exit(1)
