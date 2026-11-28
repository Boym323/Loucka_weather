import {createHash} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import type {ArchiveReader,ArchiveRow} from './store.js';
import type {LiveHub} from './live.js';
import {isMetric} from './metrics.js';
import type {Metric} from './metrics.js';
import {outputUnit} from './units.js';
import type {OutputUnits} from './units.js';
import {HistoryValidationError,historyValidationMessage,rowIsValid,HistoryIntervalGroups,rawHistoryPoints,addHourlyRow,hourlyHistoryPoints} from './archive-history.js';
import type {HourBucket,ArchiveHistoryPoint} from './archive-history.js';
import {dailyHistoryPoints} from './daily-statistics.js';
import type {DailyHistoryPoint} from './daily-statistics.js';
import {epoch,utcIso,localMidnight,localDateAt,nextLocalDate,hourlyBucketCount,dailyBucketCount,localDayAligned} from './calendar-time.js';
import {hasUnverifiedLightningMapping} from './lightning-publication.js';
import {originalDailyAggregateHeld} from './sensor-publication-qc.js';
import {bad,conditional,commonQuery,historyPolicy} from './http-contract.js';

type Dataset='original'|'approved';
type HistoryQuery={metric?:string;from?:string;to?:string;resolution?:'auto'|'raw'|'hourly'|'daily';
  limit?:string;units?:OutputUnits;dataset?:Dataset};

/** Register the existing history HTTP endpoint on the same Fastify instance.
 * Keep the exact schema, limits, SQL calls, revision gate and error contract.
 */
