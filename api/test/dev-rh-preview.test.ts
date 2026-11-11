import {createHash} from 'node:crypto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildApp} from '../src/app.js';
import {previewFromPackage} from '../src/dev-rh-preview.js';
import type {ArchiveReader,ArchiveRow} from '../src/store.js';

const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const TOKEN='test-preview-secret-with-at-least-32-characters';
const BASE=Date.parse('2022-04-26T00:00:00Z')/1000;
function makeRealisticPackage(){
 const records=[];
 for(let i=0;i<5153;i++){
  const category=i<2874?'historical_estimate_from_missing':
   i<5068?'historical_estimate_replacing_suspect_original':
    'historical_invalidation';
  const oldValue=category==='historical_estimate_from_missing'?null:89;
  const newValue=category==='historical_invalidation'?null:70;
  const t=BASE+i*300;
  records.push({epoch:t,utc:new Date(t*1000).toISOString(),
   variable:'outHumidity',
   originalValue:oldValue,experimentalValue:newValue,
   category,legacySource:'test-fixture-only',legacyBatchKey:'synthetic',
   legacyChangeId:i+1,
   evaluation:'historically_applied_to_reconstruction_copy_only',
   approved:false,accuracyValidated:false,
   provenanceVerifiedAgainstOriginal:true});
 }
 const raw={
  schemaVersion:'1',packageVersion:'rh-2022-dev-preview-package-v1',
  dataset:'experimental_unapproved',variable:'outHumidity',
  periodUtc:{from:'2022-01-01T00:00:00.000Z',toExclusive:'2023-01-01T00:00:00.000Z'},
  counts:{records:5153,missingToEstimate:2874,measuredToEstimate:2194,invalidated:85},
  originalArchive:'pocasi-loucka.eu.archive',
  reconstructionArchive:'loucka_reconstruction.archive',
  referenceAudit:'loucka_reconstruction.reconstruction_changes',
  recordsSha256:hash(JSON.stringify(records)),records,
  safety:{databaseWrites:0,automaticApprovals:false,liveDevPublishing:false}
 };
 return {raw,sha:hash(JSON.stringify(raw))};
}
function reader(rows:ArchiveRow[]):ArchiveReader{
 return {latest:async()=>null,history:async()=>rows,ping:async()=>{}};
}
test('valid pinned 5153-row preview is always unapproved and bearer-gated',()=>{
 const {raw,sha}=makeRealisticPackage();
 const preview=previewFromPackage(raw,sha,TOKEN);
 assert.equal(preview.packageSha256,sha);
 assert.equal(preview.authorize(undefined),false);
 assert.equal(preview.authorize('Bearer wrong'),false);
 assert.equal(preview.authorize('Basic '+TOKEN),false);
 assert.equal(preview.authorize('Bearer '+TOKEN),true);
 const points=preview.merge([{dateTime:BASE,usUnits:16,interval:5,outHumidity:null}],
   BASE-300,BASE);
 assert.equal(points.length,1);
 assert.equal(points[0]?.original.status,'original_missing');
 assert.equal(points[0]?.preview.status,'experimental_unapproved');
 assert.equal(points[0]?.preview.value,70);
 assert.equal(points[0]?.preview.legacyBatchKey,'synthetic');
 assert.throws(()=>preview.merge([{dateTime:BASE,usUnits:16,interval:5,outHumidity:90}],
   BASE-300,BASE),/Origin changed/);
});
test('tampered content, source, digest, and signed transition categories fail closed',()=>{
 const f=makeRealisticPackage();
 assert.throws(()=>previewFromPackage(f.raw,'f'.repeat(64),TOKEN),/Invalid or unpinned/);
 const copy=structuredClone(f.raw);
 copy.records[0]!.experimentalValue=0;
 assert.throws(()=>previewFromPackage(copy,hash(JSON.stringify(copy)),TOKEN),/Invalid or unpinned/);
 const c2=structuredClone(f.raw);c2.records[0]!.category='historical_invalidation';
 c2.recordsSha256=hash(JSON.stringify(c2.records));
 assert.throws(()=>previewFromPackage(c2,hash(JSON.stringify(c2)),TOKEN),/Impossible RH/);
 const c3=structuredClone(f.raw);c3.records[0]!.approved=true;
 c3.recordsSha256=hash(JSON.stringify(c3.records));
 assert.throws(()=>previewFromPackage(c3,hash(JSON.stringify(c3)),TOKEN),/Invalid unapproved/);
});
test('endpoint disabled by default, even if bearer token is supplied',async t=>{
 const app=buildApp(reader([]));t.after(()=>app.close());
 const r=await app.inject({url:'/api/v1/dev/preview/rh-history',
  headers:{authorization:'Bearer '+TOKEN}});
 assert.equal(r.statusCode,404);
 const meta=(await app.inject('/api/v1/station')).json();
 assert.deepEqual(meta.availableDatasets,['original']);
});
test('explicit private raw endpoint never affects original history and reports no-store',async t=>{
 const {raw,sha}=makeRealisticPackage();
 const preview=previewFromPackage(raw,sha,TOKEN);
 const rows:ArchiveRow[]=[{dateTime:BASE,usUnits:16,interval:5,outHumidity:null}];
 const app=buildApp(reader(rows),undefined,undefined,{},preview);
 t.after(()=>app.close());
 const endpoint='/api/v1/dev/preview/rh-history?from=2022-04-25T23:55:00Z&to=2022-04-26T00:00:00Z';
 const noAuth=await app.inject(endpoint);
 assert.equal(noAuth.statusCode,401);
 const wrong=await app.inject({url:endpoint,headers:{authorization:'Bearer invalid'}});
 assert.equal(wrong.statusCode,401);
 const ok=await app.inject({url:endpoint,headers:{authorization:'Bearer '+TOKEN}});
 assert.equal(ok.statusCode,200,ok.body);
 assert.equal(ok.headers['cache-control'],'no-store');
 assert.equal(ok.headers.vary,'Authorization');
 const body=ok.json();
 assert.equal(body.approved,false);
 assert.equal(body.dataset,'preview_unapproved');
 assert.equal(body.count,1);
 assert.equal(body.points[0].original.value,null);
 assert.equal(body.points[0].preview.value,70);
 assert.equal(body.points[0].preview.status,'experimental_unapproved');
 assert.equal(body.packageSha256,sha);
 assert.equal((await app.inject('/api/v1/history?dataset=approved&metric=outHumidity&from=2022-04-25T23:55:00Z&to=2022-04-26T00:00:00Z')).statusCode,503);
 const original=(await app.inject('/api/v1/history?metric=outHumidity&resolution=raw&from=2022-04-25T23:55:00Z&to=2022-04-26T00:00:00Z')).json();
 assert.equal(original.dataset,'original');
 assert.equal(original.points[0].value,null);
});
test('raw preview rejects excessive time windows, damaged original and out-of-range requests',async t=>{
 const {raw,sha}=makeRealisticPackage();
 const preview=previewFromPackage(raw,sha,TOKEN);
 const app=buildApp(reader([{dateTime:BASE,usUnits:16,interval:5,outHumidity:88}]),
  undefined,undefined,{},preview);
 t.after(()=>app.close());
 const auth={authorization:'Bearer '+TOKEN};
 const cases=[
 '/api/v1/dev/preview/rh-history?from=2022-04-01T00:00:00Z&to=2022-04-30T00:00:00Z',
 '/api/v1/dev/preview/rh-history?from=2021-12-01T00:00:00Z&to=2022-01-02T00:00:00Z',
 '/api/v1/dev/preview/rh-history?from=2022-04-25T23:55:00Z&to=2022-04-26T00:00:00Z&limit=3000'
 ];
 for(const url of cases){
  const r=await app.inject({url,headers:auth});
  assert.equal(r.statusCode,422,r.body);
 }
 const bad=await app.inject({url:'/api/v1/dev/preview/rh-history?from=2022-04-25T23:55:00Z&to=2022-04-26T00:00:00Z',headers:auth});
 assert.equal(bad.statusCode,503);
 assert.ok(!bad.body.includes('88'));
});
