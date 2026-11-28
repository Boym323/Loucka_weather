import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildApp} from '../src/app.js';
import {originalFieldQuality,originalQualityWindow} from '../src/original-quality.js';
import type {ArchiveReader,ArchiveRow} from '../src/store.js';

const row=(dateTime:number,outTemp:number|null):ArchiveRow=>({
 dateTime,interval:5,usUnits:16,outTemp
});
const makeReader=(rows:ArchiveRow[]):ArchiveReader=>({
 latest:async()=>rows.at(-1)??null,
 history:async(_metric,from,to,limit)=>rows.filter(r=>r.dateTime>from&&r.dateTime<=to).slice(0,limit),
 ping:async()=>{}
});
test('original per-field endpoint keeps zero and NULL separate without inventing approved measurements',async t=>{
 const data=[row(600,0),row(1200,null)];
 const app=buildApp(makeReader(data),()=>new Date('2026-11-22T20:00:00Z'));
 t.after(()=>app.close());
 const response=await app.inject('/api/v1/quality/observations?metric=outTemp'+
  '&from=1970-01-01T00:00:00Z&to=1970-01-01T00:25:00Z');
 assert.equal(response.statusCode,200,response.body);
 const body=response.json();
 assert.equal(body.dataset,'original');
 assert.equal(body.qualitySchema,'loucka-field-qc-v1');
 assert.equal(body.provenanceStatus,'not_independently_validated');
 assert.equal(body.count,2);
 assert.deepEqual(body.summary,{UNVERIFIED:1,MISSING:1,SENSOR_ERROR:0});
 assert.equal(body.observations[0].state,'UNVERIFIED');
 assert.equal(body.observations[0].displayValue,0);
 assert.equal(body.observations[0].measurementValue,0);
 assert.equal(body.observations[0].sourceRef,'weewx_original_archive');
 assert.equal(body.observations[0].epochRef,null);
 assert.equal(body.observations[0].changeRef,null);
 assert.equal(body.observations[0].approved,false);
 assert.equal(body.observations[0].independentValidation,false);
 assert.equal(body.observations[0].extremaEligible,false);
 assert.equal(body.observations[1].state,'MISSING');
 assert.equal(body.observations[1].displayValue,null);
 assert.deepEqual(body.observations[1].qcFlags,['ARCHIVE_FIELD_NULL']);
 assert.deepEqual(body.gaps.map((gap:any)=>[gap.startTime,gap.endTime]),[
  ['1970-01-01T00:00:00.000Z','1970-01-01T00:05:00.000Z'],
  ['1970-01-01T00:10:00.000Z','1970-01-01T00:15:00.000Z'],
  ['1970-01-01T00:20:00.000Z','1970-01-01T00:25:00.000Z']
 ]);
 const conditional=await app.inject({url:'/api/v1/quality/observations?metric=outTemp'+
  '&from=1970-01-01T00:00:00Z&to=1970-01-01T00:25:00Z',headers:{'if-none-match':String(response.headers.etag)}});
 assert.equal(conditional.statusCode,304);
});
test('original lightning noise is not displayed but remains forensic evidence',()=>{
 const r:ArchiveRow={dateTime:1793520000,interval:5,usUnits:16,
  lightning_noise_count:4,lightning_strike_count:4};
 const original=originalFieldQuality(r,'lightning_noise_count','metricwx');
 assert.equal(original.state,'SENSOR_ERROR');
 assert.equal(original.displayValue,null);
 // Forensic raw number is preserved, never exposed as a valid reading or record.
 assert.equal(original.measurementValue,4);
 assert.equal(original.extremaEligible,false);
 assert.deepEqual(original.qcFlags,['UNVERIFIED_FIELD_MAPPING']);
 assert.equal(original.approved,false);
 assert.equal(originalFieldQuality({...r,lightning_noise_count:null},'lightning_noise_count','metricwx').state,'MISSING');
});
test('same local 02:30 in autumn DST is two distinct UTC instants and folds',()=>{
 const early=originalFieldQuality(row(1792888200,5),'outTemp','metricwx');
 const late=originalFieldQuality(row(1792891800,6),'outTemp','metricwx');
 assert.equal(early.localFold,0);
 assert.equal(late.localFold,1);
 assert.match(early.localEndIso,/T02:30:00\+02:00$/);
 assert.match(late.localEndIso,/T02:30:00\+01:00$/);
 assert.notEqual(early.timestampUtc,late.timestampUtc);
});
test('quality endpoint fails closed on unapproved dataset, window, bounds and truncation',async t=>{
 const records=[row(600,1),row(900,2)];
 const app=buildApp(makeReader(records),()=>new Date('2026-11-22T20:00:00Z'));
 t.after(()=>app.close());
 const prefix='/api/v1/quality/observations?metric=outTemp';
 const start='&from=1970-01-01T00:00:00Z&to=1970-01-01T00:15:00Z';
 assert.equal((await app.inject(prefix+start+'&dataset=approved')).statusCode,503);
 assert.equal((await app.inject(prefix+start+'&limit=1')).statusCode,422);
 assert.equal((await app.inject(prefix+start+'&limit=2001')).statusCode,422);
 assert.equal((await app.inject(prefix+'&from=1970-01-01T00:00:00Z&to=1970-01-04T00:00:00Z')).statusCode,422);
 assert.equal((await app.inject(prefix+'&from=1970-01-01&to=1970-01-02')).statusCode,422);
 assert.equal((await app.inject(prefix.replace('outTemp','__SQL_injection')+start)).statusCode,400);
 assert.equal((await app.inject(prefix+start+'&unknown=yes')).statusCode,400);
});
test('rejects unsorted source and overlapping archive intervals instead of drawing invented links',()=>{
 assert.throws(()=>originalQualityWindow([row(1200,2),row(600,1)],'outTemp','metricwx',0,1500),
  /Unordered/);
 assert.throws(()=>originalQualityWindow([row(600,2),row(750,1)],'outTemp','metricwx',0,1500),
  /Overlapping/);
 const empty=originalQualityWindow([],'outTemp','metricwx',0,1500);
 assert.equal(empty.observations.length,0);
 assert.equal(empty.gaps.length,1);
 assert.equal(empty.gaps[0]?.displayValue,null);
});
