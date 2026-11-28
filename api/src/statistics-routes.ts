import {createHash} from 'node:crypto';
import type {FastifyInstance,FastifyRequest,FastifyReply} from 'fastify';
import type {ArchiveReader,DailySummaryRow} from './store.js';
import {isMetric} from './metrics.js';
import type {Metric} from './metrics.js';
import {aggregationPolicy} from './aggregation.js';
import type {OutputUnits} from './units.js';
import {aggregateSummaryRows} from './daily-statistics.js';
import {utcIso,localMidnight,localDateAt} from './calendar-time.js';
import {hasUnverifiedLightningMapping} from './lightning-publication.js';
import {originalDailyAggregateHeld} from './sensor-publication-qc.js';
import {bad,conditional,commonQuery} from './http-contract.js';

type Dataset='original'|'approved';
type StatisticsQuery={metric?:string;aggregation?:string;date?:string;month?:string;year?:string;
  units?:OutputUnits;dataset?:Dataset};
function statsAggregationAllowed(metric:Metric,aggregation:string):boolean{
 const policy=aggregationPolicy[metric] as {allowed:readonly string[];statsEnabled:boolean};
 return policy.statsEnabled&&policy.allowed.includes(aggregation);
}

/** Register the existing day/month/year API without changing period or QC semantics. */
export function registerStatisticsRoutes(app:FastifyInstance,reader:ArchiveReader){
 const statisticsRoute=(period:'day'|'month'|'year')=>async(req:FastifyRequest<{Querystring:StatisticsQuery}>,reply:FastifyReply)=>{
  const {metric,aggregation,units='metricwx',dataset='original'}=req.query;
  const label=period==='day'?req.query.date!:period==='month'?
   req.query.month!:req.query.year!;
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
}
