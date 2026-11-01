"""Domain and schema tests, not real API implementation or validation of unverified raw data."""
import copy
import json
from pathlib import Path
from datetime import timedelta
from jsonschema import Draft202012Validator, FormatChecker
import pytest
import yaml
from contracts.aggregation import weighted_mean, interval_sum, vector_wind_direction, local_day_bounds, archive_record_start

ROOT=Path(__file__).resolve().parents[1]
F=json.loads((ROOT/"schemas/features.schema.json").read_text())
W=json.loads((ROOT/"schemas/weather.schema.json").read_text())
P=json.loads((ROOT/"schemas/aggregation-policy.json").read_text())
C=json.loads((ROOT/"schemas/metrics.json").read_text())
O=yaml.safe_load((ROOT/"openapi.yaml").read_text())

def fixture(name):
    return json.loads((ROOT/"tests/fixtures"/(name+".json")).read_text())
def validator(name):
    return Draft202012Validator({"$defs":F["$defs"],"$ref":"#/$defs/"+name},format_checker=FormatChecker())

@pytest.mark.parametrize("name,ref",[
    ("station","StationResponse"),("sensors","SensorsResponse"),
    ("period","PeriodStatsResponse"),("camera","CameraStatusResponse"),
    ("live","LiveEvent"),("readiness","ReadinessResponse")
])
def test_extended_fixtures(name,ref):
    validator(ref).validate(fixture(name))

def test_aggregation_policy_total_and_non_permissive():
    active={k for k,v in C["columns"].items() if v["public"]}
    assert set(P["metrics"])==active
    allowed={"mean","min","max","sum","count","vecdir","dir_at_max"}
    for k,v in P["metrics"].items():
        assert set(v["allowed"])<=allowed
        assert v["default"] in v["allowed"]
        assert v["algorithm"] and v["sourcePriority"]
    assert P["metrics"]["rain"]["default"]=="sum"
    assert "sum" not in P["metrics"]["rainRate"]["allowed"]
    assert "mean" not in P["metrics"]["windDir"]["allowed"]
    assert "vecdir" in P["metrics"]["windDir"]["allowed"]
    assert "sum" not in P["metrics"]["outTemp"]["allowed"]
    assert P["metrics"]["lightning_strike_count"]["statsEnabled"] is False
    assert P["metrics"]["ET24"]["allowed"]==["max","count"]

def test_metric_aggregation_rejected_by_jsonschema():
    x=fixture("period")
    for metric,method in [("rain","mean"),("outTemp","sum"),("windDir","mean"),("rainRate","sum"),("lightning_strike_count","count")]:
        case=copy.deepcopy(x)
        case["metric"]=metric
        case["aggregation"]=method
        assert not validator("PeriodStatsResponse").is_valid(case),(metric,method)
    case=copy.deepcopy(x)
    case["units"]="us"
    assert not validator("PeriodStatsResponse").is_valid(case)
    case=copy.deepcopy(x)
    case["aggregation"]="count"
    case["unit"]="count"
    assert validator("PeriodStatsResponse").is_valid(case)
    case["unit"]="mm"
    assert not validator("PeriodStatsResponse").is_valid(case)

def test_yearly_aggregation_rejected():
    year=fixture("yearly")
    schema=Draft202012Validator({"$defs":W["$defs"],"$ref":"#/$defs/YearlyResponse"},format_checker=FormatChecker())
    year["aggregation"]="mean"
    assert not schema.is_valid(year)
    year["aggregation"]="sum"
    assert schema.is_valid(year)

def test_station_does_not_fabricate_metadata():
    station=fixture("station")
    assert station["location"]["verified"] is False
    assert station["location"]["latitude"] is None
    assert station["availableDatasets"]==["original"]

def test_sensor_state_is_not_inferred_from_nullable_data():
    info=fixture("sensors")["sensors"][0]
    assert info["status"]=="unknown" and info["depthCm"] is None
    bad=fixture("sensors")
    bad["sensors"][0]["status"]="healthy"
    assert not validator("SensorsResponse").is_valid(bad)

def test_camera_private_origins_not_allowed():
    camera=fixture("camera")
    camera["latestUrl"]="rtsp://internal/camera"
    assert not validator("CameraStatusResponse").is_valid(camera)

def test_openapi_routes_and_policies():
    required={"/api/v1/station","/api/v1/sensors","/api/v1/current","/api/v1/history",
              "/api/v1/statistics/daily","/api/v1/statistics/monthly","/api/v1/statistics/yearly",
              "/api/v1/live","/api/v1/camera/status","/api/v1/readyz","/api/v1/healthz"}
    assert set(O["paths"])==required
    for uri in ("/api/v1/current","/api/v1/history","/api/v1/statistics/daily",
                "/api/v1/statistics/monthly","/api/v1/statistics/yearly"):
        params=O["paths"][uri]["get"]["parameters"]
        refs={p.get("$ref") for p in params}
        assert "#/components/parameters/Dataset" in refs
        assert "#/components/parameters/Units" in refs
    assert O["paths"]["/api/v1/live"]["get"]["responses"]["200"]["content"].get("text/event-stream")
    assert O["components"]["parameters"]["Dataset"]["schema"]["default"]=="original"
    assert O["components"]["parameters"]["Units"]["schema"]["default"]=="metricwx"

