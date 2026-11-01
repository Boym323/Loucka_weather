"""Reference unit conversion for Loucka Weather contract. NOT a deployed API.

Only the standard WeeWX source codes 1/16/17 are accepted. No DB access and
no change of meteorological records. Python reference for cross-language fixtures.
"""
from __future__ import annotations
import json
import math
from decimal import Decimal
from pathlib import Path

CATALOG = json.loads((Path(__file__).resolve().parents[1] / "schemas" / "metrics.json").read_text(encoding="utf-8"))
SYSTEMS = {"us": 1, "metric": 16, "metricwx": 17}
# Exact physical factors where exactness is defined.
# 1 inHg = 33.8638866667 hPa (conventional reference), not exact by definition.
HPA_PER_INHG = Decimal("33.8638866667")
BASE_FACTORS = {
    "rain": {"inch": Decimal("25.4"), "cm": Decimal("10"), "mm": Decimal("1")},
    "rainrate": {"inch_per_h": Decimal("25.4"), "cm_per_h": Decimal("10"), "mm_per_h": Decimal("1")},
    "speed": {"mph": Decimal("0.44704"), "km_per_h": Decimal(1) / Decimal("3.6"), "m_per_s": Decimal("1")},
    "pressure": {"inHg": HPA_PER_INHG, "hPa": Decimal("1")},
    "altitude": {"ft": Decimal("0.3048"), "m": Decimal("1")},
    "distance": {"mi": Decimal("1.609344"), "km": Decimal("1")},
}
class UnitConversionError(ValueError):
    """Unsupported or ambiguous source unit: fail closed, do not silently guess."""

def convert(metric: str, value: float | int | None, source_us_units: int, output_units: str = "metricwx"):
    """Convert an individual archive value into requested output units.

    Numeric values represent single observations / already-computed aggregations.
    Caller MUST never apply affine temperature conversion to SUM of temperature
    samples; the aggregate must be computed correctly before converting.
    """
    field = CATALOG["columns"].get(metric)
    if not field or not field.get("public"):
        raise UnitConversionError("Unknown or disabled meteorological metric")
    if type(source_us_units) is not int or source_us_units not in (1, 16, 17):
        raise UnitConversionError("Unsupported WeeWX source usUnits")
    if not isinstance(output_units, str) or output_units not in SYSTEMS:
        raise UnitConversionError("Unsupported requested unit system")
    if value is None:
        return None
    if type(value) not in (int, float) or not math.isfinite(value):
        raise UnitConversionError("Input must be a finite real number or null")
    source_unit = field["sourceUnitsByWeeWX"][str(source_us_units)]
    target_unit = field["outputUnits"][output_units]
    group = field["unitGroup"]
    if source_unit == target_unit:
        return float(value)
    number = Decimal(str(value))
    if group == "temperature":
        celsius = (number - Decimal(32)) * Decimal(5) / Decimal(9) if source_unit == "degF" else number
        result = celsius * Decimal(9) / Decimal(5) + Decimal(32) if target_unit == "degF" else celsius
    elif group in BASE_FACTORS:
        factors = BASE_FACTORS[group]
        try:
            result = number * factors[source_unit] / factors[target_unit]
        except KeyError as exc:
            raise UnitConversionError("Unsupported unit within unit group") from exc
    else:
        # Other groups are invariant across all three WeeWX standards.
        if source_unit != target_unit:
            raise UnitConversionError("Unrecognized unit conversion")
        result = number
    converted = float(result)
    if not math.isfinite(converted):
        raise UnitConversionError("Numeric overflow after conversion")
    return converted