export function registerHistoryRoute(app:FastifyInstance,reader:ArchiveReader,liveHub?:LiveHub){
 app.get<{Querystring:HistoryQuery}>('/api/v1/history',{
  schema:{querystring:{...commonQuery,required:['metric','from','to'],
   properties:{...commonQuery.properties,
    metric:{type:'string'},from:{type:'string'},to:{type:'string'},
    resolution:{type:'string',enum:['auto','raw','hourly','daily']},
     limit:{type:'string',pattern:'^[0-9]{1,5}$'}}}}
 },async(req,reply)=>{
  const {metric,from,to,resolution='auto',limit:limitText,units='metricwx',dataset='original'}=req.query;
  const limit=limitText===undefined?2000:Number(limitText);
  if(!Number.isSafeInteger(limit)||limit<1||limit>10000)
   return bad(reply,req.id,'BAD_REQUEST','limit must be an integer from 1 to 10000');
  if(dataset==='approved')return bad(reply,req.id,'DATASET_UNAVAILABLE','No approved dataset published',503);
  if(!metric||!isMetric(metric))return bad(reply,req.id,'UNKNOWN_METRIC','Unsupported public metric');
   if(hasUnverifiedLightningMapping(metric))return bad(reply,req.id,'UNVERIFIED_FIELD_MAPPING','Original lightning counter mapping is unverified',503);
  const start=from?epoch(from):null,end=to?epoch(to):null;
  if(start===null||end===null||end<=start)return bad(reply,req.id,'INVALID_RANGE','Invalid UTC time range',422);
  const policy=historyPolicy(metric);
  const overRawRange=end-start>31*86400;
  const overHourlyRange=end-start>2*366*86400;
  const rawCandidate=resolution==='raw'||resolution==='auto'&&!overRawRange;
  const revisionAtStart=liveHub?.dataRevision;
  const makeResponse=(selectedResolution:'raw'|'hourly'|'daily',aggregation:string,points:readonly (ArchiveHistoryPoint|DailyHistoryPoint)[],valid:number,fingerprint:string)=>{
   if(points.length>limit)return bad(reply,req.id,'LIMIT_EXCEEDED','Too many points for requested limit',422);
   if(liveHub&&revisionAtStart!==liveHub.dataRevision)
    return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Archive changed during history request; retry',503);
   const unit=aggregation==='count'?'count':aggregation==='vecdir'||aggregation==='dir_at_max'?'degree':outputUnit(metric,units);
   return conditional(req,reply,{schemaVersion:'1',metric,unit,
    range:{from:utcIso(start),to:utcIso(end),boundary:'(start,end]',calendarTimezone:'Europe/Prague'},
    resolution:selectedResolution,points,count:points.length,
    completeness:{expected:null,valid,fraction:null},units,dataset,
    qcStatus:'original_unverified',extremaVerified:false,
    dataRevision:`archive-${revisionAtStart??'unobserved'}-${fingerprint}`,aggregation,truncated:false,gapPolicy:'explicit-null'});
  };
  if(resolution==='raw'&&overRawRange)return bad(reply,req.id,'LIMIT_EXCEEDED','Raw history is limited to 31 days',422);
  if(rawCandidate){
   let rows:ArchiveRow[];
   try{rows=await reader.history(metric,start,end,Math.min(limit+1,10001));}
   catch{return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Archive unavailable',503);}
   if(rows.length<=limit){
    try{
     const result=rawHistoryPoints(metric,rows,start,end,units);
     if(resolution==='raw'||result.points.length<=limit){
      const digest=createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0,20);
      return makeResponse('raw','sample',result.points,result.valid,digest);
     }
    }catch(error){return bad(reply,req.id,'UPSTREAM_UNAVAILABLE',historyValidationMessage(error,'Unsupported archived observation'),503);}
   }else if(resolution==='raw')return bad(reply,req.id,'LIMIT_EXCEEDED','Too many archive points for requested limit',422);
  }
  const autoDailyAligned=localDayAligned(start,end);
  let selectedResolution:'raw'|'hourly'|'daily';
  if(resolution==='auto'){
   const hourlyFits=!overHourlyRange&&hourlyBucketCount(start,end)<=limit;
   const dailyFits=autoDailyAligned&&dailyBucketCount(start,end)<=limit;
   selectedResolution=hourlyFits?'hourly':'daily';
   if(!hourlyFits&&!dailyFits)
    return bad(reply,req.id,'LIMIT_EXCEEDED','No safe history resolution fits this limit and range',422);
  }else selectedResolution=resolution;
  if(!policy.enabled)return bad(reply,req.id,'INVALID_AGGREGATION','No verified aggregate policy for this metric',422);
  if(selectedResolution==='hourly'){
   if(overHourlyRange)return bad(reply,req.id,'LIMIT_EXCEEDED','Hourly history is limited to two years',422);
   const bucketCount=hourlyBucketCount(start,end);
   if(bucketCount>limit)return bad(reply,req.id,'LIMIT_EXCEEDED','Hourly bucket count exceeds limit',422);
   const aggregation=policy.aggregation;
   const selectedMetrics:Metric[]=metric==='windDir'?['windSpeed','windDir']:
    metric==='windGustDir'?['windGust','windGustDir']:[metric];
   const buckets=new Map<number,HourBucket>(),digest=createHash('sha256');
   let cursor=start,scanned=0;
   const conflicted=new Set<number>();
   const groups=new HistoryIntervalGroups(group=>{
    if(group.row!==null)return;
    // Withhold whole affected hourly buckets, including extrema/counts.
    // Never prorate rain or publish a partial sum as a complete hour.
    for(let hour=Math.floor(Math.max(group.start,start)/3600)*3600;hour<Math.min(group.end,end);hour+=3600)
     conflicted.add(hour);
   });
   try{
    for(let page=0;page<300;page++){
     const rows=reader.historyPage?await reader.historyPage(selectedMetrics,start,end,cursor,5000):
      await reader.history(metric,start,end,500001);
     for(const row of rows){
      if(row.dateTime<=cursor||row.dateTime>end)throw new HistoryValidationError('Invalid archive ordering');
      const rowStart=rowIsValid(row);
      groups.add(row,rowStart);
      digest.update(JSON.stringify(row)).update('\n');
      addHourlyRow(buckets,metric,aggregation,row,units,start,end);
      cursor=row.dateTime;scanned++;
      if(scanned>500000)throw new Error('Hourly input row limit exceeded');
     }
     if(!reader.historyPage||rows.length<5000)break;
     if(page===299)throw new Error('Hourly input paging limit exceeded');
    }
    groups.finish();
    const result=hourlyHistoryPoints(metric,aggregation,buckets,start,end,units,conflicted);
    return makeResponse('hourly',aggregation,result.points,result.valid,digest.digest('hex').slice(0,20));
   }catch(error){
    const message=error instanceof Error?error.message:'';
    if(message.includes('limit exceeded'))return bad(reply,req.id,'LIMIT_EXCEEDED','Hourly archive scan exceeds its safety limit',422);
    return bad(reply,req.id,'UPSTREAM_UNAVAILABLE',historyValidationMessage(error,'Hourly archive unavailable or invalid'),503);
   }
  }
  if(selectedResolution!=='daily')return bad(reply,req.id,'BAD_REQUEST','Unknown history resolution');
  if(originalDailyAggregateHeld(metric,start,end))return bad(reply,req.id,'HISTORICAL_QC_HOLD','Unverified original daily summaries could contain known sensor anomalies',503);
  if(resolution==='daily'&&!policy.enabled)return bad(reply,req.id,'INVALID_AGGREGATION','No verified aggregate policy for this metric',422);
  const fromDate=localDateAt(start),toDate=localDateAt(end);
  const dailyStart=localMidnight(fromDate),dailyEnd=localMidnight(toDate);
  if(dailyStart!==start||dailyEnd!==end||dailyStart===null||dailyEnd===null)
   return bad(reply,req.id,'INVALID_RANGE','Daily resolution requires Europe/Prague midnight boundaries',422);
  let dayCount=0;for(let date=fromDate;date<toDate;date=nextLocalDate(date))dayCount++;
  if(dayCount>limit)return bad(reply,req.id,'LIMIT_EXCEEDED','Daily bucket count exceeds limit',422);
  if(!reader.dailySummaries)return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Daily summaries are unavailable',503);
  try{
   const rows=await reader.dailySummaries(metric,start,end,dayCount+1);
   if(rows.length>dayCount)return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Daily summary range returned extra rows',503);
   const result=dailyHistoryPoints(metric,policy.aggregation,rows,fromDate,toDate,units);
   const digest=createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0,20);
   return makeResponse('daily',policy.aggregation,result.points,result.valid,digest);
  }catch{return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Daily summaries unavailable or invalid',503);}
 });
}
