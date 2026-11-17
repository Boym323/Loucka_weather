"""No-DB contract for bounded July 2026 WeeWX interval-overlap QC."""
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
import re
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "qc-outtemp-july-2026-readonly.sql"
SQL = SCRIPT.read_text(encoding="utf-8")
PRAGUE = ZoneInfo("Europe/Prague")

def utc_bounds(local_date):
    start = datetime(local_date.year, local_date.month, local_date.day, tzinfo=PRAGUE)
    end_date = local_date + timedelta(days=1)
    end = datetime(end_date.year, end_date.month, end_date.day, tzinfo=PRAGUE)
    return int(start.timestamp()), int(end.timestamp())

class JulyReadOnlyQc(unittest.TestCase):
    def test_july_calendar_boundaries_are_local_day_not_utc_midnight(self):
        self.assertEqual(utc_bounds(date(2026,7,25)), (1784930400,1785016800))
        self.assertEqual(utc_bounds(date(2026,7,26)), (1785016800,1785103200))

    def test_europe_prague_days_have_dst_23_24_25_hour_lengths(self):
        self.assertEqual(utc_bounds(date(2026,3,29))[1] - utc_bounds(date(2026,3,29))[0],23*3600)
        self.assertEqual(utc_bounds(date(2026,7,25))[1] - utc_bounds(date(2026,7,25))[0],24*3600)
        self.assertEqual(utc_bounds(date(2026,10,25))[1] - utc_bounds(date(2026,10,25))[0],25*3600)

    def test_sql_is_bounded_select_only_and_deduplicates_overlaps(self):
        statements = re.sub(r"--[^\\n]*", "", SQL)
        self.assertNotRegex(statements, r"(?im)^\\s*(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|SET)\\b")
        for epoch in ("1784930400","1785016800","1785103200"):
            self.assertIn(epoch, SQL)
        self.assertIn("dateTime>1784930400 AND a.dateTime<=1785103200", SQL)
        self.assertIn("MAX(clip_end) OVER(", SQL)
        self.assertIn("PARTITION BY local_day", SQL)
        self.assertIn("LIMIT 1000", SQL)

if __name__ == "__main__":
    unittest.main()
