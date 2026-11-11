import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,chmodSync,writeFileSync,readFileSync,statSync,rmSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {buildRhDay,dateRange} from '../scripts/qc-humidity-lib.mjs';
import {createRhTriage,triageCsv} from '../scripts/qc-rh-triage-lib.mjs';

function make(day,mode='agree'){
 const time=Date.parse(day+'T00:00:00Z')/1000;
 const own=Array.from({length:288},(_,i)=>({dateTime:time+i*300,outHumidity:null}));
 const ref=station=>Array.from({length:288},(_,i)=>({
  station_id:station,observed_at_utc:time+i*300,
  relative_humidity_pct:station==='luhamet_sehradice'?55:
    mode==='agree'?57:82,quality_status:'reference_only'
 }));
 return buildRhDay({day,original:own,references:{
   luhamet_sehradice:ref('luhamet_sehradice'),
   wu_ilouka4:ref('wu_ilouka4')}});
}
let year=null;
function evidence(){return year??(year=dateRange().map(d=>make(d,d==='2022-03-22'?'conflict':'agree')));}
test('365 verified RH daily rows yield strict month and safety aggregates',()=>{
 const result=createRhTriage(evidence());
 assert.equal(result.processedDays,365);
 assert.equal(result.months.length,12);
 assert.equal(result.days.length,365);
 assert.equal(result.totals.nullRhSlots,365*288);
 assert.equal(result.totals.agreeWithin10Slots,364*288);
 assert.equal(result.totals.conflictingBothReferenceSlots,288);
 assert.equal(result.months[0].rhNullSlots,31*288);
 assert.equal(result.months[1].rhNullSlots,28*288);
 assert.equal(result.months[2].agreeWithin10Slots,30*288);
 assert.equal(result.days.find(x=>x.day==='2022-03-22').evidenceCategory,'rozpor_referenci');
 assert.equal(result.days.find(x=>x.day==='2022-02-15').evidenceCategory,
    'shodne_reference_neoverena_kalibrace');
 assert.equal(result.days.find(x=>x.day==='2022-03-22').replacementRhPct,null);
 assert.equal(result.days.every(x=>x.reviewState==='needs_manual_review'&&
   x.automaticWriteAllowed===false),true);
 assert.equal(result.safety.databaseWrites,0);
 assert.equal(triageCsv(result).split('\r\n').length,367);
});
test('missing days, mismatched totals and unauthorized approvals stop the triage',()=>{
 assert.throws(()=>createRhTriage(evidence().slice(0,364)),/Full RH/);
 const wrong=structuredClone(evidence());
 wrong[0].referenceEvidence[0].proposedOriginalRhPct=57;
 assert.throws(()=>createRhTriage(wrong),/Unsafe or invalid/);
 const wrongCounts=structuredClone(evidence());
 wrongCounts[0].counts.missingRhSingleReferenceSlots=1;
 assert.throws(()=>createRhTriage(wrongCounts),/Invalid RH null-evidence/);
});
test('triage CLI never contacts MariaDB and does not run when evidence is incomplete',t=>{
 const dir=mkdtempSync(join(tmpdir(),'loucka-rh-triage-'));
 chmodSync(dir,0o700);
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const script=['scripts/qc-rh-triage.mjs','--reports-dir',dir];
 const run=()=>spawnSync(process.execPath,script,{
   cwd:process.cwd(),env:{},encoding:'utf8',timeout:10000});
 assert.notEqual(run().status,0);
 for(const report of evidence())writeFileSync(join(dir,'qc-rh-2022-'+report.utcDay+'.json'),
   JSON.stringify(report),{flag:'wx',mode:0o600});
 let check=run();
 assert.equal(check.status,0,check.stderr);
 const result=JSON.parse(check.stdout);
 assert.equal(result.processedDays,365);
 assert.equal(result.totals.agreeWithin10Slots,364*288);
 for(const name of ['qc-rh-2022-triage.json','qc-rh-2022-triage.csv'])
  assert.equal(statSync(join(dir,name)).mode&0o777,0o600);
 check=run();
 assert.equal(check.status,0,check.stderr);
 unlinkSync(join(dir,'qc-rh-2022-2022-02-01.json'));
 assert.notEqual(run().status,0);
 chmodSync(dir,0o755);
 assert.notEqual(run().status,0);
});
test('new private triage CLI and pure engine parse as ESM',()=>{
 for(const file of ['scripts/qc-rh-triage.mjs','scripts/qc-rh-triage-lib.mjs']){
  const r=spawnSync(process.execPath,['--check',file],{
   cwd:process.cwd(),encoding:'utf8',timeout:10000});
  assert.equal(r.status,0,r.stderr);
 }
});
