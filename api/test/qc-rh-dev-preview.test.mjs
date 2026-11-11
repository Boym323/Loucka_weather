import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildRhPreviewPackage,previewPackageDigest,PREVIEW_VERSION}
 from '../scripts/qc-rh-dev-preview-lib.mjs';

const epoch=Date.parse('2022-04-26T00:00:00Z')/1000;
function sample(n,{old=null,newRh=64,source='LuhaMet_and_ILOUKA4'}={}){
 const t=epoch+n*300;
 return {id:n+1,target_time:t,variable:'outHumidity',
  old_value:old,new_value:newRh,
  original_rh:old,reconstruction_rh:newRh,
  original_time:t,reconstruction_time:t,
  source_database:source,batch_key:'qc-old-test-batch',
  state:'applied'};
}
const expected={rows:3,missingToEstimate:1,measuredToEstimate:1,invalidated:1};
test('dev preview only contains historically applied and fully reconciled changes',()=>{
 const data=[sample(0),sample(1,{old:89,newRh:75}),sample(2,{old:75,newRh:null})];
 const p=buildRhPreviewPackage(data,{allowSynthetic:true,expected});
 assert.equal(p.packageVersion,PREVIEW_VERSION);
 assert.deepEqual(p.counts,{records:3,
  missingToEstimate:1,measuredToEstimate:1,invalidated:1});
 assert.deepEqual(p.records.map(x=>x.category),[
  'historical_estimate_from_missing',
  'historical_estimate_replacing_suspect_original',
  'historical_invalidation'
 ]);
 assert.equal(p.records.every(x=>x.approved===false&&x.accuracyValidated===false),true);
 assert.equal(p.safety.databaseWrites,0);
 assert.equal(p.safety.liveDevPublishing,false);
 assert.match(p.recordsSha256,/^[a-f0-9]{64}$/);
 assert.equal(previewPackageDigest(p),createHash('sha256').update(JSON.stringify(p)).digest('hex'));
 assert.equal(buildRhPreviewPackage([...data].reverse(),{allowSynthetic:true,expected}).recordsSha256,p.recordsSha256);
});
test('modified source or reconstruction, and invalid staging, fail closed',()=>{
 const s=sample(0);
 const invalids=[
  {...s,original_rh:75},
  {...s,reconstruction_rh:80},
  {...s,original_time:null},
  {...s,reconstruction_time:null},
  {...s,state:'prepared'},
  {...s,variable:'outTemp'},
  {...s,target_time:s.target_time+1},
  {...s,target_time:Date.parse('2023-01-01T00:00:00Z')/1000},
  {...s,batch_key:''},
  {...s,source_database:''},
  {...s,new_value:108,reconstruction_rh:108},
  {...s,old_value:75,original_rh:75,new_value:75,reconstruction_rh:75},
 ];
 for(const row of invalids)assert.throws(()=>buildRhPreviewPackage([row],{
  allowSynthetic:true,expected:{rows:1,missingToEstimate:1,measuredToEstimate:0,invalidated:0}
 }),/lineage|recognized/i);
});
test('duplicate target slots, audit IDs and incomplete years fail closed',()=>{
 const s=sample(0),t=sample(1);
 assert.throws(()=>buildRhPreviewPackage([s,s],{
  allowSynthetic:true,expected:{rows:2,missingToEstimate:2,measuredToEstimate:0,invalidated:0}
 }),/Duplicate/);
 assert.throws(()=>buildRhPreviewPackage([s,{...t,id:s.id}],{
  allowSynthetic:true,expected:{rows:2,missingToEstimate:2,measuredToEstimate:0,invalidated:0}
 }),/Duplicate/);
 assert.throws(()=>buildRhPreviewPackage([s]),/Incomplete/);
 assert.throws(()=>buildRhPreviewPackage([s],{
  allowSynthetic:true,expected:{rows:2,missingToEstimate:1,measuredToEstimate:0,invalidated:0}
 }),/Unexpected synthetic/);
});
test('CLI dry-run has no database configuration or side effects',t=>{
 const dir=mkdtempSync(join(tmpdir(),'rh-dev-preview-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const output=join(dir,'qc');mkdirSync(output);chmodSync(output,0o700);
 const run=(args)=>spawnSync(process.execPath,
  ['scripts/qc-rh-dev-preview-export.mjs','--reports-dir',output,...args],
  {cwd:process.cwd(),env:{},encoding:'utf8',timeout:15000});
 const ok=run(['--dry-run']);
 assert.equal(ok.status,0,ok.stderr);
 assert.equal(JSON.parse(ok.stdout).databaseWrites,0);
 assert.equal(JSON.parse(ok.stdout).devPublishing,false);
 assert.notEqual(run(['--export']).status,0);
 assert.notEqual(run(['--dry-run','--export']).status,0);
 chmodSync(output,0o755);
 assert.notEqual(run(['--dry-run']).status,0);
});
test('read-only SQL is bounded and syntax valid',()=>{
 const src=readFileSync(new URL('../scripts/qc-rh-dev-preview-export.mjs',import.meta.url),'utf8');
 assert.match(src,/LIMIT 5154/);
 assert.match(src,/reconstruction_changes/);
 assert.match(src,/original_rh/);
 assert.match(src,/reconstruction_rh/);
 assert.match(src,/SHOW GRANTS/);
 assert.match(src,/READ ONLY/);
 const r=spawnSync(process.execPath,['--check','scripts/qc-rh-dev-preview-export.mjs'],
  {cwd:process.cwd(),encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stderr);
});
