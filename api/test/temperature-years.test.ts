import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildApp} from '../src/app.js';
import {buildTemperatureDays} from '../src/temperature-years.js';
import type {ArchiveReader,DailySummaryRow} from '../src/store.js';

const clock=()=>new Date('2026-11-03T12:00:00Z');
const sec=(iso:string)=>Math.floor(Date.parse(iso)/1000);
function point(iso:string,value:number|null,seconds=86400):DailySummaryRow{
 return {dateTime:sec(iso),usUnits:16,
  count:value===null?0:Math.ceil(seconds/300),
  wsum:value===null?null:value*seconds,sumtime:value===null?null:seconds,
  min:null,mintime:null,max:null,maxtime:null,sum:null};
}
const fixture=[
 point('2024-02-28T23:00:00Z',5), // 29 February (Prague)
 point('2024-03-30T23:00:00Z',8,82800), // 23-hour spring DST day
 point('2024-10-26T22:00:00Z',4,90000), // 25-hour autumn DST day
 point('2025-01-01T23:00:00Z',null),
 point('2025-01-02T23:00:00Z',-2,3600), // observed, but partial
 point('2025-01-03T23:00:00Z',3)
];
function reader(rows:DailySummaryRow[]=fixture){
 let count=0;
 const result:ArchiveReader={
  latest:async()=>null,history:async()=>[],ping:async()=>{},
  dailySummaries:async(metric,from,to,limit)=>{
   count++;
   assert.equal(metric,'outTemp');assert.equal(limit>6000,true);
   assert.equal(from,sec('2008-12-31T23:00:00Z'));
   return rows;
  }
 };
 return {result,calls:()=>count};
}
test('one archive read yields daily temperature for every year without inventing gaps',async t=>{
 const fake=reader(),app=buildApp(fake.result,clock);t.after(()=>app.close());
 const response=await app.inject('/api/v1/climate/temperature-years?units=metricwx&dataset=original');
 assert.equal(response.statusCode,200,response.body);
 const body=response.json();
 assert.equal(body.firstYear,2009);
 assert.equal(body.endsBefore,'2026-11-03');
 assert.equal(body.dataset,'original');
 assert.equal(body.qcStatus,'original_unverified');
 assert.equal(body.points.length,6);
 assert.equal(body.points[0].date,'2024-02-29');
 assert.equal(body.points[0].value,5);
 assert.equal(body.points[0].quality,'derived');
 assert.equal(body.points[1].expectedSeconds,82800);
 assert.equal(body.points[2].expectedSeconds,90000);
 assert.equal(body.points[3].quality,'missing');
 assert.equal(body.points[3].value,null);
 assert.equal(body.points[4].quality,'partial');
 assert.equal(body.points[4].validSeconds,3600);
 assert.equal(body.points[5].value,3);
 assert.equal(fake.calls(),1);
 const repeated=await app.inject('/api/v1/climate/temperature-years');
 assert.equal(repeated.statusCode,200);
 assert.equal(fake.calls(),1);
 const notModified=await app.inject({url:'/api/v1/climate/temperature-years',
  headers:{'if-none-match':String(response.headers.etag)}});
 assert.equal(notModified.statusCode,304);
 assert.equal(fake.calls(),1);
 const station=(await app.inject('/api/v1/station')).json();
 assert.ok(station.capabilities.includes('temperature_all_years'));
});
test('invalid or partial source values stay labelled; duplicates fail closed',async t=>{
 const invalid=point('2025-01-01T23:00:00Z',7,250000);
 const good=point('2025-01-02T23:00:00Z',-3);
 const app=buildApp(reader([invalid,good]).result,clock);t.after(()=>app.close());
 const res=await app.inject('/api/v1/climate/temperature-years');
 assert.equal(res.statusCode,200,res.body);
 assert.equal(res.json().points[0].value,null);
 assert.equal(res.json().points[0].quality,'suspect');
 assert.equal(res.json().points[1].value,-3);
 const dupe=buildApp(reader([good,good]).result,clock);t.after(()=>dupe.close());
 assert.equal((await dupe.inject('/api/v1/climate/temperature-years')).statusCode,503);
});
test('temperature series refuses approved dataset and invalid units, never falls back',async t=>{
 const app=buildApp(reader().result,clock);t.after(()=>app.close());
 assert.equal((await app.inject('/api/v1/climate/temperature-years?dataset=approved')).statusCode,503);
 assert.equal((await app.inject('/api/v1/climate/temperature-years?units=us')).statusCode,400);
 assert.equal((await app.inject('/api/v1/climate/temperature-years?metric=rain')).statusCode,400);
 const missingReader=reader().result;delete missingReader.dailySummaries;
 const missing=buildApp(missingReader,clock);t.after(()=>missing.close());
 assert.equal((await missing.inject('/api/v1/climate/temperature-years')).statusCode,503);
});
test('daily source builder rejects timestamps away from local midnight',()=>{
 const row=point('2025-01-02T00:00:00Z',11);
 assert.throws(()=>buildTemperatureDays({
  rows:[row],from:0,until:sec('2025-01-05T00:00:00Z'),today:'2025-01-05',
  localDateAt:()=> '2025-01-02',
  localMidnight:()=> sec('2025-01-01T23:00:00Z'),
  convert:v=>v
 }),/boundary/i);
});
