import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import type { ArchiveReader,ArchiveRow } from '../src/store.js';
const now=()=>new Date('2026-11-01T08:10:00Z');
const fixture:ArchiveRow={dateTime:1793520000,usUnits:16,interval:5,
  outTemp:12.5,rain:0.1,windSpeed:36,barometer:1013.25};
function reader(row:ArchiveRow|null=fixture):ArchiveReader{
  return {latest:async()=>row,ping:async()=>{}};
}
test('health and station expose only actual capabilities',async t=>{
  const app=buildApp(reader(),now);t.after(()=>app.close());
  const h=await app.inject('/api/v1/healthz');
  assert.equal(h.statusCode,200);assert.equal(h.json().status,'ok');
  const station=(await app.inject('/api/v1/station')).json();
  assert.deepEqual(station.capabilities,['current']);
  assert.deepEqual(station.availableDatasets,['original']);
  assert.equal(station.location.verified,false);
});
test('current converts METRIC archive by row source units',async t=>{
  const app=buildApp(reader(),now);t.after(()=>app.close());
  const res=await app.inject('/api/v1/current?units=metricwx');
  assert.equal(res.statusCode,200,res.body);
  const body=res.json();
  assert.equal(body.dataset,'original');
  assert.equal(body.readings.outTemp.value,12.5);
  assert.equal(body.readings.windSpeed.value,10);
  assert.equal(body.readings.rain.value,1);
  assert.equal(body.readings.windSpeed.unit,'m_per_s');
  assert.equal(body.readings.outTemp.sourceUsUnits,16);
});
test('missing values stay null, unsupported source is not fabricated',async t=>{
  const app=buildApp(reader({...fixture,outTemp:null,usUnits:1}),now);t.after(()=>app.close());
  const good=(await app.inject('/api/v1/current?units=us')).json();
  assert.equal(good.readings.outTemp.value,null);
  assert.equal(good.readings.outTemp.quality,'missing');
  const invalid=buildApp(reader({...fixture,usUnits:255}),now);t.after(()=>invalid.close());
  const r=await invalid.inject('/api/v1/current');
  assert.equal(r.statusCode,503);
});
test('bad request, unapproved dataset and empty archive fail closed',async t=>{
  const app=buildApp(reader(null),now);t.after(()=>app.close());
  assert.equal((await app.inject('/api/v1/current?units=invalid')).statusCode,400);
  assert.equal((await app.inject('/api/v1/current?asOf=2026-11-01')).statusCode,400);
  assert.equal((await app.inject('/api/v1/current?dataset=approved')).statusCode,503);
  assert.equal((await app.inject('/api/v1/current')).statusCode,404);
});
test('readiness separates DB failure from process liveness',async t=>{
  const fail:ArchiveReader={ping:async()=>{throw Error('secret DB error');},latest:async()=>null};
  const app=buildApp(fail,now);t.after(()=>app.close());
  assert.equal((await app.inject('/api/v1/healthz')).statusCode,200);
  const r=await app.inject('/api/v1/readyz');
  assert.equal(r.statusCode,503);
  assert.ok(!r.body.includes('secret DB error'));
});
