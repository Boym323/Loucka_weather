import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildApp} from '../src/app.js';
import {originalSensorHold,originalDailyAggregateHeld} from '../src/sensor-publication-qc.js';
import {publiclySafeReading} from '../src/units.js';
import {originalFieldQuality} from '../src/original-quality.js';
import type {ArchiveReader,ArchiveRow} from '../src/store.js';

const pmTime=1726257900;
const pmRow:ArchiveRow={dateTime:pmTime,interval:5,usUnits:16,pm25_1:999.9};
const reader:ArchiveReader={
 latest:async()=>pmRow,
 history:async(_metric,from,to,limit)=>{
  const rows=[pmRow,{dateTime:pmTime+300,interval:5,usUnits:16,pm25_1:20}];
  return rows.filter(r=>r.dateTime>from&&r.dateTime<=to).slice(0,limit);
 },
 dailySummaries:async()=>{throw Error('Daily summary must never be read for held cohort');},
 ping:async()=>{}
};

test('September 2024 PM2.5 suspected saturation is withheld, not converted to zero or approved',()=>{
 const held=publiclySafeReading('pm25_1',999.9,16,'metricwx',pmTime);
 assert.equal(held.value,null);
 assert.equal(held.quality,'unverified');
 assert.deepEqual(held.qcFlags,['SUSPECT_PM25_SENSOR_SATURATION']);
 assert.equal(held.extremaEligible,false);
 const evidence=originalFieldQuality(pmRow,'pm25_1','metricwx');
 assert.equal(evidence.state,'UNVERIFIED');
 assert.equal(evidence.measurementValue,999.9);
 assert.equal(evidence.displayValue,null);
 assert.equal(evidence.independentValidation,false);
 assert.deepEqual(evidence.qcFlags,['SUSPECT_PM25_SENSOR_SATURATION']);
 assert.equal(publiclySafeReading('pm25_1',499,16,'metricwx',pmTime).value,499);
 assert.equal(publiclySafeReading('pm25_1',650,16,'metricwx',1680000000).value,650);
});

test('2022 extraTemp2 has unverified sensor identity; 822.4 C and soil spikes are sensor errors',()=>{
 const ambiguous=originalFieldQuality({dateTime:1662108300,interval:5,usUnits:16,extraTemp2:72},
  'extraTemp2','metricwx');
 assert.equal(ambiguous.state,'UNVERIFIED');
 assert.equal(ambiguous.measurementValue,72);
 assert.equal(ambiguous.displayValue,null);
 assert.deepEqual(ambiguous.qcFlags,['UNVERIFIED_2022_EXTRA_TEMP2_CHANNEL']);
 for(const [metric,t,value] of [
  ['extraTemp2',1708179900,822.4],
  ['extraTemp1',1708179900,114.72],
  ['soilTemp1',1782728400,-28.5],
  ['soilTemp5',1774158600,-46.9],
  ['soilTemp6',1774541100,-61.75]
 ] as const){
  const hold=originalSensorHold(metric,value,16,t);
  assert.equal(hold?.status,'sensor_error',metric);
  const result=publiclySafeReading(metric,value,16,'metricwx',t);
  assert.equal(result.value,null,metric);
  assert.equal(result.quality,'sensor_error',metric);
 }
 assert.equal(publiclySafeReading('soilTemp3',23,16,'metricwx',1782728400).value,23);
 assert.equal(publiclySafeReading('soilTemp5',18,16,'metricwx',1782728400).value,18);
 const unconfirmed=publiclySafeReading('soilTemp5',-21.4,16,'metricwx',1772983500);
 assert.equal(unconfirmed.value,null);
 assert.equal(unconfirmed.quality,'unverified');
 assert.deepEqual(unconfirmed.qcFlags,['SUSPECT_2026_SOIL_SENSOR_NEGATIVE_SPIKE']);
 const october=publiclySafeReading('soilTemp6',-17,16,'metricwx',1792440000);
 assert.equal(october.value,null);
 assert.equal(october.quality,'unverified');
 assert.equal(publiclySafeReading('extraTemp2',29,16,'metricwx',1686000000).value,29);
 assert.equal(originalSensorHold('soilTemp1',null,16,1782728400),null);
});

test('current and quality API never display saturated PM as a certified record',async t=>{
 const app=buildApp(reader,()=>new Date('2024-09-14T12:00:00Z'));
 t.after(()=>app.close());
 const curr=await app.inject('/api/v1/current?asOf=2024-09-14T00:00:00Z');
 assert.equal(curr.statusCode,200,curr.body);
 assert.equal(curr.json().readings.pm25_1.value,null);
 assert.equal(curr.json().readings.pm25_1.quality,'unverified');
 const res=await app.inject(
  '/api/v1/quality/observations?metric=pm25_1&from=2024-09-13T20:00:00Z&to=2024-09-13T20:15:00Z');
 assert.equal(res.statusCode,200,res.body);
 const item=res.json().observations[0];
 assert.equal(item.displayValue,null);
 assert.equal(item.measurementValue,999.9);
 assert.equal(item.state,'UNVERIFIED');
});

test('raw and hourly history exclude saturated PM from values and extrema',async t=>{
 const app=buildApp(reader,()=>new Date('2024-09-14T12:00:00Z'));
 t.after(()=>app.close());
 const from='2024-09-13T20:00:00Z',to='2024-09-13T21:00:00Z';
 const base='/api/v1/history?metric=pm25_1&from='+from+'&to='+to;
 const raw=await app.inject(base+'&resolution=raw');
 assert.equal(raw.statusCode,200,raw.body);
 const points=raw.json().points.filter((p:any)=>p.quality!=='missing');
 assert.equal(points[0].value,null);
 assert.equal(points[0].quality,'unverified');
 assert.deepEqual(points[0].qcFlags,['SUSPECT_PM25_SENSOR_SATURATION']);
 assert.equal(points[1].value,20);
 const hourly=await app.inject(base+'&resolution=hourly');
 assert.equal(hourly.statusCode,200,hourly.body);
 const actual=hourly.json().points.find((p:any)=>p.value!==null);
 assert.equal(actual.value,20);
 assert.equal(actual.maxValue,20);
});

test('daily, monthly, yearly and annual matrix endpoints refuse dirty stored aggregates',async t=>{
 const app=buildApp(reader,()=>new Date('2026-11-23T07:00:00Z'));
 t.after(()=>app.close());
 const probes=[
  '/api/v1/statistics/daily?metric=pm25_1&aggregation=mean&date=2024-09-14',
  '/api/v1/statistics/monthly?metric=pm25_1&aggregation=max&month=2024-09',
  '/api/v1/statistics/yearly?metric=pm25_1&aggregation=max&year=2024',
  '/api/v1/statistics/monthly?metric=extraTemp2&aggregation=max&month=2022-09',
  '/api/v1/statistics/monthly?metric=extraTemp2&aggregation=max&month=2024-02',
  '/api/v1/statistics/yearly?metric=soilTemp1&aggregation=min&year=2026',
  '/api/v1/climate/annual-matrix?metric=pm25_1',
  '/api/v1/history?metric=pm25_1&resolution=daily&from=2024-08-31T22:00:00Z&to=2024-09-30T22:00:00Z'
 ];
 for(const url of probes){
  const r=await app.inject(url);
  assert.equal(r.statusCode,503,url+': '+r.body);
  assert.equal(r.json().error.code,'HISTORICAL_QC_HOLD');
 }
 assert.equal(originalDailyAggregateHeld('pm25_1',1725148800,1727730000),true);
 assert.equal(originalDailyAggregateHeld('pm25_1',1672531200,1680307200),false);
});
