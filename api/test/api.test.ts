import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {test} from 'node:test';
import type {TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {buildApp} from '../src/app.js';
import {converted} from '../src/units.js';
import {metricNames,metrics} from '../src/metrics.js';
import type {ArchiveReader,ArchiveRow} from '../src/store.js';

const now=()=>new Date('2026-11-01T08:10:00Z');
const fixture:ArchiveRow={dateTime:1793520000,usUnits:16,interval:5,
 outTemp:12.5,rain:0.1,windSpeed:36,barometer:1013.25};
function reader(row:ArchiveRow|null=fixture,rows:ArchiveRow[]=[]):ArchiveReader{
 return {latest:async()=>row,history:async()=>rows,ping:async()=>{}};
}
/** Unit tests are hermetic even on an LXC with working camera and CAP collectors.
 * CI and production run the same assertions. No live state is modified.
 */
async function isolatedSourceApp(t:TestContext,clock:()=>Date=now){
 const root=await mkdtemp(join(tmpdir(),'loucka-source-tests-'));
 const files={cameraDir:join(root,'camera'),warningsFile:join(root,'chmi','alerts.json')};
 const app=buildApp(reader(),clock,undefined,files);
 t.after(async()=>{await app.close();await rm(root,{recursive:true,force:true});});
 return {app,root,files};
}
test('healthz, readiness, station, camera and sensors do not fabricate capabilities',async t=>{
 const {app}=await isolatedSourceApp(t);
 const h=await app.inject('/api/v1/healthz');
 assert.equal(h.statusCode,200);assert.equal(h.json().status,'ok');
 const ready=(await app.inject('/api/v1/readyz')).json();
 assert.equal(ready.ready,true);
 assert.equal(ready.components.live,'disabled');
 assert.equal(ready.components.camera,'disabled');
 const station=(await app.inject('/api/v1/station')).json();
 assert.deepEqual(station.capabilities,['current','history','sensors']);
 assert.deepEqual(station.availableDatasets,['original']);
 assert.equal(station.location.verified,false);
 const sensors=(await app.inject('/api/v1/sensors')).json();
 assert.deepEqual(sensors.sensors,[]);
 const channels=(await app.inject('/api/v1/sensors/channels')).json();
 assert.equal(channels.status,'metadata_only');
 assert.equal(channels.channels.length,11);
 assert.equal(channels.channels.find((x:any)=>x.metric==='soilMoist1').physicalIdentity,'unverified');
 assert.equal(channels.channels.find((x:any)=>x.metric==='soilTemp2').archiveStatus,'unknown');
 const camera=(await app.inject('/api/v1/camera/status')).json();
 assert.equal(camera.status,'disabled');
 assert.equal(camera.latestUrl,null);
});
test('24h sensor evidence is batched, presence-only and cached for 60 seconds',async t=>{
 let requests=0;
 const fake=reader();
 fake.sensorPresence=async(from,to)=>{
  requests++;
  assert.equal(to-from,86400);
  return [{metric:'soilTemp1',count:287,lastObservedAt:to-60},
   {metric:'soilTemp2',count:0,lastObservedAt:null},
   {metric:'soilMoist1',count:280,lastObservedAt:to-600}];
 };
 const app=buildApp(fake,now);t.after(()=>app.close());
 const first=await app.inject('/api/v1/sensors/channels');
 const second=await app.inject('/api/v1/sensors/channels');
 assert.equal(first.statusCode,200,first.body);
 assert.equal(requests,1);
 assert.deepEqual(first.json(),second.json());
 assert.equal(first.headers['cache-control'],'private, max-age=30');
 const etag=first.headers.etag;
 assert.equal(typeof etag,'string');
 const conditional=await app.inject({method:'GET',url:'/api/v1/sensors/channels',headers:{'if-none-match':etag}});
 assert.equal(conditional.statusCode,304);
 assert.equal(requests,1);
 const item=first.json().channels.find((x:any)=>x.metric==='soilTemp1');
 assert.equal(item.nonNullSamples,287);
 assert.equal(item.archiveStatus,'observed_recently');
 assert.equal(item.physicalIdentity,'unverified');
 const missing=first.json().channels.find((x:any)=>x.metric==='soilTemp2');
 assert.equal(missing.archiveStatus,'not_observed_recently');
 assert.equal(missing.nonNullSamples,0);
});
test('current converts METRIC archive by source system and reports all 45 public metrics',async t=>{
 const app=buildApp(reader(),now);t.after(()=>app.close());
 const res=await app.inject('/api/v1/current?units=metricwx');
 assert.equal(res.statusCode,200,res.body);
 const body=res.json();
 assert.equal(body.dataset,'original');
 assert.equal(Object.keys(body.readings).length,45);
 assert.equal(body.readings.outTemp.value,12.5);
 assert.equal(body.readings.windSpeed.value,10);
 assert.equal(body.readings.rain.value,1);
 assert.equal(body.readings.windSpeed.unit,'m_per_s');
 assert.equal(body.readings.outTemp.sourceUsUnits,16);
 assert.equal(body.readings.soilTemp4.value,null);
});
test('each publicly catalogued metric has safe mappings for all 3 by 3 unit systems',()=>{
 assert.equal(metricNames.length,45);
 for(const name of metricNames){
  const expected=metrics[name];
  for(const source of [1,16,17]){
   for(const units of ['us','metric','metricwx'] as const){
    const nullSample=converted(name,null,source,units);
    assert.equal(nullSample.value,null);
    assert.equal(nullSample.quality,'missing');
    assert.equal(nullSample.unit,expected.outputs[units]);
    assert.equal(nullSample.sourceUsUnits,source);
    const measured=converted(name,1,source,units);
    assert.ok(measured.value!==null&&Number.isFinite(measured.value));
   }
  }
 }
 assert.equal(converted('lightning_distance',1,1,'metricwx').unit,'km');
});
test('missing is null, invalid source & nonfinite numbers fail closed',async t=>{
 const app=buildApp(reader({...fixture,outTemp:null,usUnits:1}),now);t.after(()=>app.close());
 const good=(await app.inject('/api/v1/current?units=us')).json();
 assert.equal(good.readings.outTemp.value,null);
 assert.equal(good.readings.outTemp.quality,'missing');
 const invalid=buildApp(reader({...fixture,usUnits:255}),now);t.after(()=>invalid.close());
 assert.equal((await invalid.inject('/api/v1/current')).statusCode,503);
 assert.throws(()=>converted('rain',Infinity,16,'metricwx'));
});
test('bad inputs, forbidden datasets, unsupported source and empty archive',async t=>{
 const app=buildApp(reader(null),now);t.after(()=>app.close());
 assert.equal((await app.inject('/api/v1/current?units=invalid')).statusCode,400);
 assert.equal((await app.inject('/api/v1/current?asOf=2026-11-01')).statusCode,400);
 assert.equal((await app.inject('/api/v1/current?dataset=approved')).statusCode,503);
 assert.equal((await app.inject('/api/v1/current')).statusCode,404);
 assert.equal((await app.inject('/api/v1/current?anything=1')).statusCode,400);
});
test('readiness separates DB failure from liveness without exposing secrets',async t=>{
 const fail:ArchiveReader={ping:async()=>{throw Error('private DB error');},
  latest:async()=>null,history:async()=>[]};
 const app=buildApp(fail,now);t.after(()=>app.close());
 assert.equal((await app.inject('/api/v1/healthz')).statusCode,200);
 const r=await app.inject('/api/v1/readyz');
 assert.equal(r.statusCode,503);assert.ok(!r.body.includes('private DB error'));
});
test('ETag and conditional GET invalidate after changing data',async t=>{
 const app=buildApp(reader(),now);t.after(()=>app.close());
 const initial=await app.inject('/api/v1/current');
 assert.ok(initial.headers.etag);
 const again=await app.inject({url:'/api/v1/current',headers:{'if-none-match':String(initial.headers.etag)}});
 assert.equal(again.statusCode,304);
 assert.equal(again.body,'');
 const other=await app.inject({url:'/api/v1/current?units=us',headers:{'if-none-match':String(initial.headers.etag)}});
 assert.equal(other.statusCode,200);
});
test('bounded history raw retains interval ends, actual null and explicit gaps',async t=>{
 const rows:ArchiveRow[]=[
  {dateTime:600,interval:5,usUnits:16,outTemp:10},
  {dateTime:1200,interval:5,usUnits:17,outTemp:null},
  {dateTime:1500,interval:5,usUnits:1,outTemp:50}
 ];
 const app=buildApp(reader(fixture,rows),now);t.after(()=>app.close());
 const res=await app.inject('/api/v1/history?metric=outTemp&from=1970-01-01T00:00:00Z&to=1970-01-01T00:25:00Z&resolution=raw&limit=15');
 assert.equal(res.statusCode,200,res.body);
 const body=res.json();
 assert.equal(body.resolution,'raw');
 assert.equal(body.aggregation,'sample');
 assert.equal(body.truncated,false);
 assert.equal(body.points.length,5);
 assert.equal(body.points[0].quality,'missing');
 assert.equal(body.points[0].source,'derived');
 assert.equal(body.points[3].value,null);
 assert.equal(body.points[4].value,10);
 assert.equal(body.completeness.valid,2);
 assert.equal(body.completeness.expected,null);
});
test('history refuses large raw periods and silent truncation while supporting rollups',async t=>{
 const app=buildApp(reader(fixture,[{dateTime:600,interval:5,usUnits:16,outTemp:10},{dateTime:900,interval:5,usUnits:16,outTemp:9}]),now);t.after(()=>app.close());
 const base='/api/v1/history?metric=outTemp&from=1970-01-01T00:00:00Z&to=1970-01-01T00:15:00Z';
 assert.equal((await app.inject(base+'&resolution=hourly')).statusCode,200);
 const rolled=await app.inject(base+'&limit=1');
 assert.equal(rolled.statusCode,200);
 assert.equal(rolled.json().resolution,'hourly');
 assert.equal((await app.inject(base.replace('outTemp','__injected'))).statusCode,400);
 assert.equal((await app.inject(base+'&dataset=approved')).statusCode,503);
 assert.equal((await app.inject(base+'&unexpected=1')).statusCode,400);
 const big='/api/v1/history?metric=outTemp&from=2026-01-01T00:00:00Z&to=2026-05-01T00:00:00Z';
 assert.equal((await app.inject(big)).statusCode,422);
});
test('history has no fabricated points when no source rows exist',async t=>{
 const app=buildApp(reader(fixture,[]),now);t.after(()=>app.close());
 const res=await app.inject('/api/v1/history?metric=rain&from=1970-01-01T00:00:00Z&to=1970-01-01T00:10:00Z');
 assert.equal(res.statusCode,200);
 assert.deepEqual(res.json().points,[]);
 assert.equal(res.json().count,0);
});

test('unit conversions match the independent Python reference golden vectors',()=>{
 const data=JSON.parse(readFileSync(join(process.cwd(),'../tests/fixtures/unit-conversions.json'),'utf8')) as {
  cases:Array<{metric:string;value:number|null;usUnits:number;units:'us'|'metric'|'metricwx';expected:number|null}>
 };
 for(const sample of data.cases){
  assert.ok(metricNames.includes(sample.metric as typeof metricNames[number]));
  const r=converted(sample.metric as typeof metricNames[number],sample.value,sample.usUnits,sample.units);
  if(sample.expected===null)assert.equal(r.value,null);
  else assert.ok(r.value!==null && Math.abs(r.value-sample.expected)<1e-7,
   JSON.stringify({sample,actual:r.value}));
 }
});

test('extra read-only endpoints expose real-source telemetry and derived solar only',async t=>{
 const mock:ArchiveReader={...reader(),
  telemetrySnapshot:async()=>[{column:'ws80_sig',dateTime:1793520000,value:3},
   {column:'ws80_batt',dateTime:1793520000,value:2.7}],
  solarYear:async()=>({records:100,validRecords:80,validMinutes:400,energyKwhM2:2.4})
 };
 const app=buildApp(mock,now);t.after(()=>app.close());
 const diag=await app.inject('/api/v1/diagnostics/sensors');
 assert.equal(diag.statusCode,200,diag.body);
 assert.equal(diag.json().readings.length,2);
 assert.equal(diag.json().readings[0].unit,'raw');
 const solar=await app.inject('/api/v1/climate/solar?year=2025');
 assert.equal(solar.statusCode,200,solar.body);
 assert.equal(solar.json().energyKwhM2,2.4);
 assert.equal(solar.json().sunshineHours,null);
 assert.equal(solar.json().snowDepthCm,null);
 assert.equal((await app.inject('/api/v1/climate/solar?year=2000')).statusCode,400);
 assert.equal((await app.inject('/api/v1/climate/solar?year=bad')).statusCode,400);
});
test('camera archive and CHMI warning fail closed when collectors not installed',async t=>{
 const {app}=await isolatedSourceApp(t);
 const archive=(await app.inject('/api/v1/camera/archive')).json();
 assert.equal(archive.status,'unavailable');
 assert.deepEqual(archive.frames,[]);
 const alert=(await app.inject('/api/v1/alerts/local')).json();
 assert.equal(alert.status,'unavailable');
 assert.deepEqual(alert.alerts,[]);
 const traversal=await app.inject('/api/v1/camera/frames/..%2Fapi.env');
 assert.ok([400,404].includes(traversal.statusCode));
 assert.equal((await app.inject('/api/v1/camera/frames/invalid.jpg')).statusCode,404);
 assert.equal((await app.inject('/api/v1/camera/timelapse/unknown.mp4')).statusCode,404);
});

test('camera day browsing rejects traversal, invalid dates and future requests',async t=>{
 const {app}=await isolatedSourceApp(t);
 assert.equal((await app.inject('/api/v1/camera/archive/day/2026-02-30')).statusCode,400);
 assert.equal((await app.inject('/api/v1/camera/archive/day/bad')).statusCode,400);
 const distant=await app.inject('/api/v1/camera/archive/day/2020-01-01');
 assert.equal(distant.statusCode,200);
 assert.equal(distant.json().status,'outside_retention');
 const today=await app.inject('/api/v1/camera/archive/day/'+new Date().toISOString().slice(0,10));
 assert.equal(today.statusCode,200);
 assert.equal(today.json().status,'unavailable');
 assert.deepEqual(today.json().frames,[]);
});

test('camera and CHMI report real validated collector files from explicit isolated paths',async t=>{
 // Monitoring uses the same clock as collector fixtures; other contract tests
 // intentionally keep their fixed historical clock.
 const {app,files}=await isolatedSourceApp(t,()=>new Date());
 const stamp=new Date();
 const name=stamp.toISOString().slice(0,19).replace(/[-:]/g,'')+'Z.jpg';
 const fetchedAt=stamp.toISOString();
 await mkdir(files.cameraDir,{recursive:true});
 await mkdir(join(files.cameraDir,'frames'),{recursive:true});
 await mkdir(join(files.warningsFile,'..'),{recursive:true});
 await writeFile(join(files.cameraDir,'index.json'),JSON.stringify({
  schemaVersion:'1',frames:[{name,fetchedAt}],videos:[]
 }));
 await writeFile(join(files.cameraDir,'frames',name),'fake-jpeg-fixture');
 await writeFile(files.warningsFile,JSON.stringify({
  schemaVersion:'1',source:'CHMI_CAP',orp:'7209',status:'verified',
  checkedAt:stamp.toISOString(),alerts:[]
 }));
 const camera=(await app.inject('/api/v1/camera/status')).json();
 assert.equal(camera.status,'fresh');
 const ready=(await app.inject('/api/v1/readyz')).json();
 assert.equal(ready.ready,true);
 assert.equal(ready.components.camera,'ok');
 assert.equal(camera.latestUrl,'/api/v1/camera/frames/'+name);
 const listing=(await app.inject('/api/v1/camera/archive')).json();
 assert.equal(listing.status,'ok');
 assert.equal(listing.frames.length,1);
 const day=(await app.inject('/api/v1/camera/archive/day/'+stamp.toISOString().slice(0,10))).json();
 assert.equal(day.status,'ok');
 assert.equal(day.frames.length,1);
 const alert=(await app.inject('/api/v1/alerts/local')).json();
 assert.equal(alert.status,'verified');
 assert.deepEqual(alert.alerts,[]);
 const monitor=(await app.inject('/api/v1/monitor/status')).json();
 assert.equal(monitor.components.camera.status,'ok');
 assert.equal(monitor.components.chmi.status,'ok');
});

test('experimental RH preview is separate, opt-in and never confused with approved data',async t=>{
 const unavailable=buildApp(reader(),now);
 t.after(()=>unavailable.close());
 const from='2022-04-26T00:00:00Z',to='2022-04-27T00:00:00Z';
 const route='/api/v1/dev/rh-preview?from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to);
 const blocked=await unavailable.inject(route);
 assert.equal(blocked.statusCode,503,blocked.body);
 assert.equal((await unavailable.inject('/api/v1/history?metric=outHumidity&from='+from+
  '&to='+to+'&dataset=approved')).statusCode,503);
 let read=0;
 const fake=reader();
 fake.previewHumidity=async(start,end,limit)=>{
  read++;
  assert.equal(start,Date.parse(from)/1000);
  assert.equal(end,Date.parse(to)/1000);
  assert.equal(limit,2400);
  return {versionId:'rh2022-'+'a'.repeat(24),checksumSha256:'f'.repeat(64),
   points:[
    {dateTime:start+300,originalRh:null,previewRh:77,
     category:'estimated',method:'dual_vapor_pressure_v1',
     sourceBatch:'test-batch',reviewState:'experimental_unapproved'},
    {dateTime:start+600,originalRh:61,previewRh:61,
     category:'measured',method:null,sourceBatch:null,
     reviewState:'original_unverified'},
    {dateTime:start+900,originalRh:89,previewRh:null,
     category:'invalidated',method:'dual_vapor_pressure_v1',
     sourceBatch:'test-batch',reviewState:'experimental_unapproved'}
   ]};
 };
 const app=buildApp(fake,now);t.after(()=>app.close());
 const ok=await app.inject(route);
 assert.equal(ok.statusCode,200,ok.body);
 const data=ok.json();
 assert.equal(data.approved,false);
 assert.equal(data.dataset,'experimental_preview');
 assert.equal(data.versionId,'rh2022-'+'a'.repeat(24));
 assert.equal(data.points.length,3);
 assert.equal(data.points[0].originalRh,null);
 assert.equal(data.points[0].previewRh,77);
 assert.equal(data.points[0].approved,false);
 assert.equal(data.points[2].previewRh,null);
 assert.equal(data.points[2].quality,'invalidated');
 assert.match(data.note,/NOT independently verified/);
 assert.equal(read,1);
 const cached=await app.inject({url:route,headers:{'if-none-match':String(ok.headers.etag)}});
 assert.equal(cached.statusCode,304);
 const overRange=await app.inject('/api/v1/dev/rh-preview?from=2022-04-01T00:00:00Z&to=2022-05-01T00:00:00Z');
 assert.equal(overRange.statusCode,422);
 const badParams=await app.inject('/api/v1/dev/rh-preview?from='+from+'&to='+to+'&extra=1');
 assert.equal(badParams.statusCode,400);
 const notApproved=await app.inject('/api/v1/history?metric=outHumidity&from='+from+'&to='+to+'&dataset=approved');
 assert.equal(notApproved.statusCode,503);
});
