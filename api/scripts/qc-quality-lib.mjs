/** Pure read-only QC overview model. Source months use UTC, QC weeks are attributed to start month. */
import {planQcWindows,reportFilename,validateQcReport} from './qc-batch-lib.mjs';
import {validateOverflowSidecar} from './qc-overflow-lib.mjs';

export const FROM='2009-01-01T00:00:00Z';
export const TO='2026-11-10T00:00:00Z';
export const STATIONS=['luhamet_sehradice','wu_ilouka4'];
export const WINDOWS=planQcWindows(FROM,TO);
const LABELS={luhamet_sehradice:'LuhaMet Sehradice',wu_ilouka4:'WU ILOUKA4'};
export function monthWindows(){
  const first=new Date(FROM),last=new Date(TO),out=[];
  for(let y=first.getUTCFullYear();y<=last.getUTCFullYear();y++){
    for(let month=1;month<=12;month++){
      const s=Date.UTC(y,month-1,1)/1000;
      const e=Math.min(Date.UTC(y,month,1)/1000,last.getTime()/1000);
      if(e<=s)continue;
      out.push({month:y+'-'+String(month).padStart(2,'0'),
        from:s,to:e,expectedSlots:(e-s)/300});
    }
  }
  return out;
}
export function summarizePrivateQc(readReport,overflow=null){
  const months=new Map(monthWindows().map(m=>[m.month,{
    ...m,qc:{weeks:0,acceptedOriginal:0,rejectedOriginal:0,candidatesTotal:0,
      candidatesStartingHere:null,candidateKindsStartingHere:null,
      candidatesVisible:0,truncatedWeeks:0,
      candidateKindsVisible:{suspect_source_run:0,temperature_disagreement:0,reference_evidence_for_gap:0},
      flags:{},references:Object.fromEntries(STATIONS.map(s=>[s,{
        name:LABELS[s],acceptedSlots:0,matchedPairs:0,
        strong:0,moderate:0,limited:0,insufficient:0}]))}
  }]));
  let processed=0;
  const byWindow=new Map();
  const originalCandidates=[];
  const truncated=[];
  for(const w of WINDOWS){
    const report=validateQcReport(readReport(reportFilename(w),w),w);
    byWindow.set(w.from+'|'+w.to,report);
    originalCandidates.push(...report.candidates.items);
    if(report.candidates.truncated)truncated.push(w.from+'|'+w.to);
    const item=months.get(w.from.slice(0,7));
    if(!item)throw new Error('QC week falls outside requested months');
    processed++;
    const q=item.qc;
    q.weeks++;
    q.acceptedOriginal+=report.sourceQuality.loucka.acceptedSlots;
    q.rejectedOriginal+=report.sourceQuality.loucka.rejectedRows;
    q.candidatesTotal+=report.candidates.total;
    q.candidatesVisible+=report.candidates.shown;
    if(report.candidates.truncated)q.truncatedWeeks++;
    for(const candidate of report.candidates.items){
      if(!Object.hasOwn(q.candidateKindsVisible,candidate.kind))
        throw new Error('Unknown QC candidate kind');
      q.candidateKindsVisible[candidate.kind]++;
    }
    for(const [key,value] of Object.entries(report.sourceQuality.loucka.flags||{}))
      q.flags[key]=(q.flags[key]||0)+value;
    for(const station of STATIONS){
      const ref=q.references[station],source=report.sourceQuality[station];
      const cmp=report.comparisons[station];
      ref.acceptedSlots+=source.acceptedSlots;
      ref.matchedPairs+=cmp.matchedPairs;
      const level=cmp.reliability?.level;
      if(!['strong','moderate','limited','insufficient'].includes(level))
        throw new Error('Unknown QC reliability level');
      ref[level]++;
    }
  }
  let completeCandidates=null,recoveredCandidates=0;
  if(overflow!==null){
    recoveredCandidates=validateOverflowSidecar(overflow,(from,to)=>byWindow.get(from+'|'+to));
    const provided=new Set(overflow.entries.map(e=>e.fromUtc+'|'+e.toExclusiveUtc));
    if(provided.size!==truncated.length||truncated.some(k=>!provided.has(k)))
      throw new Error('Recovery sidecar does not cover all truncated weeks');
    completeCandidates=[...originalCandidates,...overflow.entries.flatMap(e=>e.items)];
    for(const m of months.values()){
      m.qc.candidatesStartingHere=0;
      m.qc.candidateKindsStartingHere={
        suspect_source_run:0,temperature_disagreement:0,reference_evidence_for_gap:0};
    }
    for(const candidate of completeCandidates){
      const month=candidate.fromUtc?.slice(0,7);
      const destination=months.get(month)?.qc;
      if(!destination||!Object.hasOwn(destination.candidateKindsStartingHere,candidate.kind))
        throw new Error('Invalid candidate UTC month in recovery evidence');
      destination.candidatesStartingHere++;
      destination.candidateKindsStartingHere[candidate.kind]++;
    }
  }
  return {processed,months,completeCandidates,recoveredCandidates};
}
export function combineOverview(qc,sqlRows){
  const rows=new Map(sqlRows.map(row=>[row.month,row]));
  if(rows.size!==sqlRows.length)throw new Error('Duplicate SQL month');
  const merged=[];
  for(const item of qc.months.values()){
    const r=rows.get(item.month);
    if(!r)throw new Error('Missing SQL month '+item.month);
    const n=key=>{
      const v=Number(r[key]);
      if(!Number.isSafeInteger(v)||v<0)return null;
      return v;
    };
    const total=n('totalRows'),onGrid=n('onGridSlots'),
      temp=n('temperatureSlots'),humid=n('humiditySlots'),
      tempNull=n('temperatureNull'),humidityNull=n('humidityNull');
    if([total,onGrid,temp,humid,tempNull,humidityNull].some(x=>x===null)||
       onGrid>item.expectedSlots||temp>onGrid||humid>onGrid||
       tempNull>total||humidityNull>total)
      throw new Error('Invalid SQL aggregation for '+item.month);
    merged.push({month:item.month,expectedSlots:item.expectedSlots,
      totalRows:total,onGridSlots:onGrid,temperatureSlots:temp,humiditySlots:humid,
      temperatureNull:tempNull,humidityNull,quality:item.qc});
  }
  if(rows.size!==merged.length)throw new Error('Unexpected SQL months');
  const sum=(field)=>merged.reduce((a,b)=>a+b[field],0);
  const sumQ=(field)=>merged.reduce((a,b)=>a+b.quality[field],0);
  return {schemaVersion:'1',status:'screening_only',dataset:'original',
    period:{fromUtc:FROM,toExclusiveUtc:TO},windows:qc.processed,
    months:merged,candidateDetailsComplete:qc.completeCandidates!==null,
    recoveredCandidates:qc.recoveredCandidates,
    totals:{expectedSlots:sum('expectedSlots'),
      onGridSlots:sum('onGridSlots'),temperatureSlots:sum('temperatureSlots'),
      humiditySlots:sum('humiditySlots'),totalRows:sum('totalRows'),
      temperatureNull:sum('temperatureNull'),humidityNull:sum('humidityNull'),
      rejectedOriginal:sumQ('rejectedOriginal'),candidatesTotal:sumQ('candidatesTotal'),
      candidatesVisible:sumQ('candidatesVisible'),
      truncatedWeeks:sumQ('truncatedWeeks')},
    methodology:[
      'Monthly SQL counts are UTC calendar intervals, five-minute expected slots at exact UTC grid boundaries.',
      'Temperature and humidity availability are counted separately as non-NULL original readings on the 5-minute grid; availability does not certify correctness.',
      'QC rejected-row counts, flags, and reference reliability belong to 7-day windows; they are attributed to the month in which the QC week starts, not the exact calendar month.',
      'When recovery sidecar exists, complete candidate events are assigned to their UTC START month; a candidate crossing month boundary is counted once at its start.',
      'A gap without original or reference records is still missing even if QC produced zero candidates.',
      'QC proposals are not approved corrections. Original 100-item weekly reports are never overwritten; recovered items are validated private evidence. No original database rows were modified.'
    ],safety:{databaseWrites:0,automaticApprovals:false,automaticCorrections:false}};
}
