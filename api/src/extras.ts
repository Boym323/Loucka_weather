/** External snapshots are collected by an independent least-privilege service.
 * HTTP API reads only safe, fixed paths; no writes, arbitrary URLs or DB mutations.
 */
import type {FastifyInstance} from 'fastify';
import {createReadStream} from 'node:fs';
import {readFile,lstat,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import type {ArchiveReader} from './store.js';

/** Override filesystem locations only for isolated Fastify contract tests.
 * Default runtime locations still come from the staging environment.
 * No test should need to inspect or mutate live collector state.
 */
export type ExtraSourceFiles={cameraDir?:string;warningsFile?:string};
const defaultCameraDir=process.env.LOUCKA_CAMERA_ARCHIVE_DIR||'/var/lib/loucka-camera';
const defaultWarningsFile=process.env.LOUCKA_ALERTS_FILE||'/var/lib/loucka-alerts/alerts.json';
const nowIso=()=>new Date().toISOString();
const limitFile=async(path:string,max:number)=>{
 const info=await lstat(path);
 if(!info.isFile()||info.size>max)throw Error('Invalid archive file');
 return info;
};
const loadJson=async(path:string,max=150000)=>{
 await limitFile(path,max);
 return JSON.parse(await readFile(path,'utf8')) as Record<string,unknown>;
};
const fileNameOk=(name:string,kind:'frame'|'video')=>kind==='frame'?
 /^\d{8}T\d{6}Z\.jpg$/.test(name):/^\d{4}-\d{2}-\d{2}\.mp4$/.test(name);
export async function archiveCameraStatus(sources:ExtraSourceFiles={}){
 const cameraDir=sources.cameraDir??defaultCameraDir;
 try{
  const data=await loadJson(join(cameraDir,'index.json'),250000);
  const frame=Array.isArray(data.frames)?data.frames[0] as {name?:unknown;fetchedAt?:unknown}:null;
  if(!frame||typeof frame.name!=='string'||!fileNameOk(frame.name,'frame')||
   typeof frame.fetchedAt!=='string')throw Error('No published frames');
  const published=Date.parse(frame.fetchedAt);
  if(!Number.isFinite(published)||published>Date.now()+60_000)throw Error('Invalid archive timestamp');
  const age=Math.max(0,Math.floor((Date.now()-published)/1000));
  return {schemaVersion:'1',cameraId:'west',status:age<=1200?'fresh':'stale',
   capturedAt:null,publishedAt:new Date(published).toISOString(),
   latestUrl:'/api/v1/camera/frames/'+frame.name,ageSeconds:age,
   width:null,height:null,privacyMaskApplied:null,updatedAt:nowIso(),
   timestampMeaning:'downloaded_not_captured'};
 }catch{
  return {schemaVersion:'1',cameraId:'west',status:'disabled',capturedAt:null,
   publishedAt:null,latestUrl:null,ageSeconds:null,width:null,height:null,
   privacyMaskApplied:null,updatedAt:nowIso(),timestampMeaning:'unknown'};
 }
}
export function registerExtras(app:FastifyInstance,reader:ArchiveReader,sources:ExtraSourceFiles={}){
 const cameraDir=sources.cameraDir??defaultCameraDir;
 const warningsFile=sources.warningsFile??defaultWarningsFile;
 app.get('/api/v1/diagnostics/sensors',async(_req,reply)=>{
  if(!reader.telemetrySnapshot)return reply.code(503).send({schemaVersion:'1',status:'unavailable',readings:[]});
  try{
   const rows=await reader.telemetrySnapshot(Math.floor(Date.now()/1000));
   return {schemaVersion:'1',status:'ok',checkedAt:nowIso(),source:'weewx_archive',
    metadata:'Raw WeeWX telemetry. Sensor identity, signal scale and battery units require verification.',
    readings:rows.map(r=>({column:r.column,observedAt:new Date(r.dateTime*1000).toISOString(),
      rawValue:r.value,unit:'raw',confidence:'provisional'}))};
  }catch{return reply.code(503).send({schemaVersion:'1',status:'unavailable',readings:[]});}
 });
 app.get<{Querystring:{year?:string}}>('/api/v1/climate/solar',async(req,reply)=>{
  const year=Number(req.query.year);
  if(!/^20\d{2}$/.test(req.query.year??'')||year<2009||year>new Date().getFullYear()||!reader.solarYear)
   return reply.code(400).send({schemaVersion:'1',error:'Invalid year or source'});
  const yearStart=Date.parse(year+'-01-01T00:00:00+01:00')/1000;
  const nextStart=Date.parse((year+1)+'-01-01T00:00:00+01:00')/1000;
  try{
   const result=await reader.solarYear(yearStart,nextStart);
   return {schemaVersion:'1',year,source:'weewx_archive',method:'sum(radiation_Wm2 * interval_minutes / 60000)',
    unit:'kWh/m2',energyKwhM2:result.energyKwhM2,validRecords:result.validRecords,
    totalRecords:result.records,coverageFraction:result.validMinutes*60/(nextStart-yearStart),
    sunshineHours:null,snowDepthCm:null,quality:'derived_unreviewed'};
  }catch{return reply.code(503).send({schemaVersion:'1',error:'Solar data unavailable'});}
 });
 app.get('/api/v1/camera/archive',async()=>{
  try{
   const data=await loadJson(join(cameraDir,'index.json'),250000);
   const frames=Array.isArray(data.frames)?data.frames.filter((v):v is {name:string;fetchedAt:string}=>
    typeof v==='object'&&v!==null&&typeof (v as any).name==='string'&&
    fileNameOk((v as any).name,'frame')&&typeof (v as any).fetchedAt==='string').slice(0,120):[];
   const videos=Array.isArray(data.videos)?data.videos.filter((v):v is {name:string;date:string}=>
    typeof v==='object'&&v!==null&&typeof (v as any).name==='string'&&
    fileNameOk((v as any).name,'video')&&typeof (v as any).date==='string').slice(0,45):[];
   return {schemaVersion:'1',status:'ok',source:'public_camera_jpeg',timestampMeaning:'downloaded_not_captured',
    frames:frames.map(f=>({fetchedAt:f.fetchedAt,url:'/api/v1/camera/frames/'+f.name})),
    videos:videos.map(v=>({date:v.date,url:'/api/v1/camera/timelapse/'+v.name}))};
  }catch{return {schemaVersion:'1',status:'unavailable',frames:[],videos:[]};}
 });
 app.get<{Params:{date:string}}>('/api/v1/camera/archive/day/:date',async(req,reply)=>{
  const date=req.params.date;
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||
   new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)
   return reply.code(400).send({schemaVersion:'1',error:'Invalid UTC date'});
  const target=Date.parse(date+'T00:00:00Z');
  if(target>Date.now()+86400000||target<Date.now()-37*86400000)
   return {schemaVersion:'1',date,status:'outside_retention',frames:[]};
  try{
   const prefix=date.replace(/-/g,'')+'T';
   const files=(await readdir(join(cameraDir,'frames'))).filter(n=>n.startsWith(prefix)&&fileNameOk(n,'frame'))
    .sort().reverse().slice(0,160);
   return {schemaVersion:'1',date,status:'ok',timestampMeaning:'downloaded_not_captured',
    frames:files.map(n=>({fetchedAt:new Date(Date.UTC(
      Number(n.slice(0,4)),Number(n.slice(4,6))-1,Number(n.slice(6,8)),
      Number(n.slice(9,11)),Number(n.slice(11,13)),Number(n.slice(13,15)))).toISOString(),
      url:'/api/v1/camera/frames/'+n}))};
  }catch{return {schemaVersion:'1',date,status:'unavailable',frames:[]};}
 });
 app.get<{Params:{file:string}}>('/api/v1/camera/frames/:file',async(req,reply)=>{
  if(!fileNameOk(req.params.file,'frame'))return reply.code(404).send();
  const path=join(cameraDir,'frames',req.params.file);
  try{await limitFile(path,8_000_000);}
  catch{return reply.code(404).send();}
  return reply.header('Cache-Control','public,max-age=3600,immutable').type('image/jpeg').send(createReadStream(path));
 });
 app.get<{Params:{file:string}}>('/api/v1/camera/timelapse/:file',async(req,reply)=>{
  if(!fileNameOk(req.params.file,'video'))return reply.code(404).send();
  const path=join(cameraDir,'timelapse',req.params.file);
  try{await limitFile(path,60_000_000);}
  catch{return reply.code(404).send();}
  return reply.header('Cache-Control','public,max-age=3600').type('video/mp4').send(createReadStream(path));
 });
 app.get('/api/v1/alerts/local',async()=>{
  try{
   const data=await loadJson(warningsFile,180000);
   const updatedAt=String(data.checkedAt||'');
   const fresh=Number.isFinite(Date.parse(updatedAt))&&Date.now()-Date.parse(updatedAt)<45*60_000;
   const scope=data.orp==='7209'&&data.source==='CHMI_CAP'&&data.status==='verified';
   if(!fresh||!scope)return {schemaVersion:'1',status:'unavailable',area:'ORP Valašské Klobouky',alerts:[]};
   const alerts=Array.isArray(data.alerts)?data.alerts.slice(0,40).filter(item=>item!==null&&typeof item==='object').map(item=>{
    const a=item as Record<string,unknown>;
    const str=(key:string)=>typeof a[key]==='string'?String(a[key]).slice(0,2500):'';
    return {event:str('event'),severity:str('severity'),onset:str('onset'),
     expires:str('expires'),headline:str('headline'),description:str('description'),
     instruction:str('instruction')};
   }):[];
   return {schemaVersion:'1',status:'verified',area:'ORP Valašské Klobouky',
    checkedAt:updatedAt,source:'CHMI_CAP',alerts};
  }catch{return {schemaVersion:'1',status:'unavailable',area:'ORP Valašské Klobouky',alerts:[]};}
 });
}
