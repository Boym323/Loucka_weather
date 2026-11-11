import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,chmodSync,writeFileSync,readFileSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {RH_VERSION} from '../scripts/qc-humidity-lib.mjs';
import {TRIPLET_VERSION} from '../scripts/qc-rh-triplets-lib.mjs';
import {HOLDOUT_VERSION} from '../scripts/qc-rh-holdout-lib.mjs';
import {buildReadiness,readinessCsv}
 from '../scripts/qc-rh-readiness-lib.mjs';

const safe={databaseWrites:0,automaticApprovals:false,automaticCorrections:false};
const month=i=>'2022-'+String(i+1).padStart(2,'0');
function evidence(){
 const months=Array.from({length:12},(_,i)=>({
  month:month(i),days:new Date(Date.UTC(2022,i+1,0)).getUTCDate()
 }));
 const triageMonths=months.map((m,i)=>({
  ...m,rhNullSlots:i===11?0:100,rhMeasuredSlots:500,
  originalAbsentSlots:i===11?3:4,
  bothReferenceSlots:i===11?0:90,
  agreeWithin10Slots:i===2?40:i===11?0:85
 }));
 const triage={schemaVersion:'1',qcVersion:RH_VERSION,
  status:'screening_only',processedDays:365,
  months:triageMonths,totals:{
   nullRhSlots:1100,originalAbsentSlots:47,
   bothReferenceSlots:990,agreeWithin10Slots:890
  },safety:safe};
 const tripletMonths=months.map(m=>({...m,processedDays:m.days,pairs:2000}));
 const triplets={schemaVersion:'1',tripletVersion:TRIPLET_VERSION,
  status:'screening_only',analyzedDays:365,complete:true,
  overall:{pairs:24000},months:tripletMonths,safety:safe};
 const holdoutMonths=months.map((m,i)=>{
  const validatedDays=(i===0||i===1||i===2)?0:10;
  const validatedTriplets=validatedDays?1000:0;
  const rawWuMae=validatedDays?5:null,correctedWuMae=validatedDays?
   i===3?5.3:i===4?3:5:null;
  return {...m,validatedDays,validatedTriplets,
   rawWuMae,correctedWuMae,
   rawLuhaMae:validatedDays?7:null,
   correctedLuhaMae:validatedDays?6:null,
   wuCalibrationGain:validatedDays?Math.round((rawWuMae-correctedWuMae)*1000)/1000:null,
   evaluationStatus:validatedDays?'holdout_evidence_for_review':
    'insufficient_holdout_evidence'};
 });
 const holdout={schemaVersion:'1',version:HOLDOUT_VERSION,
  status:'screening_only',complete:true,analyzedDays:365,
  holdoutMethod:'same-month leave-one-day-out with +/-3-day purge',
  trainingMinimum:{distinctDays:7,pairedTriplets:500},
  testMinimumTripletsPerDay:24,
  months:holdoutMonths,overall:{
   testedDays:90,testedTriplets:9000,
   rawWuMae:5,correctedWuMae:4.9,rawLuhaMae:7,correctedLuhaMae:6
  },safety:{...safe,proposedReconstruction:false}};
 return {triage,triplets,holdout};
}
test('monthly readiness flags missing calibration, conflicting references, worsening offsets and empty RH',()=>{
 const result=buildReadiness(evidence());
 assert.equal(result.months.length,12);
 assert.equal(result.months[0].evidenceStatus,'blocked_no_local_validation');
 assert.equal(result.months[1].evidenceStatus,'blocked_no_local_validation');
 assert.equal(result.months[2].evidenceStatus,'blocked_no_local_validation');
 assert.equal(result.months[3].evidenceStatus,'hold_offset_worsens_validation');
 assert.equal(result.months[4].evidenceStatus,'blocked_reference_disagreement');
 assert.equal(result.months[11].evidenceStatus,'no_null_rh');
 assert.equal(result.months.every(m=>m.estimatedReplacementRhPct===null&&
  m.automaticWriteAllowed===false),true);
 assert.equal(result.safety.proposedReconstruction,false);
 assert.equal(result.totals.nullRhSlots,1100);
 assert.equal(result.totals.triplets,24000);
 const csv=readinessCsv(result);
 assert.equal(csv.split('\r\n').length,14);
 assert.match(csv,/blocked_no_local_validation/);
 assert.match(csv,/no_null_rh/);
});
test('unsupported methods, unsafe approvals and inconsistent evidence fail closed',()=>{
 let e=evidence();e.holdout.safety.automaticApprovals=true;
 assert.throws(()=>buildReadiness(e),/unsafe/);
 e=evidence();e.triage.months[3].agreeWithin10Slots=96;
 assert.throws(()=>buildReadiness(e),/Impossible/);
 e=evidence();e.holdout.months[3].validatedTriplets=2100;
 assert.throws(()=>buildReadiness(e),/Impossible/);
 e=evidence();e.holdout.months[3].correctedWuMae=null;
 assert.throws(()=>buildReadiness(e),/Missing RH/);
 e=evidence();e.holdout.months[3].wuCalibrationGain=-1;
 assert.throws(()=>buildReadiness(e),/does not reconcile/);
 e=evidence();e.triplets.overall.pairs--;
 assert.throws(()=>buildReadiness(e),/Monthly totals inconsistent/);
 e=evidence();e.holdout.holdoutMethod='future-data-leakage';
 assert.throws(()=>buildReadiness(e),/unsupported/);
});
test('offline readiness CLI consumes exactly 3 private files, emits private JSON and CSV',t=>{
 const dir=mkdtempSync(join(tmpdir(),'loucka-rh-readiness-'));
 chmodSync(dir,0o700);
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const e=evidence();
 const input={triage:'qc-rh-2022-triage.json',
   triplets:'qc-rh-2022-triplets-summary.json',
   holdout:'qc-rh-2022-holdout-summary.json'};
 const args=['scripts/qc-rh-readiness.mjs','--reports-dir',dir];
 const run=()=>spawnSync(process.execPath,args,{
  cwd:process.cwd(),env:{},encoding:'utf8',timeout:15000});
 assert.notEqual(run().status,0);
 for(const [key,name] of Object.entries(input))
  writeFileSync(join(dir,name),JSON.stringify(e[key]),{mode:0o600,flag:'wx'});
 const ok=run();
 assert.equal(ok.status,0,ok.stderr);
 const result=JSON.parse(ok.stdout);
 assert.equal(result.complete,true);
 assert.equal(result.totals.nullRhSlots,1100);
 assert.equal(result.safety.databaseWrites,0);
 assert.equal(result.monthStatuses['2022-12'],'no_null_rh');
 for(const name of ['qc-rh-2022-readiness.json','qc-rh-2022-readiness.csv'])
  assert.equal(statSync(join(dir,name)).mode&0o777,0o600);
 assert.equal(run().status,0); // reproducible derived outputs
 chmodSync(dir,0o755);
 assert.notEqual(run().status,0);
});
test('CLI and pure evidence gate JavaScript parse safely',()=>{
 for(const p of ['scripts/qc-rh-readiness.mjs','scripts/qc-rh-readiness-lib.mjs']){
  const r=spawnSync(process.execPath,['--check',p],{
   cwd:process.cwd(),encoding:'utf8',timeout:10000});
  assert.equal(r.status,0,r.stderr);
 }
});
