import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {calendarDayExists,yearDays,alignedCalendarDays,pragueLocalDate,dailyValues,
 colorBand,sharedDayComparison,validDayCount,comparisonMetrics} from '../src/shared/domain/year-comparison.ts';
const file=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const point=(day,value,quality='derived')=>({startTime:day,endTime:day,value,quality,source:'weewx_daily',provenance:null});
test('calendar comparison preserves 29 February without shifting March',()=>{
 assert.equal(calendarDayExists(2024,2,29),true);
 assert.equal(calendarDayExists(2025,2,29),false);
 assert.equal(calendarDayExists(2025,4,31),false);
 assert.equal(yearDays(2024),366);
 assert.equal(yearDays(2025),365);
 assert.equal(alignedCalendarDays.length,366);
 assert.equal(alignedCalendarDays[59],'02-29');
 assert.equal(alignedCalendarDays[60],'03-01');
});
test('local midnight is interpreted in Europe/Prague, including DST',()=>{
 assert.equal(pragueLocalDate('2025-12-31T23:00:00.000Z'),'2026-01-01');
 assert.equal(pragueLocalDate('2026-06-30T22:00:00.000Z'),'2026-07-01');
 assert.equal(pragueLocalDate('2026-10-24T22:00:00.000Z'),'2026-10-25');
 assert.equal(pragueLocalDate('bad'),null);
});
test('zero rainfall stays a valid observation; gaps and suspect values remain missing',()=>{
 const data=dailyValues(2025,[
  point('2024-12-31T23:00:00Z',0),
  point('2025-01-01T23:00:00Z',null,'missing'),
  point('2025-01-02T23:00:00Z',199,'suspect'),
  point('2025-01-03T23:00:00Z',5),
  point('2025-12-31T23:00:00Z',50)
 ]);
 assert.equal(data.get('01-01'),0);
 assert.equal(data.get('01-02'),null);
 assert.equal(data.get('01-03'),null);
 assert.equal(data.get('01-04'),5);
 assert.equal(data.has('12-31'),false);
 assert.equal(validDayCount(data),2);
});
test('comparison aggregates matched civil dates only, not missing dates',()=>{
 const a=new Map([['01-01',0],['01-02',5],['02-29',null],['03-01',null]]);
 const b=new Map([['01-01',4],['01-02',null],['02-29',20],['03-01',2]]);
 assert.deepEqual(sharedDayComparison('rain',a,b),{
  days:1,first:0,second:4,difference:4
 });
 assert.deepEqual(sharedDayComparison('outTemp',a,b),{
  days:1,first:0,second:4,difference:4
 });
 assert.equal(sharedDayComparison('rain',new Map(),b).difference,null);
});
test('the color scale is independent of selected years and preserves real zero',()=>{
 assert.equal(colorBand('rain',0),0);
 assert.ok(colorBand('rain',1)>colorBand('rain',0));
 for(const [metric,config] of Object.entries(comparisonMetrics)){
  assert.equal(config.colors.length,config.limits.length+1,metric);
 }
});
test('heatmaps are mounted in climatology with real API and progress UI',async()=>{
 const page=await file('src/pages/klimatologie.astro');
 const dashboard=await file('src/features/climate/ClimateDashboard.astro');
 const component=await file('src/features/climate/YearComparison.astro');
 assert.match(page,/YearComparison/);
 assert.match(dashboard,/href="#srovnani-let"/);
 assert.match(component,/getHistoryInterval/);
 assert.match(component,/dailyValues/);
 assert.match(component,/is-missing/);
 assert.match(component,/selectedDay/);
 assert.match(component,/aria-live="polite"/);
 assert.doesNotMatch(component,/Math\.random|fake|placeholder values/);
});
