import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildApp} from '../src/app.js';
import {consolidateAnnualSummaries} from '../src/climate-consolidation.js';
import type {ArchiveReader,DailySummaryRow} from '../src/store.js';

const now=()=>new Date('2026-11-03T12:00:00Z');
const day=(date:string)=>Math.floor(Date.parse(date)/1000);
const row=(date:string,mean:number,seconds=86400):DailySummaryRow=>({
 dateTime:day(date),usUnits:16, count:seconds/300, sumtime:seconds,
 wsum:mean*seconds,sum:mean, min:null,max:null,mintime:null,maxtime:null
});
const observed:DailySummaryRow[]=[
 row('2024-02-28T23:00:00Z',5),
 row('2025-01-01T23:00:00Z',10),
 row('2025-01-02T23:00:00Z',30,43200)
];
function reader(rows:DailySummaryRow[]=observed){
 let calls=0;
 const r:ArchiveReader={
  latest:async()=>null,history:async()=>[],ping:async()=>{},
  dailySummaries:async()=>{calls++;return rows;}
 };
 return {r,count:()=>calls};
}
test('all years through current partial year, weighted °C and ETag cache',async t=>{
 const fake=reader();
 const app=buildApp(fake.r,now);t.after(()=>app.close());
 const response=await app.inject('/api/v1/climate/annual-matrix?metric=outTemp');
 assert.equal(response.statusCode,200,response.body);
 const body=response.json();
 assert.equal(body.schemaVersion,'1');
 assert.equal(body.qcStatus,'original_unverified');
 assert.equal(body.dataset,'original');
 assert.equal(body.years.length,18);
 assert.equal(body.years[0].year,2009);
 assert.equal(body.years[0].value,null);
 assert.equal(body.years.find((y:any)=>y.year===2024).calendarDays,366);
 const y2025=body.years.find((y:any)=>y.year===2025);
 assert.equal(y2025.validDays,2);
 assert.equal(y2025.sourceRows,2);
 assert.equal(y2025.missingDays,363);
 assert.ok(Math.abs(y2025.value-16.6666666667)<0.0001);
 assert.ok(Math.abs(y2025.timeCoverageFraction-1.5/365)<.00001);
 assert.equal(body.years.at(-1).year,2026);
 assert.equal(body.years.at(-1).periodStatus,'in_progress');
 assert.equal(body.years.at(-1).value,null);
 assert.equal(body.endsBefore,'2026-11-03');
 assert.equal(fake.count(),1);
 assert.equal((await app.inject('/api/v1/climate/annual-matrix?metric=outTemp')).statusCode,200);
 assert.equal(fake.count(),1,'second request should hit the per-metric cache');
 const notModified=await app.inject({url:'/api/v1/climate/annual-matrix?metric=outTemp',
  headers:{'if-none-match':String(response.headers.etag)}});
 assert.equal(notModified.statusCode,304);
 assert.equal(fake.count(),1);
 const cap=(await app.inject('/api/v1/station')).json();
 assert.ok(cap.capabilities.includes('annual_consolidation'));
});
test('zero rain stays zero, source metric=METRIC cm becomes metricwx mm',async t=>{
 const zero=row('2025-01-01T23:00:00Z',0);zero.sum=0;
 const wet=row('2025-01-02T23:00:00Z',0);wet.sum=1.25;
 const fake=reader([zero,wet]);const app=buildApp(fake.r,now);t.after(()=>app.close());
 const response=await app.inject('/api/v1/climate/annual-matrix?metric=rain');
 assert.equal(response.statusCode,200,response.body);
 const y=response.json().years.find((e:any)=>e.year===2025);
 assert.equal(y.validDays,2);assert.equal(y.value,12.5);
 assert.equal(y.unit,'mm');assert.equal(y.method,'sum');
});
test('invalid and duplicate daily evidence fail closed, no invented annual 0',async t=>{
 const bad=[row('2025-01-01T23:00:00Z',10,200000),row('2025-01-02T23:00:00Z',9)];
 const app=buildApp(reader(bad).r,now);t.after(()=>app.close());
 const response=await app.inject('/api/v1/climate/annual-matrix?metric=outTemp');
 assert.equal(response.statusCode,200,response.body);
 const y=response.json().years.find((e:any)=>e.year===2025);
 assert.equal(y.invalidDays,1);
 assert.equal(y.validDays,1);
 assert.equal(y.value,9);
 const duplicate=buildApp(reader([bad[1],bad[1]]).r,now);t.after(()=>duplicate.close());
 assert.equal((await duplicate.inject('/api/v1/climate/annual-matrix?metric=outTemp')).statusCode,503);
});
test('unsupported metrics, approved data and absent summary reader fail closed',async t=>{
 const app=buildApp(reader().r,now);t.after(()=>app.close());
 assert.equal((await app.inject('/api/v1/climate/annual-matrix?metric=__sql')).statusCode,400);
 assert.equal((await app.inject('/api/v1/climate/annual-matrix?metric=windDir')).statusCode,422);
 assert.equal((await app.inject('/api/v1/climate/annual-matrix?metric=outTemp&dataset=approved')).statusCode,503);
 assert.equal((await app.inject('/api/v1/climate/annual-matrix?metric=rain&bad=1')).statusCode,400);
 const noDaily=reader().r;delete noDaily.dailySummaries;
 const missing=buildApp(noDaily,now);t.after(()=>missing.close());
 assert.equal((await missing.inject('/api/v1/climate/annual-matrix?metric=outTemp')).statusCode,503);
});
test('reconciliation engine rejects daily timestamps not at Prague midnight',()=>{
 const bad=row('2025-01-02T00:00:00Z',8);
 assert.throws(()=>consolidateAnnualSummaries({
  rows:[bad],startYear:2025,currentDate:'2025-01-05',aggregation:'mean',unit:'°C',
  localDateAt:()=> '2025-01-02',localMidnight:()=>day('2025-01-01T23:00:00Z'),
  aggregate:()=>({value:8,valid:1,unit:'°C'})
 }),/midnight/i);
});
