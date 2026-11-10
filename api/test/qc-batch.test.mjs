import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {planQcWindows,reportFilename,validateQcReport,summarizeQcReports}
  from '../scripts/qc-batch-lib.mjs';
import {QC_VERSION} from '../scripts/qc-engine.mjs';

const from='2026-10-01T00:00:00Z',to='2026-10-17T00:00:00Z';
const windows=planQcWindows(from,to);
const report=w=>({
  schemaVersion:'1',qcVersion:QC_VERSION,dataset:'original',status:'screening_only',
  window:{fromUtc:w.from,toExclusiveUtc:w.to,expectedFiveMinuteSlots:2016},
  sourceQuality:{
    loucka:{totalRows:2016,rejectedRows:1,acceptedSlots:2015,flags:{humidity_invalid:1}},
    luhamet_sehradice:{totalRows:2016,rejectedRows:0,acceptedSlots:2016,flags:{}},
    wu_ilouka4:{totalRows:0,rejectedRows:0,acceptedSlots:0,flags:{}}
  },
  comparisons:{
    luhamet_sehradice:{matchedPairs:2015,reliability:{level:'strong',score:95}},
    wu_ilouka4:{matchedPairs:0,reliability:{level:'insufficient',score:0}}
  },
  candidates:{total:1,shown:1,truncated:false,items:[{
    id:'example-id',kind:'suspect_source_run',source:'loucka',
    reviewState:'needs_manual_review',automaticWriteAllowed:false
  }]},
  safety:{databaseWrites:0,automaticCorrections:false,automaticApprovals:false,
    referenceStationsAreNotOriginalMeasurements:true}
});

test('2009–2026 scan produces contiguous bounded windows without a day gap',()=>{
  const windows=planQcWindows('2009-01-01T00:00:00Z','2026-11-10T00:00:00Z');
  assert.ok(windows.length>900);
  assert.equal(windows[0].from,'2009-01-01T00:00:00Z');
  assert.equal(windows.at(-1).to,'2026-11-10T00:00:00Z');
  for(let i=0;i<windows.length;i++){
    const w=windows[i];
    assert.ok(Date.parse(w.to)-Date.parse(w.from)<=7*86400*1000);
    if(i>0)assert.equal(windows[i-1].to,w.from);
  }
  assert.equal(new Set(windows.map(reportFilename)).size,windows.length);
});

test('ranges reject invalid dates, future time and unexpected station',()=>{
  for(const [a,b] of [
    ['2009-02-30T00:00:00Z',to],
    ['2008-12-31T00:00:00Z',to],
    [to,from],
    ['2009-01-01T00:00:00+01:00',to],
    ['2009-01-01T00:01:00Z',to],
    ['2009-01-01T00:00:00Z','2099-01-01T00:00:00Z']
  ])assert.throws(()=>planQcWindows(a,b));
  assert.throws(()=>planQcWindows(from,to,['arbitrary_station']));
});

test('stored reports must be screening-only, complete and never approve writes',()=>{
  const original=report(windows[0]);
  assert.equal(validateQcReport(original,windows[0]),original);
  assert.throws(()=>validateQcReport({...original,status:'approved'},windows[0]));
  assert.throws(()=>validateQcReport({...original,safety:{...original.safety,databaseWrites:1}},windows[0]));
  assert.throws(()=>validateQcReport({...original,
    candidates:{...original.candidates,items:[{
      ...original.candidates.items[0],reviewState:'approved'}]}},windows[0]));
  assert.throws(()=>validateQcReport(original,windows[1]));
  assert.throws(()=>validateQcReport({...original,
    comparisons:{luhamet_sehradice:original.comparisons.luhamet_sehradice}},windows[0]));
});

