import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {buildApp} from '../src/app.js';
import {registerHistoryRoute} from '../src/history-route.js';
import type {ArchiveReader,ArchiveRow} from '../src/store.js';

const sample:ArchiveRow={dateTime:600,interval:5,usUnits:17,rain:0,outTemp:1};
const base='/api/v1/history?metric=rain&from=1970-01-01T00:00:00Z&to=1970-01-01T00:15:00Z&resolution=raw';
const calls:{metric:string;from:number;to:number;limit:number}[]=[];
const reader:ArchiveReader={
 latest:async()=>sample,
 history:async(metric,from,to,limit)=>{calls.push({metric,from,to,limit});return [sample];},
 ping:async()=>{}
};

test('standalone history registration matches composed application body and ETag',async t=>{
 const standalone=Fastify({logger:false,ajv:{customOptions:{removeAdditional:false,coerceTypes:false}}});
 registerHistoryRoute(standalone,reader);
 const composed=buildApp(reader,()=>new Date('2026-11-28T12:00:00Z'));
 t.after(async()=>{await standalone.close();await composed.close();});
 const a=await standalone.inject(base),b=await composed.inject(base);
 assert.equal(a.statusCode,200,a.body);
 assert.equal(b.statusCode,200,b.body);
 assert.deepEqual(a.json(),b.json());
 assert.equal(a.headers.etag,b.headers.etag);
 assert.equal(a.headers['cache-control'],'no-cache');
 assert.deepEqual(a.json().points.map((p:{value:number|null})=>p.value),[null,0,null]);
 assert.deepEqual(calls.slice(-2),Array(2).fill({metric:'rain',from:0,to:900,limit:2001}));
 for(const tag of [String(a.headers.etag),'W/'+a.headers.etag,'*']){
  const result=await composed.inject({url:base,headers:{'if-none-match':tag}});
  assert.equal(result.statusCode,304);assert.equal(result.body,'');
  assert.equal(result.headers.etag,a.headers.etag);
 }
});
test('composed history preserves validation, dataset gate and bounded reads',async t=>{
 const app=buildApp(reader);t.after(()=>app.close());
 const start=calls.length;
 for(const [url,status,code] of [
  [base+'&unexpected=1',400,'BAD_REQUEST'],
  [base+'&limit=0',400,'BAD_REQUEST'],
  [base+'&dataset=approved',503,'DATASET_UNAVAILABLE'],
  [base.replace('metric=rain','metric=unknown'),400,'UNKNOWN_METRIC'],
  [base.replace('00:15:00Z','00:00:00Z'),422,'INVALID_RANGE']
 ] as const){
  const res=await app.inject(url);
  assert.equal(res.statusCode,status,res.body);
  const error=res.json();assert.equal(error.schemaVersion,'1');assert.equal(error.error.code,code);
  assert.equal(typeof error.error.requestId,'string');
 }
 assert.equal(calls.length,start);
});
