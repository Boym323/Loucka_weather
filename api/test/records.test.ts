import test from 'node:test';
import assert from 'node:assert/strict';
import {climateRecordsFromDaily} from '../src/records.js';
import type {DailySummaryRow,ArchiveReader} from '../src/store.js';
import {buildApp} from '../src/app.js';

const jan1=Date.parse('2024-12-31T23:00:00Z')/1000;
function daily(overrides:Partial<DailySummaryRow>):DailySummaryRow{
 return {dateTime:jan1,usUnits:17,min:0,mintime:jan1,max:0,maxtime:jan1,
  sum:0,count:288,wsum:0,sumtime:86400,...overrides};
}
test('provisional records use actual daily values and preserve source/coverage',()=>{
 const result=climateRecordsFromDaily({
  temperature:[daily({min:-4,max:30.5}),daily({dateTime:jan1+86400,min:2,max:21})],
  rain:[daily({sum:18.5}),daily({dateTime:jan1+86400,sum:1.2})],
  gust:[daily({max:12.8})],from:'2009-01-01',toExclusive:'2025-01-03',
  calendarDays:5847
 });
 assert.equal(result.records.minTemp?.value,-4);
 assert.equal(result.records.maxTemp?.value,30.5);
 assert.equal(result.records.maxDailyRain?.value,18.5);
 assert.equal(result.records.maxWindGust?.unit,'m/s');
 assert.equal(result.dayTypes.frost,1);
 assert.equal(result.dayTypes.summer,1);
 assert.equal(result.dayTypes.tropical,1);
 assert.equal(result.coverage.temperatureDays,2);
 assert.equal(result.status,'preliminary');
 assert.equal(result.records.minTemp?.quality,'unverified_original');
});
test('out-of-range original data are not silently published as records',()=>{
 const result=climateRecordsFromDaily({temperature:[daily({min:-999,max:999})],
  rain:[daily({sum:9999})],gust:[daily({max:999})],
  from:'2009-01-01',toExclusive:'2025-01-02',calendarDays:5846});
 assert.equal(result.records.maxTemp,null);
 assert.equal(result.records.maxDailyRain,null);
 assert.equal(result.records.maxWindGust,null);
 assert.equal(result.dayTypes.validTempDays,0);
});
test('read-only records endpoint and yearly timeCoverage report metric-scoped measured time',async()=>{
 const input:DailySummaryRow[]= [daily({min:-4,max:30.5,sum:24,count:288,
  sumtime:86400})];
 const reader:ArchiveReader={
  latest:async()=>null,history:async()=>[],ping:async()=>{},
  dailySummaries:async()=>input
 };
 const app=buildApp(reader,()=>new Date('2025-01-03T12:00:00Z'));
 try{
  const rec=await app.inject('/api/v1/climate/records');
  assert.equal(rec.statusCode,200,rec.body);
  assert.equal(rec.json().status,'preliminary');
  assert.equal(rec.json().records.minTemp.value,-4);
  const stats=await app.inject('/api/v1/statistics/yearly?metric=outTemp&aggregation=mean&year=2025&units=metricwx');
  assert.equal(stats.statusCode,200,stats.body);
  const coverage=stats.json().timeCoverage;
  assert.equal(coverage.expectedSeconds,365*86400);
  assert.equal(coverage.validSeconds,86400);
  assert.equal(coverage.scope,'metric_only');
  assert.ok(coverage.fraction>0&&coverage.fraction<0.01);
 }finally{await app.close();}
});
