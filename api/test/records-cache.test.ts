import test from 'node:test';
import assert from 'node:assert/strict';
import {get} from 'node:http';
import {DayScopedCache} from '../src/records-cache.js';
import {climateRecordsFromDaily} from '../src/records.js';
import {buildApp} from '../src/app.js';
import {LiveHub} from '../src/live.js';
import type {ArchiveReader,DailySummaryRow} from '../src/store.js';

test('day-scoped records cache coalesces simultaneous cold callers',async()=>{
 const cache=new DayScopedCache<number>(1000,5000);
 let loads=0,finish!:(value:number)=>void;
 const blocker=new Promise<number>(resolve=>{finish=resolve;});
 const load=()=>{loads++;return blocker;};
 const first=cache.get('2026-11-02',10000,load);
 const second=cache.get('2026-11-02',10000,load);
 await Promise.resolve();
 assert.equal(loads,1);
 finish(42);
 assert.deepEqual(await Promise.all([first,second]),[42,42]);
 assert.equal(await cache.get('2026-11-02',10500,()=>Promise.resolve(999)),42);
 assert.equal(loads,1);
});

test('expired cache serves bounded same-day stale data while one refresh runs',async()=>{
 const cache=new DayScopedCache<number>(1000,5000);
 assert.equal(await cache.get('day1',0,async()=>10),10);
 let loads=0,finish!:(value:number)=>void;
 const pending=new Promise<number>(resolve=>{finish=resolve;});
 const load=()=>{loads++;return pending;};
 assert.equal(await cache.get('day1',1200,load),10);
 assert.equal(await cache.get('day1',1300,load),10);
 await Promise.resolve();
 assert.equal(loads,1);
 finish(20);
 // An additional microtask turn lets the cache updater run.
 await pending;
 await Promise.resolve();
 assert.equal(await cache.get('day1',1500,()=>Promise.resolve(999)),20);
});

test('failed background refresh is retried and stale values expire',async()=>{
 const cache=new DayScopedCache<number>(1000,5000);
 assert.equal(await cache.get('day1',0,async()=>10),10);
 assert.equal(await cache.get('day1',1100,async()=>{throw Error('temporary read failure');}),10);
 await new Promise<void>(resolve=>setImmediate(resolve));
 assert.equal(await cache.get('day1',6000,async()=>22),22);
});

test('midnight invalidates old day even if its slower refresh completes later',async()=>{
 const cache=new DayScopedCache<number>(1000,5000);
 assert.equal(await cache.get('day1',0,async()=>10),10);
 let finish!:(value:number)=>void;
 const late=new Promise<number>(resolve=>{finish=resolve;});
 assert.equal(await cache.get('day1',1200,()=>late),10);
 assert.equal(await cache.get('day2',1500,async()=>30),30);
 finish(20);
 await late;
 await new Promise<void>(resolve=>setImmediate(resolve));
 assert.equal(await cache.get('day2',1600,async()=>999),30);
});

test('climate endpoint switches to next Europe/Prague day without keeping old records',async()=>{
 let clock=Date.parse('2026-11-02T12:00:00Z'),queries=0;
 const reader:ArchiveReader={
  latest:async()=>null,history:async()=>[],ping:async()=>{},
  dailySummaries:async()=>{queries++;return [];}
 };
 const app=buildApp(reader,()=>new Date(clock));
 try{
  const first=await app.inject('/api/v1/climate/records');
  assert.equal(first.statusCode,200,first.body);
  assert.equal(first.json().range.toExclusive,'2026-11-02');
  assert.equal(queries,3);
  clock=Date.parse('2026-11-02T23:05:00Z');
  const next=await app.inject('/api/v1/climate/records');
  assert.equal(next.statusCode,200,next.body);
  assert.equal(next.json().range.toExclusive,'2026-11-03');
  assert.equal(queries,6);
 }finally{await app.close();}
});

test('reused ICU calendar yields correct local dates through spring DST change',()=>{
 const initial=Date.parse('2026-03-28T23:00:00Z')/1000;
 const afterDst=Date.parse('2026-03-29T22:00:00Z')/1000;
 const row=(dateTime:number,min:number):DailySummaryRow=>({
  dateTime,usUnits:17,min,mintime:dateTime,max:min+5,maxtime:dateTime,
  sum:0,count:200,wsum:0,sumtime:60000
 });
 const result=climateRecordsFromDaily({
  temperature:[row(initial,-3),row(afterDst,-7)],
  rain:[],gust:[],from:'2009-01-01',toExclusive:'2026-04-01',calendarDays:6300
 });
 assert.equal(result.records.minTemp?.localDate,'2026-03-30');
});

test('SSE listeners drain before HTTP close and release subscribers', {timeout:5000},async()=>{
 const hub=new LiveHub();
 const reader:ArchiveReader={latest:async()=>null,history:async()=>[],ping:async()=>{}};
 const app=buildApp(reader,()=>new Date('2026-11-02T12:00:00Z'),hub);
 try{
  const address=await app.listen({port:0,host:'127.0.0.1'});
  const stream=await new Promise<import('node:http').IncomingMessage>((resolve,reject)=>{
   const request=get(address+'/api/v1/live',resolve);
   request.on('error',reject);
  });
  stream.resume();
  assert.equal(stream.statusCode,200);
  assert.equal(hub.subscriberCount,1);
  await app.close();
  assert.equal(hub.subscriberCount,0);
  stream.destroy();
 }finally{await app.close();}
});
