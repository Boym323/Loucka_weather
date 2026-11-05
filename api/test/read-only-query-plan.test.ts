import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../../scripts/read-only-query-plan.mjs',import.meta.url));

test('query-plan audit refuses to run when staging is not explicitly enabled',()=>{
 const check=spawnSync(process.execPath,[script],{
  env:{PATH:process.env.PATH??'/usr/bin:/bin'},
  encoding:'utf8',timeout:5000
 });
 assert.equal(check.status,1,check.stderr);
 assert.equal(check.stdout,'');
 assert.match(check.stderr,/SQL audit did not finish/);
 assert.doesNotMatch(check.stderr,/password|WEATHER_DB_PASSWORD|SELECT [^)]*FROM/i);
});

test('query-plan audit rejects unsafe schema before trying the database',()=>{
 const check=spawnSync(process.execPath,[script],{
  env:{PATH:process.env.PATH??'/usr/bin:/bin',WEATHER_STAGING_ENABLED:'YES',
   WEATHER_DB_SCHEMA:'invalid`schema'},
  encoding:'utf8',timeout:5000
 });
 assert.equal(check.status,1,check.stderr);
 assert.equal(check.stdout,'');
 assert.match(check.stderr,/SQL audit did not finish/);
});
