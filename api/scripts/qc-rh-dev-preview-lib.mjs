/** Pure, fail-closed manifest builder for an UNAPPROVED dev RH preview.
 * No MariaDB, no network, and no production/API mutations in this module.
 */
import {createHash} from 'node:crypto';

export const PREVIEW_VERSION='rh-2022-dev-preview-package-v1';
export const FROM=1640995200;
export const TO=1672531200;
const EXPECTED={rows:5153,missingToEstimate:2874,measuredToEstimate:2194,invalidated:85};
function numberOrNull(raw,name){
 if(raw===null||raw===undefined)return null;
 const value=Number(raw);
 if(!Number.isFinite(value))throw Error('Invalid '+name);
 return value;
}
function validRh(x){return typeof x==='number'&&Number.isFinite(x)&&x>=1&&x<=100;}
function roughlyEq(a,b){return a===b||(typeof a==='number'&&typeof b==='number'&&Math.abs(a-b)<1e-7);}
function parseRow(row){
 const t=Number(row.target_time);
 const oldRh=numberOrNull(row.old_value,'old_value');
 const newRh=numberOrNull(row.new_value,'new_value');
 const originalRh=numberOrNull(row.original_rh,'original_rh');
 const currentReconstructionRh=numberOrNull(row.reconstruction_rh,'reconstruction_rh');
 const originalTime=Number(row.original_time);
 const reconstructionTime=Number(row.reconstruction_time);
 const changeId=Number(row.id);
 if(!Number.isSafeInteger(t)||t<FROM||t>=TO||t%300!==0||
   !Number.isSafeInteger(changeId)||changeId<1||
   originalTime!==t||reconstructionTime!==t||
   row.state!=='applied'||row.variable!=='outHumidity'||
   typeof row.batch_key!=='string'||!row.batch_key||row.batch_key.length>80||
   typeof row.source_database!=='string'||!row.source_database||
   row.source_database.length>80||
   !roughlyEq(oldRh,originalRh)||!roughlyEq(newRh,currentReconstructionRh))
   throw Error('Stale or unsupported RH reconstruction lineage');
 let category;
 if(oldRh===null&&validRh(newRh))category='historical_estimate_from_missing';
 else if(validRh(oldRh)&&validRh(newRh)&&!roughlyEq(oldRh,newRh))
   category='historical_estimate_replacing_suspect_original';
 else if(validRh(oldRh)&&newRh===null)category='historical_invalidation';
 else throw Error('RH change is not a recognized existing state transition');
 // Value remains EXPLICITLY UNAPPROVED, and retains its former status.
 return {
  epoch:t,utc:new Date(t*1000).toISOString(),
  variable:'outHumidity',
  originalValue:oldRh,
  experimentalValue:newRh,
  category,legacySource:row.source_database,legacyBatchKey:row.batch_key,
  legacyChangeId:changeId,
  evaluation:'historically_applied_to_reconstruction_copy_only',
  approved:false,provenanceVerifiedAgainstOriginal:true,
  accuracyValidated:false
 };
}
export function buildRhPreviewPackage(input,{
 expected=EXPECTED,allowSynthetic=false
}={}){
 if(!Array.isArray(input)||!input.length)throw Error('Empty preview inputs');
 if(!allowSynthetic&&input.length!==EXPECTED.rows)
  throw Error('Incomplete 2022 RH reconstruction changes');
 const sorted=input.map(parseRow).sort((a,b)=>a.epoch-b.epoch);
 const counts={missingToEstimate:0,measuredToEstimate:0,invalidated:0};
 let prev=-1,ids=new Set();
 for(const r of sorted){
  if(r.epoch===prev||ids.has(r.legacyChangeId))
   throw Error('Duplicate change timestamp or audit identity');
  prev=r.epoch;ids.add(r.legacyChangeId);
  if(r.category==='historical_estimate_from_missing')counts.missingToEstimate++;
  if(r.category==='historical_estimate_replacing_suspect_original')counts.measuredToEstimate++;
  if(r.category==='historical_invalidation')counts.invalidated++;
 }
 if(!allowSynthetic){
  if(counts.missingToEstimate!==EXPECTED.missingToEstimate||
     counts.measuredToEstimate!==EXPECTED.measuredToEstimate||
     counts.invalidated!==EXPECTED.invalidated)
   throw Error('Original-vs-preview lineage totals changed since QC audit');
 }
 if(allowSynthetic&&expected){
  if(input.length!==expected.rows||
     counts.missingToEstimate!==expected.missingToEstimate||
     counts.measuredToEstimate!==expected.measuredToEstimate||
     counts.invalidated!==expected.invalidated)
    throw Error('Unexpected synthetic preview totals');
 }
 const recordsJson=JSON.stringify(sorted);
 const recordsSha256=createHash('sha256').update(recordsJson).digest('hex');
 return {schemaVersion:'1',packageVersion:PREVIEW_VERSION,
   dataset:'experimental_unapproved',variable:'outHumidity',
   periodUtc:{from:'2022-01-01T00:00:00.000Z',toExclusive:'2023-01-01T00:00:00.000Z'},
   counts:{records:sorted.length,...counts},
   originalArchive:'pocasi-loucka.eu.archive',
   reconstructionArchive:'loucka_reconstruction.archive',
   referenceAudit:'loucka_reconstruction.reconstruction_changes',
   recordsSha256,records:sorted,
   rules:[
     'The package represents EXISTING changes previously applied ONLY to the private reconstruction database.',
     'Experimental values are never original measurements and none are approved for publication as verified data.',
     'Never load into or replace the original archive. Verify live dev DB identity, exact expected source row and rollback before promoting.',
     'The package is an immutable review artifact. No HTTP endpoint or live database writes are part of this export.'
   ],
   safety:{databaseWrites:0,sourceWrites:0,automaticApprovals:false,
      automaticCorrections:false,liveDevPublishing:false}};
}
export function previewPackageDigest(pkg){
 const data=JSON.stringify(pkg);
 return createHash('sha256').update(data).digest('hex');
}
