import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(
 new URL('../../deploy/lxc/qc-july-2026-interval-overlap-locations-readonly.sql',import.meta.url),
 'utf8'
);
const withoutComments=source.replace(/^--.*$/gm,'').trim();

test('both statements are bounded SELECT-only CTE queries',()=>{
 const commands=withoutComments.split(';').map(x=>x.trim()).filter(Boolean);
 assert.equal(commands.length,2);
 for(const sql of commands){
  assert.match(sql,/^WITH days AS \(/);
  assert.match(sql,/\bSELECT\b/);
  assert.match(sql,/a\.dateTime>d\.day_start AND a\.dateTime<=d\.day_end/);
  assert.match(sql,/a\.outTemp IS NOT NULL/);
  assert.match(sql,/a\.`interval` BETWEEN 1 AND 120/);
  assert.match(sql,/MAX\(clip_end\) OVER/);
  assert.match(sql,/ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING/);
  assert.match(sql,/GREATEST\(d\.day_start,a\.dateTime-a\.`interval`\*60\)/);
  assert.match(sql,/LEAST\(d\.day_end,a\.dateTime\)/);
  assert.doesNotMatch(sql,/\b(UPDATE|INSERT|DELETE|REPLACE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|LOAD)\b/i);
  assert.doesNotMatch(sql,/\bINTO\s+OUTFILE\b/i);
 }
 assert.doesNotMatch(withoutComments,/`loucka_reconstruction`/i);
});

test('time bounds are two distinct 24h local summer days (UTC+2)',()=>{
 const a=Date.parse('2026-07-25T00:00:00+02:00')/1000;
 const b=Date.parse('2026-07-26T00:00:00+02:00')/1000;
 const c=Date.parse('2026-07-27T00:00:00+02:00')/1000;
 assert.equal(a,1784930400);
 assert.equal(b,1785016800);
 assert.equal(c,1785103200);
 assert.equal(b-a,86400);
 assert.equal(c-b,86400);
 assert.equal((withoutComments.match(/'2026-07-25' AS local_day,1784930400 AS day_start,1785016800 AS day_end/g)||[]).length,2);
 assert.equal((withoutComments.match(/'2026-07-26',1785016800,1785103200/g)||[]).length,2);
});

test('unique-time logic distinguishes overlapping records from uncovered gaps',()=>{
 function analyze(intervals,begin=0,end=86400){
  let priorEnd=begin,naive=0,duplicates=0,gaps=0;
  for(const [start,stop] of [...intervals].sort((a,b)=>a[0]-b[0]||a[1]-b[1])){
   const s=Math.max(begin,start),e=Math.min(end,stop);
   const newly=Math.max(0,e-Math.max(s,priorEnd));
   naive+=e-s;
   duplicates+=e-s-newly;
   gaps+=Math.max(0,s-priorEnd);
   priorEnd=Math.max(priorEnd,e);
  }
  gaps+=Math.max(0,end-priorEnd);
  return {naive,duplicates,gaps,unique:naive-duplicates};
 }
 assert.deepEqual(analyze([[0,300],[240,540],[600,900]],0,900),
  {naive:900,duplicates:60,gaps:60,unique:840});
 assert.deepEqual(analyze([[0,300],[0,300],[300,600]],0,600),
  {naive:900,duplicates:300,gaps:0,unique:600});
 assert.deepEqual(analyze([[60,120],[100,150]],0,180),
  {naive:110,duplicates:20,gaps:90,unique:90});
});
