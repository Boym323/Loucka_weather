import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildApp} from '../src/app.js';
import type {ArchiveReader,ArchiveRow} from '../src/store.js';

test('legacy original current/history public APIs disclose non-certified origin without changing units or zero',async t=>{
 const current:ArchiveRow={dateTime:1793520000,usUnits:16,interval:5,outTemp:0,
  lightning_disturber_count:1793523300};
 const rows:ArchiveRow[]=[{dateTime:600,usUnits:16,interval:5,outTemp:0}];
 const reader:ArchiveReader={latest:async()=>current,history:async()=>rows,ping:async()=>{}};
 const app=buildApp(reader,()=>new Date('2026-11-01T08:10:00Z'));
 t.after(()=>app.close());
 const curr=await app.inject('/api/v1/current');
 assert.equal(curr.statusCode,200,curr.body);
 const body=curr.json();
 assert.equal(body.qcStatus,'original_unverified');
 assert.equal(body.extremaVerified,false);
 assert.equal(body.readings.outTemp.value,0);
 assert.equal(body.readings.outTemp.verificationStatus,'original_unverified');
 assert.equal(body.readings.outTemp.extremaEligible,false);
 assert.equal(body.readings.lightning_disturber_count.quality,'sensor_error');
 assert.equal(body.readings.lightning_disturber_count.value,null);

 const hist=await app.inject('/api/v1/history?metric=outTemp'+
  '&from=1970-01-01T00:00:00Z&to=1970-01-01T00:10:00Z&resolution=raw');
 assert.equal(hist.statusCode,200,hist.body);
 assert.equal(hist.json().qcStatus,'original_unverified');
 assert.equal(hist.json().extremaVerified,false);
 assert.equal(hist.json().points[1].value,0);
});
