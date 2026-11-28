import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildApp} from '../src/app.js';
import Fastify from 'fastify';
import {registerClimateRoutes} from '../src/climate-routes.js';
import type {ArchiveReader,DailySummaryRow} from '../src/store.js';

const clock=()=>new Date('2026-11-17T18:00:00Z');
const timestamp=(iso:string)=>Math.floor(Date.parse(iso)/1000);
function day(iso:string,value:number|null,seconds=86400,metric='outTemp'):DailySummaryRow{
 const at=timestamp(iso);
 return {dateTime:at,usUnits:16,count:value===null?0:seconds/300,
  wsum:value===null?null:value*seconds,
  sumtime:value===null?null:seconds,
  sum:metric==='rain'?value:null,
  min:value===null?null:value-2,mintime:value===null?null:at+60,
  max:value===null?null:value+3,maxtime:value===null?null:at+120};
}
const original={
 outTemp:[
  day('2024-03-30T23:00:00Z',10,82800), // DST spring (23h)
  day('2024-10-26T22:00:00Z',8,90000), // DST autumn (25h)
  day('2025-01-01T23:00:00Z',0),
  day('2025-03-29T23:00:00Z',11,82800),
  day('2025-10-25T22:00:00Z',7,90000)
 ],
 rain:[
  day('2024-03-30T23:00:00Z',0,82800,'rain'),
  day('2025-01-01T23:00:00Z',0,86400,'rain'),
  day('2025-03-29T23:00:00Z',2.5,82800,'rain')
 ],
 windSpeed:[
  day('2024-03-30T23:00:00Z',36,82800,'windSpeed'),
  day('2025-01-01T23:00:00Z',36,86400,'windSpeed'),
  day('2025-03-29T23:00:00Z',18,82800,'windSpeed')
 ]
};
function make(rows=original){
 let calls=0;
 const reader:ArchiveReader={
  latest:async()=>null,history:async()=>[],ping:async()=>{},
  dailySummaries:async(metric,from,to,limit)=>{
   calls++;
   assert.ok(limit<=2601,'Batch SELECT must be bounded');
   return (rows[metric as keyof typeof rows]??[]).filter(item=>
    item.dateTime>=from&&item.dateTime<to);
  }
 };
 return {reader,calls:()=>calls};
}
const q='?year=2025&units=metricwx&dataset=original';
test('one dashboard uses just three bounded read-only WeeWX metric scans',async t=>{
 const fake=make(),app=buildApp(fake.reader,clock);t.after(()=>app.close());
 const r=await app.inject('/api/v1/climate/dashboard'+q);
 assert.equal(r.statusCode,200,r.body);
 const data=r.json();
 assert.equal(data.schemaVersion,'1');
 assert.equal(data.source,'weewx_daily');
 assert.equal(data.dataset,'original');
 assert.equal(data.qcStatus,'original_unverified');
 assert.equal(data.calendarTimezone,'Europe/Prague');
 assert.equal(data.year,2025);
 assert.equal(data.annualYears.length,6);
 assert.equal(data.annualYears[0],2025);
 assert.equal(fake.calls(),3,'one read per metric, no per-month SQL fanout');
 assert.equal(data.monthly.temperature.length,12);
 assert.equal(data.monthly.temperature[0],0,'measured 0 C is never missing');
 assert.equal(data.monthly.rain[0],0,'measured zero rainfall is not a gap');
 assert.equal(data.monthly.temperature[1],null,'absent February stays NULL');
 assert.equal(data.monthly.rain[1],null,'absent rainfall stays NULL');
 assert.ok(data.summary.temperature!==null);
 assert.equal(data.monthly.temperatureLow[0],-2);
 assert.equal(data.monthly.temperatureHigh[0],3);
 assert.equal(data.summary.maxTemp,14);
 assert.equal(data.monthly.wind[0],10,'METRIC km/h -> metricwx m/s');
 assert.equal(data.annual.temperatureCoverage[0]>0,true);
 assert.equal(data.annual.temperatureCoverage[0]<0.1,true);
 const again=await app.inject('/api/v1/climate/dashboard'+q);
 assert.equal(again.statusCode,200);
 assert.equal(fake.calls(),3,'same-key visitors reuse the 5min cache');
 assert.equal(again.body,r.body);
 const notModified=await app.inject({
  url:'/api/v1/climate/dashboard'+q,
  headers:{'if-none-match':String(r.headers.etag)}
 });
 assert.equal(notModified.statusCode,304);
 assert.equal(fake.calls(),3);
});
test('batched monthly/yearly values match existing single-statistics endpoint including DST',async t=>{
 const fake=make(),app=buildApp(fake.reader,clock);t.after(()=>app.close());
 const response=(await app.inject('/api/v1/climate/dashboard'+q)).json();
 for(const [metric,key,aggregation] of [
  ['outTemp','temperature','mean'],['rain','rain','sum'],['windSpeed','wind','mean']
 ] as const){
  const yearly=await app.inject('/api/v1/statistics/yearly?'+new URLSearchParams({
   metric,aggregation,year:'2025',dataset:'original',units:'metricwx'
  }));
  assert.equal(yearly.statusCode,200,yearly.body);
  assert.equal(response.summary[key],yearly.json().value);
  const monthly=await app.inject('/api/v1/statistics/monthly?'+new URLSearchParams({
   metric,aggregation,month:'2025-03',dataset:'original',units:'metricwx'
  }));
  assert.equal(monthly.statusCode,200,monthly.body);
  assert.equal(response.monthly[key][2],monthly.json().value);
 }
 const peak=(await app.inject('/api/v1/statistics/yearly?'+new URLSearchParams({
  metric:'outTemp',aggregation:'max',year:'2025',units:'metricwx'
 }))).json();
 assert.equal(response.summary.maxTemp,peak.value);
 const previous=(await app.inject('/api/v1/statistics/monthly?'+new URLSearchParams({
  metric:'outTemp',aggregation:'mean',month:'2024-03',units:'metricwx'
 }))).json();
 assert.equal(previous.value,10);
});
test('invalid or unauthorized climate query is refused, no database SELECT happens',async t=>{
 const fake=make(),app=buildApp(fake.reader,clock);t.after(()=>app.close());
 for(const [path,status] of [
  ['/api/v1/climate/dashboard?year=2027',422],
  ['/api/v1/climate/dashboard?year=2008',422],
  ['/api/v1/climate/dashboard?year=2025&dataset=approved',503],
  ['/api/v1/climate/dashboard?year=2025&units=unknown',400],
  ['/api/v1/climate/dashboard?year=2025&extra=1',400],
  ['/api/v1/climate/dashboard',400],
  ['/api/v1/climate/dashboard?year=2025%20OR%201%3D1',422]
 ] as const){
  const response=await app.inject(path);
  assert.equal(response.statusCode,status,path+' '+response.body);
 }
 assert.equal(fake.calls(),0);
});
test('day-boundary tampering and duplicate daily rows fail closed',async t=>{
 const tampered=structuredClone(original);
 tampered.outTemp.push(day('2025-03-30T00:00:00Z',70));
 tampered.outTemp.sort((a,b)=>a.dateTime-b.dateTime);
 const f=make(tampered),app=buildApp(f.reader,clock);t.after(()=>app.close());
 const response=await app.inject('/api/v1/climate/dashboard'+q);
 assert.equal(response.statusCode,503);
 assert.equal(response.json().error.code,'UPSTREAM_UNAVAILABLE');
 const duplicated=structuredClone(original);
 duplicated.rain.push({...duplicated.rain[0]!});
 duplicated.rain.sort((a,b)=>a.dateTime-b.dateTime);
 const d=make(duplicated),other=buildApp(d.reader,clock);t.after(()=>other.close());
 assert.equal((await other.inject('/api/v1/climate/dashboard'+q)).statusCode,503);
});
test('API does not claim to have a dashboard when day-summary tables are absent',async t=>{
 const reader:ArchiveReader={latest:async()=>null,history:async()=>[],ping:async()=>{}};
 const app=buildApp(reader,clock);t.after(()=>app.close());
 assert.equal((await app.inject('/api/v1/climate/dashboard'+q)).statusCode,503);
});

