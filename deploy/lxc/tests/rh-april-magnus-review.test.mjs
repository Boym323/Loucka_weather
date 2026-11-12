import test from 'node:test';
import assert from 'node:assert/strict';
import {magnusStageGate,reviewAprilMagnusCandidate,buildAprilMagnusReview} from '../rh-april-magnus-review.mjs';

const epoch=Date.parse('2022-04-07T12:00:00Z')/1000;
const g=t=>17.62*t/(243.12+t);
const fixture=(overrides={})=>{
 const candidate={target_time:epoch,defect_type:'missing',decision:'estimate_ready',
  method_version:'dual_vapor_pressure_v1',original_humidity_pct:null,
  local_temperature_c:10,luhamet_temperature_c:10,ilouka4_temperature_c:10,
  luhamet_humidity_pct:60,ilouka4_humidity_pct:62,...overrides};
 if(!('proposed_humidity_pct' in overrides)){
  const l=candidate.luhamet_humidity_pct*Math.exp(g(candidate.luhamet_temperature_c)-g(candidate.local_temperature_c));
  const w=candidate.ilouka4_humidity_pct*Math.exp(g(candidate.ilouka4_temperature_c)-g(candidate.local_temperature_c));
  candidate.proposed_humidity_pct=candidate.decision==='estimate_ready'?
   Math.round(Math.max(1,Math.min(100,(l+w)/2))*100)/100:null;
 }
 const original={dateTime:candidate.target_time,usUnits:16,
  outHumidity:candidate.original_humidity_pct,outTemp:candidate.local_temperature_c};
 return {candidate,original};
};
const control=(overrides={})=>({utcDay:'2022-04-07',source:'original_archive_excluding_known_frozen',
 gate:'strict',n:100,sumAbsoluteError:180,sumWuAbsoluteError:250,...overrides});
const review=(f,c)=>reviewAprilMagnusCandidate(f.candidate,f.original,c);

test('strict candidate is a review priority only, never a correction',()=>{
 const f=fixture();assert.equal(f.candidate.proposed_humidity_pct,61);
 const r=review(f,control());
 assert.equal(r.methodGate,'strict_experimental_review');
 assert.equal(r.priority,'manual_missing_review_priority');
 assert.equal(r.evidence.modelMaePp,1.8);
 assert.equal(r.reviewState,'needs_manual_review');
 assert.equal(r.automaticApprovalAllowed,false);
 assert.equal(r.automaticWriteAllowed,false);
 assert.equal(r.replacementRhPct,null);
 assert.equal(r.historicalProposalValueIncluded,false);
 assert.equal('proposed_humidity_pct' in r,false);
});
test('absence or small same-day sample blocks priority even with agreeing references',()=>{
 assert.equal(review(fixture(),null).priority,'hold_insufficient_same_day_controls');
 assert.equal(review(fixture(),control({n:23,sumAbsoluteError:23,sumWuAbsoluteError:46})).priority,
  'hold_insufficient_same_day_controls');
});
test('same-day controls must favor model and have MAE at most 5 pp',()=>{
 for(const c of [control({sumAbsoluteError:260}),control({sumAbsoluteError:250}),
  control({sumAbsoluteError:510,sumWuAbsoluteError:600})])
  assert.equal(review(fixture(),c).priority,'hold_same_day_model_not_preferred');
});
test('reject wrong day, reconstructed controls, invalid aggregates and changed source',()=>{
 for(const c of [control({utcDay:'2022-04-08'}),control({source:'reconstructed'}),
  control({n:289}),control({sumAbsoluteError:-1}),control({gate:'all'})])
  assert.throws(()=>review(fixture(),c),/same-day/);
 const f=fixture();f.original.outTemp=12;
 assert.throws(()=>review(f,control()),/no longer matches/);
});
test('raw, transferred, temperature and historical formula checks are distinct',()=>{
 assert.equal(magnusStageGate(fixture({luhamet_humidity_pct:45}).candidate),'raw_reference_conflict');
 assert.equal(magnusStageGate(fixture({luhamet_temperature_c:12,ilouka4_temperature_c:8}).candidate),
  'transferred_reference_conflict');
 assert.equal(magnusStageGate(fixture({luhamet_temperature_c:13.1,ilouka4_temperature_c:13.1,
  luhamet_humidity_pct:30,ilouka4_humidity_pct:30}).candidate),'temperature_distance');
 assert.equal(magnusStageGate(fixture({proposed_humidity_pct:50}).candidate),'historical_formula_mismatch');
 assert.equal(magnusStageGate(fixture({luhamet_temperature_c:null,proposed_humidity_pct:61}).candidate),'invalid_inputs');
 assert.equal(magnusStageGate(fixture({luhamet_humidity_pct:100,ilouka4_humidity_pct:100,
  luhamet_temperature_c:11,ilouka4_temperature_c:11}).candidate),'clamped');
});
test('frozen and invalidation are separate from a missing RH estimate',()=>{
 const f=fixture({defect_type:'frozen',original_humidity_pct:75});
 assert.equal(review(f,control()).priority,'manual_frozen_review_priority');
 const invalid=fixture({defect_type:'frozen',original_humidity_pct:75,decision:'invalidate_frozen'});
 assert.equal(review(invalid,control()).priority,'hold_no_numeric_estimate');
 assert.equal(review(invalid,control()).replacementRhPct,null);
});
test('batch rejects duplicate targets and controls and counts priorities without approving',()=>{
 const a=fixture(),b=fixture({target_time:epoch+300,defect_type:'frozen',original_humidity_pct:75});
 const result=buildAprilMagnusReview([a,b],[control()],{expectedRecords:2});
 assert.equal(result.complete,true);
 assert.equal(result.counts['missing/manual_missing_review_priority'],1);
 assert.equal(result.counts['frozen/manual_frozen_review_priority'],1);
 assert.equal(result.safety.databaseWrites,0);
 assert.equal(result.safety.automaticApprovals,false);
 assert.throws(()=>buildAprilMagnusReview([a,a],[control()]),/Duplicate RH candidate/);
 assert.throws(()=>buildAprilMagnusReview([a],[control(),control()]),/Duplicate or invalid/);
 assert.throws(()=>buildAprilMagnusReview([a],[control()],{expectedRecords:2}),/Incomplete/);
});
