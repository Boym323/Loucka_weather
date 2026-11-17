import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {probeClimateRecords} from '../scripts/climate-records-diagnostic-lib.mjs';

const now=new Date('2026-11-17T19:44:45.489Z');
const validEpoch=Date.parse('2025-01-01T23:00:00Z')/1000;
const sample={dateTime:validEpoch,min:1,max:20,sum:2,count:25,
 usUnits:17,wsum:50,sumtime:7500,mintime:null,maxtime:null};
const compute=input=>({status:'preliminary',count:input.temperature.length});

test('bounded read-only original metrics are probed without publishing weather values',async()=>{
 const seen=[];
 const reader={dailySummaries:async(metric,start,end,limit)=>{
  seen.push({metric,start,end,limit});return [sample];
 }};
 const result=await probeClimateRecords(reader,compute,now);
 assert.equal(result.passed,true);
 assert.equal(result.stage,'complete');
 assert.deepEqual(result.metrics.map(x=>x.metric),['outTemp','rain','windGust']);
 assert.deepEqual(result.metrics.map(x=>x.rowCount),[1,1,1]);
 assert.ok(seen.every(x=>x.limit<=7501&&x.start<x.end));
 assert.deepEqual(result.dateRange,{from:'2009-01-01',toExclusive:'2026-11-17'});
 assert.ok(typeof result.computeElapsedMs==='number');
 const report=JSON.stringify(result);
 assert.ok(!report.includes('"wsum":50'));
 assert.ok(!report.includes('"max":20'));
 assert.ok(!report.includes('password'));
});
test('database errors are classified but SQL and connection details are never included',async()=>{
 const reader={dailySummaries:async metric=>{
  if(metric!=='windGust')return [];
  const e=Error('secret-lan-host:3306 SELECT private-schema');e.code='ER_NO_SUCH_TABLE';
  throw e;
 }};
 const result=await probeClimateRecords(reader,compute,now);
 assert.equal(result.passed,false);
 assert.equal(result.stage,'daily_summary_read');
 assert.equal(result.metrics[2].errorCode,'ER_NO_SUCH_TABLE');
 assert.ok(!JSON.stringify(result).includes('secret-lan-host'));
 const hidden=await probeClimateRecords({dailySummaries:async()=>{
  const e=Error('password=PRIVATE');e.code='TOKEN_PRIVATE';throw e;
 }},compute,now);
 assert.ok(hidden.metrics.every(x=>x.errorCode==='UNCLASSIFIED'));
 assert.ok(!JSON.stringify(hidden).includes('PRIVATE'));
});
test('incorrect calendar rows fail closed without changing or discarding them',async()=>{
 const cases=[
  [[{...sample,dateTime:validEpoch+3600}],'not_local_midnight'],
  [[sample,sample],'unordered_or_duplicate'],
  [[{...sample,dateTime:Date.parse('2026-11-18T23:00:00Z')/1000}],'outside_calendar_range'],
  [Array.from({length:7502},()=>sample),'too_many_days']
 ];
 for(const [rows,reason] of cases){
  const result=await probeClimateRecords({dailySummaries:async()=>rows},compute,now);
  assert.equal(result.stage,'calendar_validation');
  assert.equal(result.passed,false);
  assert.equal(result.metrics[0].reason,reason);
 }
});
test('computation failures are separate from read and calendar failures',async()=>{
 const result=await probeClimateRecords({dailySummaries:async()=>[sample]},()=>{
  throw Error('sensitive weather value');
 },now);
 assert.equal(result.stage,'record_computation');
 assert.equal(result.passed,false);
 assert.ok(!JSON.stringify(result).includes('sensitive weather value'));
});
test('CLI is explicitly staging only, read-only, and uses the real API reader',async()=>{
 const cli=await readFile(new URL('../scripts/climate-records-diagnostic.mjs',import.meta.url),'utf8');
 assert.match(cli,/WEATHER_STAGING_ENABLED/);
 assert.match(cli,/createMariaDbReader/);
 assert.match(cli,/climateRecordsFromDaily/);
 assert.doesNotMatch(cli,/\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE)\s+(?:INTO|FROM|TABLE)\b/i);
});
