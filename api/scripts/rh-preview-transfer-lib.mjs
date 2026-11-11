import {createHash} from 'node:crypto';

/** Versioned 2022 RH preview. Every number is from an existing *applied*
 * reconstruction_changes audit row, never a newly inferred replacement.
 */
export const PREVIEW_MODEL='rh-2022-transfer-v1';
export const UTC_START=1640995200;
export const UTC_END=1672531200;
export const EXPECTED={total:5153,estimated:2874,frozen_adjusted:2194,invalidated:85};
const numeric=(value,label)=>{
 if(value===null||value===undefined)return null;
 const n=Number(value);
 if(!Number.isFinite(n))throw Error('Invalid '+label);
 return n;
};
const close=(a,b)=>a===b||(a!==null&&b!==null&&Math.abs(a-b)<=0.00001);
const validRh=x=>x!==null&&x>=1&&x<=100;
const checkString=(s,n)=>typeof s==='string'&&s.length>0&&s.length<=n&&!/[\r\n\0]/.test(s);
export function normalizeAppliedChange(raw){
 const time=numeric(raw.target_time,'target epoch'),
   old=numeric(raw.old_value,'old RH'),
   next=numeric(raw.new_value,'new RH'),
   orig=numeric(raw.originalRh,'original archive RH'),
   current=numeric(raw.reconstructionRh,'reconstruction RH'),
   temp=numeric(raw.originalTemp,'original temp'),
   sourceTemp=numeric(raw.reconstructionTemp,'reconstruction temp'),
   units=numeric(raw.originalUnits,'original units'),
   currentUnits=numeric(raw.reconstructionUnits,'reconstruction units');
 if(raw.variable!=='outHumidity'||raw.state!=='applied'||!Number.isSafeInteger(time)||
    time<UTC_START||time>=UTC_END||time%300!==0||
    !checkString(raw.batch_key,80)||!checkString(raw.reason,255)||
    !close(old,orig)||!close(next,current)||!close(temp,sourceTemp)||
    units!==16||currentUnits!==16||
    (old!==null&&!validRh(old))||
    (next!==null&&!validRh(next))||
    (old===null&&next===null)||
    (old!==null&&next!==null&&close(old,next)))
  throw Error('Invalid, changed or untraceable RH reconstruction record');
 const category=old===null?'estimated':next===null?'invalidated':'frozen_adjusted';
 const month=new Date(time*1000).toISOString().slice(0,7);
 // Method names are traceable labels of old audit text, not a validation claim.
 let method='legacy_method_requires_review';
 if(month==='2022-04')method='dual_vapor_pressure_v1';
 else if(month==='2022-03'&&raw.reason.includes('Magnus transfer'))
   method='magnus_transfer_minus_2pp';
 else if(month==='2022-07'&&raw.reason.includes('moderate v1'))
   method='weighted_80_20_moderate_v1';
 else if(month==='2022-07'&&raw.reason.includes('ESTIMATED_EXTERNAL v1'))
   method='weighted_80_20_v1';
 return {epoch:time,originalRh:old,previewRh:next,
  category,method,sourceBatch:raw.batch_key,
  reviewState:'experimental_unapproved',
  quality:'unvalidated_historical_estimate'};
}
function assertCounts(rows,counts){
 const count={total:rows.length,estimated:0,frozen_adjusted:0,invalidated:0};
 for(const row of rows)count[row.category]++;
 for(const [key,n] of Object.entries(EXPECTED))
  if(count[key]!==n)throw Error('RH expected lineage counts changed: '+key);
 return count;
}
export function buildPreviewManifest(raw){
 if(!Array.isArray(raw)||raw.length!==EXPECTED.total)
  throw Error('Unexpected complete 2022 RH audit length');
 const rows=raw.map(normalizeAppliedChange).sort((a,b)=>a.epoch-b.epoch);
 for(let i=1;i<rows.length;i++)
  if(rows[i].epoch===rows[i-1].epoch)throw Error('Duplicate applied RH UTC epoch');
 const totals=assertCounts(rows);
 const canonical=JSON.stringify({model:PREVIEW_MODEL,rows});
 const sha256=createHash('sha256').update(canonical).digest('hex');
 const versionId='rh2022-'+sha256.slice(0,24);
 return {
  schemaVersion:'1',model:PREVIEW_MODEL,versionId,sha256,
  source:'loucka_reconstruction.reconstruction_changes+archive and pocasi-loucka.eu.archive',
  periodUtc:['2022-01-01T00:00:00Z','2023-01-01T00:00:00Z'],
  status:'experimental_unapproved',total:totals.total,totals,
  rows,
  warnings:[
   'Derived from ALREADY APPLIED working reconstruction. Original production archive was never modified.',
   'Approval is NOT implied by state=applied in reconstruction_changes.',
   'Original frozen RH is not independent ground truth and historical estimated RH has not passed blocked validation for its gap.',
   'Only altered RH existing archive rows are represented. Missing entire archive timestamps are NOT created.',
   'A preview must never overwrite original measurements or daily WeeWX summaries.'
  ],
  safety:{productionWrites:0,sourceReconstructionWrites:0,
   automaticApprovals:false,automaticCorrections:false}
 };
}
export function validatePreviewManifest(m){
 if(!m||m.schemaVersion!=='1'||m.model!==PREVIEW_MODEL||
    m.status!=='experimental_unapproved'||m.safety?.productionWrites!==0||
    m.safety?.sourceReconstructionWrites!==0||
    m.safety?.automaticApprovals!==false||
    m.safety?.automaticCorrections!==false||
    !Array.isArray(m.rows)||m.rows.length!==EXPECTED.total)
  throw Error('Unsafe or incompatible RH preview manifest');
 const rows=m.rows;
 const seen=new Set(),totals={total:rows.length,estimated:0,frozen_adjusted:0,invalidated:0};
 for(const row of rows){
  if(!Number.isSafeInteger(row.epoch)||row.epoch<UTC_START||
     row.epoch>=UTC_END||row.epoch%300!==0||seen.has(row.epoch)||
     !['estimated','frozen_adjusted','invalidated'].includes(row.category)||
     !checkString(row.method,80)||!checkString(row.sourceBatch,80)||
     row.reviewState!=='experimental_unapproved'||
     row.quality!=='unvalidated_historical_estimate'||
     (row.originalRh!==null&&!validRh(row.originalRh))||
     (row.previewRh!==null&&!validRh(row.previewRh))||
     (row.category==='estimated'&&(row.originalRh!==null||row.previewRh===null))||
     (row.category==='frozen_adjusted'&&(row.originalRh===null||row.previewRh===null||close(row.originalRh,row.previewRh)))||
     (row.category==='invalidated'&&(row.originalRh===null||row.previewRh!==null)))
   throw Error('Invalid preview point');
  seen.add(row.epoch);totals[row.category]++;
 }
 const canonical=JSON.stringify({model:m.model,rows});
 const sha=createHash('sha256').update(canonical).digest('hex');
 if(m.sha256!==sha||m.versionId!=='rh2022-'+sha.slice(0,24)||
    Object.entries(EXPECTED).some(([k,n])=>totals[k]!==n||m.totals?.[k]!==n))
  throw Error('RH preview checksum or totals mismatch');
 return {sha256:sha,versionId:m.versionId,totals};
}
