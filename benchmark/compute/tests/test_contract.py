import csv
import datetime as dt
import tempfile
import unittest
from pathlib import Path
from zoneinfo import ZoneInfo
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
sys.path.insert(0,str(ROOT/'python'))
from normalize_weewx_csv import convert,unit_values
from main import compute

class ContractTest(unittest.TestCase):
 def test_unit_conversions(self):
  a=unit_values(1,50.0,1.0,1.0)
  for x,y in zip(a,(10.,25.4,.44704)):self.assertAlmostEqual(x,y)
  a=unit_values(16,10.,.1,3.6)
  for x,y in zip(a,(10.,1.,1.)):self.assertAlmostEqual(x,y)
  self.assertEqual(unit_values(17,10.,1.,2.),(10.,1.,2.))
  with self.assertRaises(ValueError):unit_values(42,10.,1.,2.)

 def test_midnight_and_dst_both_directions(self):
  tz=ZoneInfo('Europe/Prague')
  dates=[dt.datetime(2024,3,31,0,0,tzinfo=tz),
         dt.datetime(2024,10,27,0,0,tzinfo=tz),
         dt.datetime(2024,10,28,0,0,tzinfo=tz)]
  with tempfile.TemporaryDirectory() as tmp:
   src=Path(tmp)/'in.csv';dst=Path(tmp)/'out.tsv'
   with src.open('w',newline='') as f:
    w=csv.writer(f);w.writerow(['dateTime','interval','usUnits','outTemp','rain','windSpeed','windDir','outHumidity','source'])
    for i,t in enumerate(dates):w.writerow([int(t.timestamp()),5,17,10+i,.2,1,0,60,'R' if i==1 else 'O'])
   convert(src,dst)
   days=[r.split('\t')[2] for r in dst.read_text().splitlines()[1:]]
   self.assertEqual(days,['2024-03-30','2024-10-26','2024-10-27'])

 def test_weighted_and_missing_and_reconstruction(self):
  header='endTs\tintervalMin\tlocalDay\ttempC\trainMm\twindMs\twindFromDeg\thumidityPct\tsource\n'
  values=header+('100\t5\t2024-01-01\t10\t0.2\t2\t0\t40\tO\n'
                  '700\t10\t2024-01-01\t20\t0.3\t2\t90\t80\tR\n'
                  '1000\t5\t2024-01-01\t-\t-\t-\t-\t-\tO\n')
  a=compute(values)['daily']['2024-01-01']
  self.assertEqual(a['rows'],3)
  self.assertEqual(a['reconstructed'],1)
  self.assertEqual(a['minutes'],20)
  self.assertEqual(a['tempMinutes'],15)
  self.assertAlmostEqual(a['tempC'],(10*5+20*10)/15)
  self.assertEqual(a['tempMin'],10)
  self.assertEqual(a['tempMax'],20)
  self.assertAlmostEqual(a['rainMm'],.5)
  self.assertAlmostEqual(a['humidPct'],(40*5+80*10)/15)
  self.assertAlmostEqual(a['windVectorMs'],2*((5**2+10**2)**.5)/15)
  self.assertAlmostEqual(a['windDir'],63.43494882,places=6)

 def test_null_not_zero(self):
  raw='endTs\tintervalMin\tlocalDay\ttempC\trainMm\twindMs\twindFromDeg\thumidityPct\tsource\n100\t5\t2024-01-01\t-\t-\t-\t-\t-\tO\n'
  a=compute(raw)['total']
  self.assertIsNone(a['tempC']);self.assertIsNone(a['rainMm']);self.assertIsNone(a['windVectorMs']);self.assertIsNone(a['humidPct'])

if __name__=='__main__':unittest.main()
