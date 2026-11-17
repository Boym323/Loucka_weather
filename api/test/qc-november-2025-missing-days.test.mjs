import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const path=new URL('../../deploy/lxc/qc-november-2025-missing-days-readonly.sql',import.meta.url);
const source=await readFile(path,'utf8');
const sql=source.replace(/^--.*$/gm,'').trim();
const dayEpoch=day=>Math.floor(Date.parse(day+'T00:00:00+01:00')/1000);

test('exactly six bounded Europe/Prague windows (November, UTC+01)',()=>{
 const dates=['2025-11-05','2025-11-06','2025-11-07',
              '2025-11-27','2025-11-28','2025-11-29'];
 for(const d of dates){
  const start=dayEpoch(d);
  const next=new Date(Date.parse(d+'T00:00:00Z')+86400000)
   .toISOString().slice(0,10);
  const end=dayEpoch(next);
  assert.equal(end-start,86400);
  assert.ok(source.includes("'"+d+"' AS local_day, "+start+
   " AS left_exclusive, "+end+" AS right_inclusive"));
 }
 for(const d of ['2025-11-06','2025-11-28']){
  assert.ok(source.includes("'"+d+"' AS local_day, "+dayEpoch(d)+
   ' AS left_exclusive'));
 }
});

test('only SELECT/CTE statements, no mutation or grant',()=>{
 const statements=sql.split(';').map(x=>x.trim()).filter(Boolean);
 assert.equal(statements.length,3);
 assert.ok(statements.every(x=>x.startsWith('WITH ')));
 assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|REPLACE|GRANT|REVOKE|LOAD)\b/i);
 assert.doesNotMatch(sql,/\bINTO\s+OUTFILE\b/i);
 assert.match(sql,/LEFT JOIN `pocasi-loucka.eu`\.`archive`/);
 assert.match(sql,/MAX\(clip_end\) OVER/);
 assert.match(sql,/duplicate_seconds/);
});

test('only original summary tables and original archive are referenced',()=>{
 for(const name of ['archive_day_outTemp','archive_day_rain',
  'archive_day_wind','archive_day_windGust','archive']){
  assert.ok(sql.includes('`pocasi-loucka.eu`.`'+name+'`'));
 }
 assert.doesNotMatch(sql,/\bloucka_reconstruction\b/i);
 assert.doesNotMatch(sql,/\b(?:mysql|information_schema)\b/i);
});
