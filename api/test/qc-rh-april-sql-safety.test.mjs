import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const file=new URL('../scripts/qc-rh-april-2022-stage-audit.sql',import.meta.url);

test('all reproducibility statements are SELECT/CTE only with immutable source archive',()=>{
 const raw=readFileSync(file,'utf8');
 const clean=raw.split('\n').filter(line=>!/^\s*--/.test(line)).join('\n');
 const statements=clean.split(';').map(v=>v.trim()).filter(Boolean);
 assert.equal(statements.length,4);
 for(const statement of statements){
  assert.match(statement,/^(?:SELECT|WITH)\s/i);
  assert.doesNotMatch(statement,/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|REPLACE|CALL|GRANT|REVOKE)\s/i);
  assert.match(statement,/\`loucka_reconstruction\`\.\`reconstruction_humidity_202204\`/);
 }
 assert.match(statements[0],/\`pocasi-loucka\.eu\`\.\`archive\`/);
 assert.match(statements[0],/ON o\.dateTime=s\.target_time/);
 assert.match(statements[2],/FLOOR\(s\.target_time\/86400\)/);
 assert.doesNotMatch(statements[2],/FROM_UNIXTIME/i);
 assert.match(statements[3],/LAG\(target_time\)/);
});
test('no SQL script executes during a Node test; only the pure classifier is loaded',()=>{
 const res=spawnSync(process.execPath,['--check','scripts/qc-rh-april-stage-risk-lib.mjs'],
  {cwd:process.cwd(),encoding:'utf8',timeout:10000});
 assert.equal(res.status,0,res.stderr);
});
