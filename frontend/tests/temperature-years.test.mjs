import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {calendarKeys,overlayTemperatureYears} from '../src/shared/domain/temperature-years.ts';
const make=(date,value,seconds=86400,quality='derived')=>({
 date,year:Number(date.slice(0,4)),monthDay:date.slice(5),value,
 validSeconds:value===null?null:seconds,expectedSeconds:86400,quality
});
const fixture={
 schemaVersion:'1',metric:'outTemp',unit:'°C',dataset:'original',
 source:'weewx_daily',qcStatus:'original_unverified',firstYear:2009,
 endsBefore:'2026-11-03',dataRevision:'test',
 points:[
  make('2020-01-01',0),make('2021-01-01',10),make('2022-01-01',20),
  make('2024-02-29',-3),make('2025-01-01',null),
  make('2026-01-01',30)
 ]
};
test('all years have one axis; 29 February does not shift March',()=>{
 assert.equal(calendarKeys.length,366);
 assert.equal(calendarKeys[59],'02-29');
 assert.equal(calendarKeys[60],'03-01');
 const chart=overlayTemperatureYears(fixture,'daily');
 assert.equal(chart.years[0],2009);
 assert.equal(chart.years.at(-1),2026);
 assert.equal(chart.years.length,18);
 assert.equal(chart.values.get(2024)[59],-3);
 assert.equal(chart.values.get(2025)[59],null);
 assert.equal(chart.values.get(2020)[0],0);
 assert.equal(chart.values.get(2025)[0],null);
 assert.equal(chart.average[0],10);
 assert.equal(chart.minimum[0],0);
 assert.equal(chart.maximum[0],20);
 assert.ok(!chart.baselineYears.includes(2026));
 assert.equal(chart.values.get(2026)[0],30);
});
test('monthly values are weighted by valid seconds and poor coverage hides months',()=>{
 const points=[];
 for(let d=1;d<=16;d++){
  const date='2025-01-'+String(d).padStart(2,'0');
  const seconds=d===16?43200:86400;
  points.push(make(date,d===16?30:10,seconds));
 }
 const selected={...fixture,points};
 const monthly=overlayTemperatureYears(selected,'monthly');
 assert.equal(monthly.keys.length,12);
 assert.ok(monthly.values.get(2025)[0]>10);
 assert.ok(monthly.values.get(2025)[0]<11);
 assert.equal(monthly.values.get(2025)[1],null);
 assert.equal(monthly.validDays.get(2025),16);
 const insufficient=overlayTemperatureYears({...fixture,points:points.slice(0,15)},'monthly');
 assert.equal(insufficient.values.get(2025)[0],null);
});
test('frontend mounts all-year overlay above pair comparison with accessible options',async()=>{
 const page=await readFile(new URL('../src/pages/klimatologie.astro',import.meta.url),'utf8');
 const component=await readFile(new URL('../src/features/climate/AllYearsTemperature.astro',import.meta.url),'utf8');
 assert.ok(page.indexOf('<AllYearsTemperature />')<page.indexOf('<YearComparison />'));
 assert.match(component,/data-temperature-show-all checked/);
 assert.match(component,/data-temperature-resolution/);
 assert.match(component,/data-temperature-highlight/);
 assert.match(component,/data-temperature-range checked/);
 assert.match(component,/data-temperature-average checked/);
 assert.match(component,/getTemperatureYears/);
 assert.match(component,/connectNulls:false/);
 assert.match(component,/data-temperature-year-choices/);
});
