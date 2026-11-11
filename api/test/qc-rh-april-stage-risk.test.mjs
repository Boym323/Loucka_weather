import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {buildAprilStageAudit,reviewAprilStageRow,aprilStageReviewCsv}
  from '../scripts/qc-rh-april-stage-risk-lib.mjs';

const anchor=Date.parse('2022-04-26T00:00:00Z')/1000;
function sample(i,{defect='missing',decision='estimate_ready',
  ownRh=defect==='frozen'?75:null,proposed=62,luha=60,wu=61,
  temp=12}={}){
  const t=anchor+i*300;
  return {candidate:{
    target_time:t,original_humidity_pct:ownRh,
    proposed_humidity_pct:decision==='estimate_ready'?proposed:null,
    defect_type:defect,decision,
    method_version:'dual_vapor_pressure_v1',
    local_temperature_c:temp,
    luhamet_humidity_pct:luha,ilouka4_humidity_pct:wu,
    luhamet_temperature_c:11,ilouka4_temperature_c:13
  },original:{
    dateTime:t,usUnits:16,outHumidity:ownRh,outTemp:temp
  }};
}
test('original snapshots cannot drift, frozen RH is not treated as valid ground truth',()=>{
 const frozen=sample(0,{defect:'frozen',ownRh:89,proposed:74});
 const r=reviewAprilStageRow(frozen.candidate,frozen.original);
 assert.equal(r.riskCategory,'frozen_sensor_requires_review');
 assert.ok(r.riskFlags.includes('original_sensor_suspected_frozen'));
 assert.equal(r.reviewState,'needs_manual_review');
 assert.equal(r.automaticWriteAllowed,false);
 assert.equal(r.replacementRhPct,null);
 assert.equal(r.historicalProposalValueIncluded,false);
 assert.equal(JSON.stringify(r).includes('proposedRhPct'),false);
 const altered=structuredClone(frozen);
 altered.original.outHumidity=83;
 assert.throws(()=>reviewAprilStageRow(altered.candidate,altered.original),
   /Original RH\/temp no longer matches/);
 const changedTemp=structuredClone(frozen);
 changedTemp.original.outTemp=2;
 assert.throws(()=>reviewAprilStageRow(changedTemp.candidate,changedTemp.original),
   /Original RH\/temp no longer matches/);
});
test('multi-reason categories keep conflicts and outside-reference flags separate',()=>{
 const cases=[
  sample(0),
  sample(1,{luha:51,wu:66,proposed:58}),
  sample(2,{luha:51,wu:76,proposed:58}),
  sample(3,{luha:51,wu:56,proposed:97}),
  sample(4,{decision:'missing_unresolved',proposed:null,luha:null,wu:72}),
  sample(5,{defect:'frozen',decision:'estimate_ready',ownRh:75,proposed:61}),
  sample(6,{defect:'frozen',decision:'invalidate_frozen',ownRh:75,proposed:null})
 ];
 const report=buildAprilStageAudit(cases,{expectedRecords:7});
 assert.equal(report.complete,true);
 assert.equal(report.totalStagingRows,7);
 assert.equal(report.categories.missing_references_agree_unvalidated,1);
 assert.equal(report.categories.missing_reference_conflict_over_10pp,1);
 assert.equal(report.categories.missing_reference_conflict_over_20pp,1);
 assert.equal(report.categories.missing_proposal_outside_reference_band,1);
 assert.equal(report.categories.missing_unresolved,1);
 assert.equal(report.categories.frozen_sensor_requires_review,1);
 assert.equal(report.categories.frozen_invalidation_requires_review,1);
 assert.equal(report.risks.referenceDifferenceOver10,2);
 assert.equal(report.risks.referenceDifferenceOver20,1);
 assert.equal(report.risks.proposalOutsideReferenceBandBy10,1);
 assert.equal(report.risks.missingValidRef,1);
 assert.equal(report.risks.frozenRecords,2);
 assert.equal(report.risks.unresolvedRecords,2);
 assert.equal(report.utcDays.length,1);
 assert.equal(report.utcDays[0].dayUtc,'2022-04-26');
 assert.equal(report.safety.databaseWrites,0);
 assert.equal(report.safety.proposedReconstruction,false);
 assert.equal(report.candidates.every(x=>x.replacementRhPct===null&&
   !x.automaticWriteAllowed),true);
 const csv=aprilStageReviewCsv(report);
 assert.equal(csv.split('\r\n').length,9);
 assert.match(csv,/missing_references_agree_unvalidated/);
 assert.doesNotMatch(csv,/97\.0?0?[^0-9]/);
});
test('duplicate stage timestamps, impossible decisions and missing originals fail closed',()=>{
 const a=sample(0);
 assert.throws(()=>buildAprilStageAudit([a,a]),/Duplicate RH/);
 assert.throws(()=>buildAprilStageAudit([a],{expectedRecords:3734}),/Incomplete/);
 const bad=structuredClone(a);bad.candidate.defect_type='frozen';
 assert.throws(()=>reviewAprilStageRow(bad.candidate,bad.original),
   /Original RH\/temp/);
 const wrongDecision=structuredClone(a);
 wrongDecision.candidate.decision='invalidate_frozen';
 wrongDecision.candidate.proposed_humidity_pct=null;
 assert.throws(()=>reviewAprilStageRow(wrongDecision.candidate,wrongDecision.original),
   /Unexpected RH staging/);
 const stale=structuredClone(a);stale.original.dateTime+=300;
 assert.throws(()=>reviewAprilStageRow(stale.candidate,stale.original),/Missing or changed UTC/);
 const offset=structuredClone(a);offset.candidate.target_time+=60;
 assert.throws(()=>reviewAprilStageRow(offset.candidate,offset.original),/Unexpected RH staging/);
});
test('UTC dates are derived from Unix epochs, not MariaDB server time zones',()=>{
 const t=Date.parse('2022-04-26T23:55:00Z')/1000;
 const a=sample(0);a.candidate.target_time=t;a.original.dateTime=t;
 const r=reviewAprilStageRow(a.candidate,a.original);
 assert.equal(r.utcDay,'2022-04-26');
 assert.equal(r.targetTimeUtc,'2022-04-26T23:55:00.000Z');
});
test('source file parses under Node ESM',()=>{
 const r=spawnSync(process.execPath,
  ['--check','scripts/qc-rh-april-stage-risk-lib.mjs'],
  {cwd:process.cwd(),encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stderr);
});
