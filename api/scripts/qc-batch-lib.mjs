/** Pure, testable planning / validation for incremental read-only QC scans. */
import {parseWindow,validateStations,QC_VERSION,STATIONS} from './qc-engine.mjs';

const SEVEN_DAYS=7*86400;
const MAX_HISTORY=7500*86400;
function stamp(epoch){return new Date(epoch*1000).toISOString().replace('.000Z','Z');}
function strictUtc(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value))
    throw new Error('Expected an explicit UTC timestamp YYYY-MM-DDTHH:mm:ssZ');
  const epoch=Date.parse(value)/1000;
  if(!Number.isSafeInteger(epoch)||stamp(epoch)!==value||epoch%300!==0)
    throw new Error('Timestamp must be a valid UTC five-minute boundary');
  return epoch;
}
export function planQcWindows(from,to,stations=STATIONS){
  validateStations(stations);
  const start=strictUtc(from),end=strictUtc(to);
  if(start<Date.parse('2009-01-01T00:00:00Z')/1000||end<=start||
     end-start>MAX_HISTORY||end>Date.now()/1000)
    throw new Error('QC history range must be historical, nonempty and at most 7500 days');
  const windows=[];
  for(let cursor=start;cursor<end;cursor+=SEVEN_DAYS){
    const next=Math.min(end,cursor+SEVEN_DAYS);
    const w={from:stamp(cursor),to:stamp(next),stations:[...stations]};
    parseWindow(w.from,w.to);
    windows.push(w);
  }
  return windows;
}
export function reportFilename(w){
  const encode=s=>s.replaceAll('-','').replaceAll(':','');
  validateStations(w.stations);
  parseWindow(w.from,w.to);
  return 'qc_'+encode(w.from)+'_'+encode(w.to)+'_'+[...w.stations].sort().join('_')+'.json';
}
export function validateQcReport(report,w){
  if(!report||typeof report!=='object'||report.schemaVersion!=='1'||
     report.qcVersion!==QC_VERSION||report.dataset!=='original'||
     report.status!=='screening_only'||
     report.window?.fromUtc!==w.from||report.window?.toExclusiveUtc!==w.to||
     report.safety?.databaseWrites!==0||
     report.safety?.automaticCorrections!==false||
     report.safety?.automaticApprovals!==false||
     report.safety?.referenceStationsAreNotOriginalMeasurements!==true||
     !report.sourceQuality?.loucka||!report.comparisons||
     !report.candidates||!Array.isArray(report.candidates.items)||
     !Number.isSafeInteger(report.candidates.total)||
     !Number.isSafeInteger(report.candidates.shown)||
     report.candidates.shown!==report.candidates.items.length||
     report.candidates.shown>100||
     report.candidates.truncated!==(report.candidates.total>100)||
     report.candidates.items.some(c=>c.reviewState!=='needs_manual_review'||
       c.automaticWriteAllowed!==false))
    throw new Error('Invalid or potentially unsafe QC report');
  for(const station of w.stations)
    if(!report.sourceQuality[station]||!report.comparisons[station])
      throw new Error('QC report does not contain every requested station');
  return report;
}
export function summarizeQcReports(reports){
  const quality={},reliability={},kinds={};
  let proposals=0,visible=0,truncated=0,zeroPairs=0;
  for(const report of reports){
    proposals+=report.candidates.total;
    visible+=report.candidates.shown;
    if(report.candidates.truncated)truncated++;
    for(const [source,details] of Object.entries(report.sourceQuality)){
      const agg=quality[source]??={totalRows:0,rejectedRows:0,acceptedSlots:0,flags:{}};
      agg.totalRows+=details.totalRows;
      agg.rejectedRows+=details.rejectedRows;
      agg.acceptedSlots+=details.acceptedSlots;
      for(const [flag,count] of Object.entries(details.flags||{}))
        agg.flags[flag]=(agg.flags[flag]??0)+count;
    }
    for(const [source,comparison] of Object.entries(report.comparisons)){
      const agg=reliability[source]??={windowCount:0,matchedPairs:0,
        strong:0,moderate:0,limited:0,insufficient:0};
      agg.windowCount++;
      agg.matchedPairs+=comparison.matchedPairs;
      agg[comparison.reliability.level]++;
      if(comparison.matchedPairs===0)zeroPairs++;
    }
    for(const item of report.candidates.items)
      kinds[item.kind]=(kinds[item.kind]??0)+1;
  }
  return {schemaVersion:'1',qcVersion:QC_VERSION,status:'screening_only',
    processedWindows:reports.length,totalCandidateProposals:proposals,
    visibleCandidateProposals:visible,truncatedWindows:truncated,
    stationWindowsWithoutMatchedPairs:zeroPairs,
    sourceQuality:quality,reliabilityByStation:reliability,candidateKinds:kinds,
    safety:{automaticCorrections:false,automaticApprovals:false,databaseWrites:0},
    notes:['Each window is an independent UTC scan; reports are evidence, not approved corrections.',
      'Candidate totals may include repeated boundary evidence; not a unique missing-day count.',
      'Scores do not establish long-term station calibration, and no reference is original Loucka data.']};
}
