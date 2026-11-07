import test from 'node:test';
import assert from 'node:assert/strict';
import {temperatureSeasonRanking} from '../src/shared/domain/season-ranking.ts';
import {yearbookPlotData} from '../src/shared/ui/yearbook-charts.ts';
import {seasonWindow,calendarDates} from '../src/shared/domain/climate-atlas.ts';
import {pragueMidnightIso,nextDate} from '../src/shared/domain/statistics.ts';

const instant=(value)=>Date.parse(pragueMidnightIso(value));
const day=(date,value,quality='derived',fraction=1)=>{
 const expectedSeconds=(instant(nextDate(date))-instant(date))/1000;
 return {date,year:Number(date.slice(0,4)),monthDay:date.slice(5),
  value,validSeconds:value===null?null:expectedSeconds*fraction,
  expectedSeconds,quality};
};
const evidence=(points,endsBefore='2026-11-07')=>({
 schemaVersion:'1',metric:'outTemp',unit:'°C',
 dataset:'original',source:'weewx_daily',qcStatus:'original_unverified',
 firstYear:2009,endsBefore,dataRevision:'test',points
});
test('completed summers are ranked by weighted valid seconds, not missing days',()=>{
 const a=calendarDates('2024-06-01','2024-09-01').map(d=>day(d,24));
 const b=calendarDates('2025-06-01','2025-09-01').map(d=>day(d,20));
 b[0]=day('2025-06-01',null,'missing');
 const result=temperatureSeasonRanking(evidence([...a,...b]),'summer');
 assert.equal(result.ranked.length,2);
 assert.deepEqual(result.ranked.map(x=>x.year),[2024,2025]);
 assert.equal(result.ranked[0].mean,24);
 assert.equal(result.ranked[1].validDays,91);
 assert.ok(result.ranked[1].timeCoverage>.9);
 assert.ok(result.excluded.length>0);
 assert.ok(result.excluded.every(x=>!x.qualified));
});
test('suspect, partial and unobserved days never improve coverage',()=>{
 const days=calendarDates('2025-06-01','2025-09-01').map((d,i)=>
  day(d,i<20?99:21,i<20?'partial':'derived',i<20?.25:1));
 const result=temperatureSeasonRanking(evidence(days),'summer');
 assert.equal(result.ranked.length,0);
 const entry=result.excluded.find(x=>x.year===2025);
 assert.ok(entry);
 assert.equal(entry.validDays,72);
 assert.ok(entry.timeCoverage<.9);
});
test('winter crosses year and preserves leap year day count; future season omitted',()=>{
 const winter=seasonWindow(2023,'winter');
 const rows=calendarDates(winter.from,winter.toExclusive).map(d=>day(d,2));
 const ranking=temperatureSeasonRanking(evidence(rows,'2024-05-01'),'winter');
 assert.equal(ranking.ranked.length,1);
 assert.equal(ranking.ranked[0].label,'Zima 2023/2024');
 assert.equal(ranking.ranked[0].expectedDays,91);
 assert.ok(Math.abs(ranking.ranked[0].timeCoverage-1)<.00001);
 assert.ok(!ranking.excluded.some(row=>row.year===2024));
});
test('DST transition uses true elapsed seconds and excludes duplicated days',()=>{
 const w=seasonWindow(2024,'autumn');
 const rows=calendarDates(w.from,w.toExclusive).map(d=>day(d,10));
 assert.equal(rows.find(p=>p.date==='2024-10-27').expectedSeconds,90000);
 const result=temperatureSeasonRanking(evidence(rows,'2025-01-01'),'autumn');
 assert.equal(result.ranked.length,1);
 assert.equal(result.ranked[0].timeCoverage,1);
 assert.throws(()=>temperatureSeasonRanking(evidence([...rows,rows[0]]),'autumn'),/Duplicated/);
});
test('monthly yearbook charts keep measured 0 but reject sparse and missing months',()=>{
 const row=(month,value,valid,days)=>({
  month,value,validDays:valid,expectedDays:days,
  coverage:valid/days,days:new Map()
 });
 const rows=[row(1,0,31,31),row(2,33,1,28),row(3,null,0,31)];
 const model=yearbookPlotData(rows);
 assert.deepEqual(model.map(r=>r.value),[0,null,null]);
 assert.deepEqual(model.map(r=>r.coverage),[1,1/28,0]);
});
