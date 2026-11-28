import {createHash} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import type {ArchiveReader,ArchiveRow} from './store.js';
import {isMetric} from './metrics.js';
import {serializeSse} from './live.js';
import type {LiveHub} from './live.js';
import {readingsFromRow,outputUnit} from './units.js';
import type {OutputUnits} from './units.js';
import {epoch,utcIso} from './calendar-time.js';
import {gatewayReadings} from './gateway.js';
import {originalQualityWindow} from './original-quality.js';
import {bad,conditional,commonQuery} from './http-contract.js';

type Dataset='original'|'approved';
type CurrentQuery={asOf?:string;units?:OutputUnits;dataset?:Dataset};
type LiveQuery={units?:OutputUnits};
type QualityObservationsQuery={metric?:string;from?:string;to?:string;units?:OutputUnits;
 limit?:string;dataset?:Dataset};

/** Current archive, bounded original QC and live SSE. Each registration owns
 * its live connections and drains them on the existing app's preClose hook.
 */
export function registerObservationRoutes(app:FastifyInstance,reader:ArchiveReader,now:()=>Date,liveHub?:LiveHub){
 // SSE sockets stay open indefinitely: drain them before server.close(), not
 // in onClose, which is only invoked after in-flight connections have drained.
 const sseConnections=new Set<()=>void>();
 app.addHook('preClose',async()=>{for(const close of sseConnections)close();});
 app.get<{Querystring:LiveQuery}>('/api/v1/live',{schema:{querystring:{type:'object',additionalProperties:false,
  properties:{units:{type:'string',enum:['us','metric','metricwx']}}}}},async(req,reply)=>{
  if(!liveHub)return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Live stream is unavailable',503);
  if(liveHub.subscriberCount>=100){reply.header('Retry-After','5');return bad(reply,req.id,'TOO_MANY_REQUESTS','Live connection limit reached',429);}
  const header=req.headers['last-event-id'];
  if(Array.isArray(header)||typeof header==='string'&&(header.length>128||/[\r\n\0]/.test(header)))
   return bad(reply,req.id,'BAD_REQUEST','Invalid Last-Event-ID');
  const lastEventId=typeof header==='string'?header:undefined;
  const units=req.query.units??'metricwx';
  const raw=reply.raw;
  reply.hijack();
  raw.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8',
   'Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
  let closed=false,heartbeat:ReturnType<typeof setInterval>|undefined;
  let unsubscribe=()=>{};
  const close=()=>{if(closed)return;closed=true;if(heartbeat)clearInterval(heartbeat);unsubscribe();sseConnections.delete(close);if(!raw.destroyed)raw.end();};
  const write=(event:Parameters<typeof serializeSse>[0])=>{
   if(closed)return;
   try{if(!raw.write(serializeSse(event)))close();}catch{close();}
  };
  raw.once('close',close);
  sseConnections.add(close);
  unsubscribe=liveHub.subscribe(write);
  const snapshot=(eventType:'snapshot'|'reset')=>{
   const gateway=units==='metricwx'?liveHub.getGateway(now().getTime()):null;
   if(gateway)return liveHub.createLiveEvent({eventType,observedAt:gateway.observedAt,
    receivedAt:gateway.receivedAt,emittedAt:now().toISOString(),units:'metricwx',
    state:'live',source:'gw3000_live',timestampMeaning:gateway.timestampMeaning??'device_reported',
    readings:gatewayReadings(gateway)});
   let row=liveHub.latestObservation;
   let readings:unknown={},state:'archive_fallback'|'stale'|'unavailable'=row?
    (now().getTime()/1000-row.dateTime>120?'stale':'archive_fallback'):'unavailable';
   if(row){try{readings=readingsFromRow(row,units);}catch{row=null;state='unavailable';}}
   const payload={schemaVersion:'1' as const,eventType,eventId:'',observedAt:row?utcIso(row.dateTime):null,
    emittedAt:now().toISOString(),units,state,readings,reason:row?null:'Archive snapshot unavailable'};
   return liveHub.createLiveEvent(payload);
  };
  const replay=liveHub.replay(lastEventId);
  if(replay.reset){write(snapshot('reset'));write(snapshot('snapshot'));}
  else if(lastEventId){for(const event of replay.events)write(event);}
  else write(snapshot('snapshot'));
  if(!closed){
   heartbeat=setInterval(()=>{if(!closed&&!raw.write(`: heartbeat ${now().toISOString()}\n\n`))close();},15000);
   heartbeat.unref();
  }
 });
 app.get<{Querystring:CurrentQuery}>('/api/v1/current',{
  schema:{querystring:{...commonQuery,properties:{...commonQuery.properties,
   asOf:{type:'string'}}}}
 },async(req,reply)=>{
  const {asOf,units='metricwx',dataset='original'}=req.query;
  if(dataset==='approved')return bad(reply,req.id,'DATASET_UNAVAILABLE','No approved dataset published',503);
  const at=asOf===undefined?Math.floor(now().getTime()/1000):epoch(asOf);
  if(at===null)return bad(reply,req.id,'BAD_REQUEST','asOf must be RFC3339 with timezone');
  const revisionAtStart=liveHub?.dataRevision;
  let row:ArchiveRow|null;
  try{row=await reader.latest(at);}catch{return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Archive unavailable',503);}
  if(liveHub&&revisionAtStart!==liveHub.dataRevision)
   return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Archive changed during current request; retry',503);
  if(row===null)return bad(reply,req.id,'NOT_FOUND','No archived observation',404);
  try{
   if(!Number.isSafeInteger(row.dateTime)||row.dateTime<0||!Number.isSafeInteger(row.interval)||row.interval<1||row.interval>1440)
    throw new Error('Invalid archival metadata');
   const readings=readingsFromRow(row,units);
   const fingerprint=createHash('sha256').update(JSON.stringify(row)).digest('hex').slice(0,16);
   return conditional(req,reply,{schemaVersion:'1',observedAt:utcIso(row.dateTime),
    stale:now().getTime()/1000-row.dateTime>900,archiveIntervalMinutes:row.interval,
    readings,units,dataset,qcStatus:'original_unverified',extremaVerified:false,dataRevision:`archive-${revisionAtStart??'unobserved'}-${fingerprint}`});
  }catch{return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Unsupported archived observation',503);}
 });
 // Independent, bounded per-variable QC view of the ORIGINAL archive.
 // This is not an approved dataset and never auto-assigns MEASURED.
 app.get<{Querystring:QualityObservationsQuery}>('/api/v1/quality/observations',{
  schema:{querystring:{...commonQuery,required:['metric','from','to'],
   properties:{...commonQuery.properties,metric:{type:'string'},
    from:{type:'string'},to:{type:'string'},limit:{type:'string',pattern:'^[0-9]{1,4}$'}}}}
 },async(req,reply)=>{
  const {metric,from,to,units='metricwx',limit:rawLimit,dataset='original'}=req.query;
  if(dataset==='approved')return bad(reply,req.id,'DATASET_UNAVAILABLE','No approved dataset published',503);
  if(!metric||!isMetric(metric))return bad(reply,req.id,'UNKNOWN_METRIC','Unsupported quality metric',400);
  const start=from?epoch(from):null,end=to?epoch(to):null;
  if(start===null||end===null||end<=start||end-start>48*3600)
   return bad(reply,req.id,'INVALID_RANGE','Quality window must be valid UTC/offset RFC3339 and at most 48 hours',422);
  const limit=rawLimit===undefined?750:Number(rawLimit);
  if(!Number.isSafeInteger(limit)||limit<1||limit>2000)
   return bad(reply,req.id,'LIMIT_EXCEEDED','Quality limit must be 1..2000',422);
  let rows:ArchiveRow[];
  try{rows=await reader.history(metric,start,end,limit+1);}
  catch{return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Original archive unavailable',503);}
  if(rows.length>limit)
   return bad(reply,req.id,'LIMIT_EXCEEDED','Quality observations are not silently truncated',422);
  try{
   const data=originalQualityWindow(rows,metric,units,start,end);
   const fingerprint=createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0,20);
   return conditional(req,reply,{
    schemaVersion:'1',qualitySchema:'loucka-field-qc-v1',
    metric,unit:outputUnit(metric,units),units,dataset:'original',
    source:'weewx_original_archive',
    provenanceStatus:'not_independently_validated',
    interpretedAs:'archival_field_value_not_original_sensor_proof',
    range:{from:utcIso(start),to:utcIso(end),boundary:'(start,end]',
     calendarTimezone:'Europe/Prague'},
    observations:data.observations,gaps:data.gaps,summary:data.summary,
    count:data.observations.length,extremaPolicy:'none_eligible_until_per_field_provenance',
    gapPolicy:'explicit_null_spans_no_interpolation',
    dataRevision:'original-qc-'+fingerprint
   });
  }catch{
   return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Invalid archive quality input',503);
  }
 });
}
