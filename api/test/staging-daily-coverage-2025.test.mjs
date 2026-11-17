import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {calendarDays,dailyCoverage,localMidnight,sharedMissingDates} from '../scripts/daily-coverage-2025-lib.mjs';

const cal=calendarDays(2025);
const rows=()=>cal.entries.map(e=>({dateTime:e.dateTime,count:1,sumtime:300}));

test('Prague 2025 has exactly 365 local days; DST uses 23/25h',()=>{
 assert.equal(cal.days,365);
 assert.equal(cal.entries.length,365);
 assert.equal(new Date(localMidnight('2025-01-01')*1000).toISOString(),'2024-12-31T23:00:00.000Z');
 const day=(label)=>{
  const i=cal.entries.findIndex(e=>e.day===label);
  return (i+1===cal.entries.length?cal.end:cal.entries[i+1].dateTime)-cal.entries[i].dateTime;
 };
 assert.equal(day('2025-03-30'),23*3600);
 assert.equal(day('2025-10-26'),25*3600);
 assert.equal(day('2025-06-02'),24*3600);
 assert.throws(()=>localMidnight('2025-02-30'),/INVALID_DAY/);
});

test('report two absent summary dates without inventing zero-valued weather',()=>{
 const missing=['2025-04-12','2025-10-28']; // synthetic fixture, not observed data
 const r=dailyCoverage(rows().filter(row=>
  !missing.some(date=>row.dateTime===localMidnight(date))), 'outTemp',cal);
 assert.equal(r.expectedDays,365);
 assert.equal(r.returnedRows,363);
 assert.deepEqual(r.missingDates,missing);
 assert.deepEqual(r.zeroSampleDates,[]);
 assert.deepEqual(r.overCoveredDates,[]);
});

test('identical and different absent days are distinguished per metric',()=>{
 const no=(days,metric)=>dailyCoverage(rows().filter(row=>!days.includes(
  cal.entries.find(e=>e.dateTime===row.dateTime)?.day)),metric,cal);
 const results=[
  no(['2025-01-02','2025-03-01'],'outTemp'),
  no(['2025-01-02','2025-03-02'],'rain'),
  no(['2025-01-02'],'windSpeed')
 ];
 assert.deepEqual(sharedMissingDates(results),['2025-01-02']);
 assert.deepEqual(sharedMissingDates([]),[]);
});

test('present-but-empty days and overlapping >100% sumtime stay separate from missing',()=>{
 const input=rows();
 const spring=cal.entries.find(e=>e.day==='2025-03-30').dateTime;
 input[0]={...input[0],count:0};
 const idx=input.findIndex(e=>e.dateTime===spring);
 input[idx]={...input[idx],sumtime:86400};
 const r=dailyCoverage(input,'outTemp',cal);
 assert.deepEqual(r.missingDates,[]);
 assert.deepEqual(r.zeroSampleDates,['2025-01-01']);
 assert.deepEqual(r.overCoveredDates,[{date:'2025-03-30',excessSeconds:3600}]);
});

test('malformed, duplicate, unsorted or off-calendar rows fail closed',()=>{
 const valid=rows();
 for(const sample of [
  [valid[0],valid[0]],
  [valid[2],valid[1]],
  [{dateTime:valid[0].dateTime+60}],
  [{dateTime:cal.end}],
  [{dateTime:'nonsense'}],
  Array.from({length:367},()=>valid[0])
 ])assert.throws(()=>dailyCoverage(sample,'rain',cal),/INVALID_/);
});

test('operator CLI has staging guard and no writes or detailed measurements',async()=>{
 const url=new URL('../scripts/staging-daily-coverage-2025.mjs',import.meta.url);
 const body=await readFile(url,'utf8');
 assert.equal(spawnSync(process.execPath,['--check',url.pathname]).status,0);
 assert.match(body,/WEATHER_STAGING_ENABLED/);
 assert.match(body,/process\.argv\.length!==2/);
 assert.match(body,/reader\.dailySummaries/);
 assert.match(body,/original_unverified/);
 assert.doesNotMatch(body,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER)\s+(?:INTO|FROM|TABLE)\b/i);
 assert.doesNotMatch(body,/\.query\s*\(/);
});
