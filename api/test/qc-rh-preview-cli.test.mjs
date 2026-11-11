import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,chmodSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {buildPreviewManifest,EXPECTED} from '../scripts/rh-preview-transfer-lib.mjs';
const run=(script,args,env={})=>spawnSync(process.execPath,[script,...args],{
 cwd:process.cwd(),env:{PATH:process.env.PATH,HOME:process.env.HOME,...env},
 encoding:'utf8',timeout:20000
});
function fixture(t){
 const base=mkdtempSync(join(tmpdir(),'loucka-preview-transfer-'));
 t.after(()=>rmSync(base,{recursive:true,force:true}));
 const dir=join(base,'private');
 mkdirSync(dir);chmodSync(dir,0o700);
 const rows=[];
 for(let i=0;i<EXPECTED.total;i++){
  const category=i<EXPECTED.estimated?'estimated':
   i<EXPECTED.estimated+EXPECTED.frozen_adjusted?'frozen_adjusted':'invalidated';
  const old=category==='estimated'?null:category==='invalidated'?89:75,
    next=category==='estimated'?65:category==='invalidated'?null:60;
  rows.push({target_time:1640995200+(i+1)*300,variable:'outHumidity',
   state:'applied',old_value:old,new_value:next,
   originalRh:old,reconstructionRh:next,
   originalTemp:12,reconstructionTemp:12,originalUnits:16,reconstructionUnits:16,
   batch_key:'ci-synthetic',reason:'ESTIMATED_EXTERNAL v1'});
 }
 const manifest=buildPreviewManifest(rows);
 const filename=join(dir,'qc-rh-preview-'+manifest.versionId+'.json');
 writeFileSync(filename,JSON.stringify(manifest),{mode:0o600});
 return {dir,filename,manifest};
}
test('read-only export dry run needs no SQL credentials and cannot mutate archive',t=>{
 const {dir}=fixture(t);
 const result=run('scripts/rh-preview-export.mjs',
  ['--dry-run','--reports-dir',dir]);
 assert.equal(result.status,0,result.stderr);
 assert.equal(JSON.parse(result.stdout).databaseWrites,0);
 assert.equal(JSON.parse(result.stdout).expected,5153);
 const secret=run('scripts/rh-preview-export.mjs',
  ['--export','--reports-dir',dir]);
 assert.notEqual(secret.status,0);
});
test('import dry run verifies 5153 SHA256 points, never opens SQL',t=>{
 const f=fixture(t);
 const args=['--manifest',f.filename];
 const result=run('scripts/rh-preview-import.mjs',['--dry-run',...args]);
 assert.equal(result.status,0,result.stderr);
 const output=JSON.parse(result.stdout);
 assert.equal(output.databaseWrites,0);
 assert.equal(output.totals.total,5153);
 assert.equal(output.imported,false);
 assert.equal(output.approved,false);
 const noEnv=run('scripts/rh-preview-import.mjs',
  ['--import',...args,'--ack-unapproved-dev-only']);
 assert.notEqual(noEnv.status,0);
 const invalidFlag=run('scripts/rh-preview-import.mjs',
  ['--import',...args]);
 assert.notEqual(invalidFlag.status,0);
 const badChecksum=JSON.parse(readFileSync(f.filename,'utf8'));
 badChecksum.rows[0].previewRh=1;
 writeFileSync(f.filename,JSON.stringify(badChecksum));
 assert.notEqual(run('scripts/rh-preview-import.mjs',['--dry-run',...args]).status,0);
});
test('import refuses unsafe output paths and loose permissions',t=>{
 const f=fixture(t);
 chmodSync(f.filename,0o644);
 assert.notEqual(run('scripts/rh-preview-import.mjs',
  ['--dry-run','--manifest',f.filename]).status,0);
 chmodSync(f.filename,0o600);
 chmodSync(f.dir,0o755);
 assert.notEqual(run('scripts/rh-preview-import.mjs',
  ['--dry-run','--manifest',f.filename]).status,0);
});
test('bounded SQL schema migration is dev-only, not automatically executed',()=>{
 const ddl=readFileSync(new URL('../scripts/rh-preview-dev-migration.sql',import.meta.url),'utf8');
 const sql=ddl.split('\n').filter(line=>!/^\s*--/.test(line)).join('\n');
 assert.equal((sql.match(/CREATE TABLE/g)||[]).length,2);
 assert.equal((sql.match(/\`loucka_dev_preview\`/g)||[]).length>=3,true);
 assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE|DROP|CREATE DATABASE|TRUNCATE)\s+/i);
 assert.match(sql,/experimental_unapproved/);
});
test('both transfer CLIs are valid Node ESM',()=>{
 for(const file of ['scripts/rh-preview-export.mjs','scripts/rh-preview-import.mjs']){
  const c=spawnSync(process.execPath,['--check',file],{
   cwd:process.cwd(),encoding:'utf8',timeout:10000});
  assert.equal(c.status,0,c.stderr);
 }
});
