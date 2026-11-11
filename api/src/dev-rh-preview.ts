/** Explicitly disabled-by-default, access-token-gated DEV ONLY RH preview.
 * Never uses reconstructed MariaDB archive as main archive, never writes DB.
 */
import {createHash,timingSafeEqual} from 'node:crypto';
import {constants,closeSync,fstatSync,lstatSync,openSync,readFileSync} from 'node:fs';
import path from 'node:path';
import type {ArchiveRow} from './store.js';

export type PreviewChange={
 epoch:number;utc:string;variable:'outHumidity';
 originalValue:number|null;experimentalValue:number|null;
 category:'historical_estimate_from_missing'|
          'historical_estimate_replacing_suspect_original'|
          'historical_invalidation';
 legacySource:string;legacyBatchKey:string;legacyChangeId:number;
 evaluation:string;approved:false;accuracyValidated:false;
 provenanceVerifiedAgainstOriginal:true;
};
export type PreviewPoint={
 at:string;epoch:number;intervalMinutes:number;
 original:{value:number|null;status:'original_measured'|'original_missing'};
 preview:{value:number|null;
  status:'original_measured'|'original_missing'|
    'experimental_unapproved'|'historically_invalidated_unapproved';
  legacyBatchKey:string|null;legacySource:string|null};
};
export type DevRhPreview={
 packageSha256:string;recordsSha256:string;
 authorize:(header:unknown)=>boolean;
 merge:(rows:ArchiveRow[],fromExclusive:number,toInclusive:number)=>PreviewPoint[];
};
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const valid=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x)&&x>=1&&x<=100;
const maybeRh=(x:unknown)=>x===null||valid(x);
const isRecord=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const same=(a:number|null,b:number|null)=>a===b||
 (typeof a==='number'&&typeof b==='number'&&Math.abs(a-b)<1e-7);
