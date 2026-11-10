import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildQcReport,parseWindow,validateStations,STATIONS} from '../scripts/qc-engine.mjs';

const from='2026-10-10T00:00:00Z',to='2026-10-10T04:00:00Z';
const base=Date.parse(from)/1000;
const own=(n,temp=10,humidity=70,other={})=>({
  dateTime:base+n*300,usUnits:16,interval:5,outTemp:temp,outHumidity:humidity,...other
});
const ref=(n,temp=10,humidity=70,other={})=>({
  observed_at_utc:base+n*300-8,temperature_c:temp,relative_humidity_pct:humidity,
  quality_status:'reference_only',...other
});
const run=(original,references={luhamet_sehradice:[],wu_ilouka4:[]},override={})=>
  buildQcReport({from,to,original,references,stations:STATIONS,...override});

test('strict bounded UTC 5-minute windows, allowed stations and no silent truncation',()=>{
  assert.deepEqual(parseWindow(from,to).expectedSlots,48);
  for(const [start,end] of [
    ['2026-02-30T00:00:00Z',to],
    ['2026-10-10T00:00:01Z',to],
    ['2026-10-10T00:00:00+01:00',to],
    [to,from],
    ['2008-12-31T00:00:00Z',to],
    ['2026-01-01T00:00:00Z','2026-01-09T00:00:00Z']
  ])assert.throws(()=>parseWindow(start,end));
  assert.throws(()=>validateStations(['user_selected_table']));
  assert.throws(()=>validateStations(['luhamet_sehradice','luhamet_sehradice']));
  assert.throws(()=>run(new Array(2801).fill(own(0))));
});

test('exact 5-minute pairing and WU -8s drift, no reference autosubstitution',()=>{
  const report=run([own(0,12),own(1,0,72)],{
    luhamet_sehradice:[ref(0,10),ref(1,0,85)],
    wu_ilouka4:[ref(0,11),ref(1,0,80)]
  });
  assert.equal(report.status,'screening_only');
  assert.equal(report.comparisons.luhamet_sehradice.matchedPairs,2);
  assert.equal(report.comparisons.luhamet_sehradice.meanBiasC,1);
  assert.equal(report.comparisons.wu_ilouka4.meanBiasC,.5);
  assert.equal(report.sourceQuality.loucka.acceptedSlots,2);
  assert.equal(report.safety.automaticCorrections,false);
  assert.equal(report.candidates.items.every(x=>x.automaticWriteAllowed===false),true);
});

test('0 °C is valid; 0 °C with RH 0 rejected as sentinel and never paired',()=>{
  const report=run([own(0,0,75),own(1,-12,85)],{
    luhamet_sehradice:[ref(0,0,85),ref(1,0,0)],
    wu_ilouka4:[ref(0,1,80),ref(1,-11,80)]
  });
  assert.equal(report.comparisons.luhamet_sehradice.matchedPairs,1);
  assert.equal(report.comparisons.wu_ilouka4.matchedPairs,2);
  assert.equal(report.sourceQuality.luhamet_sehradice.flags.zero_temperature_and_humidity,1);
  assert.ok(report.candidates.items.some(x=>x.source==='luhamet_sehradice'&&
    x.kind==='suspect_source_run'));
});

test('data with unknown units, impossible humidity and nonfinite temperatures rejected',()=>{
  const report=run([
    own(0,50,30,{usUnits:1}), // Fahrenheit -> 10 °C
    own(1,12,0),
    own(2,NaN,80),
    own(3,20,101),
    own(4,10,80,{usUnits:99})
  ],{luhamet_sehradice:[ref(0,10)],wu_ilouka4:[]});
  assert.equal(report.comparisons.luhamet_sehradice.matchedPairs,1);
  assert.equal(report.comparisons.luhamet_sehradice.meanBiasC,0);
  assert.equal(report.sourceQuality.loucka.rejectedRows,4);
  assert.equal(report.sourceQuality.loucka.flags.unknown_unit_system,1);
  assert.ok(report.sourceQuality.loucka.flags.zero_humidity>=1);
});