test('aggregate summary counts flags and per-station coverage, not inferred corrections',()=>{
  const summary=summarizeQcReports([report(windows[0]),report(windows[1])]);
  assert.equal(summary.processedWindows,2);
  assert.equal(summary.sourceQuality.loucka.rejectedRows,2);
  assert.equal(summary.sourceQuality.loucka.flags.humidity_invalid,2);
  assert.equal(summary.reliabilityByStation.luhamet_sehradice.strong,2);
  assert.equal(summary.reliabilityByStation.wu_ilouka4.insufficient,2);
  assert.equal(summary.stationWindowsWithoutMatchedPairs,2);
  assert.equal(summary.totalCandidateProposals,2);
  assert.equal(summary.safety.automaticCorrections,false);
});

test('batch dry-run and summary never need DB credentials or execute a SQL query',t=>{
  const dir=mkdtempSync(join(tmpdir(),'loucka-qc-batch-'));
  chmodSync(dir,0o700);
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const args=['scripts/qc-batch.mjs','--from',from,'--to',to,
    '--output-dir',dir,'--max-windows','2'];
  const dry=spawnSync(process.execPath,[...args,'--dry-run'],
    {encoding:'utf8',cwd:process.cwd(),timeout:10000});
  assert.equal(dry.status,0,dry.stderr);
  const planned=JSON.parse(dry.stdout);
  assert.equal(planned.mode,'dry-run');
  assert.equal(planned.plannedWindows,3);
  assert.equal(planned.pendingWindows,3);
  assert.equal(planned.nextWindows.length,2);
  const summary=spawnSync(process.execPath,[...args,'--summary'],
    {encoding:'utf8',cwd:process.cwd(),timeout:10000});
  assert.equal(summary.status,0,summary.stderr);
  assert.equal(JSON.parse(summary.stdout).processedWindows,0);
  assert.equal(JSON.parse(summary.stdout).pendingWindows,3);
});

test('batch refuses unsafe output folder and poisoned existing report',t=>{
  const dir=mkdtempSync(join(tmpdir(),'loucka-qc-batch-'));
  chmodSync(dir,0o700);
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const args=['scripts/qc-batch.mjs','--from',from,'--to',to,
    '--output-dir',dir,'--dry-run'];
  chmodSync(dir,0o755);
  const exposed=spawnSync(process.execPath,args,{encoding:'utf8',cwd:process.cwd(),timeout:10000});
  assert.notEqual(exposed.status,0);
  chmodSync(dir,0o700);
  const poisoned=join(dir,reportFilename(windows[0]));
  writeFileSync(poisoned,JSON.stringify({...report(windows[0]),status:'approved'}),{mode:0o600});
  const run=spawnSync(process.execPath,args,{encoding:'utf8',cwd:process.cwd(),timeout:10000});
  assert.notEqual(run.status,0);
  assert.equal(run.stdout,'');
});


test('fast catch-up is strictly opt-in, bounded and cannot be combined with offline modes',t=>{
  const dir=mkdtempSync(join(tmpdir(),'loucka-qc-optin-'));
  chmodSync(dir,0o700);
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const args=['scripts/qc-batch.mjs','--from',from,'--to',to,'--output-dir',dir];
  const invalid=[
    ['--max-windows','5'],
    ['--delay-ms','1000'],
    ['--catch-up','--summary'],
    ['--catch-up','--dry-run'],
    ['--catch-up','--max-windows','1001'],
    ['--catch-up','--max-windows','-1'],
    ['--catch-up','--delay-ms','999'],
    ['--catch-up','--delay-ms','60001'],
    ['--catch-up','--delay-ms','oops']
  ];
  for(const flags of invalid){
    const result=spawnSync(process.execPath,[...args,...flags],{
      cwd:process.cwd(),encoding:'utf8',timeout:10000
    });
    assert.notEqual(result.status,0,flags.join(' '));
    assert.equal(result.stdout,'');
  }
  const help=spawnSync(process.execPath,['scripts/qc-batch.mjs','--help'],{
    cwd:process.cwd(),encoding:'utf8',timeout:10000
  });
  assert.equal(help.status,0,help.stderr);
  assert.match(help.stdout,/--catch-up --max-windows 1000 --delay-ms 2000/);
});
