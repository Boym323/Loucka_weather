/** Fair RH comparison: the SAME original/LuhaMet/WU five-minute UTC slots only.
 *  Read-only screening; never estimates or writes a replacement RH value.
 */
import {createHash} from 'node:crypto';
import {buildRhDay,dateRange,dateWindow,validateRhDay} from './qc-humidity-lib.mjs';
export const TRIPLET_VERSION='loucka-rh-triplets-2022-v1';
const STATIONS=['luhamet_sehradice','wu_ilouka4'],MAX_SKEW=30;
const good=v=>typeof v==='number'&&Number.isFinite(v)&&v>=1&&v<=100;
const hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const r3=x=>x===null?null:Math.round(x*1000)/1000;
function selectOwn(rows,start,end){
  const grouped=new Map();
  for(const r of rows){
    const t=Number(r.dateTime);
    if(!Number.isSafeInteger(t)||t<start||t>=end)throw Error('Bad original timestamp');
    if(t%300!==0)continue;
    const v=grouped.get(t)||[];v.push(r.outHumidity);grouped.set(t,v);
  }
  return new Map([...grouped].filter(([t,a])=>a.length===1&&good(a[0]))
    .map(([t,a])=>[t,a[0]]));
}
function selectRef(rows,station,start,end){
  const grouped=new Map();
  for(const r of rows){
    const t=Number(r.observed_at_utc);
    if(r.station_id!==station||!Number.isSafeInteger(t)||
      t<start-MAX_SKEW||t>=end+MAX_SKEW)
      throw Error('Bad reference timestamp or station');
    const slot=Math.round(t/300)*300;
    if(slot<start||slot>=end||Math.abs(t-slot)>MAX_SKEW||
       r.quality_status!=='reference_only'||!good(r.relative_humidity_pct))continue;
    const a=grouped.get(slot)||[];
    a.push(r.relative_humidity_pct);
    grouped.set(slot,a);
  }
  return new Map([...grouped].filter(([t,a])=>a.length===1)
    .map(([t,a])=>[t,a[0]]));
}
function totals(deltasA,deltasB){
  const absA=deltasA.map(Math.abs),absB=deltasB.map(Math.abs);
  const sum=a=>a.reduce((s,x)=>s+x,0);
  const n=deltasA.length;
  const wuWins=deltasA.reduce((s,v,i)=>s+(Math.abs(v)-Math.abs(deltasB[i])>1e-8?1:0),0);
  const luhaWins=deltasA.reduce((s,v,i)=>s+(Math.abs(deltasB[i])-Math.abs(v)>1e-8?1:0),0);
  return {pairs:n,
    sumAbsLuha:sum(absA),sumAbsWu:sum(absB),
    sumBiasLuha:sum(deltasA),sumBiasWu:sum(deltasB),
    sumSquaresLuha:sum(deltasA.map(x=>x*x)),
    sumSquaresWu:sum(deltasB.map(x=>x*x)),
    wuBetterSlots:wuWins,luhaBetterSlots:luhaWins,
    tiedSlots:n-wuWins-luhaWins};
}
function metrics(t){
  const n=t.pairs,div=(x)=>n?r3(x/n):null;
  return {pairs:n,
    maeLuhaPctPoints:div(t.sumAbsLuha),maeWuPctPoints:div(t.sumAbsWu),
    biasOwnMinusLuhaPctPoints:div(t.sumBiasLuha),
    biasOwnMinusWuPctPoints:div(t.sumBiasWu),
    rmseLuhaPctPoints:n?r3(Math.sqrt(t.sumSquaresLuha/n)):null,
    rmseWuPctPoints:n?r3(Math.sqrt(t.sumSquaresWu/n)):null,
    advantageWuMaePctPoints:n?r3((t.sumAbsLuha-t.sumAbsWu)/n):null,
    wuBetterSlots:t.wuBetterSlots,luhaBetterSlots:t.luhaBetterSlots,
    tiedSlots:t.tiedSlots};
}
function empty(){return totals([],[]);}
function combine(list){
  const t=empty();
  for(const d of list){
    for(const k of Object.keys(t)){
      const v=d[k];
      if(typeof v!=='number'||!Number.isFinite(v))throw Error('Corrupt triplet sums');
      t[k]+=v;
    }
  }
  return t;
}
export function buildCommonDay({day,original,references,baseline}){
  const {start,end}=dateWindow(day);
  validateRhDay(baseline,day);
  // Re-run the exact original RH scanner: if any source has changed,
  // fail closed rather than silently mixing historical QC snapshots.
  const check=buildRhDay({day,original,references});
  for(const key of ['counts','references','betweenReferences'])
    if(JSON.stringify(check[key])!==JSON.stringify(baseline[key]))
      throw Error('RH evidence changed since original daily QC: '+day);
  const own=selectOwn(original,start,end);
  const refs=Object.fromEntries(STATIONS.map(station=>[
    station,selectRef(references[station],station,start,end)]));
  const a=[],b=[],seen=[];
  for(const [slot,ownRH] of own){
    const luha=refs.luhamet_sehradice.get(slot);
    const wu=refs.wu_ilouka4.get(slot);
    if(luha===undefined||wu===undefined)continue;
    a.push(ownRH-luha);b.push(ownRH-wu);seen.push(slot);
  }
  const t=totals(a,b);
  if(t.pairs>baseline.counts.originalRhMeasuredSlots||
     t.pairs>baseline.references.luhamet_sehradice.againstOriginal.matchedSlots||
     t.pairs>baseline.references.wu_ilouka4.againstOriginal.matchedSlots)
    throw Error('Triplet count exceeds source QC pairs');
  return {schemaVersion:'1',tripletVersion:TRIPLET_VERSION,
    status:'screening_only',day,baselineSha256:hash(baseline),
    measuredOriginalSlots:baseline.counts.originalRhMeasuredSlots,
    sameSlotTriplets:t,metrics:metrics(t),
    safety:{databaseWrites:0,automaticApprovals:false,automaticCorrections:false,
      replacementRhPct:null},
    notes:'Only identical source+LuhaMet+WU UTC slots. No inferred RH in missing periods.'};
}
export function validateCommonDay(report,day,baseline){
  validateRhDay(baseline,day);
  const t=report?.sameSlotTriplets,metricsCalc=t?metrics(t):null;
  if(report?.schemaVersion!=='1'||report.tripletVersion!==TRIPLET_VERSION||
     report.status!=='screening_only'||report.day!==day||
     report.baselineSha256!==hash(baseline)||
     report.measuredOriginalSlots!==baseline.counts.originalRhMeasuredSlots||
     !t||t.pairs<0||!Number.isSafeInteger(t.pairs)||
     t.pairs>report.measuredOriginalSlots||
     t.pairs>baseline.references.luhamet_sehradice.againstOriginal.matchedSlots||
     t.pairs>baseline.references.wu_ilouka4.againstOriginal.matchedSlots||
     t.wuBetterSlots+t.luhaBetterSlots+t.tiedSlots!==t.pairs||
     JSON.stringify(metricsCalc)!==JSON.stringify(report.metrics)||
     report.safety?.databaseWrites!==0||
     report.safety?.automaticApprovals!==false||
     report.safety?.automaticCorrections!==false||
     report.safety?.replacementRhPct!==null)
     throw Error('Invalid, stale or unsafe triplet evidence');
  return report;
}
export function summarizeCommonDays(reports){
  const allDays=dateRange(),seen=new Set();
  for(const r of reports){
    if(!allDays.includes(r.day)||seen.has(r.day))throw Error('Unexpected or duplicate triplet day');
    seen.add(r.day);
  }
  const byMonth=Array.from({length:12},(_,i)=>{
    const month='2022-'+String(i+1).padStart(2,'0');
    const subset=reports.filter(r=>r.day.startsWith(month));
    const combined=combine(subset.map(r=>r.sameSlotTriplets));
    const daysWithData=subset.filter(r=>r.sameSlotTriplets.pairs>=24).length;
    return {month,processedDays:subset.length,
      daysWithAtLeast24Triplets:daysWithData,
      ...metrics(combined),
      sampleStatus:combined.pairs>=500&&daysWithData>=5?
        'coverage_sufficient_for_further_validation':'insufficient_matching_triplets'};
  });
  const full=combine(reports.map(r=>r.sameSlotTriplets));
  return {schemaVersion:'1',tripletVersion:TRIPLET_VERSION,status:'screening_only',
    period:{fromUtc:'2022-01-01T00:00:00Z',toExclusiveUtc:'2023-01-01T00:00:00Z'},
    analyzedDays:reports.length,pendingDays:365-reports.length,
    complete:reports.length===365,overall:metrics(full),months:byMonth,
    methodology:[
      'MAE/bias/RMSE for both references use exactly the same original-LuhaMet-WU five-minute UTC triplets.',
      'Reference nearest-slot distance is at most 30 seconds, 1-100 % RH, reference_only, with ambiguous slots excluded.',
      'Monthly sufficiency threshold is a reporting flag, NOT a validation of reference accuracy or reconstruction suitability.',
      'Months without valid triplets have null errors, never zero error.',
      'No substitution, adjustment or reconstruction of missing original humidity is performed.'
    ],safety:{databaseWrites:0,automaticApprovals:false,automaticCorrections:false}};
}
