import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {safeDriverError,countValidDailyRows} from '../scripts/climate-db-probe-lib.mjs';

test('sanitize MariaDB errors without leaking query / credentials',()=>{
 const result=safeDriverError({
  code:'ER_TABLEACCESS_DENIED_ERROR',errno:1142,sqlState:'42000',
  message:'SECRET SQL with password',sql:'SELECT private'
 });
 assert.deepEqual(result,{code:'ER_TABLEACCESS_DENIED_ERROR',errno:1142,sqlState:'42000'});
 assert.equal(JSON.stringify(result).includes('SECRET'),false);
 assert.deepEqual(safeDriverError({code:'bad\nsecret',errno:-3,sqlState:'A'}),{
  code:'UNKNOWN',errno:null,sqlState:null
 });
});

test('reject invalid, unsorted or too many daily rows',()=>{
 const start=1735686000,end=1767222000;
 assert.equal(countValidDailyRows([{dateTime:start},{dateTime:start+86400}],start,end,367),2);
 for(const rows of [
  [{dateTime:start},{dateTime:start}],
  [{dateTime:start+86400},{dateTime:start}],
  [{dateTime:start-1}],
  [{dateTime:end}],
  [{dateTime:'not-an-epoch'}],
  [{dateTime:start}, {dateTime:start+86400}]
 ]){
  const cap=rows.length>1&&rows[0]?.dateTime===start&&rows[1]?.dateTime===start+86400?1:367;
  assert.throws(()=>countValidDailyRows(rows,start,end,cap),/INVALID_RESULT/);
 }
});

test('staging probe is syntactically valid and bounded, read-only',async()=>{
 const f=new URL('../scripts/staging-climate-db-probe.mjs',import.meta.url);
 const source=await readFile(f,'utf8');
 assert.equal(spawnSync(process.execPath,['--check',f.pathname]).status,0);
 for(const name of ['outTemp','rain','windSpeed'])assert.ok(source.includes(name));
 assert.match(source,/WEATHER_STAGING_ENABLED/);
 assert.match(source,/process\.argv\.length!==2/);
 assert.match(source,/readOnly:true/);
 assert.match(source,/originalArchiveUntouched:true/);
 assert.match(source,/maxRows=367/);
 assert.doesNotMatch(source,/\bpool\.query\s*\(/);
 assert.doesNotMatch(source,/\b(INSERT|UPDATE|DELETE|DROP|ALTER)\s+TABLE\b/i);
 assert.doesNotMatch(source,/console\.log\(error\)/);
});
