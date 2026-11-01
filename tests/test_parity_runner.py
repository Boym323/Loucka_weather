"""Tests for the comparison algorithm; uses no HTTP and no weather database."""
import importlib.util
from pathlib import Path
import pytest
P=Path(__file__).with_name("run_live.py")
spec=importlib.util.spec_from_file_location("run_live",P)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def test_numeric_json_float_int_equivalent():
    module.compare({"value":12}, {"value":12.0})

def test_close_numerical_values():
    module.compare({"points":[{"value":12.00000001}]},{"points":[{"value":12.0}]})

@pytest.mark.parametrize("a,b",[
    ({"value":12.2},{"value":13.2}),
    ({"value":None},{"value":0}),
    ({"metric":"rain"},{"metric":"outTemp"}),
    ({"points":[1,2]},{"points":[1]}),
    ({"quality":"measured"},{"quality":"reconstructed"}),
])
def test_mismatches_fail_closed(a,b):
    with pytest.raises(AssertionError):module.compare(a,b)

def test_request_ids_are_ignored_but_error_codes_not():
    a={"error":{"requestId":"a","code":"UNKNOWN_METRIC"}}
    b={"error":{"requestId":"b","code":"UNKNOWN_METRIC"}}
    module.compare(module.canonical(a),module.canonical(b))
    b["error"]["code"]="BAD_REQUEST"
    with pytest.raises(AssertionError):module.compare(module.canonical(a),module.canonical(b))

def test_parameter_matrix_covers_all_three_unit_modes():
    for route in ("/api/v1/current","/api/v1/history","/api/v1/statistics/yearly"):
        modes={params["units"] for path,params,_,expected in module.CASES if path==route and expected==200}
        assert modes=={"us","metric","metricwx"}
    assert any(params.get("units")=="unsupported" and status==400 for _,params,_,status in module.CASES)
