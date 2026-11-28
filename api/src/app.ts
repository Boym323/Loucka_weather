import Fastify from 'fastify';
import {registerDevRhPreview} from './dev-rh-preview-route.js';
import type {DevRhPreview} from './dev-rh-preview.js';
import {registerExtras,archiveCameraStatus} from './extras.js';
import type {ExtraSourceFiles} from './extras.js';
import {createHash} from 'node:crypto';
import type {ArchiveReader,ArchiveRow,DailySummaryRow} from './store.js';
import {isMetric,metrics} from './metrics.js';
import {aggregationPolicy} from './aggregation.js';

import {LiveHub,serializeSse} from './live.js';
import {readingsFromRow,outputUnit} from './units.js';
import {aggregateSummaryRows} from './daily-statistics.js';
import {epoch,utcIso,localMidnight,localDateAt} from './calendar-time.js';
import {hasUnverifiedLightningMapping} from './lightning-publication.js';
import {gatewayReadings} from './gateway.js';
import {readFile} from 'node:fs/promises';
import {sensorChannels} from './sensor-evidence.js';
import {originalQualityWindow} from './original-quality.js';
import {originalDailyAggregateHeld} from './sensor-publication-qc.js';
import type {Metric} from './metrics.js';
import {bad,conditional,errorBody,commonQuery} from './http-contract.js';
import {registerClimateRoutes} from './climate-routes.js';
import {registerHistoryRoute} from './history-route.js';
import type {OutputUnits} from './units.js';

type Dataset='original'|'approved';
type CurrentQuery={asOf?:string;units?:OutputUnits;dataset?:Dataset};
type StatisticsQuery={metric?:string;aggregation?:string;date?:string;month?:string;year?:string;
  units?:OutputUnits;dataset?:Dataset};
type LiveQuery={units?:OutputUnits};
type QualityObservationsQuery={metric?:string;from?:string;to?:string;units?:OutputUnits;
 limit?:string;dataset?:Dataset};