function validateChange(v:unknown):asserts v is PreviewChange{
 if(!isRecord(v)||!Number.isSafeInteger(v.epoch)||
    Number(v.epoch)<1640995200||Number(v.epoch)>=1672531200||
    Number(v.epoch)%300!==0||
    v.utc!==new Date(Number(v.epoch)*1000).toISOString()||
    v.variable!=='outHumidity'||
    !maybeRh(v.originalValue)||!maybeRh(v.experimentalValue)||
    !Number.isSafeInteger(v.legacyChangeId)||Number(v.legacyChangeId)<1||
    typeof v.legacyBatchKey!=='string'||v.legacyBatchKey.length<1||
    v.legacyBatchKey.length>80||
    typeof v.legacySource!=='string'||v.legacySource.length<1||
    v.approved!==false||v.accuracyValidated!==false||
    v.provenanceVerifiedAgainstOriginal!==true||
    v.evaluation!=='historically_applied_to_reconstruction_copy_only')
  throw Error('Invalid unapproved preview record');
 const kind=v.category;
 if(!(
  (kind==='historical_estimate_from_missing'&&v.originalValue===null&&valid(v.experimentalValue))||
  (kind==='historical_estimate_replacing_suspect_original'&&valid(v.originalValue)&&
    valid(v.experimentalValue)&&!same(v.originalValue,v.experimentalValue))||
  (kind==='historical_invalidation'&&valid(v.originalValue)&&v.experimentalValue===null)
 ))throw Error('Impossible RH preview transition');
}
export function previewFromPackage(raw:unknown,expectedDigest:string,token:string):DevRhPreview{
 if(!/^[a-f0-9]{64}$/.test(expectedDigest)||token.length<32)
  throw Error('Invalid pinned SHA or private preview token');
 if(!isRecord(raw)||raw.schemaVersion!=='1'||
  raw.packageVersion!=='rh-2022-dev-preview-package-v1'||
  raw.dataset!=='experimental_unapproved'||raw.variable!=='outHumidity'||
  raw.originalArchive!=='pocasi-loucka.eu.archive'||
  raw.reconstructionArchive!=='loucka_reconstruction.archive'||
  raw.referenceAudit!=='loucka_reconstruction.reconstruction_changes'||
  !isRecord(raw.periodUtc)||
  raw.periodUtc.from!=='2022-01-01T00:00:00.000Z'||
  raw.periodUtc.toExclusive!=='2023-01-01T00:00:00.000Z'||
  !isRecord(raw.counts)||raw.counts.records!==5153||
  raw.counts.missingToEstimate!==2874||
  raw.counts.measuredToEstimate!==2194||
  raw.counts.invalidated!==85||
  !isRecord(raw.safety)||raw.safety.databaseWrites!==0||
  raw.safety.automaticApprovals!==false||
  raw.safety.liveDevPublishing!==false||
  !Array.isArray(raw.records)||raw.records.length!==5153||
  typeof raw.recordsSha256!=='string'||
  sha(JSON.stringify(raw.records))!==raw.recordsSha256||
  sha(JSON.stringify(raw))!==expectedDigest)
   throw Error('Invalid or unpinned RH preview package');
 const records=new Map<number,PreviewChange>();
 const counts={missingToEstimate:0,measuredToEstimate:0,invalidated:0};
 let previous=-1;const ids=new Set<number>();
 for(const v of raw.records){
  validateChange(v);
  if(v.epoch<=previous||ids.has(v.legacyChangeId))
   throw Error('Preview dataset has duplicate or unsorted timestamps');
  previous=v.epoch;ids.add(v.legacyChangeId);
  records.set(v.epoch,v);
  if(v.category==='historical_estimate_from_missing')counts.missingToEstimate++;
  if(v.category==='historical_estimate_replacing_suspect_original')counts.measuredToEstimate++;
  if(v.category==='historical_invalidation')counts.invalidated++;
 }
 if(counts.missingToEstimate!==2874||counts.measuredToEstimate!==2194||
    counts.invalidated!==85)throw Error('Unexpected RH transition totals');
 const expectedTokenHash=Buffer.from(sha(token),'hex');
 return {
  packageSha256:expectedDigest,
  recordsSha256:raw.recordsSha256,
  authorize(header){
   if(typeof header!=='string'||!header.startsWith('Bearer '))return false;
   const supplied=header.slice('Bearer '.length);
   if(supplied.length<32||supplied.length>512)return false;
   return timingSafeEqual(Buffer.from(sha(supplied),'hex'),expectedTokenHash);
  },
  merge(rows,fromExclusive,toInclusive){
   if(!Number.isSafeInteger(fromExclusive)||!Number.isSafeInteger(toInclusive)||
      fromExclusive>=toInclusive||fromExclusive<1640995200||
      toInclusive>1672531200||toInclusive-fromExclusive>7*86400||
      rows.length>2001)throw Error('Invalid bounded preview window');
   const out:PreviewPoint[]=[];let prior=fromExclusive;
   for(const row of rows){
    if(!Number.isSafeInteger(row.dateTime)||row.dateTime<=prior||
       row.dateTime>toInclusive||row.usUnits!==16||
       !Number.isSafeInteger(row.interval)||row.interval<1||row.interval>120)
     throw Error('Invalid original historical row');
    prior=row.dateTime;
    const original=row.outHumidity??null;
    if(!maybeRh(original))throw Error('Unexpected original RH');
    const overlay=records.get(row.dateTime);
    if(overlay&&!same(original,overlay.originalValue))
      throw Error('Origin changed since RH preview export');
    const previewValue=overlay?overlay.experimentalValue:original;
    const status=overlay?
     overlay.category==='historical_invalidation'?
      'historically_invalidated_unapproved':'experimental_unapproved':
     original===null?'original_missing':'original_measured';
    out.push({
     at:new Date(row.dateTime*1000).toISOString(),epoch:row.dateTime,
     intervalMinutes:row.interval,
     original:{value:original,status:original===null?'original_missing':'original_measured'},
     preview:{value:previewValue,status,
      legacyBatchKey:overlay?.legacyBatchKey??null,
      legacySource:overlay?.legacySource??null}
    });
   }
   // No synthetic timestamps: every overlay change must match a real original row.
   const present=new Set(out.map(p=>p.epoch));
   for(const t of records.keys())
    if(t>fromExclusive&&t<=toInclusive&&!present.has(t))
     throw Error('Missing original slot required by RH preview');
   return out;
  }
 };
}
export function loadDevRhPreviewFromEnv(env:NodeJS.ProcessEnv=process.env):DevRhPreview|undefined{
 if(env.WEATHER_DEV_PREVIEW_ENABLED!=='YES')return undefined;
 if(env.WEATHER_DEV_PREVIEW_MODE!=='isolated_dev_only'||
    env.WEATHER_STAGING_ENABLED!=='YES')
  throw Error('Dev preview requires isolated-dev and staging guard');
 const filename=env.WEATHER_DEV_PREVIEW_PACKAGE;
 const expected=env.WEATHER_DEV_PREVIEW_PACKAGE_SHA256??'';
 const token=env.WEATHER_DEV_PREVIEW_TOKEN??'';
 if(!filename||!path.isAbsolute(filename)||(path.resolve(filename)!==filename||path.dirname(filename)!=='/var/lib/loucka-qc')||
    !/^qc-rh-2022-dev-preview-[a-f0-9]{16}\.json$/.test(path.basename(filename)))
  throw Error('Private versioned RH preview package path required');
 const uid=process.getuid?.();
 if(uid===undefined)throw Error('Cannot verify preview owner UID');
 const folder=lstatSync(path.dirname(filename));
 if(!folder.isDirectory()||folder.isSymbolicLink()||
    folder.uid!==uid||(folder.mode&0o077)!==0)
  throw Error('Private preview folder must be owned 0700');
 const file=lstatSync(filename);
 if(!file.isFile()||file.isSymbolicLink()||
    file.uid!==uid||(file.mode&0o077)!==0||
    file.size>5*1024*1024)
  throw Error('Private preview file must be owned 0600 and bounded');
 const fd=openSync(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const st=fstatSync(fd);
  if(st.ino!==file.ino||st.dev!==file.dev||st.size!==file.size)
   throw Error('Preview file changed during load');
  return previewFromPackage(JSON.parse(readFileSync(fd,'utf8')),expected,token);
 }finally{closeSync(fd);}
}
