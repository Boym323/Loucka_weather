import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {buildQcReport,QC_VERSION} from '../scripts/qc-engine.mjs';
import {verifyExpandedWindow,validateOverflowSidecar,fingerprint} from '../scripts/qc-overflow-lib.mjs';

const window={from:'2026-10-10T00:00:00Z',to:'2026-10-11T00:00:00Z'};
const start=Date.parse(window.from)/1000;
function sample(){
 const original=Array.from({length:130},(_,i)=>({dateTime:start+i*300,
   usUnits:16,interval:5,outTemp:20+i*0.01,outHumidity:60}));
 const reference=Array.from({length:130},(_,i)=>({observed_at_utc:start+i*300,
   temperature_c:10+i*0.01,relative_humidity_pct:60,quality_status:'reference_only'}));
 const input={from:window.from,to:window.to,original,
   stations:['luhamet_sehradice'],references:{luhamet_sehradice:reference}};
 return {baseline:buildQcReport(input),full:buildQcReport({...input,candidateLimit:20000})};
}
test('full candidate recovery preserves original 100-item prefix and all proposal IDs',()=>{
 const {baseline,full}=sample();
 assert.equal(baseline.qcVersion,QC_VERSION);
 assert.equal(baseline.candidates.total,130);
 assert.equal(baseline.candidates.shown,100);
 assert.equal(baseline.candidates.truncated,true);
 assert.equal(full.candidates.shown,130);
 assert.equal(full.candidates.truncated,false);
 const entry=verifyExpandedWindow(baseline,full,window);
 assert.equal(entry.items.length,30);
 assert.equal(entry.baseTotal,130);
 assert.equal(entry.baseShown,100);
 assert.equal(entry.baseSha256,fingerprint(baseline));
 assert.equal(new Set([...baseline.candidates.items,...entry.items].map(c=>c.id)).size,130);
 const sidecar={schemaVersion:'1',qcVersion:QC_VERSION,status:'screening_only',
   truncatedWindows:1,recoveredCandidates:30,entries:[entry],
   safety:{databaseWrites:0,automaticCorrections:false,automaticApprovals:false}};
 assert.equal(validateOverflowSidecar(sidecar,()=>baseline),30);
 assert.equal(baseline.candidates.shown,100); // no mutation in originals
});
test('mismatched historical data, modified candidate prefix and unsafe review are rejected',()=>{
 const {baseline,full}=sample();
 assert.throws(()=>verifyExpandedWindow(baseline,{
   ...full,sourceQuality:{...full.sourceQuality,loucka:{...full.sourceQuality.loucka,acceptedSlots:129}}
 },window),/Original observations/);
 const modified=structuredClone(full);
 modified.candidates.items[0].reason='changed';
 assert.throws(()=>verifyExpandedWindow(baseline,modified,window),/First 100/);
 const unsafe=structuredClone(full);
 unsafe.candidates.items[112].automaticWriteAllowed=true;
 assert.throws(()=>verifyExpandedWindow(baseline,unsafe,window),/Invalid expanded/);
 const badTime=structuredClone(full);
 badTime.candidates.items[125].fromUtc='2026-11-11T00:00:00.000Z';
 assert.throws(()=>verifyExpandedWindow(baseline,badTime,window),/outside QC window/);
 assert.throws(()=>buildQcReport({from:window.from,to:window.to,original:[],
    references:{luhamet_sehradice:[]},stations:['luhamet_sehradice'],candidateLimit:30000}),
    /Invalid QC candidate limit/);
});
test('recovery sidecars are tied to SHA256 of immutable baseline',()=>{
 const {baseline,full}=sample();
 const entry=verifyExpandedWindow(baseline,full,window);
 const sidecar={schemaVersion:'1',qcVersion:QC_VERSION,status:'screening_only',
   truncatedWindows:1,recoveredCandidates:30,entries:[entry],
   safety:{databaseWrites:0,automaticCorrections:false,automaticApprovals:false}};
 const poisoned=structuredClone(baseline);
 poisoned.sourceQuality.loucka.rejectedRows++;
 assert.throws(()=>validateOverflowSidecar(sidecar,()=>poisoned),/no longer matches/);
 assert.throws(()=>validateOverflowSidecar({
   ...sidecar,entries:[entry,entry],truncatedWindows:2,recoveredCandidates:60
 },()=>baseline),/Duplicate/);
});

test('recovery/quality CLI scripts and offline viewer JavaScript parse safely',()=>{
 for(const file of ['scripts/qc-recover-candidates.mjs',
   'scripts/qc-quality-overview.mjs','scripts/qc-report.mjs']){
   const run=spawnSync(process.execPath,['--check',file],{
     cwd:process.cwd(),encoding:'utf8',timeout:10000});
   assert.equal(run.status,0,file+': '+run.stderr);
 }
 const html=readFileSync(new URL('../scripts/qc-quality-viewer.html',import.meta.url),'utf8');
 const begin=html.indexOf('<script>');
 const finish=html.indexOf('</script>',begin+8);
 assert.ok(begin>=0&&finish>begin,'Expected inline viewer script');
 const source=html.slice(begin+8,finish).replace('__QUALITY_DATA__','{}');
 assert.doesNotThrow(()=>new Script(source));
});