def test_weighted_mean_with_non_uniform_archive_intervals():
    assert weighted_mean([(10,300),(20,360)])==pytest.approx(15.4545454545)
    assert weighted_mean([(10,300),(None,360)])==10
    assert weighted_mean([(None,300)]) is None
    with pytest.raises(ValueError):weighted_mean([(1,0)])

def test_rain_sum_not_rain_rate_sum():
    assert interval_sum([0,None,1.5,0.5])==2.0
    assert interval_sum([None,None]) is None
    with pytest.raises(ValueError):interval_sum([float("nan")])

def test_wind_circular_direction_and_calm():
    assert vector_wind_direction([(350,5,300),(10,5,300)])==pytest.approx(0,abs=1e-8)
    assert vector_wind_direction([(90,5,300),(270,5,300)]) is None

def test_weewx_archive_end_timestamp():
    assert archive_record_start(1000,5)==700
    assert archive_record_start(1000,6)==640

def test_dst_boundaries_are_not_fixed_24h():
    spring=local_day_bounds("2026-03-29")
    autumn=local_day_bounds("2026-10-25")
    assert spring[1]-spring[0]==timedelta(hours=23)
    assert autumn[1]-autumn[0]==timedelta(hours=25)

def test_history_contract_does_not_silently_truncate_and_rejects_invalid_rollups():
    history=json.loads((ROOT/"tests/fixtures/history.json").read_text())
    schema=Draft202012Validator({"$defs":W["$defs"],"$ref":"#/$defs/HistoryResponse"},format_checker=FormatChecker())
    assert schema.is_valid(history)
    case=copy.deepcopy(history);case["truncated"]=True
    assert not schema.is_valid(case)
    case=copy.deepcopy(history);case["resolution"]="hourly";case["aggregation"]="sample"
    assert not schema.is_valid(case)
    case=copy.deepcopy(history);case["metric"]="outTemp";case["resolution"]="hourly";case["aggregation"]="sum"
    assert not schema.is_valid(case)
    case=copy.deepcopy(history);case["metric"]="rain";case["resolution"]="hourly";case["aggregation"]="sum";case["unit"]="mm"
    assert schema.is_valid(case)
    case=copy.deepcopy(history);case["metric"]="lightning_strike_count";case["resolution"]="daily";case["aggregation"]="count";case["unit"]="count"
    assert not schema.is_valid(case)

def test_calendar_patterns_and_conditional_get_headers():
    import re
    for path, key, valid, invalid in [
        ('/api/v1/statistics/daily','date','2026-10-30','2026-10'),
        ('/api/v1/statistics/monthly','month','2026-10','2026-10-30'),
    ]:
        params=O['paths'][path]['get']['parameters']
        pattern=next(p['schema']['pattern'] for p in params if p.get('name')==key)
        assert re.fullmatch(pattern, valid)
        assert re.fullmatch(pattern, invalid) is None
    for path in ('/api/v1/station','/api/v1/sensors','/api/v1/current',
                 '/api/v1/history','/api/v1/statistics/daily',
                 '/api/v1/statistics/monthly','/api/v1/statistics/yearly',
                 '/api/v1/camera/status'):
        params=O['paths'][path]['get']['parameters']
        assert any(p.get('$ref')=='#/components/parameters/IfNoneMatch' for p in params)
        assert '304' in O['paths'][path]['get']['responses']

def test_docs_from_previous_prs_survive_merge_reconciliation():
    root_readme=(ROOT/"README.md").read_text(encoding="utf-8")
    docs_index=(ROOT/"docs/README.md").read_text(encoding="utf-8")
    agents=(ROOT/"AGENTS.md").read_text(encoding="utf-8")
    for path in ("docs/API_V1_PRODUCT_CONTRACT.md","docs/ARCHIVE_REFRESH_CONTRACT.md",
                 "WEEWX_DAILY_SUMMARIES_AUDIT.md","benchmark/lxc/README.md"):
        assert (ROOT/path).is_file(), path
    assert "docs/API_V1_PRODUCT_CONTRACT.md" in root_readme
    assert "benchmark/lxc/README.md" in root_readme
    assert "FRONTEND_FEATURES_CAMERA_AUDIT_2026-10-31.md" in docs_index
    assert "WEEWX_DAILY_SUMMARIES_AUDIT.md" in agents
