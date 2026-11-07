import test from 'node:test';
import assert from 'node:assert/strict';
import {pragueMidnightIso} from '../src/shared/domain/statistics.ts';
import {seasonWindow,calendarDates,calendarDaysBetween,periodRollup,
 matchSeasonDays,theilSen,monthlyRollups} from '../src/shared/domain/climate-atlas.ts';
const point=(date,value,quality='derived')=>({
 startTime:pragueMidnightIso(date),
 endTime:pragueMidnightIso(new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10)),
 value,quality,source:'browser-test-only',provenance:null
});
test('meteorological seasons handle winter across year and leap day',()=>{
 assert.deepEqual(seasonWindow(2023,'winter'),{
  from:'2023-12-01',toExclusive:'2024-03-01',label:'Zima 2023/2024'
 });
 assert.equal(calendarDaysBetween('2023-12-01','2024-03-01'),91);
 assert.equal(calendarDaysBetween('2024-12-01','2025-03-01'),90);
 assert.equal(calendarDates('2024-02-28','2024-03-02').join(','),
  '2024-02-28,2024-02-29,2024-03-01');
 assert.deepEqual(seasonWindow(2025,'summer'),{
  from:'2025-06-01',toExclusive:'2025-09-01',label:'Léto 2025'
 });
});
test('daily rollups distinguish valid zero, missing, suspect and uncovered days',()=>{
 const temp=periodRollup([
  point('2025-06-01',10),point('2025-06-02',20),
  point('2025-06-03',77,'suspect')
 ],'2025-06-01','2025-06-05','mean');
 assert.equal(temp.value,15);
 assert.equal(temp.validDays,2);
 assert.equal(temp.expectedDays,4);
 assert.equal(temp.coverage,.5);
 assert.equal(temp.days.get('2025-06-03'),null);
 assert.equal(temp.days.get('2025-06-04'),null);
 const rain=periodRollup([
  point('2025-06-01',0),point('2025-06-02',4),
  point('2025-06-03',null,'missing')
 ],'2025-06-01','2025-06-04','sum');
 assert.equal(rain.value,4);
 assert.equal(rain.days.get('2025-06-01'),0);
 assert.equal(rain.days.get('2025-06-03'),null);
});
test('matched seasons compare calendar days, never fill a missing day with zero',()=>{
 const first=periodRollup([
  point('2024-12-31',2),point('2025-01-01',4)
 ],'2024-12-30','2025-01-03','mean');
 const second=periodRollup([
  point('2025-12-31',6),point('2026-01-01',8),
  point('2026-01-02',70,'suspect')
 ],'2025-12-30','2026-01-03','mean');
 const comparison=matchSeasonDays(first,second,'mean');
 assert.equal(comparison.commonDays,2);
 assert.equal(comparison.first,3);
 assert.equal(comparison.second,7);
 assert.equal(comparison.difference,4);
 assert.equal(comparison.sufficient,false);
 const one=periodRollup([
  point('2024-02-28',0),point('2024-02-29',7),point('2024-03-01',3)
 ],'2024-02-28','2024-03-02','sum');
 const two=periodRollup([
  point('2025-02-28',0),point('2025-03-01',5)
 ],'2025-02-28','2025-03-02','sum');
 const match=matchSeasonDays(one,two,'sum');
 assert.equal(match.commonDays,2);
 assert.equal(match.first,3);
 assert.equal(match.second,5);
 assert.equal(match.difference,2);
});
test('yearbook month rollups do not claim missing months as zero',()=>{
 const x=monthlyRollups([point('2025-01-01',0),point('2025-01-02',3),
  point('2025-02-01',null,'missing')],2025,'sum');
 assert.equal(x.length,12);
 assert.equal(x[0].value,3);
 assert.equal(x[0].validDays,2);
 assert.equal(x[1].value,null);
 assert.equal(x[2].value,null);
});
test('Theil-Sen requires enough unique, spaced, finite annual values',()=>{
 assert.equal(theilSen([{year:2024,value:9},{year:2025,value:10}]),null);
 const p=Array.from({length:8},(_,i)=>({year:2009+2*i,value:10+3*i}));
 assert.equal(theilSen(p),1.5);
 const noise=[...p,{year:2009,value:10}];
 assert.equal(theilSen(noise),null);
 const invalid=[...p.slice(0,-1),{year:2023,value:Number.NaN}];
 assert.equal(theilSen(invalid),null);
});
