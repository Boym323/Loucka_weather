import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WINDOWS,FROM,TO,monthWindows,summarizePrivateQc,combineOverview}
  from '../scripts/qc-quality-lib.mjs';
import {QC_VERSION,STATIONS} from '../scripts/qc-engine.mjs';
import {fingerprint} from '../scripts/qc-overflow-lib.mjs';

const report=w=>({
  schemaVersion:'1',qcVersion:QC_VERSION,dataset:'original',status:'screening_only',
  window:{fromUtc:w.from,toExclusiveUtc:w.to,expectedFiveMinuteSlots:2016},
  sourceQuality:{
    loucka:{totalRows:5,acceptedSlots:4,rejectedRows:1,flags:{temperature_missing_or_invalid:1}},
    luhamet_sehradice:{totalRows:5,acceptedSlots:4,rejectedRows:1,flags:{}},
    wu_ilouka4:{totalRows:4,acceptedSlots:4,rejectedRows:0,flags:{}}
  },
  comparisons:{
    luhamet_sehradice:{matchedPairs:4,reliability:{level:'strong',score:99}},
    wu_ilouka4:{matchedPairs:4,reliability:{level:'moderate',score:80}}
  },
  candidates:{total:2,shown:1,truncated:false,items:[{
    id:'candidate-fixture',kind:'suspect_source_run',source:'loucka',fromUtc:w.from,
    toExclusiveUtc:w.to,reviewState:'needs_manual_review',automaticWriteAllowed:false
  }]},
  safety:{databaseWrites:0,automaticCorrections:false,automaticApprovals:false,
    referenceStationsAreNotOriginalMeasurements:true}
});
// Validated QC invariants require truncation iff total > 100; most tests use small, fully visible proposals.
function validReport(w){
  const r=report(w);
  r.candidates.total=1;
  return r;
}
test('full fixed UTC audit has 932 contiguous periods; partial November ends at cutoff',()=>{
  assert.equal(FROM,'2009-01-01T00:00:00Z');
  assert.equal(TO,'2026-11-10T00:00:00Z');
  assert.equal(WINDOWS.length,932);
  const months=monthWindows();
  assert.equal(months.length,215);
  assert.equal(months[0].month,'2009-01');
  assert.equal(months.at(-1).month,'2026-11');
  assert.equal(months.at(-1).expectedSlots,9*288);
  const total=months.reduce((n,m)=>n+m.expectedSlots,0);
  const expected=(Date.parse(TO)-Date.parse(FROM))/300000;
  assert.equal(total,expected);
});
test('private QC model is conservative: week beginning used for attribution, no approval',()=>{
  let calls=0;
  const q=summarizePrivateQc((filename,w)=>{
    assert.ok(filename.startsWith('qc_'));
    calls++;
    return validReport(w);
  });
  assert.equal(calls,932);
  assert.equal(q.processed,932);
  const first=q.months.get('2009-01').qc;
  assert.equal(first.weeks,5);
  assert.equal(first.candidatesTotal,5);
  assert.equal(first.candidatesVisible,5);
  assert.equal(first.candidateKindsVisible.suspect_source_run,5);
  assert.equal(first.rejectedOriginal,5);
  assert.equal(first.references.luhamet_sehradice.strong,5);
  assert.equal(first.references.wu_ilouka4.moderate,5);
  assert.equal(first.flags.temperature_missing_or_invalid,5);
  const last=q.months.get('2026-11').qc;
  assert.ok(last.weeks>0);
});
test('exact calendar-month SQL slots remain independent of QC weeks',()=>{
  const q=summarizePrivateQc((_,w)=>validReport(w));
  const months=monthWindows();
  const sql=months.map(m=>({
    month:m.month,totalRows:200,onGridSlots:190,
    temperatureSlots:170,humiditySlots:30,temperatureNull:20,humidityNull:170
  }));
  const overview=combineOverview(q,sql);
  assert.equal(overview.months.length,215);
  assert.equal(overview.windows,932);
  assert.equal(overview.totals.totalRows,215*200);
  assert.equal(overview.totals.temperatureNull,215*20);
  assert.equal(overview.totals.humidityNull,215*170);
  assert.equal(overview.totals.rejectedOriginal,932);
  assert.equal(overview.totals.candidatesTotal,932);
  assert.equal(overview.totals.candidatesVisible,932);
  assert.equal(overview.totals.truncatedWeeks,0);
  assert.equal(overview.safety.databaseWrites,0);
  assert.equal(overview.safety.automaticApprovals,false);
  const jan=overview.months.find(x=>x.month==='2017-01');
  assert.equal(jan.temperatureSlots,170);
  assert.equal(jan.humiditySlots,30);
  assert.equal(jan.quality.weeks>0,true);
});
test('model refuses incomplete QC, unsafe review states and invalid SQL aggregates',()=>{
  assert.throws(()=>summarizePrivateQc(()=>({status:'approved'})));
  const q=summarizePrivateQc((_,w)=>validReport(w));
  const months=monthWindows();
  const rows=months.map(m=>({month:m.month,totalRows:1,onGridSlots:1,
    temperatureSlots:1,humiditySlots:1,temperatureNull:0,humidityNull:0}));
  assert.throws(()=>combineOverview(q,rows.slice(1)),/Missing SQL month/);
  assert.throws(()=>combineOverview(q,[...rows,rows[0]]),/Duplicate SQL month/);
  assert.throws(()=>combineOverview(q,rows.map((r,i)=>i===0?
    {...r,temperatureSlots:2}:r)),/Invalid SQL aggregation/);
  assert.throws(()=>combineOverview(q,rows.map((r,i)=>i===0?
    {...r,humidityNull:2}:r)),/Invalid SQL aggregation/);
});
test('viewer is self-contained with one safe injection slot and no external dependencies',()=>{
  const source=readFileSync(new URL('../scripts/qc-quality-viewer.html',import.meta.url),'utf8');
  assert.equal(source.split('__QUALITY_DATA__').length,2);
  assert.match(source,/<meta name="referrer" content="no-referrer">/);
  assert.doesNotMatch(source,/<script[^>]+src=|<link[^>]+href=|https?:\/\//i);
  assert.match(source,/Export CSV/);
  assert.match(source,/Dostupnost teploty/);
  assert.match(source,/Dostupnost vlhkosti/);
  assert.match(source,/Referenční stanice/);
});

test('complete recovery assigns candidate events to true UTC start month, not old week-start month',()=>{
  const specialWindow=WINDOWS.find(w=>w.from==='2009-01-29T00:00:00Z');
  assert.ok(specialWindow);
  const special=validReport(specialWindow);
  special.candidates={
    total:120,shown:100,truncated:true,
    items:Array.from({length:100},(_,i)=>({...special.candidates.items[0],
      id:'jan-visible-'+i,fromUtc:'2009-01-29T00:00:00Z'}))
  };
  const overflowItems=Array.from({length:20},(_,i)=>({
    ...special.candidates.items[0],id:'feb-extra-'+i,
    kind:'temperature_disagreement',fromUtc:'2009-02-02T00:00:00Z'
  }));
  const sidecar={schemaVersion:'1',qcVersion:QC_VERSION,status:'screening_only',
    truncatedWindows:1,recoveredCandidates:20,entries:[{
      fromUtc:specialWindow.from,toExclusiveUtc:specialWindow.to,
      baseTotal:120,baseShown:100,baseSha256:fingerprint(special),
      items:overflowItems
    }],safety:{databaseWrites:0,automaticCorrections:false,automaticApprovals:false}};
  const qc=summarizePrivateQc((_,w)=>w.from===specialWindow.from?special:validReport(w),sidecar);
  const totalExact=[...qc.months.values()].reduce((n,m)=>n+m.qc.candidatesStartingHere,0);
  const totalWeekly=[...qc.months.values()].reduce((n,m)=>n+m.qc.candidatesTotal,0);
  assert.equal(totalExact,totalWeekly);
  assert.equal(qc.recoveredCandidates,20);
  assert.equal(qc.completeCandidates.length,totalWeekly);
  const jan=qc.months.get('2009-01').qc,feb=qc.months.get('2009-02').qc;
  assert.equal(jan.candidateKindsStartingHere.temperature_disagreement,0);
  assert.equal(feb.candidateKindsStartingHere.temperature_disagreement,20);
  assert.equal(jan.candidatesStartingHere<jan.candidatesTotal,true);
  const sql=monthWindows().map(m=>({month:m.month,totalRows:1,onGridSlots:1,
    temperatureSlots:1,humiditySlots:1,temperatureNull:0,humidityNull:0}));
  const overview=combineOverview(qc,sql);
  assert.equal(overview.candidateDetailsComplete,true);
  assert.equal(overview.recoveredCandidates,20);
});
