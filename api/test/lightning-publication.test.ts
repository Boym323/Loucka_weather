import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildApp} from '../src/app.js';
import type {ArchiveReader,ArchiveRow} from '../src/store.js';
import {publiclySafeReading,converted} from '../src/units.js';
import {hasUnverifiedLightningMapping} from '../src/lightning-publication.js';

const sample:ArchiveRow={
 dateTime:1793520000,usUnits:16,interval:5,outTemp:5,
 lightning_disturber_count:1793523300,
 lightning_noise_count:3,lightning_strike_count:3
};
const reader:ArchiveReader={
 latest:async()=>sample,history:async()=>[sample],
 ping:async()=>{},
 dailySummaries:async()=>[]
};
test('original archive preserves raw values internally but redacts unmapped lightning counters',async t=>{
 assert.equal(converted('lightning_disturber_count',1793523300,16,'metricwx').value,1793523300);
 assert.equal(publiclySafeReading('lightning_disturber_count',1793523300,16,'metricwx').value,null);
 assert.equal(publiclySafeReading('lightning_disturber_count',null,16,'metricwx').quality,'missing');
 assert.equal(hasUnverifiedLightningMapping('lightning_noise_count'),true);
 assert.equal(hasUnverifiedLightningMapping('lightning_strike_count'),false);
 const app=buildApp(reader,()=>new Date('2026-11-01T08:10:00Z'));t.after(()=>app.close());
 const res=await app.inject('/api/v1/current');
 assert.equal(res.statusCode,200);
 const payload=res.json();
 for(const metric of ['lightning_disturber_count','lightning_noise_count']){
  assert.equal(payload.readings[metric].value,null);
  assert.equal(payload.readings[metric].quality,'sensor_error');
  assert.deepEqual(payload.readings[metric].qcFlags,['UNVERIFIED_FIELD_MAPPING']);
 }
 assert.equal(payload.readings.lightning_strike_count.value,3);
 assert.equal(payload.readings.lightning_strike_count.quality,'measured');
 assert.equal(payload.readings.outTemp.value,5);
});
test('all public history/stats routes fail closed rather than plotting or aggregating mis-mapped counters',async t=>{
 const app=buildApp(reader,()=>new Date('2026-11-01T08:10:00Z'));t.after(()=>app.close());
 for(const metric of ['lightning_disturber_count','lightning_noise_count']){
  const url='/api/v1/history?metric='+metric+
    '&from=2026-11-01T00:00:00Z&to=2026-11-02T00:00:00Z&resolution=raw';
  const history=await app.inject(url);
  assert.equal(history.statusCode,503,metric+' history');
  assert.equal(history.json().error.code,'UNVERIFIED_FIELD_MAPPING');
  const annual=await app.inject('/api/v1/climate/annual-matrix?metric='+metric);
  assert.equal(annual.statusCode,503,metric+' annual');
  for(const [path,key] of [['daily','date=2026-11-01'],['monthly','month=2026-11'],['yearly','year=2026']]){
   const res=await app.inject('/api/v1/statistics/'+path+'?metric='+metric+'&aggregation=sum&'+key);
   assert.equal(res.statusCode,503,metric+' '+path);
   assert.equal(res.json().error.code,'UNVERIFIED_FIELD_MAPPING');
  }
 }
});
test('missing lightning fields remain missing, never fabricate zeros',()=>{
 const missing=publiclySafeReading('lightning_noise_count',null,16,'metricwx');
 assert.equal(missing.value,null);
 assert.equal(missing.quality,'missing');
 assert.equal(missing.qcFlags,undefined);
});
