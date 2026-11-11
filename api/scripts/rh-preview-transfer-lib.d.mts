/** Type declarations for Node ESM QC preview builder imported by CI-only TS tests.
 * Source of runtime logic is rh-preview-transfer-lib.mjs.
 */
export type RhAppliedChange={
 target_time:number; variable:string; state:string;
 old_value:number|null;new_value:number|null;
 originalRh:number|null;reconstructionRh:number|null;
 originalTemp:number|null;reconstructionTemp:number|null;
 originalUnits:number;reconstructionUnits:number;
 batch_key:string;reason:string;
};
export type RhPreviewChange={
 epoch:number;originalRh:number|null;previewRh:number|null;
 category:'estimated'|'frozen_adjusted'|'invalidated';
 method:string;sourceBatch:string;
 reviewState:'experimental_unapproved';
 quality:'unvalidated_historical_estimate';
};
export type RhPreviewManifest={
 schemaVersion:'1';model:string;versionId:string;sha256:string;
 source:string;periodUtc:[string,string];status:'experimental_unapproved';
 total:number;totals:{total:number;estimated:number;frozen_adjusted:number;invalidated:number};
 rows:RhPreviewChange[];warnings:string[];
 safety:{productionWrites:0;sourceReconstructionWrites:0;automaticApprovals:false;automaticCorrections:false};
};
export const PREVIEW_MODEL:string;
export const UTC_START:number;
export const UTC_END:number;
export const EXPECTED:{total:number;estimated:number;frozen_adjusted:number;invalidated:number};
export function normalizeAppliedChange(raw:RhAppliedChange):RhPreviewChange;
export function buildPreviewManifest(raw:RhAppliedChange[]):RhPreviewManifest;
export function validatePreviewManifest(m:RhPreviewManifest):{
 sha256:string;versionId:string;totals:RhPreviewManifest['totals'];
};