function statsAggregationAllowed(metric:Metric,aggregation:string):boolean{
 const policy=aggregationPolicy[metric] as {allowed:readonly string[];statsEnabled:boolean};
 return policy.statsEnabled&&policy.allowed.includes(aggregation);
}
export function buildApp(reader:ArchiveReader,now:()=>Date=()=>new Date(),liveHub?:LiveHub,
 sourceFiles:ExtraSourceFiles={},devRhPreview?:DevRhPreview){
 const app=Fastify({logger:false,ajv:{customOptions:{removeAdditional:false,coerceTypes:false}}});
 // SSE sockets stay open indefinitely: drain them before server.close(), not
 // in onClose, which is only invoked after in-flight connections have drained.
 const sseConnections=new Set<()=>void>();
 app.addHook('preClose',async()=>{for(const close of sseConnections)close();});
 const metadataCheckedAt=now().toISOString();
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
  // Component health is informative; readiness depends only on the primary DB.
  const camera=await archiveCameraStatus(sourceFiles);
  const gw=liveHub?.gatewayStatus(now().getTime())??'disabled';
  return {schemaVersion:'1',checkedAt:now().toISOString(),ready:true,
   components:{api:'ok',archive:'ok',live:gw==='fresh'?'ok':gw==='disabled'?'disabled':'degraded',
    camera:camera.status==='fresh'?'ok':camera.status==='stale'?'degraded':'disabled'}};
 });
 app.get('/api/v1/station',async(req,reply)=>conditional(req,reply,{
  schemaVersion:'1',stationId:'loucka',name:'Počasí Loučka',timezone:'Europe/Prague',
  location:{latitude:null,longitude:null,altitudeMeters:null,verified:false},
  archivalSource:'weewx',supportedOutputUnits:['us','metric','metricwx'],
  dataRevision:liveHub?.dataRevision??'original-unverified',updatedAt:metadataCheckedAt,
  capabilities:['current','history','sensors',...(reader.dailySummaries?
   ['daily_statistics','monthly_statistics','yearly_statistics','annual_consolidation','temperature_all_years']:[]),...(liveHub?['live_sse']:[]),...(liveHub?.gatewayConfigured?['gw3000_live']:[])],
  availableDatasets:['original']
 }));
 app.get('/api/v1/live/current',async()=>{
  const gateway=liveHub?.getGateway(now().getTime());
  if(gateway)return {schemaVersion:'1',source:'gw3000_live',state:'live',
   observedAt:gateway.observedAt,receivedAt:gateway.receivedAt,units:'metricwx',
   timestampMeaning:gateway.timestampMeaning??'device_reported',
   readings:gatewayReadings(gateway)};
  return {schemaVersion:'1',source:'weewx_archive',state:liveHub?.gatewayStatus(now().getTime())??'disabled',
   observedAt:null,receivedAt:liveHub?.gatewayLastReceivedAt??null,units:'metricwx',
   readings:{}};
 });
 // Independent source monitoring must NEVER cause /healthz or /readyz to fail.
 app.get('/api/v1/monitor/status',async()=>{
  const timestamp=now(),epochMs=timestamp.getTime();
  const last=liveHub?.latestObservation?.dateTime;
  const age=last===null||last===undefined?null:Math.max(0,Math.floor(epochMs/1000-last));
  const camera=await archiveCameraStatus(sourceFiles);
  let alerts:'ok'|'stale'|'missing'='missing',alertsAge:number|null=null;
  try{
   const path=sourceFiles.warningsFile??process.env.LOUCKA_ALERTS_FILE??'/var/lib/loucka-alerts/alerts.json';
   const info=JSON.parse(await readFile(path,'utf8')) as {checkedAt?:string;source?:string;status?:string;orp?:string};
   if(info.source==='CHMI_CAP'&&info.status==='verified'&&info.orp==='7209'){
    const checked=Date.parse(info.checkedAt??'');
    if(Number.isFinite(checked)&&checked<=epochMs+60000){
     alertsAge=Math.max(0,Math.floor((epochMs-checked)/1000));
     alerts=alertsAge<=2700?'ok':'stale';
    }
   }
  }catch{/* No official validated CAP cache; report missing. */}
  const gateway=liveHub?.gatewayStatus(epochMs)??'disabled';
  const archive=age===null?'missing':age>900?'stale':'ok';
  const components={
   api:{status:'ok'},
   archive:{status:archive,lastObservedAt:last?utcIso(last):null,ageSeconds:age},
   gw3000:{status:gateway,lastObservedAt:liveHub?.getGateway(epochMs)?.observedAt??null,
    lastReceivedAt:liveHub?.gatewayLastReceivedAt??null},
   camera:{status:camera.status==='fresh'?'ok':camera.status==='stale'?'stale':'missing',
    lastReceivedAt:camera.publishedAt??null},
   chmi:{status:alerts,ageSeconds:alertsAge}
  };
  const degraded=Object.values(components).some(x=>x.status==='stale'||x.status==='missing');
  return {schemaVersion:'1',checkedAt:timestamp.toISOString(),status:degraded?'degraded':'ok',
   components,notes:'Source monitoring is separate from API liveness and database readiness'};
 });
 app.get('/api/v1/sensors',async(req,reply)=>conditional(req,reply,{
  schemaVersion:'1',stationId:'loucka',updatedAt:metadataCheckedAt,
  sensors:[] // Verified physical mapping and installation epochs are not supplied.
 }));
 // This is a channel inventory, not the still-unverified physical
 // installation inventory exposed by /api/v1/sensors.
 let sensorPresenceCache:{at:number;rows:Awaited<ReturnType<NonNullable<ArchiveReader['sensorPresence']>>>}|null=null;
 app.get('/api/v1/sensors/channels',async(req,reply)=>{
  const timestamp=Math.floor(now().getTime()/1000);
  let rows:Awaited<ReturnType<NonNullable<ArchiveReader['sensorPresence']>>>|null=null;
  let availability:'archive_recent'|'source_unavailable'|'metadata_only'=
   reader.sensorPresence?'archive_recent':'metadata_only';
  if(reader.sensorPresence){
   try{
    if(sensorPresenceCache&&timestamp-sensorPresenceCache.at>=0&&timestamp-sensorPresenceCache.at<60){
     rows=sensorPresenceCache.rows;
    }else{
     rows=await reader.sensorPresence(timestamp-86400,timestamp);
     sensorPresenceCache={at:timestamp,rows};
    }
   }catch{availability='source_unavailable';}
  }
  const channels=sensorChannels.map(c=>{
   const item=rows?.find(r=>r.metric===c.metric);
   const count=item?.count??null;
   return {metric:c.metric,title:c.title,liveKey:c.liveKey,
    liveRelation:c.liveRelation,physicalIdentity:'unverified',
    source:'weewx_original_archive',confidence:'provisional',
    note:c.hint,windowHours:24,
    archiveStatus:count===null?'unknown':count>0?'observed_recently':'not_observed_recently',
    nonNullSamples:count,
    lastObservedAt:item?.lastObservedAt===null||item?.lastObservedAt===undefined?null:
      new Date(item.lastObservedAt*1000).toISOString()};
  });
  return conditional(req,reply,{schemaVersion:'1',status:availability,
    checkedAt:new Date((sensorPresenceCache?.at??timestamp)*1000).toISOString(),sampleWindowHours:24,
    interpretation:'A non-null archive sample is evidence of a field, not sensor installation or validated quality.',
    channels},availability==='archive_recent'?'private, max-age=30':'no-cache');
 });
 app.get('/api/v1/camera/status',async()=>archiveCameraStatus(sourceFiles));


 registerClimateRoutes(app,reader,now);
 const statisticsRoute=(period:'day'|'month'|'year')=>async(req:any,reply:any)=>{
  const {metric,aggregation,units='metricwx',dataset='original'}=req.query as StatisticsQuery;
  const label=period==='day'?(req.query as StatisticsQuery).date!:period==='month'?
   (req.query as StatisticsQuery).month!:(req.query as StatisticsQuery).year!;
  if(dataset==='approved')return bad(reply,req.id,'DATASET_UNAVAILABLE','No approved dataset published',503);
  if(!metric||!isMetric(metric))return bad(reply,req.id,'UNKNOWN_METRIC','Unsupported public metric');
   if(hasUnverifiedLightningMapping(metric))return bad(reply,req.id,'UNVERIFIED_FIELD_MAPPING','Original lightning counter mapping is unverified',503);
  if(!aggregation||!statsAggregationAllowed(metric,aggregation))
   return bad(reply,req.id,'INVALID_AGGREGATION','Unsupported metric and aggregation combination',422);
  let localStart:string,localEnd:string;
  if(period==='day'){
   if(localMidnight(label)===null)return bad(reply,req.id,'INVALID_RANGE','date must be a valid local calendar date',422);
   const next=new Date(Date.UTC(Number(label.slice(0,4)),Number(label.slice(5,7))-1,Number(label.slice(8,10))+1));
   localStart=label;localEnd=next.toISOString().slice(0,10);
  }else if(period==='month'){
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(label))return bad(reply,req.id,'INVALID_RANGE','month must use YYYY-MM',422);
   localStart=label+'-01';
   const next=new Date(Date.UTC(Number(label.slice(0,4)),Number(label.slice(5,7)),1));
   localEnd=next.toISOString().slice(0,10);
  }else{
   if(!/^\d{4}$/.test(label)||Number(label)<2009||Number(label)>2100)
    return bad(reply,req.id,'INVALID_RANGE','year must be from 2009 to 2100',422);
   localStart=label+'-01-01';localEnd=String(Number(label)+1).padStart(4,'0')+'-01-01';
  }
  const start=localMidnight(localStart),end=localMidnight(localEnd);
  if(start===null||end===null||end<=start)return bad(reply,req.id,'INVALID_RANGE','Invalid local period',422);
  if(originalDailyAggregateHeld(metric,start,end))return bad(reply,req.id,'HISTORICAL_QC_HOLD','Unverified original daily summaries could contain known sensor anomalies',503);
  if(!reader.dailySummaries)return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Daily summaries are unavailable',503);
  let rows:DailySummaryRow[];
  try{rows=await reader.dailySummaries(metric,start,end,period==='year'?400:40);}
  catch{return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Daily summaries unavailable',503);}
  try{
   let previousDateTime=-1;
   for(const row of rows){
    const date=localDateAt(row.dateTime);
    if(row.dateTime<start||row.dateTime>=end||localMidnight(date)!==row.dateTime||row.dateTime<=previousDateTime)
     throw new Error('Invalid daily summary boundaries or ordering');
    previousDateTime=row.dateTime;
   }
   const result=aggregateSummaryRows(metric,aggregation,rows,units);
   const fingerprint=createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0,20);
   const extremaApplies=aggregation==='min'||aggregation==='max'||aggregation==='dir_at_max';
   const common={schemaVersion:'1',metric,aggregation,unit:result.unit,units,value:result.value,
    quality:result.value===null?'missing':'derived',source:'weewx_daily',
    provenance:result.value===null?null:`weewx-daily-${aggregation}`,dataset,
     qcStatus:'original_unverified',extremaVerified:false,
    dataRevision:`daily-${fingerprint}`,completeness:{expected:null,valid:result.valid,fraction:null},
    // WeeWX day_<metric>.sumtime is the time-weighted number of VALID
    // observation seconds. Do not infer this from row counts or assume 5 min.
    timeCoverage:(period==='year'&&aggregation==='mean'&&
     rows.length>0&&rows.every(r=>(r.count??0)===0||
      (r.sumtime!==null&&Number.isFinite(r.sumtime)&&r.sumtime>=0)))?(()=>{
      const validSeconds=rows.reduce((n,r)=>n+(r.sumtime??0),0);
      const expectedSeconds=end-start;
      return validSeconds<=expectedSeconds*1.01&&expectedSeconds>0?
       {validSeconds,expectedSeconds,fraction:Math.min(1,validSeconds/expectedSeconds),
        basis:'weewx_daily_sumtime_seconds',scope:'metric_only'}:null;
     })():null,
    extremaObservedAt:result.extremaObservedAt===null?null:utcIso(result.extremaObservedAt),
    extremaSource:aggregation==='dir_at_max'?(result.value===null?'unknown':'archive'):
     extremaApplies?'unknown':'not_applicable'};
   const body=period==='year'?{...common,year:Number(label),range:{from:utcIso(start),to:utcIso(end),
    boundary:'[start,end)',calendarTimezone:'Europe/Prague'}}:{...common,period,localPeriod:label,
    intervalStart:utcIso(start),intervalEnd:utcIso(end)};
   return conditional(req,reply,body);
  }catch{return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Unsupported daily summary values',503);}
 };
 for(const [period,path,param] of [['day','/api/v1/statistics/daily','date'],
  ['month','/api/v1/statistics/monthly','month'],['year','/api/v1/statistics/yearly','year']] as const){
  app.get<{Querystring:StatisticsQuery}>(path,{schema:{querystring:{...commonQuery,
   required:['metric','aggregation',param],properties:{...commonQuery.properties,
    metric:{type:'string'},aggregation:{type:'string'},[param]:{type:'string'}}}}},statisticsRoute(period));
 }
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
 registerHistoryRoute(app,reader,liveHub);
 registerExtras(app,reader,sourceFiles);
 registerDevRhPreview(app,reader,devRhPreview);
 return app;
}
