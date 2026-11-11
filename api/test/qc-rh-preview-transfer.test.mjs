import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildPreviewManifest,normalizeAppliedChange,validatePreviewManifest,EXPECTED}
 from '../scripts/rh-preview-transfer-lib.mjs';

function record(i,category='estimated'){
 const epoch=1640995200+(i+1)*300;
 const old=category==='estimated'?null:category==='invalidated'?89:75;
 const next=category==='invalidated'?null:category==='frozen_adjusted'?60:65;
 return {target_time:epoch,old_value:old,new_value:next,
  originalRh:old,reconstructionRh:next,
  originalTemp:12,reconstructionTemp:12,
  originalUnits:16,reconstructionUnits:16,
  variable:'outHumidity',state:'applied',
  batch_key:'synthetic-test-batch',reason:'ESTIMATED_EXTERNAL v1'};
}
function fullFixture(){
 const a=[];
 for(let i=0;i<EXPECTED.total;i++)
  a.push(record(i,i<EXPECTED.estimated?'estimated':
    i<EXPECTED.estimated+EXPECTED.frozen_adjusted?'frozen_adjusted':'invalidated'));
 return a;
}
test('immutable RH manifest has all existing applied categories and stable checksum',()=>{
 const fixture=fullFixture();
 const manifest=buildPreviewManifest(fixture);
 assert.deepEqual(manifest.totals,EXPECTED);
 assert.equal(manifest.rows.length,5153);
 assert.match(manifest.versionId,/^rh2022-[a-f0-9]{24}$/);
 assert.equal(manifest.status,'experimental_unapproved');
 assert.equal(manifest.safety.productionWrites,0);
 assert.equal(manifest.rows.every(r=>r.reviewState==='experimental_unapproved'),true);
 assert.equal(manifest.rows.every(r=>r.quality==='unvalidated_historical_estimate'),true);
 assert.equal(manifest.rows.every(r=>!('approved' in r)),true);
 assert.equal(manifest.rows.filter(r=>r.category==='invalidated').every(r=>r.previewRh===null),true);
 assert.equal(validatePreviewManifest(manifest).versionId,manifest.versionId);
 assert.equal(buildPreviewManifest([...fixture].reverse()).versionId,manifest.versionId);
 const altered=structuredClone(manifest);
 altered.rows[0].previewRh=72;
 assert.throws(()=>validatePreviewManifest(altered),/checksum/);
});
test('lineage mismatch, changed source values and approval-like states fail closed',()=>{
 const original=record(1);
 assert.equal(normalizeAppliedChange(original).category,'estimated');
 for(const modification of [
  {state:'prepared'}, {originalRh:13}, {reconstructionRh:45},
  {originalUnits:1}, {target_time:original.target_time+1},
  {variable:'rainRate'}, {old_value:40}, {new_value:101},
  {batch_key:''}
 ]){
  assert.throws(()=>normalizeAppliedChange({...original,...modification}),
   /Invalid|changed|untraceable/);
 }
 const wrong=fullFixture();
 wrong.push(record(6000));
 assert.throws(()=>buildPreviewManifest(wrong),/Unexpected complete/);
 const duplicate=fullFixture();
 duplicate[1]={...duplicate[0]};
 assert.throws(()=>buildPreviewManifest(duplicate),/Duplicate/);
 const altered=buildPreviewManifest(fullFixture());
 altered.status='approved';
 assert.throws(()=>validatePreviewManifest(altered),/Unsafe/);
});
test('January to December UTC boundaries and legacy labels are deterministic',()=>{
 const base=record(1);
 const march={...base,target_time:Date.parse('2022-03-01T00:05:00Z')/1000,
  reason:'Magnus transfer -2pp'};
 assert.equal(normalizeAppliedChange(march).method,'magnus_transfer_minus_2pp');
 const july={...base,target_time:Date.parse('2022-07-01T00:05:00Z')/1000,
  reason:'ESTIMATED_EXTERNAL v1 moderate v1'};
 assert.equal(normalizeAppliedChange(july).method,'weighted_80_20_moderate_v1');
 const dec={...base,target_time:Date.parse('2022-12-31T23:55:00Z')/1000};
 assert.equal(normalizeAppliedChange(dec).category,'estimated');
});
