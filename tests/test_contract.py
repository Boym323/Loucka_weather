"""Offline validation only. DOES NOT verify real Fastify/Go/Rust servers."""
import json
from pathlib import Path
import pytest
import yaml
from jsonschema import Draft202012Validator, FormatChecker
from openapi_spec_validator import validate
from openapi_spec_validator.readers import read_from_filename

ROOT = Path(__file__).resolve().parents[1]
DOC = yaml.safe_load((ROOT / "openapi.yaml").read_text(encoding="utf-8"))
SCHEMA = json.loads((ROOT / "schemas/weather.schema.json").read_text(encoding="utf-8"))
CATALOG = json.loads((ROOT / "schemas/metrics.json").read_text(encoding="utf-8"))
FIXTURE = ROOT / "tests/fixtures"
CASES = {"current":"CurrentResponse","history":"HistoryResponse","yearly":"YearlyResponse","error":"ErrorResponse","health":"HealthResponse"}

def valid(name, data):
    return Draft202012Validator(
        {"$defs":SCHEMA["$defs"], "$ref":"#/$defs/"+name},
        format_checker=FormatChecker()
    ).is_valid(data)

def fixture(name):
    return json.loads((FIXTURE / (name + ".json")).read_text(encoding="utf-8"))

def semantics(name, data):
    if name=="current":
        for metric,reading in data["readings"].items():
            assert CATALOG["columns"][metric]["outputUnits"][data["units"]]==reading["unit"]
    if name in ("history","yearly"):
        metric=CATALOG["columns"][data["metric"]]
        assert metric["public"] and (("count" if name=="yearly" and data["aggregation"]=="count"
                                 else metric["outputUnits"][data["units"]]) == data["unit"])
        x=data["completeness"]
        if x["expected"] is not None:
            assert x["valid"]<=x["expected"]
            if x["expected"]==0: assert x["fraction"] is None
            elif x["fraction"] is not None:
                assert abs(x["valid"]/x["expected"]-x["fraction"])<1e-6
    if name=="history":
        assert data["count"]==len(data["points"])
        prev=None
        for point in data["points"]:
            assert point["startTime"]<point["endTime"]
            assert data["range"]["from"]<point["endTime"]<=data["range"]["to"]
            if prev: assert prev<=point["startTime"]
            prev=point["endTime"]

def test_openapi():
    specification, base_uri = read_from_filename(str(ROOT / "openapi.yaml"))
    validate(specification, base_uri=base_uri)
    assert DOC["openapi"]=="3.1.1"
    assert set(DOC["paths"])=={
        "/api/v1/current","/api/v1/history",
        "/api/v1/statistics/daily","/api/v1/statistics/monthly","/api/v1/statistics/yearly",
        "/api/v1/station","/api/v1/sensors","/api/v1/live",
        "/api/v1/camera/status","/api/v1/readyz","/api/v1/healthz"
    }
    for x in DOC["components"]["responses"].values():
        ref=x["content"]["application/json"]["schema"]["$ref"]
        if "weather.schema.json" in ref:
            assert ref.split("/")[-1] in SCHEMA["$defs"]
        elif "features.schema.json" in ref:
            features=json.loads((ROOT/"schemas/features.schema.json").read_text())
            assert ref.split("/")[-1] in features["$defs"]
        else:
            raise AssertionError(ref)

def test_schema():
    Draft202012Validator.check_schema(SCHEMA)

def test_catalog():
    cols=CATALOG["columns"]
    assert len(cols)==80
    assert CATALOG["observedUsUnits"]==[16]
    for meta in ("dateTime","usUnits","interval"): assert cols[meta]["role"]=="metadata"
    enabled={name for name,d in cols.items() if d["public"]}
    assert enabled==set(DOC["components"]["parameters"]["Metric"]["schema"]["enum"])
    assert enabled==set(SCHEMA["$defs"]["CurrentResponse"]["properties"]["readings"]["properties"])
    for m in ("bgt","pb","GTSdate","lightning_energy"):assert not cols[m]["public"]
    assert cols["rain"]["sourceUnit"]=="cm" and cols["rain"]["apiUnit"]=="mm"
    assert cols["windSpeed"]["sourceUnit"]=="km_per_h" and cols["windSpeed"]["apiUnit"]=="m_per_s"
    assert CATALOG["unitSystems"]=={"1":"us","16":"metric","17":"metricwx"}
    assert CATALOG["defaultOutputUnits"]=="metricwx"
    for name,entry in cols.items():
        if entry["public"]:
            assert set(entry["outputUnits"])=={"us","metric","metricwx"}
            assert set(entry["sourceUnitsByWeeWX"])=={"1","16","17"}
            assert entry["sourceUnitsByWeeWX"]["16"]==entry["sourceUnit"]
            assert entry["outputUnits"]["metricwx"]==entry["apiUnit"]
    for endpoint in ("/api/v1/current","/api/v1/history","/api/v1/statistics/yearly"):
        refs=[x.get("$ref") for x in DOC["paths"][endpoint]["get"]["parameters"]]
        assert "#/components/parameters/Units" in refs

@pytest.mark.parametrize("name",list(CASES))
def test_valid_fixture(name):
    data=fixture(name)
    assert valid(CASES[name],data),name
    semantics(name,data)

def test_invalid_current_examples():
    x=fixture("current");x["readings"]["rain"]["unit"]="degC"
    assert not valid("CurrentResponse",x)
    x=fixture("current");x["readings"]["outTemp"]["quality"]="missing"
    assert not valid("CurrentResponse",x)
    x=fixture("current");x["readings"]["invented"]={"value":1,"unit":"degC","quality":"measured","source":"weewx_archive","provenance":None}
    assert not valid("CurrentResponse",x)

def test_invalid_metric_and_unit():
    x=fixture("history");x["metric"]="GTSdate"
    assert not valid("HistoryResponse",x)
    x=fixture("history");x["unit"]="mm"
    assert not valid("HistoryResponse",x)
    x=fixture("yearly");x["unit"]="degC"
    assert not valid("YearlyResponse",x)

def test_unit_system_contract_rejects_mismatched_modes():
    for name,kind in (("current","CurrentResponse"),("history","HistoryResponse"),("yearly","YearlyResponse")):
        x=fixture(name);x["units"]="us"
        assert not valid(kind,x), f"{kind} must reject metricwx field units when units=us"
        x=fixture(name);x["units"]="nonsense"
        assert not valid(kind,x)
    x=fixture("yearly");x["aggregation"]="count";x["unit"]="count"
    assert valid("YearlyResponse",x)
    x["unit"]="mm"
    assert not valid("YearlyResponse",x)
    x=fixture("current");x["readings"]["rain"]["sourceUsUnits"]=99
    assert not valid("CurrentResponse",x)

def test_invalid_datetime_and_error():
    x=fixture("current");x["observedAt"]="nonsense"
    assert not valid("CurrentResponse",x)
    x=fixture("error");x["error"]["code"]="SQL_EXCEPTION"
    assert not valid("ErrorResponse",x)

def test_semantic_mismatch_detected():
    x=fixture("history");x["count"]=999
    with pytest.raises(AssertionError):semantics("history",x)
