/** Evidence-only RH 2022 reconstruction readiness. No reconstructed observations. */
import {HOLDOUT_VERSION} from './qc-rh-holdout-lib.mjs';
import {TRIPLET_VERSION} from './qc-rh-triplets-lib.mjs';
import {RH_VERSION} from './qc-humidity-lib.mjs';

export const READINESS_VERSION='rh-2022-evidence-gates-v1';
const isCount=n=>Number.isSafeInteger(n)&&n>=0;
const ratio=(num,den)=>den?Math.round(num/den*10000)/100:null;
const round=n=>n==null?null:Math.round(n*1000)/1000;
const sum=(list,key)=>list.reduce((n,x)=>n+x[key],0);
function safeEvidence(o,name,versionField,version){
 if(!o||o.schemaVersion!=='1'||o[versionField]!==version||
    o.status!=='screening_only'||o.safety?.databaseWrites!==0||
    o.safety?.automaticApprovals!==false||
    o.safety?.automaticCorrections!==false)
  throw Error('Invalid or unsafe '+name+' evidence');
}
function checkMonthSequence(items,name){
 if(!Array.isArray(items)||items.length!==12)throw Error('Incomplete '+name+' monthly results');
 for(let i=0;i<12;i++){
  if(items[i]?.month!=='2022-'+String(i+1).padStart(2,'0'))
   throw Error('Misordered '+name+' month');
 }
}
function choose(m,t,h){
 const nullSlots=m.rhNullSlots;
 const conflict=m.bothReferenceSlots-m.agreeWithin10Slots;
 const agreement=m.bothReferenceSlots?
   m.agreeWithin10Slots/m.bothReferenceSlots:null;
 const hasTest=h.validatedTriplets>=1000&&h.validatedDays>=7&&
   h.evaluationStatus==='holdout_evidence_for_review';
 const gain=hasTest?h.wuCalibrationGain:null;
 if(nullSlots===0)return {
  status:'no_null_rh',priority:5,
  nextAction:'Kontrolovat pouze celé chybějící sloty; RH NULL v tomto měsíci nejsou.'};
 if(nullSlots<24)return {
  status:'small_null_gaps_manual_only',priority:3,
  nextAction:'Prověřit jednotlivé časové značky a místní originální zálohy; žádný automatický převod.'};
 if(!hasTest)return {
  status:'blocked_no_local_validation',priority:1,
  nextAction:'Vyhledat nezávislé místní RH záznamy či zálohy z výpadku; nepřenášet korekci z jiného měsíce.'};
 if(agreement!==null&&agreement<0.75)return {
  status:'blocked_reference_disagreement',priority:1,
  nextAction:'Prověřit meteorologické podmínky, lokality a časový bias referencí; zadržet odhady v konfliktních intervalech.'};
 if(gain!==null&&gain< -0.05)return {
  status:'hold_offset_worsens_validation',priority:2,
  nextAction:'Měsíční offset na testovacích dnech zvyšuje chybu WU; nepoužívat jej k doplňování RH.'};
 if(gain!==null&&gain>=0.15)return {
  status:'offset_helped_known_values_only',priority:3,
  nextAction:'Výrazná zlepšení holdoutu potvrzují pouze známé RH; ověřit přenositelnost bez extrapolace do výpadku.'};
 return {status:'holdout_no_material_offset_gain',priority:3,
  nextAction:'Bez prokázaného přínosu offsetu; prověřit jednotlivé chybějící intervaly a lokální zdroje.'};
}
export function buildReadiness({triage,triplets,holdout}){
 safeEvidence(triage,'RH triage','qcVersion',RH_VERSION);
 safeEvidence(triplets,'RH triplets','tripletVersion',TRIPLET_VERSION);
 safeEvidence(holdout,'RH holdout','version',HOLDOUT_VERSION);
 if(triage.processedDays!==365||triplets.analyzedDays!==365||
   triplets.complete!==true||holdout.analyzedDays!==365||holdout.complete!==true||
   holdout.holdoutMethod!=='same-month leave-one-day-out with +/-3-day purge'||
   holdout.trainingMinimum?.distinctDays!==7||
   holdout.trainingMinimum?.pairedTriplets!==500||
   holdout.testMinimumTripletsPerDay!==24||
   holdout.safety?.proposedReconstruction!==false)
   throw Error('Incomplete or unsupported RH evidence method');
 checkMonthSequence(triage.months,'triage');
 checkMonthSequence(triplets.months,'triplets');
 checkMonthSequence(holdout.months,'holdout');
 const months=[];
 for(let i=0;i<12;i++){
  const m=triage.months[i],t=triplets.months[i],h=holdout.months[i];
  for(const [value,key] of [
    [m.rhNullSlots,'null'],[m.rhMeasuredSlots,'measured'],
    [m.originalAbsentSlots,'absent'],[m.bothReferenceSlots,'both'],
    [m.agreeWithin10Slots,'agree'],[t.pairs,'triplets'],
    [h.validatedDays,'validated days'],[h.validatedTriplets,'validated triplets']
  ])if(!isCount(value))throw Error('Invalid monthly '+key+' count');
  if(m.agreeWithin10Slots>m.bothReferenceSlots||
     m.bothReferenceSlots>m.rhNullSlots||
     h.validatedTriplets>t.pairs||
     h.validatedDays>h.days||
     t.processedDays!==undefined&&t.processedDays>31)
   throw Error('Impossible RH monthly denominator');
  if(h.validatedTriplets===0){
   if(h.rawWuMae!==null||h.correctedWuMae!==null||
      h.rawLuhaMae!==null||h.correctedLuhaMae!==null||
      h.wuCalibrationGain!==null)throw Error('Non-null error with zero test triplets');
  }else{
   if(![h.rawWuMae,h.correctedWuMae,h.rawLuhaMae,h.correctedLuhaMae,
        h.wuCalibrationGain].every(x=>typeof x==='number'&&Number.isFinite(x)))
     throw Error('Missing RH heldout error');
   if(Math.abs((h.rawWuMae-h.correctedWuMae)-h.wuCalibrationGain)>.002)
     throw Error('RH gain does not reconcile');
  }
  const decision=choose(m,t,h);
  months.push({
   month:m.month,priority:decision.priority,evidenceStatus:decision.status,
   nextAction:decision.nextAction,
   nullRhSlots:m.rhNullSlots,absentOriginalSlots:m.originalAbsentSlots,
   measuredRhSlots:m.rhMeasuredSlots,
   twoReferenceSlots:m.bothReferenceSlots,
   twoReferenceAgreementSlots:m.agreeWithin10Slots,
   agreementAmongAvailablePct:ratio(m.agreeWithin10Slots,m.bothReferenceSlots),
   disagreementAmongAvailablePct:ratio(m.bothReferenceSlots-m.agreeWithin10Slots,
     m.bothReferenceSlots),
   referenceTriplets:t.pairs,validatedTestDays:h.validatedDays,
   validatedTriplets:h.validatedTriplets,
   wuRawHoldoutMae:h.rawWuMae,wuCorrectedHoldoutMae:h.correctedWuMae,
   luhaRawHoldoutMae:h.rawLuhaMae,luhaCorrectedHoldoutMae:h.correctedLuhaMae,
   wuHoldoutGain:h.wuCalibrationGain,
   reviewState:'needs_manual_review',automaticWriteAllowed:false,
   estimatedReplacementRhPct:null});
 }
 for(const [numbers,expected,label] of [
  [sum(months,'nullRhSlots'),triage.totals.nullRhSlots,'NULL RH'],
  [sum(months,'absentOriginalSlots'),triage.totals.originalAbsentSlots,'absent'],
  [sum(months,'twoReferenceSlots'),triage.totals.bothReferenceSlots,'both refs'],
  [sum(months,'twoReferenceAgreementSlots'),triage.totals.agreeWithin10Slots,'agreement'],
  [sum(months,'referenceTriplets'),triplets.overall.pairs,'triplets'],
  [sum(months,'validatedTriplets'),holdout.overall.testedTriplets,'holdout triplets'],
  [sum(months,'validatedTestDays'),holdout.overall.testedDays,'holdout days']
 ])if(numbers!==expected)throw Error('Monthly totals inconsistent: '+label);
 const ordered=[...months].filter(m=>m.nullRhSlots>0)
  .sort((a,b)=>a.priority-b.priority||b.nullRhSlots-a.nullRhSlots);
 return {schemaVersion:'1',readinessVersion:READINESS_VERSION,
  status:'screening_only',period:'2022',complete:true,
  totals:{
   nullRhSlots:triage.totals.nullRhSlots,
   absentOriginalSlots:triage.totals.originalAbsentSlots,
   twoReferenceSlots:triage.totals.bothReferenceSlots,
   twoReferenceAgreementSlots:triage.totals.agreeWithin10Slots,
   triplets:triplets.overall.pairs,
   holdoutTestedDays:holdout.overall.testedDays,
   holdoutTestedTriplets:holdout.overall.testedTriplets,
   rawWuHoldoutMae:holdout.overall.rawWuMae,
   correctedWuHoldoutMae:holdout.overall.correctedWuMae,
   rawLuhaHoldoutMae:holdout.overall.rawLuhaMae,
   correctedLuhaHoldoutMae:holdout.overall.correctedLuhaMae
  },
  months,reviewPriority:ordered.map(m=>m.month),
  conclusions:[
   'No RH month is automatically eligible for reconstruction. Agreement of two remote stations is not calibration of the Loucka sensor.',
   'Blocked holdout can evaluate corrections only where original RH existed; it cannot validate transfer into months with no RH, especially February 2022.',
   'A monthly offset that helped November or December must never be applied to a missing winter/spring month without new independent local evidence.',
   'Original whole-slot absences and existing RH NULL must be handled separately.',
   'This artifact only gates independent manual investigations; it contains no estimated RH replacement values.'
  ],
  safety:{databaseWrites:0,automaticApprovals:false,automaticCorrections:false,
   proposedReconstruction:false}};
}
export function readinessCsv(report){
 const cols=['month','evidenceStatus','priority','nullRhSlots','absentOriginalSlots',
  'twoReferenceSlots','twoReferenceAgreementSlots','agreementAmongAvailablePct',
  'referenceTriplets','validatedTestDays','validatedTriplets',
  'wuRawHoldoutMae','wuCorrectedHoldoutMae','wuHoldoutGain','nextAction','reviewState',
  'automaticWriteAllowed','estimatedReplacementRhPct'];
 const escape=x=>{
  const str=String(x??'');
  const safe=/^[=+@\-\t\r]/.test(str)?"'"+str:str;
  return '"'+safe.replaceAll('"','""')+'"';
 };
 return '\uFEFF'+cols.map(escape).join(',')+'\r\n'+report.months.map(m=>
  cols.map(key=>escape(m[key])).join(',')).join('\r\n')+'\r\n';
}
