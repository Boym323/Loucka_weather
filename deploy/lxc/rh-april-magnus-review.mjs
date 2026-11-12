/**
 * Experimental April 2022 review priority, NOT a correction or approval.
 * Extends the already-verified stage-risk check with the fixed historical
 * Magnus method and same-UTC-day ORIGINAL control evidence.
 * No DB, network, filesystem writes or replacement RH in the output.
 */
import {reviewAprilStageRow} from '../../api/scripts/qc-rh-april-stage-risk-lib.mjs';

export const VERSION='rh-april-2022-magnus-manual-review-v1';
export const LIMITS=Object.freeze({
 rawRhDifferencePp:10, outsideRawBandPp:10, transferredDifferencePp:5,
 localTemperatureDifferenceC:3, minControlSamples:24, maxControlMaePp:5
});
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const num=x=>typeof x==='number'?x:
 typeof x==='string'&&x.trim()!==''?Number(x):NaN;
const rh=x=>finite(x)&&x>=1&&x<=100;
const temp=x=>finite(x)&&x>=-60&&x<=60;
const g=t=>17.62*t/(243.12+t);
const bounded=x=>Math.min(100,Math.max(1,x));
const rounded=x=>Math.round((x+Number.EPSILON)*100)/100;

/** Stored staging values are evidence of a past calculation, not local truth. */
export function magnusStageGate(candidate){
 const l=num(candidate.luhamet_humidity_pct),w=num(candidate.ilouka4_humidity_pct);
 const t=num(candidate.local_temperature_c),lt=num(candidate.luhamet_temperature_c);
 const wt=num(candidate.ilouka4_temperature_c),p=num(candidate.proposed_humidity_pct);
 if(candidate.decision!=='estimate_ready')return 'no_numeric_estimate';
 if(candidate.method_version!=='dual_vapor_pressure_v1'||
    !rh(l)||!rh(w)||!rh(p)||!temp(t)||!temp(lt)||!temp(wt))return 'invalid_inputs';
 const lp=l*Math.exp(g(lt)-g(t)),wp=w*Math.exp(g(wt)-g(t)),mean=(lp+wp)/2;
 if(!finite(mean)||Math.abs(p-rounded(bounded(mean)))>1e-6)
  return 'historical_formula_mismatch';
 if(Math.abs(l-w)>LIMITS.rawRhDifferencePp)return 'raw_reference_conflict';
 if(p<Math.min(l,w)-LIMITS.outsideRawBandPp||
    p>Math.max(l,w)+LIMITS.outsideRawBandPp)return 'outside_raw_reference_band';
 if(Math.abs(lp-wp)>LIMITS.transferredDifferencePp)return 'transferred_reference_conflict';
 if(Math.max(Math.abs(t-lt),Math.abs(t-wt))>LIMITS.localTemperatureDifferenceC)
  return 'temperature_distance';
 if(!rh(mean))return 'clamped';
 return 'strict_experimental_review';
}

/**
 * Controls must be aggregated on the identical strict gate, from the original
 * archive excluding ALL known frozen staging slots. No estimate may be truth.
 * The caller is responsible for providing evidence from the documented SELECT.
 */
function validateControl(control,day){
 if(control==null)return null;
 if(control.utcDay!==day||control.source!=='original_archive_excluding_known_frozen'||
    control.gate!=='strict'||
    !Number.isSafeInteger(control.n)||control.n<1||control.n>288||
    !finite(control.sumAbsoluteError)||control.sumAbsoluteError<0||
    control.sumAbsoluteError>99*control.n||
    !finite(control.sumWuAbsoluteError)||control.sumWuAbsoluteError<0||
    control.sumWuAbsoluteError>99*control.n)
  throw Error('Invalid or non-original same-day RH evidence');
 return {samples:control.n,modelMaePp:control.sumAbsoluteError/control.n,
  wuMaePp:control.sumWuAbsoluteError/control.n};
}

export function reviewAprilMagnusCandidate(candidate,original,control=null){
 const baseline=reviewAprilStageRow(candidate,original);
 const methodGate=magnusStageGate(candidate);
 const evidence=validateControl(control,baseline.utcDay);
 let priority='hold_method_gate';
 if(methodGate==='no_numeric_estimate')priority='hold_no_numeric_estimate';
 else if(methodGate==='strict_experimental_review'){
  if(!evidence||evidence.samples<LIMITS.minControlSamples)
   priority='hold_insufficient_same_day_controls';
  else if(evidence.modelMaePp>LIMITS.maxControlMaePp||
          evidence.modelMaePp>=evidence.wuMaePp)
   priority='hold_same_day_model_not_preferred';
  else priority=baseline.defectType==='frozen'?
   'manual_frozen_review_priority':'manual_missing_review_priority';
 }
 return {
  version:VERSION,targetTimeUtc:baseline.targetTimeUtc,utcDay:baseline.utcDay,
  defectType:baseline.defectType,legacyDecision:baseline.legacyDecision,
  legacyMethodVersion:baseline.legacyMethodVersion,
  methodGate,priority,evidence,
  status:'screening_only',reviewState:'needs_manual_review',
  automaticApprovalAllowed:false,automaticWriteAllowed:false,
  replacementRhPct:null,historicalProposalValueIncluded:false
 };
}

/** Use the existing private source rows; only returns review metadata, not RH. */
export function buildAprilMagnusReview(records,controls,{expectedRecords=null}={}){
 if(!Array.isArray(records)||records.length===0||!Array.isArray(controls)||
    (expectedRecords!==null&&records.length!==expectedRecords))
  throw Error('Incomplete April review input');
 const byDay=new Map();
 for(const c of controls){
  if(!c||typeof c.utcDay!=='string'||!/^2022-04-(0[1-9]|[12][0-9]|30)$/.test(c.utcDay)||
     byDay.has(c.utcDay))throw Error('Duplicate or invalid UTC control day');
  validateControl(c,c.utcDay);byDay.set(c.utcDay,c);
 }
 const seen=new Set(),rows=[],counts={},methodGates={};
 for(const {candidate,original} of records){
  const epoch=num(candidate.target_time);
  if(!Number.isSafeInteger(epoch))throw Error('Invalid target time');
  const day=new Date(epoch*1000).toISOString().slice(0,10);
  const r=reviewAprilMagnusCandidate(candidate,original,byDay.get(day));
  if(seen.has(r.targetTimeUtc))throw Error('Duplicate RH candidate');
  seen.add(r.targetTimeUtc);rows.push(r);
  const key=r.defectType+'/'+r.priority;
  counts[key]=(counts[key]??0)+1;
  const gate=r.defectType+'/'+r.methodGate;
  methodGates[gate]=(methodGates[gate]??0)+1;
 }
 rows.sort((a,b)=>a.targetTimeUtc.localeCompare(b.targetTimeUtc));
 return {version:VERSION,status:'screening_only',totalRecords:rows.length,
  complete:expectedRecords!==null,counts,methodGates,rows,
  safety:{databaseWrites:0,automaticApprovals:false,automaticCorrections:false,
   proposedReconstruction:false}};
}
