/** Integrity checking for an optional, private, append-only QC candidate sidecar. */
import {createHash} from 'node:crypto';
import {QC_VERSION} from './qc-engine.mjs';

export const SIDECAR_FILE='qc-candidate-overflow.json';
export const fingerprint=report=>createHash('sha256')
  .update(JSON.stringify(report)).digest('hex');

export function verifyExpandedWindow(original,expanded,window){
  if(original.window?.fromUtc!==window.from||original.window?.toExclusiveUtc!==window.to||
     !original.candidates?.truncated||original.candidates.shown!==100)
    throw new Error('Input is not a truncated original QC window');
  if(expanded.schemaVersion!==original.schemaVersion||expanded.qcVersion!==QC_VERSION||
     expanded.status!=='screening_only'||expanded.dataset!=='original'||
     expanded.window?.fromUtc!==window.from||expanded.window?.toExclusiveUtc!==window.to||
     expanded.safety?.databaseWrites!==0||
     expanded.safety?.automaticCorrections!==false||
     expanded.safety?.automaticApprovals!==false||
     expanded.safety?.referenceStationsAreNotOriginalMeasurements!==true)
    throw new Error('Expanded QC report is invalid or unsafe');
  if(expanded.candidates?.total!==original.candidates.total||
     expanded.candidates.shown!==original.candidates.total||
     expanded.candidates.truncated!==false||
     !Array.isArray(expanded.candidates.items)||
     expanded.candidates.items.length!==expanded.candidates.total)
    throw new Error('Expanded candidate totals changed or remained truncated');
  if(JSON.stringify(original.sourceQuality)!==JSON.stringify(expanded.sourceQuality)||
     JSON.stringify(original.comparisons)!==JSON.stringify(expanded.comparisons))
    throw new Error('Original observations/reference comparison changed');
  const a=original.candidates.items,b=expanded.candidates.items;
  for(let i=0;i<a.length;i++)
    if(JSON.stringify(a[i])!==JSON.stringify(b[i]))
      throw new Error('First 100 QC candidates changed');
  for(const item of b){
    if(item.reviewState!=='needs_manual_review'||item.automaticWriteAllowed!==false||
       !['suspect_source_run','temperature_disagreement','reference_evidence_for_gap'].includes(item.kind))
      throw new Error('Invalid expanded QC candidate');
    const from=Date.parse(item.fromUtc),to=Date.parse(item.toExclusiveUtc);
    if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from||
       from<Date.parse(window.from)||from>=Date.parse(window.to)||
       to>Date.parse(window.to))
      throw new Error('Expanded candidate timestamp outside QC window');
  }
  return {fromUtc:window.from,toExclusiveUtc:window.to,
    baseTotal:original.candidates.total,baseShown:original.candidates.shown,
    baseSha256:fingerprint(original),items:b.slice(a.length)};
}
export function validateOverflowSidecar(sidecar,lookup){
  if(sidecar?.schemaVersion!=='1'||sidecar.qcVersion!==QC_VERSION||
     sidecar.status!=='screening_only'||!Array.isArray(sidecar.entries)||
     sidecar.safety?.databaseWrites!==0||
     sidecar.safety?.automaticCorrections!==false||
     sidecar.safety?.automaticApprovals!==false)
    throw new Error('Invalid overflow sidecar');
  let count=0;const seen=new Set();
  for(const entry of sidecar.entries){
    if(!entry||typeof entry.fromUtc!=='string'||typeof entry.toExclusiveUtc!=='string')
      throw new Error('Invalid overflow entry');
    const key=entry.fromUtc+'|'+entry.toExclusiveUtc;
    if(seen.has(key))throw new Error('Duplicate overflow entry');
    seen.add(key);
    const original=lookup(entry.fromUtc,entry.toExclusiveUtc);
    if(!original||!original.candidates.truncated||
       original.candidates.total!==entry.baseTotal||
       original.candidates.shown!==entry.baseShown||
       fingerprint(original)!==entry.baseSha256||
       !Array.isArray(entry.items)||
       entry.items.length!==entry.baseTotal-entry.baseShown)
      throw new Error('QC overflow evidence no longer matches original report');
    for(const item of entry.items){
      if(item.reviewState!=='needs_manual_review'||item.automaticWriteAllowed!==false||
         !['suspect_source_run','temperature_disagreement','reference_evidence_for_gap'].includes(item.kind)||
         typeof item.fromUtc!=='string'||item.fromUtc<entry.fromUtc||
         item.fromUtc>=entry.toExclusiveUtc)
        throw new Error('Invalid hidden candidate evidence');
    }
    count+=entry.items.length;
  }
  if(sidecar.truncatedWindows!==sidecar.entries.length||
     sidecar.recoveredCandidates!==count)
    throw new Error('Inconsistent overflow sidecar totals');
  return count;
}
