import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,chmodSync,writeFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildRhDay,dateRange} from '../scripts/qc-humidity-lib.mjs';
import {buildCommonDay} from '../scripts/qc-rh-triplets-lib.mjs';
import {buildHoldoutDay,validateHoldoutDay,evaluateHoldoutYear}
 from '../scripts/qc-rh-holdout-lib.mjs';

function make(day,withData=true){
 const start=Date.parse(day+'T00:00:00Z')/1000;
 const own=withData?Array.from({length:288},(_,i)=>({
  dateTime:start+i*300,outHumidity:55+(i%5)})):[];
 const ref=(station,shift,offset)=>own.map(x=>({
  station_id:station,observed_at_utc:x.dateTime+shift,
  relative_humidity_pct:x.outHumidity+offset,quality_status:'reference_only'}));
 const references={
  luhamet_sehradice:ref('luhamet_sehradice',0,5),
  wu_ilouka4:ref('wu_ilouka4',-8,2)};
 const baseline=buildRhDay({day,original:own,references});
 const triplet=buildCommonDay({day,original:own,references,baseline});
 return {day,original:own,references,baseline,triplet};
}
test('same-slot daily holdout evidence reconciles original immutable QC evidence',()=>{
 const i=make('2022-04-15'),r=buildHoldoutDay(i);
 assert.equal(r.samples.length,288);
 assert.equal(r.samples[0].t%300,0);
 assert.equal(r.samples[0].o-r.samples[0].w,-2);
 assert.equal(r.stats.triplets,i.triplet.sameSlotTriplets.pairs);
 assert.equal(r.safety.replacementRhPct,null);
 assert.equal(validateHoldoutDay(r,i.day,i.baseline,i.triplet),r);
});
test('immutable daily source mismatch and unsafe proposals fail closed',()=>{
 const i=make('2022-04-15'),good=buildHoldoutDay(i);
 const changed=structuredClone(i);
 changed.original[0].outHumidity=10;
 assert.throws(()=>buildHoldoutDay(changed),/RH evidence changed/);
 const broken=structuredClone(good);broken.samples[0].o=99;
 assert.throws(()=>validateHoldoutDay(broken,i.day,i.baseline,i.triplet),
  /inconsistent held-out RH evidence/);
 const unsafe=structuredClone(good);unsafe.safety.replacementRhPct=60;
 assert.throws(()=>validateHoldoutDay(unsafe,i.day,i.baseline,i.triplet),
  /Unsafe or inconsistent/);
});
test('blocked leave-day-out never uses the same day or +/-3 days for training',()=>{
 const reports=dateRange().map(day=>{
  const i=make(day,day.startsWith('2022-04'));
  return buildHoldoutDay(i);
 });
 const out=evaluateHoldoutYear(reports),april=out.months[3];
 assert.equal(out.complete,true);
 assert.equal(april.validatedDays,30);
 assert.equal(april.validatedTriplets,30*288);
 assert.equal(april.rawLuhaMae,5);
 assert.equal(april.rawWuMae,2);
 assert.equal(april.correctedLuhaMae,0);
 assert.equal(april.correctedWuMae,0);
 assert.equal(april.wuCalibrationGain,2);
 assert.equal(out.months[1].validatedTriplets,0);
 assert.equal(out.months[1].correctedWuMae,null);
 const mid=out.daily.find(x=>x.day==='2022-04-15');
 assert.equal(mid.purgeDays,3);
 assert.equal(mid.trainingDays,23);
 assert.equal(mid.trainingTriplets,23*288);
 assert.equal(mid.estimatedOffsetsForValidationOnly.wu,-2);
 assert.equal(mid.estimatedOffsetsForValidationOnly.luha,-5);
 assert.equal(out.safety.proposedReconstruction,false);
 assert.throws(()=>evaluateHoldoutYear(reports.slice(1)),/365/);
 const repeated=[...reports];repeated[0]=repeated[1];
 assert.throws(()=>evaluateHoldoutYear(repeated),/Duplicate/);
});
test('partial month or less than 24 test triplets is flagged, not scored',()=>{
 const rows=dateRange().map(day=>{
  const i=make(day,day==='2022-04-15');
  return buildHoldoutDay(i);
 });
 const out=evaluateHoldoutYear(rows);
 assert.equal(out.months[3].validatedDays,0);
 assert.equal(out.months[3].rawWuMae,null);
 assert.equal(out.daily.find(x=>x.day==='2022-04-15').reason,
   'insufficient_purged_training');
});
test('CLI dry-run cannot silently skip any of the 365 original or triplet days',t=>{
 const dir=mkdtempSync(join(tmpdir(),'loucka-holdout-test-'));
 chmodSync(dir,0o700);
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const args=['scripts/qc-rh-holdout.mjs','--reports-dir',dir,'--dry-run'];
 const cmd=()=>spawnSync(process.execPath,args,{cwd:process.cwd(),env:{},
   encoding:'utf8',timeout:15000});
 assert.notEqual(cmd().status,0);
 for(const day of dateRange()){
  const i=make(day,false);
  writeFileSync(join(dir,'qc-rh-2022-'+day+'.json'),JSON.stringify(i.baseline),
    {flag:'wx',mode:0o600});
  writeFileSync(join(dir,'qc-rh-triplet-2022-'+day+'.json'),JSON.stringify(i.triplet),
    {flag:'wx',mode:0o600});
 }
 const dry=cmd();
 assert.equal(dry.status,0,dry.stderr);
 assert.equal(JSON.parse(dry.stdout).pendingDays,365);
 assert.equal(JSON.parse(dry.stdout).databaseWrites,0);
 chmodSync(dir,0o755);
 assert.notEqual(cmd().status,0);
});
test('holdout scripts pass syntax validation',()=>{
 for(const f of ['scripts/qc-rh-holdout.mjs','scripts/qc-rh-holdout-lib.mjs']){
  const run=spawnSync(process.execPath,['--check',f],
   {cwd:process.cwd(),encoding:'utf8',timeout:10000});
  assert.equal(run.status,0,f+' '+run.stderr);
 }
});
