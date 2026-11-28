import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {buildApp} from '../src/app.js';
import {registerObservationRoutes} from '../src/observation-routes.js';
import type {ArchiveReader,ArchiveRow} from '../src/store.js';

const now=()=>new Date('2026-11-28T12:00:00Z');
const end=Math.floor(now().getTime()/1000);
const row:ArchiveRow={dateTime:end-300,interval:5,usUnits:17,rain:0,outTemp:0};
function fake(){
 const reads:unknown[][]=[];
 const reader:ArchiveReader={latest:async(at)=>{reads.push(['latest',at]);return row;},
 history:async(metric,from,to,limit)=>{reads.push(['history',metric,from,to,limit]);return [row];},ping:async()=>{}};
 return {reader,reads};
}
test('observation registration preserves current/QC body, ETag, bounds and disabled SSE',async t=>{
 const a=fake(),b=fake(),standalone=Fastify({logger:false,ajv:{customOptions:{removeAdditional:false,coerceTypes:false}}});
 registerObservationRoutes(standalone,a.reader,now);
 const composed=buildApp(b.reader,now);
 t.after(async()=>{await standalone.close();await composed.close();});
 const query=new URLSearchParams({metric:'rain',from:new Date((end-900)*1000).toISOString(),to:now().toISOString()});
 for(const url of ['/api/v1/current','/api/v1/quality/observations?'+query]){
  const x=await standalone.inject(url),y=await composed.inject(url);
  assert.equal(x.statusCode,200,x.body);assert.equal(y.statusCode,200,y.body);
  assert.equal(y.body,x.body);assert.equal(y.headers.etag,x.headers.etag);
 }
 assert.deepEqual(a.reads,b.reads);
 assert.deepEqual(a.reads,[['latest',end],['history','rain',end-900,end,751]]);
 for(const app of [standalone,composed]){
  const result=await app.inject('/api/v1/live');
  assert.equal(result.statusCode,503);
  assert.equal(result.json().error.code,'UPSTREAM_UNAVAILABLE');
 }
});
