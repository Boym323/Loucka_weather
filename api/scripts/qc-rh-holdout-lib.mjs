/** Historic RH reference calibration experiment: purged, month-specific held-out days.
 * Only original non-NULL RH triplets, NEVER missing-value replacements.
 */
import {createHash} from 'node:crypto';
import {dateRange,dateWindow,validateRhDay} from './qc-humidity-lib.mjs';
import {buildCommonDay,validateCommonDay} from './qc-rh-triplets-lib.mjs';

export const HOLDOUT_VERSION='rh-2022-purged-blocked-validation-v1';
const digest=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const good=n=>typeof n==='number'&&Number.isFinite(n)&&n>=1&&n<=100;
const digits=n=>n==null?null:Math.round(n*1000)/1000;
const count=(list,what)=>list.reduce((n,x)=>n+(what(x)?1:0),0);
const average=a=>a.length?digits(a.reduce((x,y)=>x+y,0)/a.length):null;
const median=a=>{
 if(!a.length)return null;
 const b=[...a].sort((x,y)=>x-y),i=Math.floor(b.length/2);
 return (b.length%2)?b[i]:(b[i-1]+b[i])/2;
};
function originalSlots(rows,start,end){
 const map=new Map();
 for(const row of rows){
  const t=Number(row.dateTime);
  if(!Number.isSafeInteger(t)||t<start||t>=end)throw Error('Bad original RH time');
  if(t%300!==0)continue;
  const all=map.get(t)||[];all.push(row.outHumidity);map.set(t,all);
 }
 return new Map([...map].filter(([t,a])=>a.length===1&&good(a[0]))
   .map(([t,a])=>[t,a[0]]));
}
function refSlots(rows,station,start,end){
 const map=new Map();
 for(const row of rows){
  if(row.station_id!==station)throw Error('Bad RH station');
  const t=Number(row.observed_at_utc);
  if(!Number.isSafeInteger(t)||t<start-30||t>=end+30)throw Error('Bad ref time');
  const slot=Math.round(t/300)*300;
  if(slot<start||slot>=end||Math.abs(t-slot)>30||
     row.quality_status!=='reference_only'||!good(row.relative_humidity_pct))continue;
  const a=map.get(slot)||[];a.push(row.relative_humidity_pct);map.set(slot,a);
 }
 return new Map([...map].filter(([t,a])=>a.length===1).map(([t,a])=>[t,a[0]]));
}
const sum=(a,fn)=>a.reduce((n,x)=>n+fn(x),0);
function compareToOriginalReport(samples,report){
 const t=report.sameSlotTriplets;
 if(samples.length!==t.pairs)return false;
 const near=(x,y)=>Math.abs(x-y)<=1e-7*Math.max(1,Math.abs(y));
 for(const [key,value] of Object.entries({
  sumAbsLuha:sum(samples,x=>Math.abs(x.o-x.l)),
  sumAbsWu:sum(samples,x=>Math.abs(x.o-x.w)),
  sumBiasLuha:sum(samples,x=>x.o-x.l),
  sumBiasWu:sum(samples,x=>x.o-x.w),
  sumSquaresLuha:sum(samples,x=>(x.o-x.l)**2),
  sumSquaresWu:sum(samples,x=>(x.o-x.w)**2)
 }))if(!near(value,t[key]))return false;
 return true;
}
/** Explicitly re-read and verify all historical source aggregates before storing samples. */
export function buildHoldoutDay({day,original,references,baseline,triplet}){
 const {start,end}=dateWindow(day);
 validateRhDay(baseline,day);
 validateCommonDay(triplet,day,baseline);
 const freshlyComputed=buildCommonDay({day,original,references,baseline});
 if(JSON.stringify(freshlyComputed.sameSlotTriplets)!==
    JSON.stringify(triplet.sameSlotTriplets))
   throw Error('Historic triplet evidence differs from live read-only source');
 const own=originalSlots(original,start,end);
 const luha=refSlots(references.luhamet_sehradice,'luhamet_sehradice',start,end);
 const wu=refSlots(references.wu_ilouka4,'wu_ilouka4',start,end);
 const samples=[];
 for(const [t,o] of own){
  const l=luha.get(t),w=wu.get(t);
  if(l===undefined||w===undefined)continue;
  samples.push({t,o,l,w});
 }
 samples.sort((a,b)=>a.t-b.t);
 if(!compareToOriginalReport(samples,triplet))
   throw Error('Slot-level values do not reconcile with original triplet report');
 return {schemaVersion:'1',version:HOLDOUT_VERSION,status:'screening_only',
   day,baselineSha256:digest(baseline),tripletSha256:digest(triplet),
   samples,stats:{triplets:samples.length},
   safety:{databaseWrites:0,automaticApprovals:false,
     automaticCorrections:false,replacementRhPct:null}};
}
export function validateHoldoutDay(data,day,baseline,triplet){
 dateWindow(day);
 validateRhDay(baseline,day);
 validateCommonDay(triplet,day,baseline);
 const {start,end}=dateWindow(day);
 if(data?.schemaVersion!=='1'||data.version!==HOLDOUT_VERSION||
    data.status!=='screening_only'||data.day!==day||
    data.baselineSha256!==digest(baseline)||
    data.tripletSha256!==digest(triplet)||
    data.safety?.databaseWrites!==0||
    data.safety?.automaticApprovals!==false||
    data.safety?.automaticCorrections!==false||
    data.safety?.replacementRhPct!==null||
    !Array.isArray(data.samples)||data.samples.length>288||
    data.stats?.triplets!==data.samples.length||
    !compareToOriginalReport(data.samples,triplet))
  throw Error('Unsafe or inconsistent held-out RH evidence');
 let previous=start-300;
 for(const row of data.samples){
  if(!Number.isSafeInteger(row.t)||row.t%300!==0||row.t<=previous||
     row.t<start||row.t>=end||!good(row.o)||!good(row.l)||!good(row.w))
    throw Error('Invalid held-out RH sample');
  previous=row.t;
 }
 return data;
}
function dayDiff(a,b){
 return Math.abs(Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000;
}
function evaluateDay(day,days){
 const held=days.get(day).samples;
 if(held.length<24)return {day,reason:'insufficient_test_triplets',
   heldOutTriplets:held.length,trainingTriplets:0};
 const mon=day.slice(0,7);
 const trainDays=[...days.keys()].filter(d=>d!==day&&d.startsWith(mon)&&
    dayDiff(d,day)>3&&days.get(d).samples.length>0);
 const training=trainDays.flatMap(d=>days.get(d).samples);
 if(trainDays.length<7||training.length<500)return {
   day,reason:'insufficient_purged_training',
   heldOutTriplets:held.length,trainingDays:trainDays.length,
   trainingTriplets:training.length
 };
 const luhaOffset=median(training.map(x=>x.o-x.l));
 const wuOffset=median(training.map(x=>x.o-x.w));
 const calc=(key,offset)=>average(held.map(x=>Math.abs(x.o-(x[key]+offset))));
 return {day,reason:'evaluated',heldOutTriplets:held.length,
   trainingDays:trainDays.length,trainingTriplets:training.length,
   purgeDays:3,
   estimatedOffsetsForValidationOnly:{
     luha:digits(luhaOffset),wu:digits(wuOffset)},
   rawLuhaMae:calc('l',0),rawWuMae:calc('w',0),
   correctedLuhaMae:calc('l',luhaOffset),
   correctedWuMae:calc('w',wuOffset),
   // Full sums remain exact so aggregated monthly MAE never averages rounded days.
   sums:{rawLuha:sum(held,x=>Math.abs(x.o-x.l)),
     rawWu:sum(held,x=>Math.abs(x.o-x.w)),
     correctedLuha:sum(held,x=>Math.abs(x.o-(x.l+luhaOffset))),
     correctedWu:sum(held,x=>Math.abs(x.o-(x.w+wuOffset)))}};
}
export function evaluateHoldoutYear(reports){
 const year=dateRange();
 if(!Array.isArray(reports)||reports.length!==365)
   throw Error('All 365 held-out RH daily sources required');
 const days=new Map();
 for(const r of reports){
  if(!year.includes(r?.day)||days.has(r.day))throw Error('Duplicate or invalid held-out day');
  days.set(r.day,r);
 }
 const outcomes=year.map(day=>evaluateDay(day,days));
 const months=Array.from({length:12},(_,i)=>{
   const month='2022-'+String(i+1).padStart(2,'0');
   const rows=outcomes.filter(r=>r.day.startsWith(month));
   const eligible=rows.filter(r=>r.reason==='evaluated');
   const n=eligible.reduce((s,r)=>s+r.heldOutTriplets,0);
   const mae=k=>n?digits(eligible.reduce((s,r)=>s+r.sums[k],0)/n):null;
   const rawWu=mae('rawWu'),correctedWu=mae('correctedWu');
   return {month,days:rows.length,validatedDays:eligible.length,
     validatedTriplets:n,
     excludedTestDays:rows.filter(r=>r.reason==='insufficient_test_triplets').length,
     excludedTrainingDays:rows.filter(r=>r.reason==='insufficient_purged_training').length,
     rawLuhaMae:mae('rawLuha'),rawWuMae:rawWu,
     correctedLuhaMae:mae('correctedLuha'),correctedWuMae:correctedWu,
     wuCalibrationGain:n?digits(rawWu-correctedWu):null,
     evaluationStatus:eligible.length>=7&&n>=1000?
       'holdout_evidence_for_review':'insufficient_holdout_evidence'};
 });
 const eligible=outcomes.filter(r=>r.reason==='evaluated');
 const n=eligible.reduce((s,r)=>s+r.heldOutTriplets,0);
 const overall=k=>n?digits(eligible.reduce((s,r)=>s+r.sums[k],0)/n):null;
 return {schemaVersion:'1',version:HOLDOUT_VERSION,status:'screening_only',
   analyzedDays:365,complete:true,holdoutMethod:'same-month leave-one-day-out with +/-3-day purge',
   trainingMinimum:{distinctDays:7,pairedTriplets:500},
   testMinimumTripletsPerDay:24,
   overall:{testedDays:eligible.length,testedTriplets:n,
     rawLuhaMae:overall('rawLuha'),rawWuMae:overall('rawWu'),
     correctedLuhaMae:overall('correctedLuha'),correctedWuMae:overall('correctedWu')},
   months,daily:outcomes.map(x=>{
     const {sums,...rest}=x;return rest;
   }),
   limitations:[
    'Retrospective same-month blocked validation may train on later days, so it is not a prospective forecast experiment.',
    'Purging +/-3 days reduces but does not remove weather autocorrelation or site-specific bias.',
    'Only slots where original humidity was already observed are used. Null months such as 2022-02 are NOT validated.',
    'Median offset is an EXPERIMENTAL comparator evaluated on known RH; never a proposed replacement measurement.',
    'Unrepresented RH ranges or seasons may behave differently; adequate scores do not justify writes to the source archive.'
   ],safety:{databaseWrites:0,automaticApprovals:false,
     automaticCorrections:false,proposedReconstruction:false}};
}
