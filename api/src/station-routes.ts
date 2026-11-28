import type {FastifyInstance} from 'fastify';
import type {ArchiveReader} from './store.js';
import type {LiveHub} from './live.js';
import {archiveCameraStatus} from './extras.js';
import type {ExtraSourceFiles} from './extras.js';
import {utcIso} from './calendar-time.js';
import {gatewayReadings} from './gateway.js';
import {readFile} from 'node:fs/promises';
import {sensorChannels} from './sensor-evidence.js';
import {bad,conditional} from './http-contract.js';

/** Station metadata, readiness and independent source monitoring.
 * Sensor cache belongs to this app registration. Metadata time is passed
 * from the composition root to retain the original clock semantics.
 */
export function registerStationRoutes(app:FastifyInstance,reader:ArchiveReader,now:()=>Date,
 liveHub:LiveHub|undefined,sourceFiles:ExtraSourceFiles,metadataCheckedAt:string){
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
}
