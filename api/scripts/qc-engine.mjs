/** Read-only, advisory QC for bounded UTC windows. No persistence or automatic approval. */
import {createHash} from 'node:crypto';

export const QC_VERSION='weather-qc-screening-v1';
export const STATIONS=Object.freeze(['luhamet_sehradice','wu_ilouka4']);
export const MAX_WINDOW_SECONDS=7*86400;
const SLOT=300;
const MAX_CANDIDATES=100;
const limits={min:-55,max:55};

export function parseWindow(from,to){
  function parse(iso){
    if(typeof iso!=='string'||!(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(iso)))
      throw new Error('Specify a full UTC timestamp YYYY-MM-DDTHH:mm:ssZ');
    const ms=Date.parse(iso);
    if(!Number.isFinite(ms)||new Date(ms).toISOString()!==iso.replace('Z','.000Z'))
      throw new Error('Invalid UTC calendar timestamp');
    return ms/1000;
  }
  const start=parse(from),end=parse(to);
  if(start<Date.parse('2009-01-01T00:00:00Z')/1000||end<=start||
     end-start>MAX_WINDOW_SECONDS||start%SLOT!==0||end%SLOT!==0)
    throw new Error('Window must be UTC, 5-minute aligned, after 2009 and at most 7 days');
  return {start,end,expectedSlots:(end-start)/SLOT};
}
export function validateStations(stations){
  if(!Array.isArray(stations)||stations.length<1||stations.length>STATIONS.length||
     new Set(stations).size!==stations.length||
     stations.some(station=>!STATIONS.includes(station)))
    throw new Error('Only allowlisted reference stations are supported');
  return stations;
}
function round(value){return value===null?null:Math.round(value*1000)/1000;}
function stamp(seconds){return new Date(seconds*1000).toISOString();}
function slotFor(time){return Math.round(time/SLOT)*SLOT;}
function numeric(value){return typeof value==='number'&&Number.isFinite(value);}
function normalize(row,station){
  const flags=[];
  let temperature=station==='loucka'?row.outTemp:row.temperature_c;
  const humidity=station==='loucka'?row.outHumidity:row.relative_humidity_pct;
  const time=station==='loucka'?row.dateTime:row.observed_at_utc;
  if(!Number.isSafeInteger(time)||time<0)flags.push('invalid_timestamp');
  if(!numeric(temperature))flags.push('temperature_missing_or_invalid');
  else {
    if(station==='loucka'){
      if(row.usUnits===1)temperature=(temperature-32)*5/9;
      else if(row.usUnits!==16&&row.usUnits!==17)flags.push('unknown_unit_system');
      if(!Number.isSafeInteger(row.interval)||row.interval<1||row.interval>30)
        flags.push('invalid_interval_minutes');
    }else if(row.quality_status!=='reference_only'){
      flags.push('reference_status_unrecognized');
    }
    if(temperature<limits.min||temperature>limits.max)
      flags.push('temperature_outside_screening_limits');
  }
  if(humidity!==null&&humidity!==undefined&&
     (!numeric(humidity)||humidity<0||humidity>100))flags.push('humidity_invalid');
  if(temperature===0&&humidity===0)flags.push('zero_temperature_and_humidity');
  if(humidity===0)flags.push('zero_humidity');
  return {time,temperature:numeric(temperature)?temperature:null,humidity,
    flags,source:station,original:row};
}
function markFrozen(entries){
  let i=0;
  while(i<entries.length){
    let j=i+1;
    while(j<entries.length&&entries[i].temperature!==null&&
       entries[j].temperature===entries[i].temperature&&
       entries[j].time>entries[j-1].time&&entries[j].time-entries[j-1].time<=600)j++;
    if(j-i>=72&&entries[j-1].time-entries[i].time>=6*3600-600)
      for(let n=i;n<j;n++)entries[n].flags.push('constant_temperature_six_hours');
    i=j;
  }
}
function inspect(rows,station,window){
  if(!Array.isArray(rows)||rows.length>2800)
    throw new Error('Input must be an array with at most 2800 bounded rows per source');
  const entries=rows.map(r=>normalize(r,station))
    .filter(e=>Number.isSafeInteger(e.time)&&e.time>=window.start-3600&&e.time<window.end+150)
    .sort((a,b)=>a.time-b.time);
  markFrozen(entries);
  if(station==='loucka'){
    for(let i=1;i<entries.length;i++){
      const previous=entries[i-1],current=entries[i];
      if(current.time===previous.time){
        previous.flags.push('duplicate_archive_timestamp');
        current.flags.push('duplicate_archive_timestamp');
      }
      if(Number.isSafeInteger(current.original.interval)&&current.original.interval>0&&
         current.time-current.original.interval*60<previous.time){
        previous.flags.push('overlapping_archive_intervals');
        current.flags.push('overlapping_archive_intervals');
      }
    }
  }
  const slots=new Map();
  for(const entry of entries){
    const slot=slotFor(entry.time);
    if(slot<window.start||slot>=window.end)continue;
    if(Math.abs(entry.time-slot)>=150)entry.flags.push('ambiguous_time_alignment');
    if(station==='loucka'&&Math.abs(entry.time-slot)>30)
      entry.flags.push('original_timestamp_off_grid');
    if(!slots.has(slot))slots.set(slot,[]);
    slots.get(slot).push(entry);
  }
  for(const items of slots.values())if(items.length>1)
    for(const entry of items)entry.flags.push('multiple_measurements_in_slot');
  const accepted=new Map();
  let evaluated=0,rejected=0;
  const rejectedRows=[];
  for(const entry of entries){
    const slot=slotFor(entry.time);
    // Reference timestamps can be a few seconds before UTC boundary; assess their aligned slot.
    if(station==='loucka'?(entry.time<window.start||entry.time>=window.end):
       (slot<window.start||slot>=window.end))continue;
    evaluated++;
    if(!entry.flags.length&&entry.temperature!==null&&slots.get(slot)?.length===1)
      accepted.set(slot,entry);
    else{
      rejected++;
      rejectedRows.push(entry);
    }
  }
  return {entries,accepted,rejectedRows,summary:{
    totalRows:evaluated,acceptedSlots:accepted.size,rejectedRows:rejected,
    rejectionFraction:evaluated?round(rejected/evaluated):null,
    flags:Object.fromEntries([...new Set(rejectedRows.flatMap(e=>e.flags))].sort()
      .map(flag=>[flag,rejectedRows.filter(e=>e.flags.includes(flag)).length]))
  }};
}
function candidate(kind,source,start,end,reason,details){
  const seed=[QC_VERSION,kind,source,start,end,reason].join('|');
  return {id:createHash('sha256').update(seed).digest('hex').slice(0,16),
    kind,source,fromUtc:stamp(start),toExclusiveUtc:stamp(end),reason,
    details,reviewState:'needs_manual_review',automaticWriteAllowed:false};
}
function anomalyCandidates(result,source,window){
  const candidates=[];
  const rejected=result.rejectedRows.filter(e=>e.flags.length);
  let index=0;
  while(index<rejected.length){
    const begin=rejected[index];
    const reason=[...new Set(begin.flags)].sort().join(',');
    let finish=index+1;
    while(finish<rejected.length&&rejected[finish].time-rejected[finish-1].time<=600&&
      [...new Set(rejected[finish].flags)].sort().join(',')===reason)finish++;
    candidates.push(candidate('suspect_source_run',source,
      Math.max(window.start,begin.time),Math.min(window.end,rejected[finish-1].time+300),
      reason,{rows:finish-index,sourceType:source==='loucka'?'own_measurement':'reference_only'}));
    index=finish;
  }
  return candidates;
}
function compare(own,reference,window,station){
  const deltas=[];
  const matched=[];
  const outlierCandidates=[];
  for(const [slot,local] of own.accepted){
    const ref=reference.accepted.get(slot);
    if(!ref)continue;
    const diff=local.temperature-ref.temperature;
    deltas.push(diff);
    matched.push(slot);
    if(Math.abs(diff)>5)
      outlierCandidates.push(candidate('temperature_disagreement',station,slot,slot+300,
        'absolute_temperature_difference_over_5_c',
        {originalTemperatureC:round(local.temperature),
         referenceTemperatureC:round(ref.temperature),differenceC:round(diff)}));
  }
  const pairs=deltas.length;
  const mean=pairs?deltas.reduce((a,b)=>a+b,0)/pairs:null;
  const mae=pairs?deltas.reduce((a,b)=>a+Math.abs(b),0)/pairs:null;
  const rmse=pairs?Math.sqrt(deltas.reduce((a,b)=>a+b*b,0)/pairs):null;
  const outliers=deltas.filter(d=>Math.abs(d)>5).length;
  const p95=pairs?[...deltas].map(Math.abs).sort((a,b)=>a-b)[Math.ceil(pairs*.95)-1]:null;
  const matchedFraction=pairs/window.expectedSlots;
  const badRows=own.summary.rejectedRows+reference.summary.rejectedRows;
  const totalRows=own.summary.totalRows+reference.summary.totalRows;
  const rejectedFraction=totalRows?badRows/totalRows:1;
  const score=pairs===0?0:Math.round(100*(0.35*Math.min(1,matchedFraction/.8)+
    0.25*Math.min(1,pairs/144)+0.25*Math.max(0,1-(mae??5)/5)+
    0.15*(1-rejectedFraction)));
  const level=pairs===0?'insufficient':
    pairs>=144&&matchedFraction>=.7&&rejectedFraction<=.05&&
      mae<=1.5&&outliers/pairs<=.01?'strong':
    pairs>=48&&matchedFraction>=.3&&rejectedFraction<=.2&&
      mae<=3&&outliers/pairs<=.1?'moderate':'limited';
  return {metrics:{
    matchedPairs:pairs,matchedFraction:round(matchedFraction),
    originalAcceptedSlots:own.accepted.size,referenceAcceptedSlots:reference.accepted.size,
    meanBiasC:round(mean),maeC:round(mae),rmseC:round(rmse),
    p95AbsoluteDifferenceC:round(p95),outliersOver5C:outliers,
    excludedRowsFraction:round(rejectedFraction)},
    reliability:{level,score,kind:'screening_heuristic_not_climatological_validation'},
    outlierCandidates};
}
function missingSourceCandidates(own,reference,window,station){
  const found=[];
  const available=[...reference.accepted.keys()]
    .filter(slot=>!own.accepted.has(slot)).sort((a,b)=>a-b);
  let i=0;
  while(i<available.length){
    const begin=available[i];
    let next=i+1;
    while(next<available.length&&available[next]===available[next-1]+300)next++;
    const ownPresent=available.slice(i,next).filter(slot=>
      own.entries.some(e=>slotFor(e.time)===slot&&e.time>=window.start&&e.time<window.end)).length;
    found.push(candidate('reference_evidence_for_gap',station,begin,available[next-1]+300,
      'no_accepted_original_measurement',
      {referenceSlots:next-i,originalRowsExistInSlots:ownPresent,
       referenceOnly:true,proposedOriginalValue:null}));
    i=next;
  }
  return found;
}
/** Pure function: does not issue SQL, write a file, or approve any candidate. */
export function buildQcReport({from,to,original,references,stations=STATIONS,candidateLimit=MAX_CANDIDATES}){
  // Only opt-in private recovery may request an expanded in-memory candidate list.
  // This changes neither IDs nor the default 100-item historical report format.
  if(!Number.isSafeInteger(candidateLimit)||candidateLimit<1||candidateLimit>20000)
    throw new Error('Invalid QC candidate limit');
  const window=parseWindow(from,to);
  validateStations(stations);
  if(!references||typeof references!=='object'||Array.isArray(references))
    throw new Error('Reference input is required');
  const own=inspect(original,'loucka',window);
  const comparisons={},sourceQuality={loucka:own.summary};
  let proposed=[...anomalyCandidates(own,'loucka',window)];
  for(const station of stations){
    if(!Object.hasOwn(references,station))throw new Error('Missing reference station rows');
    const ref=inspect(references[station],station,window);
    sourceQuality[station]=ref.summary;
    const result=compare(own,ref,window,station);
    comparisons[station]={...result.metrics,reliability:result.reliability};
    proposed.push(...anomalyCandidates(ref,station,window),
      ...result.outlierCandidates,...missingSourceCandidates(own,ref,window,station));
  }
  // Prioritise source anomalies, then large disagreements, then reference-only gaps.
  const order={suspect_source_run:0,temperature_disagreement:1,reference_evidence_for_gap:2};
  proposed.sort((a,b)=>order[a.kind]-order[b.kind]||a.fromUtc.localeCompare(b.fromUtc)||
    a.source.localeCompare(b.source));
  const candidateCount=proposed.length;
  proposed=proposed.slice(0,candidateLimit);
  return {schemaVersion:'1',qcVersion:QC_VERSION,dataset:'original',
    status:'screening_only',window:{fromUtc:from,toExclusiveUtc:to,
      expectedFiveMinuteSlots:window.expectedSlots},
    sourceQuality,comparisons,
    candidates:{total: candidateCount,shown:proposed.length,
      truncated:candidateCount>candidateLimit,items:proposed},
    safety:{databaseWrites:0,automaticCorrections:false,automaticApprovals:false,
      referenceStationsAreNotOriginalMeasurements:true},
    notes:['No candidate is a replacement value or an approved observation.',
      'Reliability is a conservative screening heuristic, not station calibration.',
      'UTC five-minute slots do not prove identical sensor exposure or provenance.',
      'Timestamp drift, constant runs and overlaps are flagged before pairing.']};
}
