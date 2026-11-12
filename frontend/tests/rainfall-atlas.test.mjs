import test from 'node:test';
import assert from 'node:assert/strict';
import {rainfallCoverage,rainYearRisk,rainMonthRisk,rainDayRisk,rainTrendEligible} from '../src/shared/domain/rainfall-atlas.ts';
import {pragueMidnightIso,nextDate} from '../src/shared/domain/statistics.ts';
const p=(day,value,quality='derived',source='weewx_daily')=>({
 startTime:pragueMidnightIso(day),endTime:pragueMidnightIso(nextDate(day)),
 value,quality,source,provenance:null
});
const h=points=>({schemaVersion:'1',metric:'rain',unit:'mm',resolution:'daily',dataRevision:'fixture',points});
test('original daily rain separates a real zero, missing, suspect and wet days',()=>{
 const r=rainfallCoverage(2021,h([p('2021-01-01',0),p('2021-01-02',2.5),
  p('2021-01-03',null,'missing','derived'),p('2021-01-04',-1),
  p('2021-01-05',30,'suspect'),{...p('2021-01-06',3),validCount:0}]));
 assert.equal(r.sumMm,2.5);assert.equal(r.availableDays,2);
 assert.equal(r.wetDays,1);assert.equal(r.dryDays,1);assert.equal(r.suspectDays,3);
 assert.equal(r.missingDays,360);assert.equal(r.months[1].sumMm,null);
 assert.equal(r.months[0].dryDays,1);assert.equal(r.months[6].risk,rainYearRisk(2021));
});
test('zero only is not a missing month; complete absence is never zero-filled',()=>{
 assert.equal(rainfallCoverage(2022,h([p('2022-01-01',0)])).months[0].sumMm,0);
 assert.equal(rainfallCoverage(2022,h([])).sumMm,null);
});
test('local leap year and DST boundaries; reject duplicates and foreign or reconstructed provenance',()=>{
 const r=rainfallCoverage(2024,h([p('2024-02-29',5),p('2024-03-31',0),p('2024-10-27',7)]));
 assert.equal(r.expectedDays,366);assert.equal(r.months[1].expectedDays,29);
 assert.equal(r.sumMm,12);
 const q=p('2022-01-01',1);
 for(const points of [[q,q],[p('2022-01-01',1,'reconstructed')],
 [p('2022-01-01',1,'derived','reference')],[p('2022-01-01',1,'derived','derived')],
 [{...q,endTime:q.startTime}],[p('2021-12-31',1)]])
  assert.throws(()=>rainfallCoverage(2022,h(points)));
 assert.throws(()=>rainfallCoverage(2022,{...h([]),unit:'cm'}));
});
const annual=(year,overrides={})=>({year,calendarDays:365,elapsedDays:365,
 value:600,unit:'mm',method:'sum',source:'weewx_daily',qcStatus:'original_unverified',
 periodStatus:'finished',validDays:350,timeCoverageFraction:.96,...overrides});
test('known archive defects are never eligible for descriptive precipitation trend',()=>{
 for(const year of [2009,2010,2011,2012,2013,2020,2021,2025]){
  assert.ok(rainYearRisk(year));assert.equal(rainTrendEligible(annual(year)),false);
 }
 assert.equal(rainTrendEligible(annual(2019)),true);
 assert.equal(rainTrendEligible(annual(2019,{timeCoverageFraction:null})),false);
 assert.equal(rainTrendEligible(annual(2019,{timeCoverageFraction:.89})),false);
 assert.equal(rainTrendEligible(annual(2019,{validDays:300})),false);
 assert.equal(rainTrendEligible(annual(2019,{periodStatus:'in_progress'})),false);
 assert.equal(rainTrendEligible(annual(2019,{value:-1})),false);
 assert.equal(rainTrendEligible(annual(2019,{source:'reference'})),false);
});
test('known risks have bounded calendar attribution, no automatic approval for other dates',()=>{
 assert.ok(rainMonthRisk(2021,7));assert.equal(rainMonthRisk(2021,8),null);
 assert.ok(rainDayRisk('2021-07-25'));assert.ok(rainDayRisk('2025-02-27'));
 assert.equal(rainDayRisk('2025-02-28'),null);assert.equal(rainMonthRisk(2013,5),null);
 assert.ok(rainDayRisk('2011-06-30'));assert.equal(rainYearRisk(2024),null);
});
