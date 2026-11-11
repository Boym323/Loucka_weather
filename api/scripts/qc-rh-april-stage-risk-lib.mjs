/** Pure screening of existing RH April 2022 staging proposals.
 * No inferred RH, no database connection, and no approved replacements.
 */
export const STAGE_RISK_VERSION='rh-april-2022-staging-risk-v1';
const START=Date.parse('2022-04-01T00:00:00Z')/1000;
const END=Date.parse('2022-05-01T00:00:00Z')/1000;
const decisions=new Set(['estimate_ready','missing_unresolved','invalidate_frozen']);
const finite=(x)=>typeof x==='number'&&Number.isFinite(x);
const validRh=x=>finite(x)&&x>=1&&x<=100;
const eq=(a,b)=>a===b||(finite(a)&&finite(b)&&Math.abs(a-b)<1e-6);
const numeric=(raw,label)=>{
  if(raw===null||raw===undefined)return null;
  const x=Number(raw);
  if(!Number.isFinite(x))throw Error('Invalid '+label);
  return x;
};
function normalize(r){
  const n={...r};
  for(const key of ['target_time','original_humidity_pct','proposed_humidity_pct',
    'local_temperature_c','luhamet_humidity_pct','ilouka4_humidity_pct',
    'luhamet_temperature_c','ilouka4_temperature_c'])
    n[key]=numeric(r[key],key);
  return n;
}
export function reviewAprilStageRow(raw,original){
  const r=normalize(raw);
  if(!Number.isSafeInteger(r.target_time)||r.target_time<START||
     r.target_time>=END||r.target_time%300!==0||
     !['missing','frozen'].includes(r.defect_type)||
     !decisions.has(r.decision)||r.method_version!=='dual_vapor_pressure_v1'||
     ((r.defect_type==='missing')&&!['estimate_ready','missing_unresolved'].includes(r.decision))||
     ((r.defect_type==='frozen')&&!['estimate_ready','invalidate_frozen'].includes(r.decision)))
    throw Error('Unexpected RH staging record');
  if(original?.dateTime!==r.target_time||original.usUnits!==16)
    throw Error('Missing or changed UTC origin / unit code');
  const ownRh=numeric(original.outHumidity,'original RH');
  const ownTemp=numeric(original.outTemp,'original temperature');
  if(!eq(ownRh,r.original_humidity_pct)||!eq(ownTemp,r.local_temperature_c)||
     (r.defect_type==='missing'&&ownRh!==null)||
     (r.defect_type==='frozen'&&!validRh(ownRh)))
    throw Error('Original RH/temp no longer matches staging snapshot');
  const hasProposal=r.decision==='estimate_ready';
  if(hasProposal!==validRh(r.proposed_humidity_pct)||
     (!hasProposal&&r.proposed_humidity_pct!==null))
    throw Error('Unrecognized existing RH proposal state');
  const l=r.luhamet_humidity_pct,w=r.ilouka4_humidity_pct;
  const bothRefValid=validRh(l)&&validRh(w);
  const refDifference=bothRefValid?Math.abs(l-w):null;
  const outsideBy10=hasProposal&&bothRefValid&&
    (r.proposed_humidity_pct<Math.min(l,w)-10||
     r.proposed_humidity_pct>Math.max(l,w)+10);
  const flags=[];
  if(r.defect_type==='frozen')flags.push('original_sensor_suspected_frozen');
  if(!hasProposal)flags.push('no_historical_estimate');
  if(!bothRefValid)flags.push('reference_missing_or_invalid');
  else{
    if(refDifference>10)flags.push('references_disagree_over_10pp');
    if(refDifference>20)flags.push('references_disagree_over_20pp');
  }
  if(outsideBy10)flags.push('historical_proposal_outside_reference_band_by_10pp');
  // Every class is explicitly unapproved, even if two references agree.
  let category;
  if(r.defect_type==='frozen')
    category=r.decision==='invalidate_frozen'?
      'frozen_invalidation_requires_review':'frozen_sensor_requires_review';
  else if(!hasProposal)category='missing_unresolved';
  else if(!bothRefValid)category='missing_reference_insufficient';
  else if(refDifference>20)category='missing_reference_conflict_over_20pp';
  else if(refDifference>10)category='missing_reference_conflict_over_10pp';
  else if(outsideBy10)category='missing_proposal_outside_reference_band';
  else category='missing_references_agree_unvalidated';
  return {
    targetTimeUtc:new Date(r.target_time*1000).toISOString(),
    utcDay:new Date(r.target_time*1000).toISOString().slice(0,10),
    defectType:r.defect_type,legacyDecision:r.decision,
    legacyMethodVersion:r.method_version,
    riskCategory:category,riskFlags:flags,
    hasHistoricProposal:hasProposal,
    sourceRhWasNull:ownRh===null,
    hasTwoValidReferences:bothRefValid,
    referenceDifferencePp:refDifference,
    historicProposalOutsideReferencesBy10Pp:Boolean(outsideBy10),
    historicalProposalValueIncluded:false,
    originalBaselineChecked:true,
    reviewState:'needs_manual_review',
    automaticWriteAllowed:false,
    replacementRhPct:null
  };
}
const byKey=(o,key)=>o[key]??(o[key]=0);
export function buildAprilStageAudit(records,{expectedRecords=null}={}){
  if(!Array.isArray(records)||records.length===0||
     (expectedRecords!==null&&
       (!Number.isSafeInteger(expectedRecords)||records.length!==expectedRecords)))
    throw Error('Incomplete or invalid April staging sample');
  const seen=new Set(),rows=[];
  for(const {candidate,original} of records){
    const row=reviewAprilStageRow(candidate,original);
    if(seen.has(row.targetTimeUtc))throw Error('Duplicate RH target timestamp');
    seen.add(row.targetTimeUtc);rows.push(row);
  }
  rows.sort((a,b)=>a.targetTimeUtc.localeCompare(b.targetTimeUtc));
  const categories={},legacyStates={},days={},risks={
    referenceDifferenceOver10:0,referenceDifferenceOver20:0,
    proposalOutsideReferenceBandBy10:0,missingValidRef:0,
    frozenRecords:0,unresolvedRecords:0};
  for(const x of rows){
    categories[x.riskCategory]=(categories[x.riskCategory]||0)+1;
    const key=x.defectType+'/'+x.legacyDecision;
    legacyStates[key]=(legacyStates[key]||0)+1;
    const day=days[x.utcDay]??(days[x.utcDay]={dayUtc:x.utcDay,
      records:0,missing:0,frozen:0,referenceConflictOver10:0,
      referenceConflictOver20:0,unresolved:0});
    day.records++;
    day[x.defectType]++;
    const f=x.riskFlags;
    if(f.includes('references_disagree_over_10pp')){
      risks.referenceDifferenceOver10++;day.referenceConflictOver10++;
    }
    if(f.includes('references_disagree_over_20pp')){
      risks.referenceDifferenceOver20++;day.referenceConflictOver20++;
    }
    if(f.includes('reference_missing_or_invalid'))risks.missingValidRef++;
    if(f.includes('historical_proposal_outside_reference_band_by_10pp'))
      risks.proposalOutsideReferenceBandBy10++;
    if(x.defectType==='frozen')risks.frozenRecords++;
    if(!x.hasHistoricProposal){risks.unresolvedRecords++;day.unresolved++;}
  }
  const totals=rows.length;
  return {schemaVersion:'1',riskVersion:STAGE_RISK_VERSION,
    status:'screening_only',windowUtc:['2022-04-01','2022-05-01'],
    complete:expectedRecords!==null&&expectedRecords===totals,
    totalStagingRows:totals,legacyStates,categories,risks,
    utcDays:Object.values(days).sort((a,b)=>a.dayUtc.localeCompare(b.dayUtc)),
    candidates:rows,
    conclusions:[
      'All original RH/temperature values were checked against the current immutable source archive at identical UTC epochs.',
      'Suspected frozen original RH is not clean ground truth, even when non-NULL.',
      'Remote reference agreement is a screening criterion, not a validation of source-local humidity.',
      'Historical dual_vapor_pressure_v1 proposals are retained only as provenance: no proposed numeric RH is included in this derived report.',
      'Day attribution is UTC epoch based; MariaDB FROM_UNIXTIME can use a different session time zone.',
      'No candidate is eligible for automatic correction or approval.'
    ],
    safety:{databaseWrites:0,automaticApprovals:false,
      automaticCorrections:false,proposedReconstruction:false}};
}
export function aprilStageReviewCsv(audit){
  const heads=['targetTimeUtc','defectType','legacyDecision','riskCategory',
    'referenceDifferencePp','riskFlags','reviewState',
    'automaticWriteAllowed','replacementRhPct'];
  const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  return '\uFEFF'+heads.map(quote).join(',')+'\r\n'+
    audit.candidates.map(r=>heads.map(h=>
      quote(Array.isArray(r[h])?r[h].join('|'):r[h])).join(',')).join('\r\n')+'\r\n';
}