test('duplicate alignment and overlapping archive intervals are fail closed',()=>{
  const report=run([
    own(0,11),own(1,12),own(1,13,65,{dateTime:base+360})
  ],{
    luhamet_sehradice:[ref(0,10),ref(1,11),ref(1,12,70,{observed_at_utc:base+310})],
    wu_ilouka4:[]
  });
  assert.equal(report.sourceQuality.loucka.acceptedSlots,1,
    'unaffected first slot stays valid; overlapping later slot is rejected');
  assert.ok(report.sourceQuality.loucka.flags.overlapping_archive_intervals>=1);
  assert.ok(report.sourceQuality.loucka.flags.multiple_measurements_in_slot>=2);
  assert.equal(report.comparisons.luhamet_sehradice.matchedPairs,1);
  assert.ok(report.sourceQuality.luhamet_sehradice.flags.multiple_measurements_in_slot>=2);
});

test('reference-only gap proposals do not include replacement temperatures',()=>{
  const report=run([],{
    luhamet_sehradice:[ref(0,11),ref(1,12),ref(2,13),ref(5,14)],
    wu_ilouka4:[]
  });
  const gaps=report.candidates.items.filter(x=>x.kind==='reference_evidence_for_gap');
  assert.equal(gaps.length,2);
  assert.equal(gaps[0].details.referenceSlots,3);
  assert.equal(gaps[0].details.proposedOriginalValue,null);
  assert.equal(report.comparisons.luhamet_sehradice.reliability.level,'insufficient');
});

test('long constant temperature streak flagged for manual verification',()=>{
  const end='2026-10-10T07:00:00Z';
  const original=Array.from({length:84},(_,n)=>own(n,13.6,45));
  const references={
    luhamet_sehradice:Array.from({length:84},(_,n)=>ref(n,13.6,50)),
    wu_ilouka4:[]
  };
  const report=run(original,references,{to:end});
  assert.equal(report.sourceQuality.loucka.acceptedSlots,0);
  assert.equal(report.sourceQuality.loucka.flags.constant_temperature_six_hours,84);
  assert.equal(report.comparisons.luhamet_sehradice.matchedPairs,0);
  assert.ok(report.candidates.items.some(c=>c.reason.includes('constant_temperature_six_hours')));
});

test('large difference candidate is advisory, not an approved correction',()=>{
  const report=run([own(0,22)],{
    luhamet_sehradice:[ref(0,13)],
    wu_ilouka4:[ref(0,21)]
  });
  assert.equal(report.comparisons.luhamet_sehradice.outliersOver5C,1);
  const c=report.candidates.items.find(x=>x.kind==='temperature_disagreement');
  assert.equal(c.details.differenceC,9);
  assert.equal(c.reviewState,'needs_manual_review');
  assert.equal(c.automaticWriteAllowed,false);
  assert.equal(report.comparisons.wu_ilouka4.outliersOver5C,0);
});

test('bounded result max 100 proposals and truthful truncation metadata',()=>{
  const original=Array.from({length:48},(_,n)=>own(n,15,0));
  const refs={
    luhamet_sehradice:Array.from({length:48},(_,n)=>ref(n,5)),
    wu_ilouka4:Array.from({length:48},(_,n)=>ref(n,5))
  };
  const report=run(original,refs);
  assert.ok(report.candidates.total>=2);
  assert.equal(report.candidates.shown,report.candidates.items.length);
  assert.ok(report.candidates.shown<=100);
});

test('all-zero legitimate winter values are not rejected without further evidence',()=>{
  const originals=[own(0,0,90),own(1,0,85),own(2,0,82)];
  const references={luhamet_sehradice:[ref(0,0,80),ref(1,0,80),ref(2,0,80)],wu_ilouka4:[]};
  const report=run(originals,references);
  assert.equal(report.sourceQuality.loucka.rejectedRows,0);
  assert.equal(report.comparisons.luhamet_sehradice.matchedPairs,3);
});
