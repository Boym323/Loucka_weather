/** Strictly read-only RH screening for one 2022 UTC day. No inferred replacement humidity. */
export const RH_VERSION='loucka-rh-screening-2022-v1';
export const RH_STATIONS=Object.freeze(['luhamet_sehradice','wu_ilouka4']);
const SLOT=300,MAX_SKEW=30;
export const RH_FIRST='2022-01-01',RH_END='2023-01-01';
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const plausible=value=>finite(value)&&value>=1&&value<=100;
const iso=seconds=>new Date(seconds*1000).toISOString();
const round=value=>value===null?null:Math.round(value*1000)/1000;
export function dateWindow(day){
  if(typeof day!=='string'||!/^2022-\d{2}-\d{2}$/.test(day)||
     new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)
    throw new Error('RH requires a valid UTC calendar day in 2022');
  const start=Date.parse(day+'T00:00:00Z')/1000;
  return {day,start,end:start+86400,expectedSlots:288};
}
export function dateRange(from=RH_FIRST,to=RH_END){
  const asDay=x=>x===RH_END?Date.parse(x+'T00:00:00Z')/1000:dateWindow(x).start;
  const start=asDay(from),end=asDay(to);
  if(start>=end||start<Date.parse(RH_FIRST+'T00:00:00Z')/1000||
     end>Date.parse(RH_END+'T00:00:00Z')/1000)
    throw new Error('RH date range must be within 2022 and end exclusive');
  const days=[];
  for(let t=start;t<end;t+=86400)days.push(iso(t).slice(0,10));
  return days;
}
function ingestOriginal(rows,window){
  if(!Array.isArray(rows)||rows.length>400)throw new Error('Original daily RH rows exceed 400');
  const groups=new Map();let offGridRows=0;
  for(const row of rows){
    const time=Number(row.dateTime);
    if(!Number.isSafeInteger(time)||time<window.start||time>=window.end)
      throw new Error('Original RH timestamp outside day');
    if(time%SLOT!==0){offGridRows++;continue;}
    const list=groups.get(time)||[];
    list.push(row);groups.set(time,list);
  }
  let duplicateSlots=0;
  const accepted=new Map();
  for(const [time,list] of groups){
    if(list.length===1)accepted.set(time,list[0]);
    else duplicateSlots++;
  }
  return {accepted,groups,offGridRows,duplicateSlots,rows:rows.length};
}
function ingestReference(rows,station,window){
  if(!Array.isArray(rows)||rows.length>400)throw new Error('Reference daily RH rows exceed 400');
  const groups=new Map();let rejected=0,offTime=0,zeroRh=0,invalidRh=0;
  for(const row of rows){
    if(row.station_id!==station)throw new Error('Unexpected RH reference station');
    const time=Number(row.observed_at_utc);
    if(!Number.isSafeInteger(time)||time<window.start-MAX_SKEW||
       time>=window.end+MAX_SKEW)throw new Error('Reference RH timestamp outside bounded day');
    const slot=Math.round(time/SLOT)*SLOT;
    if(slot<window.start||slot>=window.end)continue;
    if(Math.abs(time-slot)>MAX_SKEW){offTime++;rejected++;continue;}
    const humidity=row.relative_humidity_pct;
    if(humidity===0)zeroRh++;
    if(!plausible(humidity))invalidRh++;
    if(row.quality_status!=='reference_only'||!plausible(humidity)){
      rejected++;continue;
    }
    const group=groups.get(slot)||[];
    group.push({value:humidity,time});
    groups.set(slot,group);
  }
  const accepted=new Map();let ambiguousSlots=0;
  for(const [slot,group] of groups)
    if(group.length===1)accepted.set(slot,group[0]);
    else ambiguousSlots++;
  return {accepted,rows:rows.length,rejected,offTime,zeroRh,invalidRh,ambiguousSlots};
}
function mean(nums){return nums.length?round(nums.reduce((a,b)=>a+b,0)/nums.length):null;}
function compare(a,b){
  const deltas=[];
  for(const [slot,left] of a){
    const right=b.get(slot);
    if(right)deltas.push(left.value-right.value);
  }
  return {matchedSlots:deltas.length,meanBiasPctPoints:mean(deltas),
    maePctPoints:mean(deltas.map(Math.abs)),
    maxAbsoluteDifferencePctPoints:deltas.length?round(Math.max(...deltas.map(Math.abs))):null};
}
function segments(states,window){
  const spans=[];
  for(let i=0;i<states.length;){
    const state=states[i];
    if(state==='measured'){i++;continue;}
    let j=i+1;
    while(j<states.length&&states[j]===state)j++;
    spans.push({kind:state,fromUtc:iso(window.start+i*SLOT),
      toExclusiveUtc:iso(window.start+j*SLOT),slots:j-i});
    i=j;
  }
  return spans;
}
export function buildRhDay({day,original,references}){
  const window=dateWindow(day),own=ingestOriginal(original,window);
  if(!references||typeof references!=='object')throw new Error('RH reference input missing');
  const refs=Object.fromEntries(RH_STATIONS.map(station=>[
    station,ingestReference(references[station],station,window)]));
  const status=[],ownValid=new Map();
  const available=Object.fromEntries(RH_STATIONS.map(s=>[s,new Map()]));
  const counts={expectedSlots:288,originalRows:own.rows,
    originalGridSlots:own.groups.size,originalOffGridRows:own.offGridRows,
    originalDuplicateSlots:own.duplicateSlots,
    originalAbsentSlots:0,originalRhNullSlots:0,originalRhInvalidSlots:0,
    originalRhMeasuredSlots:0,missingRhBothReferenceSlots:0,
    missingRhTwoRefsAgreeSlots:0,missingRhSingleReferenceSlots:0,
    missingRhNoReferenceSlots:0,originalAbsentWithTwoRefsSlots:0};
  const referenceEvidence=[];
  for(let i=0;i<288;i++){
    const slot=window.start+i*SLOT;
    const row=own.accepted.get(slot),present=own.groups.has(slot);
    let state='measured';
    if(!present){state='archive_absent';counts.originalAbsentSlots++;}
    else if(!row){state='rh_invalid_or_ambiguous';counts.originalRhInvalidSlots++;}
    else if(row.outHumidity===null||row.outHumidity===undefined){
      state='rh_null';counts.originalRhNullSlots++;
    }else if(!plausible(row.outHumidity)){
      state='rh_invalid_or_ambiguous';counts.originalRhInvalidSlots++;
    }else{counts.originalRhMeasuredSlots++;ownValid.set(slot,{value:row.outHumidity,time:slot});}
    status.push(state);
    const lu=refs.luhamet_sehradice.accepted.get(slot);
    const wu=refs.wu_ilouka4.accepted.get(slot);
    if(state==='archive_absent'&&lu&&wu)counts.originalAbsentWithTwoRefsSlots++;
    if(state==='rh_null'){
      if(lu&&wu){
        counts.missingRhBothReferenceSlots++;
        if(Math.abs(lu.value-wu.value)<=10){
          counts.missingRhTwoRefsAgreeSlots++;
          referenceEvidence.push({atUtc:iso(slot),luhametRhPct:lu.value,
            ilouka4RhPct:wu.value,differencePctPoints:round(lu.value-wu.value),
            quality:'two_reference_agreement_screening_only',
            reviewState:'needs_manual_review',automaticWriteAllowed:false,
            proposedOriginalRhPct:null});
        }
      }else if(lu||wu)counts.missingRhSingleReferenceSlots++;
      else counts.missingRhNoReferenceSlots++;
    }
  }
  const coverage=Object.fromEntries(RH_STATIONS.map(station=>{
    const r=refs[station];
    return [station,{fetchedRows:r.rows,validSlots:r.accepted.size,
      rejectedRows:r.rejected,offTimeRows:r.offTime,
      zeroHumidityRows:r.zeroRh,invalidHumidityRows:r.invalidRh,
      ambiguousSlots:r.ambiguousSlots,
      againstOriginal:compare(ownValid,r.accepted)}];
  }));
  const betweenReferences=compare(refs.luhamet_sehradice.accepted,
    refs.wu_ilouka4.accepted);
  return {schemaVersion:'1',qcVersion:RH_VERSION,status:'screening_only',
    dataset:'original',utcDay:day,window:{fromUtc:iso(window.start),
      toExclusiveUtc:iso(window.end)},counts,references:coverage,
    betweenReferences,missingSegments:segments(status,window),
    referenceEvidence,safety:{databaseWrites:0,automaticApprovals:false,
      automaticCorrections:false},notes:[
      'A valid humidity reading means a nonzero 1–100% value in a uniquely occupied exact UTC slot; it is not a calibrated or certified observation.',
      'References are accepted only when status is reference_only, 1–100% RH, unique slot and within 30 seconds of five-minute UTC grid.',
      'Agreement threshold 10 percentage points is a preliminary filter, not proof of spatial equivalence. No replacement value is calculated.',
      'Daily segments end at 00:00 UTC; adjacent segments across day boundaries are not merged.',
      'Only null humidity with an existing unique original row can produce reviewable two-reference evidence; archive absence is counted separately.'
    ]};
}
export function validateRhDay(report,day){
  const window=dateWindow(day),c=report?.counts;
  if(report?.schemaVersion!=='1'||report.qcVersion!==RH_VERSION||
     report.status!=='screening_only'||report.dataset!=='original'||
     report.utcDay!==day||report.window?.fromUtc!==iso(window.start)||
     report.window?.toExclusiveUtc!==iso(window.end)||
     report.safety?.databaseWrites!==0||
     report.safety?.automaticApprovals!==false||
     report.safety?.automaticCorrections!==false||!c||
     !Number.isSafeInteger(c.originalRhMeasuredSlots)||
     c.originalAbsentSlots+c.originalRhNullSlots+
     c.originalRhInvalidSlots+c.originalRhMeasuredSlots!==288||
     c.missingRhTwoRefsAgreeSlots!==report.referenceEvidence?.length||
     report.referenceEvidence.some(e=>e.proposedOriginalRhPct!==null||
       e.reviewState!=='needs_manual_review'||e.automaticWriteAllowed!==false))
    throw new Error('Unsafe or invalid daily RH evidence');
  return report;
}
export function summarizeRhDays(reports,range=dateRange()){
  const daily=reports.map(r=>validateRhDay(r,r.utcDay));
  const seen=new Set();
  for(const r of daily){
    if(!range.includes(r.utcDay)||seen.has(r.utcDay))throw new Error('Unexpected or duplicate RH day');
    seen.add(r.utcDay);
  }
  const columns=['expectedSlots','originalRows','originalGridSlots','originalOffGridRows',
    'originalAbsentSlots','originalRhNullSlots','originalRhInvalidSlots',
    'originalRhMeasuredSlots','missingRhBothReferenceSlots',
    'missingRhTwoRefsAgreeSlots','missingRhSingleReferenceSlots',
    'missingRhNoReferenceSlots','originalAbsentWithTwoRefsSlots'];
  const totals=Object.fromEntries(columns.map(k=>[
    k,daily.reduce((n,r)=>n+r.counts[k],0)]));
  const months={};
  for(const r of daily){
    const month=r.utcDay.slice(0,7);
    const item=months[month]??={days:0};
    item.days++;
    for(const k of columns)item[k]=(item[k]??0)+r.counts[k];
  }
  return {schemaVersion:'1',qcVersion:RH_VERSION,status:'screening_only',
    dataset:'original',period:{fromUtc:range[0]+'T00:00:00Z',
      toExclusiveUtc:new Date(Date.parse(range.at(-1)+'T00:00:00Z')+86400000).toISOString()},
    analyzedDays:daily.length,expectedDays:range.length,
    pendingDays:range.filter(d=>!seen.has(d)).length,
    complete:daily.length===range.length,totals,months,
    daily:daily.map(r=>({day:r.utcDay,counts:r.counts,
      betweenReferences:r.betweenReferences,
      references:r.references})),
    safety:{databaseWrites:0,automaticApprovals:false,automaticCorrections:false},
    note:'Candidate evidence is not an approved reconstructed humidity value.'};
}