test('opt-in climate diagnostics record bounded cold refresh once, never expose readings',async t=>{
 const originalInfo=console.info;
 const oldMode=process.env.WEATHER_API_PERF_LOG;
 const recorded:string[]=[];
 process.env.WEATHER_API_PERF_LOG='YES';
 console.info=(...args:unknown[])=>{recorded.push(args.map(String).join(' '));};
 const fake=make(),app=buildApp(fake.reader,clock);
 try{
  const response=await app.inject('/api/v1/climate/dashboard'+q);
  assert.equal(response.statusCode,200,response.body);
  const next=await app.inject('/api/v1/climate/dashboard'+q);
  assert.equal(next.statusCode,200,next.body);
  assert.equal(fake.calls(),3);
  const events=recorded.filter(s=>s.includes('"event":"climate_dashboard_refresh"'));
  assert.equal(events.length,1,'warm cache must not generate another timing event');
  const timing=JSON.parse(events[0]!) as Record<string,unknown>;
  assert.equal(timing.year,2025);
  assert.equal(timing.event,'climate_dashboard_refresh');
  for(const metric of ['durationMs','queryWallMs','processingMs','rssMiB','heapUsedMiB'])
   assert.ok(typeof timing[metric]==='number'&&Number.isFinite(timing[metric]));
  assert.deepEqual(timing.rows,{outTemp:5,rain:3,windSpeed:3});
  const queryMs=timing.queryMs as Record<string,unknown>;
  assert.deepEqual(Object.keys(queryMs).sort(),['outTemp','rain','windSpeed']);
  assert.ok(Object.values(queryMs).every(v=>typeof v==='number'&&v>=0));
  assert.equal('readings' in timing,false);
  assert.equal('databaseHost' in timing,false);
  assert.equal('schema' in timing,false);
 }finally{
  console.info=originalInfo;
  if(oldMode===undefined)delete process.env.WEATHER_API_PERF_LOG;
  else process.env.WEATHER_API_PERF_LOG=oldMode;
  await app.close();
 }
});

