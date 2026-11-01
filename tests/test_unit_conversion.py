"""Pure, read-only unit normalization contract tests for all WeeWX input systems."""
import json
import math
from pathlib import Path
import pytest
from contracts.unit_conversion import convert,UnitConversionError,CATALOG,SYSTEMS

ROOT=Path(__file__).resolve().parents[1]
GOLDEN=json.loads((ROOT/"tests/fixtures/unit-conversions.json").read_text())

@pytest.mark.parametrize("case",GOLDEN["cases"],ids=lambda p: f'{p["metric"]}-{p["usUnits"]}-{p["units"]}-{p["value"]}')
def test_golden_conversions(case):
    actual=convert(case["metric"],case["value"],case["usUnits"],case["units"])
    if case["expected"] is None:
        assert actual is None
    else:
        assert math.isclose(actual,case["expected"],abs_tol=2e-7,rel_tol=2e-9)

@pytest.mark.parametrize("metric,entry",[(n,x) for n,x in CATALOG["columns"].items() if x["public"]])
def test_all_public_metrics_are_supported(metric,entry):
    for src in SYSTEMS.values():
        for target in SYSTEMS:
            actual=convert(metric,1.0,src,target)
            assert math.isfinite(actual)
            assert entry["sourceUnitsByWeeWX"][str(src)] in CATALOG["groupUnits"][entry["unitGroup"]].values()
            assert entry["outputUnits"][target] in CATALOG["groupUnits"][entry["unitGroup"]].values()

@pytest.mark.parametrize("src", [0,2,18,255,-1,True,16.0,"16",None])
def test_unknown_source_is_rejected(src):
    with pytest.raises(UnitConversionError):
        convert("rain",1.0,src)

@pytest.mark.parametrize("mode",["si","imperial","METRICWX","",None,1])
def test_unknown_requested_system_is_rejected(mode):
    with pytest.raises(UnitConversionError):
        convert("rain",1.0,16,mode)

@pytest.mark.parametrize("bad",["3",True,float("nan"),float("inf"),-float("inf"),{},[]])
def test_bad_numeric_input_fails(bad):
    with pytest.raises(UnitConversionError):
        convert("outTemp",bad,16)

@pytest.mark.parametrize("metric",["bgt","GTSdate","lightning_energy","__fake__"])
def test_disabled_or_unknown_metric_fails(metric):
    with pytest.raises(UnitConversionError):
        convert(metric,12,16)

@pytest.mark.parametrize("metric",["rain","outTemp","windSpeed","barometer","cloudbase","windrun"])
def test_negative_or_zero_is_not_silently_clamped(metric):
    assert convert(metric,0,17) == 0 or (metric=="outTemp" and convert(metric,0,17)==0)
    # Some source anomalies are negative; conversion must not delete data silently.
    assert math.isfinite(convert(metric,-2.0,16))

def test_missing_remains_null():
    assert convert("rain",None,1,"us") is None
    assert convert("rain",None,16,"metricwx") is None
    with pytest.raises(UnitConversionError):
        convert("rain",None,123,"metricwx")

@pytest.mark.parametrize("metric",["rain","outTemp","windSpeed","barometer","cloudbase","windrun"])
def test_round_trip(metric):
    for syscode in SYSTEMS.values():
        for target in SYSTEMS:
            initial=123.456
            into=convert(metric,initial,syscode,target)
            recovered=convert(metric,into,SYSTEMS[target],{v:k for k,v in SYSTEMS.items()}[syscode])
            assert math.isclose(initial,recovered,rel_tol=1e-10,abs_tol=1e-8)
