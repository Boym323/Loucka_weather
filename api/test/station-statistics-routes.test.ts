import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {buildApp} from '../src/app.js';
import {registerStatisticsRoutes} from '../src/statistics-routes.js';
import {registerStationRoutes} from '../src/station-routes.js';
import {localMidnight} from '../src/calendar-time.js';
import type {ArchiveReader,DailySummaryRow} from '../src/store.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const now=()=>new Date('2026-11-28T12:00:00Z');
const at=localMidnight('2026-03-29')!;
const sample:DailySummaryRow={dateTime:at,usUnits:17,min:0,mintime:at+300,max:0,maxtime:at+600,sum:0,count:2,wsum:0,sumtime:600};
function fake(count:number){
 const reads:{metric:string;from:number;to:number;limit:number}[]=[];
 let presenceReads=0;
 const reader:ArchiveReader={latest:async()=>null,history:async()=>[],ping:async()=>{},
  dailySummaries:async(metric,from,to,limit)=>{reads.push({metric,from,to,limit});return [sample].filter(r=>r.dateTime>=from&&r.dateTime<to);},
  sensorPresence:async()=>{presenceReads++;return [{metric:'soilTemp1',count,lastObservedAt:at}];}
 };
 return {reader,reads,presenceReads:()=>presenceReads};
}
const server=()=>Fastify({logger:false,ajv:{customOptions:{removeAdditional:false,coerceTypes:false}}});
test('statistics route composition preserves body, ETag, DST bounds and query limits',async t=>{
 const a=fake(1),b=fake(2),standalone=server(),composed=buildApp(b.reader,now);
 registerStatisticsRoutes(standalone,a.reader);
 t.after(async()=>{await standalone.close();await composed.close();});
 for(const [kind,parameter,limit] of [['daily','date=2026-03-29',40],['monthly','month=2026-03',40],['yearly','year=2026',400]] as const){
  const url='/api/v1/statistics/'+kind+'?metric=rain&aggregation=sum&'+parameter;
  const x=await standalone.inject(url),y=await composed.inject(url);
  assert.equal(x.statusCode,200,x.body);assert.equal(y.body,x.body);
  assert.equal(x.json().value,0);assert.equal(y.headers.etag,x.headers.etag);
  assert.deepEqual(a.reads.at(-1),b.reads.at(-1));
  assert.equal(a.reads.at(-1)?.limit,limit);
  if(kind==='daily')assert.equal(a.reads.at(-1)!.to-a.reads.at(-1)!.from,23*3600);
 }
});
test('station routes preserve metadata clock and isolate sensor evidence cache',async t=>{
 const root=await mkdtemp(join(tmpdir(),'loucka-station-routes-'));
 const files={cameraDir:join(root,'camera'),warningsFile:join(root,'alerts.json')};
 const a=fake(7),b=fake(9),standalone=server(),composed=buildApp(b.reader,now,undefined,files);
 registerStationRoutes(standalone,a.reader,now,undefined,files,now().toISOString());
 t.after(async()=>{await standalone.close();await composed.close();await rm(root,{recursive:true,force:true});});
 for(const path of ['/api/v1/healthz','/api/v1/readyz','/api/v1/station','/api/v1/live/current','/api/v1/monitor/status','/api/v1/sensors','/api/v1/camera/status']){
  const x=await standalone.inject(path),y=await composed.inject(path);
  assert.equal(x.statusCode,200,x.body);assert.equal(y.statusCode,200,y.body);
  if(path==='/api/v1/camera/status'){
   // Disabled camera status uses real wall-clock time, not the injected app clock.
   // Compare stable contract fields and independently check both dynamic timestamps.
   const {updatedAt:xTime,...xBody}=x.json(),{updatedAt:yTime,...yBody}=y.json();
   assert.ok(Number.isFinite(Date.parse(xTime)));
   assert.ok(Number.isFinite(Date.parse(yTime)));
   assert.deepEqual(yBody,xBody);
  }else assert.deepEqual(y.json(),x.json());
  assert.equal(y.headers.etag,x.headers.etag);
 }
 const url='/api/v1/sensors/channels';
 const x=await standalone.inject(url),again=await standalone.inject(url),y=await composed.inject(url);
 assert.equal(x.statusCode,200,x.body);assert.equal(y.statusCode,200,y.body);
 assert.equal(again.body,x.body);
 const value=(body:string)=>JSON.parse(body).channels.find((item:{metric:string})=>item.metric==='soilTemp1').nonNullSamples;
 assert.equal(value(x.body),7);assert.equal(value(y.body),9);
 assert.equal(a.presenceReads(),1);assert.equal(b.presenceReads(),1);
});