test('ordinary climate dashboard requests do not log weather or timing without opt-in',async t=>{
 const originalInfo=console.info,oldMode=process.env.WEATHER_API_PERF_LOG;
 const recorded:string[]=[];
 delete process.env.WEATHER_API_PERF_LOG;
 console.info=(...args:unknown[])=>{recorded.push(args.map(String).join(' '));};
 const fake=make(),app=buildApp(fake.reader,clock);
 try{
  const response=await app.inject('/api/v1/climate/dashboard'+q);
  assert.equal(response.statusCode,200,response.body);
  assert.equal(recorded.filter(s=>s.includes('climate_dashboard_refresh')).length,0);
 }finally{
  console.info=originalInfo;
  if(oldMode===undefined)delete process.env.WEATHER_API_PERF_LOG;
  else process.env.WEATHER_API_PERF_LOG=oldMode;
  await app.close();
 }
});

test('climate route registration preserves response and isolates coalesced caches per app',async t=>{
 const a=make(),b=make();
 const standalone=Fastify({logger:false,ajv:{customOptions:{removeAdditional:false,coerceTypes:false}}});
 registerClimateRoutes(standalone,a.reader,clock);
 const composed=buildApp(b.reader,clock);
 t.after(async()=>{await standalone.close();await composed.close();});
 const url='/api/v1/climate/dashboard'+q;
 const [first,concurrent]=await Promise.all([standalone.inject(url),standalone.inject(url)]);
 assert.equal(first.statusCode,200,first.body);
 assert.equal(concurrent.body,first.body);
 assert.equal(a.calls(),3,'parallel callers must share the same cold load');
 assert.equal(b.calls(),0,'a different app must not share reader or cache state');
 const other=await composed.inject(url);
 assert.equal(other.statusCode,200,other.body);
 assert.equal(other.body,first.body);
 assert.equal(other.headers.etag,first.headers.etag);
 assert.equal(other.headers['cache-control'],first.headers['cache-control']);
 assert.equal(b.calls(),3);
 const cached=await standalone.inject({url,headers:{'if-none-match':String(first.headers.etag)}});
 assert.equal(cached.statusCode,304);
 assert.equal(a.calls(),3);
});
