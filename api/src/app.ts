import Fastify from 'fastify';
import { createHash } from 'node:crypto';
import type { ArchiveReader } from './store.js';
import { readingsFromRow } from './units.js';
import type { OutputUnits } from './units.js';

type CurrentQuery={asOf?:string; units?:OutputUnits; dataset?:'original'|'approved'};
const datePattern=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
export function buildApp(reader:ArchiveReader, now:()=>Date=()=>new Date()){
  const app=Fastify({logger:false});
  const errorBody=(code:string,message:string,requestId:string)=>({
    schemaVersion:'1',error:{code,message,requestId}
  });
  app.setErrorHandler((err,req,reply)=>{
    const invalid=Boolean((err as {validation?:unknown}).validation);
    void reply.code(invalid?400:500).send(errorBody(invalid?'BAD_REQUEST':'INTERNAL_ERROR',
      invalid?'Invalid API query':'Internal API failure',req.id));
  });
  app.setNotFoundHandler((req,reply)=>{
    void reply.code(404).send(errorBody('NOT_FOUND','Unknown endpoint',req.id));
  });
  app.get('/api/v1/healthz',async()=>({schemaVersion:'1',status:'ok',checkedAt:now().toISOString()}));
  app.get('/api/v1/readyz',async(req,reply)=>{
    try{await reader.ping();}
    catch{return reply.code(503).send(errorBody('UPSTREAM_UNAVAILABLE','Archive unavailable',req.id));}
    return {schemaVersion:'1',checkedAt:now().toISOString(),ready:true,
      components:{api:'ok',archive:'ok',live:'disabled',camera:'disabled'}};
  });
  app.get('/api/v1/station',async()=>({
    schemaVersion:'1',stationId:'loucka',name:'Počasí Loučka',timezone:'Europe/Prague',
    location:{latitude:null,longitude:null,altitudeMeters:null,verified:false},
    archivalSource:'weewx',supportedOutputUnits:['us','metric','metricwx'],
    dataRevision:'original-unverified',updatedAt:now().toISOString(),
    capabilities:['current'],availableDatasets:['original']
  }));
  app.get<{Querystring:CurrentQuery}>('/api/v1/current',{
    schema:{querystring:{
      type:'object',additionalProperties:false,
      properties:{asOf:{type:'string'},units:{type:'string',enum:['us','metric','metricwx']},
        dataset:{type:'string',enum:['original','approved']}}
    }}
  },async(req,reply)=>{
    const {asOf,units='metricwx',dataset='original'}=req.query;
    if(dataset==='approved')return reply.code(503).send(errorBody('DATASET_UNAVAILABLE',
      'No approved dataset published',req.id));
    if(asOf!==undefined&&(!datePattern.test(asOf)||!Number.isFinite(Date.parse(asOf))))
      return reply.code(400).send(errorBody('BAD_REQUEST','asOf must be RFC3339 with timezone',req.id));
    const epoch=asOf!==undefined?Math.floor(Date.parse(asOf)/1000):Math.floor(now().getTime()/1000);
    if(epoch<0)return reply.code(400).send(errorBody('INVALID_RANGE','Negative timestamp',req.id));
    let row;
    try{row=await reader.latest(epoch);}
    catch{return reply.code(503).send(errorBody('UPSTREAM_UNAVAILABLE','Archive unavailable',req.id));}
    if(!row)return reply.code(404).send(errorBody('NOT_FOUND','No archived observation',req.id));
    try{
      const readings=readingsFromRow(row,units);
      const fingerprint=createHash('sha256').update(JSON.stringify(row)).digest('hex').slice(0,16);
      return {schemaVersion:'1',observedAt:new Date(row.dateTime*1000).toISOString(),
        stale:now().getTime()/1000-row.dateTime>900,archiveIntervalMinutes:row.interval,
        readings,units,dataset,dataRevision:`archive-${row.dateTime}-${fingerprint}`};
    }catch{
      return reply.code(503).send(errorBody('UPSTREAM_UNAVAILABLE','Unsupported archived observation',req.id));
    }
  });
  return app;
}
