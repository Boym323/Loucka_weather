import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,chmodSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildRhDay,dateRange} from '../scripts/qc-humidity-lib.mjs';
import {buildCommonDay,validateCommonDay,summarizeCommonDays}
  from '../scripts/qc-rh-triplets-lib.mjs';
function synth(day='2022-04-15',rh=[60,70,80]){
 const start=Date.parse(day+'T00:00:00Z')/1000;
 const original=rh.map((v,i)=>({dateTime:start+i*300,outHumidity:v}));
 const refs=(id,values,offset)=>values.map((value,i)=>({
   station_id:id,observed_at_utc:start+i*300+offset,
   relative_humidity_pct:value,quality_status:'reference_only'}));
 const references={
   luhamet_sehradice:refs('luhamet_sehradice',[61,65,90],0),
   wu_ilouka4:refs('wu_ilouka4',[59,72,75],-8)};
 const baseline=buildRhDay({day,original,references});
 return {day,original,references,baseline};
}
test('both RH station errors use strictly identical original/LuhaMet/WU UTC slots',()=>{
 const inputs=synth(),r=buildCommonDay(inputs);
 assert.equal(r.sameSlotTriplets.pairs,3);
 assert.equal(r.metrics.maeLuhaPctPoints,5.333);
 assert.equal(r.metrics.maeWuPctPoints,2.667);
 assert.equal(r.metrics.advantageWuMaePctPoints,2.667);
 assert.equal(r.metrics.wuBetterSlots,2);
 assert.equal(r.metrics.tiedSlots,1);
 assert.equal(r.metrics.luhaBetterSlots,0);
 assert.equal(r.safety.replacementRhPct,null);
 assert.equal(validateCommonDay(r,r.day,inputs.baseline),r);
});
test('only common pairs count; duplicates, invalid RH and ±30s offset filtered',()=>{
 const x=synth();
 x.references.wu_ilouka4.push({
  ...x.references.wu_ilouka4[1],observed_at_utc:x.references.wu_ilouka4[1].observed_at_utc+3});
 x.original[0].outHumidity=null;
 x.references.luhamet_sehradice[2].relative_humidity_pct=0;
 x.baseline=buildRhDay(x);
 const r=buildCommonDay(x);
 assert.equal(r.sameSlotTriplets.pairs,0);
 assert.equal(r.metrics.maeWuPctPoints,null);
 assert.equal(r.metrics.advantageWuMaePctPoints,null);
 assert.equal(r.metrics.wuBetterSlots,0);
});
test('stale historical original or altered approved result fails closed',()=>{
 const x=synth(),r=buildCommonDay(x);
 const changed=structuredClone(x);
 changed.original[0].outHumidity=79;
 assert.throws(()=>buildCommonDay(changed),/RH evidence changed/);
 const tamper=structuredClone(r);
 tamper.safety.automaticCorrections=true;
 assert.throws(()=>validateCommonDay(tamper,r.day,x.baseline),/unsafe/);
 const wrong=structuredClone(r);
 wrong.sameSlotTriplets.sumAbsLuha=0;
 assert.throws(()=>validateCommonDay(wrong,r.day,x.baseline),/unsafe/);
});
test('absence of own RH yields no triplets and cannot become false zero error',()=>{
 const x=synth('2022-02-15',[null,null,null]);
 const r=buildCommonDay(x);
 assert.equal(r.metrics.pairs,0);
 assert.equal(r.metrics.maeLuhaPctPoints,null);
 assert.equal(r.metrics.maeWuPctPoints,null);
 const m=summarizeCommonDays([r]);
 assert.equal(m.complete,false);
 assert.equal(m.pendingDays,364);
 assert.equal(m.months[1].sampleStatus,'insufficient_matching_triplets');
 assert.equal(m.months[1].maeLuhaPctPoints,null);
});
test('annual/monthly errors weight raw identical-slot sums rather than rounded daily averages',()=>{
 const one=synth('2022-03-01'),two=synth('2022-03-02');
 two.original[2].outHumidity=null;
 two.baseline=buildRhDay(two);
 const rs=[buildCommonDay(one),buildCommonDay(two)];
 const out=summarizeCommonDays(rs);
 assert.equal(out.overall.pairs,5);
 assert.equal(out.months[2].pairs,5);
 assert.equal(out.months[2].sampleStatus,'insufficient_matching_triplets');
 assert.equal(out.analyzedDays,2);
 assert.throws(()=>summarizeCommonDays([rs[0],rs[0]]),/duplicate/);
});
test('the triplet CLI requires full original daily private evidence even in dry-run',t=>{
 const dir=mkdtempSync(join(tmpdir(),'loucka-triplets-'));
 chmodSync(dir,0o700);
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const args=['scripts/qc-rh-triplets.mjs','--reports-dir',dir];
 const run=extra=>spawnSync(process.execPath,[...args,...extra],
   {cwd:process.cwd(),env:{},encoding:'utf8',timeout:15000});
 assert.notEqual(run(['--dry-run']).status,0);
 const emptyDay=(day)=>buildRhDay({day,original:[],references:{
   luhamet_sehradice:[],wu_ilouka4:[]}});
 for(const day of dateRange())
   writeFileSync(join(dir,'qc-rh-2022-'+day+'.json'),
     JSON.stringify(emptyDay(day)),{flag:'wx',mode:0o600});
 const dry=run(['--dry-run']);
 assert.equal(dry.status,0,dry.stderr);
 assert.equal(JSON.parse(dry.stdout).pendingDays,365);
 assert.equal(JSON.parse(dry.stdout).overall.pairs,0);
 assert.equal(run(['--run','--max-days','500']).status!==0,true);
 chmodSync(dir,0o755);
 assert.notEqual(run(['--dry-run']).status,0);
});
test('pure and CLI triplet ES modules parse',()=>{
 for(const file of ['scripts/qc-rh-triplets-lib.mjs','scripts/qc-rh-triplets.mjs']){
  const c=spawnSync(process.execPath,['--check',file],
    {cwd:process.cwd(),encoding:'utf8',timeout:10000});
  assert.equal(c.status,0,c.stderr);
 }
});
