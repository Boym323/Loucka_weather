import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,chmodSync,statSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {Script} from 'node:vm';
import {buildRhDay,dateRange,dateWindow,validateRhDay,summarizeRhDays}
  from '../scripts/qc-humidity-lib.mjs';
const date='2022-02-15',start=Date.parse(date+'T00:00:00Z')/1000;
const reference=(station,rows)=>rows.map(([sec,rh])=>({
  station_id:station,observed_at_utc:start+sec,
  relative_humidity_pct:rh,quality_status:'reference_only'}));
function sample(){
 return {day:date,original:[
  {dateTime:start,outHumidity:null},
  {dateTime:start+300,outHumidity:45},
  {dateTime:start+600,outHumidity:0},
  {dateTime:start+900,outHumidity:80},
  {dateTime:start+900,outHumidity:82},
  {dateTime:start+1500,outHumidity:null}
 ],references:{
  luhamet_sehradice:reference('luhamet_sehradice',
    [[0,50],[300,44],[600,51],[900,80],[1500,40],[1800,0]]),
  wu_ilouka4:reference('wu_ilouka4',
    [[-8,53],[292,47],[592,52],[892,80],[1492,80]])
 }};
}
test('RH days and ranges use exact UTC calendar boundaries and exclude 2023',()=>{
 assert.deepEqual(dateWindow('2022-02-15'),{
  day:'2022-02-15',start,end:start+86400,expectedSlots:288});
 assert.equal(dateRange('2022-02-27','2022-03-02').length,3);
 assert.equal(dateRange().length,365);
 for(const value of ['2022-02-29','2023-01-01','2022-13-10'])
  assert.throws(()=>dateWindow(value));
 assert.throws(()=>dateRange('2022-03-10','2022-02-01'));
});
test('RH distinguishes entirely absent slot, null, invalid zero, duplicate and WU -8 sec',()=>{
 const day=buildRhDay(sample()),c=day.counts;
 assert.equal(c.expectedSlots,288);
 assert.equal(c.originalRows,6);
 assert.equal(c.originalGridSlots,5);
 assert.equal(c.originalAbsentSlots,283);
 assert.equal(c.originalRhNullSlots,2);
 assert.equal(c.originalRhInvalidSlots,2);
 assert.equal(c.originalRhMeasuredSlots,1);
 assert.equal(c.originalDuplicateSlots,1);
 assert.equal(day.references.luhamet_sehradice.zeroHumidityRows,1);
 assert.equal(day.references.wu_ilouka4.validSlots,5);
 assert.equal(day.references.luhamet_sehradice.againstOriginal.matchedSlots,1);
 assert.equal(day.references.wu_ilouka4.againstOriginal.matchedSlots,1);
 assert.equal(c.missingRhBothReferenceSlots,2);
 assert.equal(c.missingRhTwoRefsAgreeSlots,1);
 assert.equal(day.referenceEvidence.length,1);
 assert.equal(day.referenceEvidence[0].atUtc,'2022-02-15T00:00:00.000Z');
 assert.equal(day.referenceEvidence[0].proposedOriginalRhPct,null);
 assert.equal(day.referenceEvidence[0].automaticWriteAllowed,false);
 assert.equal(day.referenceEvidence[0].reviewState,'needs_manual_review');
 assert.equal(day.betweenReferences.matchedSlots,5);
 assert.equal(day.missingSegments[0].kind,'rh_null');
 assert.equal(day.missingSegments[0].slots,1);
 assert.equal(day.missingSegments.at(-1).toExclusiveUtc,'2022-02-16T00:00:00.000Z');
 assert.equal(validateRhDay(day,date),day);
});
test('out-of-range, invalid stations, duplicate refs and non-reference states are excluded',()=>{
 const source=sample();
 source.references.wu_ilouka4.push({
  station_id:'wu_ilouka4',observed_at_utc:start+5,
  relative_humidity_pct:52,quality_status:'reference_only'
 });
 source.references.luhamet_sehradice.push({
  station_id:'luhamet_sehradice',observed_at_utc:start+1200,
  relative_humidity_pct:60,quality_status:'provisional'
 });
 const report=buildRhDay(source);
 assert.equal(report.references.wu_ilouka4.ambiguousSlots,1);
 assert.equal(report.counts.missingRhTwoRefsAgreeSlots,0);
 assert.equal(report.references.luhamet_sehradice.rejectedRows>=2,true);
 assert.throws(()=>buildRhDay({...source,references:{
  ...source.references,wu_ilouka4:[{...source.references.wu_ilouka4[0],station_id:'invalid'}]
 }}),/Unexpected RH reference station/);
 const altered=structuredClone(report);
 altered.referenceEvidence.push({proposedOriginalRhPct:55,reviewState:'approved'});
 assert.throws(()=>validateRhDay(altered,date),/Unsafe or invalid/);
});
test('partial 2022 summary does not misrepresent missing days as successful',()=>{
 const day=buildRhDay(sample()),range=dateRange('2022-02-15','2022-02-17');
 const s=summarizeRhDays([day],range);
 assert.equal(s.analyzedDays,1);
 assert.equal(s.expectedDays,2);
 assert.equal(s.pendingDays,1);
 assert.equal(s.complete,false);
 assert.equal(s.months['2022-02'].originalRhNullSlots,2);
 assert.equal(s.months['2022-02'].originalAbsentSlots,283);
 assert.equal(s.safety.databaseWrites,0);
 assert.throws(()=>summarizeRhDays([day,day],range),/Unexpected or duplicate/);
});
test('RH CLI dry-run runs without database, limits processing, rejects unsafe output folder',t=>{
 const dir=mkdtempSync(join(tmpdir(),'loucka-rh-dry-run-'));
 chmodSync(dir,0o700);
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const args=['scripts/qc-humidity-2022.mjs','--reports-dir',dir,
   '--from','2022-02-15','--to','2022-02-18'];
 const run=(extra)=>spawnSync(process.execPath,[...args,...extra],{
   cwd:process.cwd(),env:{},encoding:'utf8',timeout:10000});
 const r=run(['--dry-run']);
 assert.equal(r.status,0,r.stderr);
 assert.equal(JSON.parse(r.stdout).pendingDays,3);
 assert.equal(JSON.parse(r.stdout).databaseWrites,0);
 assert.equal(run(['--dry-run','--run']).status!==0,true);
 assert.equal(run(['--run','--max-days','367']).status!==0,true);
 const s=run(['--summary']);
 assert.equal(s.status,0,s.stderr);
 assert.equal(JSON.parse(s.stdout).complete,false);
 chmodSync(dir,0o755);
 assert.notEqual(run(['--dry-run']).status,0);
});
test('RH CLI static module syntax passes without touching production',()=>{
 for(const script of ['scripts/qc-humidity-lib.mjs','scripts/qc-humidity-2022.mjs']){
  const r=spawnSync(process.execPath,['--check',script],{
    cwd:process.cwd(),encoding:'utf8',timeout:10000});
  assert.equal(r.status,0,r.stderr);
 }
});
