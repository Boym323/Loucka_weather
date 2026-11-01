import Fastify from 'fastify';
import {createHash} from 'node:crypto';
import type {ArchiveReader,ArchiveRow} from './store.js';
import {isMetric,metrics} from './metrics.js';
import {readingsFromRow,converted,outputUnit} from './units.js';
import type {Metric} from './metrics.js';
import type {OutputUnits} from './units.js';

type Dataset='original'|'approved';
type CurrentQuery={asOf?:string;units?:OutputUnits;dataset?:Dataset};
type HistoryQuery={metric?:string;from?:string;to?:string;resolution?:'auto'|'raw'|'hourly'|'daily';
  limit?:number;units?:OutputUnits;dataset?:Dataset};
const datePattern=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const source= {source:'weewx_archive',provenance:null} as const;
const commonQuery={
 type:'object',additionalProperties:false,
 properties:{
  units:{type:'string',enum:['us','metric','metricwx']},
  dataset:{type:'string',enum:['original','approved']}
 }
} as const;
function utcIso(seconds:number):string{return new Date(seconds*1000).toISOString();}
function epoch(raw:string):number|null{
 if(!datePattern.test(raw))return null;
 const millis=Date.parse(raw);
 return Number.isFinite(millis)&&millis>=0?Math.floor(millis/1000):null;
}
function responseEtag(body:unknown):string {
 return '"'+createHash('sha256').update(JSON.stringify(body)).digest('hex')+'"';
}
export function buildApp(reader:ArchiveReader,now:()=>Date=()=>new Date()){
 const app=Fastify({logger:false,ajv:{customOptions:{removeAdditional:false,coerceTypes:false}}});
 const errorBody=(code:string,message:string,requestId:string)=>({
  schemaVersion:'1',error:{code,message,requestId}
 });
 const bad=(reply:any,reqId:string,code:string,message:string,status=400)=>
  reply.code(status).send(errorBody(code,message,reqId));
 const conditional=(req:any,reply:any,body:unknown)=>{
  const etag=responseEtag(body);
  reply.header('ETag',etag).header('Cache-Control','no-cache');
  return req.headers['if-none-match']===etag?reply.code(304).send():body;
 };
 app.setErrorHandler((err,req,reply)=>{
  const invalid=Boolean((err as {validation?:unknown}).validation);
  void reply.code(invalid?400:500).send(errorBody(invalid?'BAD_REQUEST':'INTERNAL_ERROR',
   invalid?'Invalid API query':'Internal API failure',req.id));
 });
 app.setNotFoundHandler((req,reply)=>{
  void reply.code(404).send(errorBody('NOT_FOUND','Unknown endpoint',req.id));
 });
 app.get('/api/v1/healthz',async()=>({
  schemaVersion:'1',status:'ok',checkedAt:now().toISOString()
 }));
 app.get('/api/v1/readyz',async(req,reply)=>{
  try{await reader.ping();}catch{return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Archive unavailable',503);}
  return {schemaVersion:'1',checkedAt:now().toISOString(),ready:true,
   components:{api:'ok',archive:'ok',live:'disabled',camera:'disabled'}};
 });
 app.get('/api/v1/station',async(req,reply)=>conditional(req,reply,{
  schemaVersion:'1',stationId:'loucka',name:'Počasí Loučka',timezone:'Europe/Prague',
  location:{latitude:null,longitude:null,altitudeMeters:null,verified:false},
  archivalSource:'weewx',supportedOutputUnits:['us','metric','metricwx'],
  dataRevision:'original-unverified',updatedAt:'2026-11-01T00:00:00Z',
  capabilities:['current','history','sensors'],availableDatasets:['original']
 }));
 app.get('/api/v1/sensors',async(req,reply)=>conditional(req,reply,{
  schemaVersion:'1',stationId:'loucka',updatedAt:'2026-11-01T00:00:00Z',
  sensors:[] // Verified physical mapping and installation epochs are not supplied.
 }));
 app.get('/api/v1/camera/status',async(req,reply)=>conditional(req,reply,{
  schemaVersion:'1',cameraId:'west',status:'disabled',
  capturedAt:null,publishedAt:null,latestUrl:null,ageSeconds:null,
  width:null,height:null,privacyMaskApplied:null,
  updatedAt:'2026-11-01T00:00:00Z'
 }));
 app.get<{Querystring:CurrentQuery}>('/api/v1/current',{
  schema:{querystring:{...commonQuery,properties:{...commonQuery.properties,
   asOf:{type:'string'}}}}
 },async(req,reply)=>{
  const {asOf,units='metricwx',dataset='original'}=req.query;
  if(dataset==='approved')return bad(reply,req.id,'DATASET_UNAVAILABLE','No approved dataset published',503);
  const at=asOf===undefined?Math.floor(now().getTime()/1000):epoch(asOf);
  if(at===null)return bad(reply,req.id,'BAD_REQUEST','asOf must be RFC3339 with timezone');
  let row:ArchiveRow|null;
  try{row=await reader.latest(at);}catch{return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Archive unavailable',503);}
  if(row===null)return bad(reply,req.id,'NOT_FOUND','No archived observation',404);
  try{
   if(!Number.isSafeInteger(row.dateTime)||!Number.isInteger(row.interval)||row.interval<=0)
    throw new Error('Invalid archival metadata');
   const readings=readingsFromRow(row,units);
   const fingerprint=createHash('sha256').update(JSON.stringify(row)).digest('hex').slice(0,16);
   return conditional(req,reply,{schemaVersion:'1',observedAt:utcIso(row.dateTime),
    stale:now().getTime()/1000-row.dateTime>900,archiveIntervalMinutes:row.interval,
    readings,units,dataset,dataRevision:`archive-${row.dateTime}-${fingerprint}`});
  }catch{return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Unsupported archived observation',503);}
 });
 app.get<{Querystring:HistoryQuery}>('/api/v1/history',{
  schema:{querystring:{...commonQuery,required:['metric','from','to'],
   properties:{...commonQuery.properties,
    metric:{type:'string'},from:{type:'string'},to:{type:'string'},
    resolution:{type:'string',enum:['auto','raw','hourly','daily']},
    limit:{type:'integer',minimum:1,maximum:10000}}}}
 },async(req,reply)=>{
  const {metric,from,to,resolution='auto',limit=2000,units='metricwx',dataset='original'}=req.query;
  if(dataset==='approved')return bad(reply,req.id,'DATASET_UNAVAILABLE','No approved dataset published',503);
  if(!metric||!isMetric(metric))return bad(reply,req.id,'UNKNOWN_METRIC','Unsupported public metric');
  const start=from?epoch(from):null,end=to?epoch(to):null;
  if(start===null||end===null||end<=start)return bad(reply,req.id,'INVALID_RANGE','Invalid UTC time range',422);
  if(resolution==='hourly'||resolution==='daily')
   return bad(reply,req.id,'INVALID_AGGREGATION','Aggregate history not yet implemented in staging',422);
  if(end-start>31*86400)
   return bad(reply,req.id,'LIMIT_EXCEEDED','Raw history is limited to 31 days',422);
  let rows:ArchiveRow[];
  try{rows=await reader.history(metric,start,end,Math.min(limit+1,10001));}
  catch{return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Archive unavailable',503);}
  if(rows.length>limit)return bad(reply,req.id,'LIMIT_EXCEEDED','Too many archive points for requested limit',422);
  const points:any[]=[];
  let previous=start,valid=0;
  try{
   for(const row of rows){
    if(!Number.isSafeInteger(row.dateTime)||!Number.isInteger(row.interval)||row.interval<=0
      ||row.dateTime<=previous||row.dateTime>end)throw new Error('Invalid row order or interval');
    const rowStart=row.dateTime-row.interval*60;
    if(rowStart>previous){
     points.push({startTime:utcIso(previous),endTime:utcIso(rowStart),
      value:null,quality:'missing',source:'derived',provenance:null,sourceUsUnits:null});
    }
    const reading=converted(metric,row[metric],row.usUnits,units);
    points.push({startTime:utcIso(rowStart),endTime:utcIso(row.dateTime),
     value:reading.value,quality:reading.quality,...source,sourceUsUnits:reading.sourceUsUnits});
    if(reading.value!==null)valid++;
    previous=row.dateTime;
   }
   if(rows.length && previous<end)points.push({
    startTime:utcIso(previous),endTime:utcIso(end),value:null,
    quality:'missing',source:'derived',provenance:null,sourceUsUnits:null
   });
   if(points.length>limit)return bad(reply,req.id,'LIMIT_EXCEEDED','Too many points including gaps',422);
   const fingerprint=createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0,16);
   return conditional(req,reply,{
    schemaVersion:'1',metric,unit:outputUnit(metric,units),
    range:{from:utcIso(start),to:utcIso(end),boundary:'(start,end]',calendarTimezone:'Europe/Prague'},
    resolution:'raw',points,count:points.length,
    completeness:{expected:null,valid,fraction:null},
    units,dataset,dataRevision:`archive-${fingerprint}`,
    aggregation:'sample',truncated:false,gapPolicy:'explicit-null'
   });
  }catch{return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Unsupported archived observation',503);}
 });
 return app;
}
