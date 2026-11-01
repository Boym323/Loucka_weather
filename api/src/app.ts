import Fastify from 'fastify';
import {createHash} from 'node:crypto';
import type {ArchiveReader,ArchiveRow,DailySummaryRow} from './store.js';
import {isMetric,metrics} from './metrics.js';
import {aggregationPolicy} from './aggregation.js';
import type {Aggregation} from './aggregation.js';
import {LiveHub,serializeSse} from './live.js';
import {readingsFromRow,converted,outputUnit} from './units.js';
import type {Metric} from './metrics.js';
import type {OutputUnits} from './units.js';

type Dataset='original'|'approved';
type CurrentQuery={asOf?:string;units?:OutputUnits;dataset?:Dataset};
type HistoryQuery={metric?:string;from?:string;to?:string;resolution?:'auto'|'raw'|'hourly'|'daily';
  limit?:string;units?:OutputUnits;dataset?:Dataset};
type StatisticsQuery={metric?:string;aggregation?:string;date?:string;month?:string;year?:string;
  units?:OutputUnits;dataset?:Dataset};
type LiveQuery={units?:OutputUnits};
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
 // Date.parse accepts and normalizes impossible dates (for example February 30).
 // Validate the calendar components before converting the RFC3339 instant.
 const parts=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(raw);
 if(!parts)return null;
 const [,year,month,day,hour,minute,second,,sign,offsetHour,offsetMinute]=parts;
 const y=Number(year),m=Number(month),d=Number(day),h=Number(hour),mi=Number(minute),s=Number(second);
 const maxDay=new Date(Date.UTC(y,m,0)).getUTCDate();
 if(m<1||m>12||d<1||d>maxDay||h>23||mi>59||s>59)return null;
 if(sign&&(Number(offsetHour)>23||Number(offsetMinute)>59))return null;
 const millis=Date.parse(raw);
 return Number.isFinite(millis)&&millis>=0?Math.floor(millis/1000):null;
}
function responseEtag(body:unknown):string {
 return '"'+createHash('sha256').update(JSON.stringify(body)).digest('hex')+'"';
}
const pragueDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function localMidnight(date:string):number|null{
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
 if(!match)return null;
 const y=Number(match[1]),m=Number(match[2]),d=Number(match[3]);
 if(y<2009||y>2101||m<1||m>12||d<1||d>new Date(Date.UTC(y,m,0)).getUTCDate())return null;
 const desired=Date.UTC(y,m-1,d);
 let guess=desired;
 for(let i=0;i<3;i++){
  const parts=Object.fromEntries(pragueDate.formatToParts(new Date(guess)).map(p=>[p.type,p.value]));
  const localAsUtc=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));
  guess+=desired-localAsUtc;
 }
 return Math.floor(guess/1000);
}
function statsAggregationAllowed(metric:Metric,aggregation:string):boolean{
 const policy=aggregationPolicy[metric] as {allowed:readonly string[];statsEnabled:boolean};
 return policy.statsEnabled&&policy.allowed.includes(aggregation);
}
function historyPolicy(metric:Metric):{aggregation:Aggregation;enabled:boolean}{
 const policy=aggregationPolicy[metric] as {default:Aggregation;statsEnabled:boolean};
 return {aggregation:policy.default,enabled:policy.statsEnabled};
}
function localDateAt(epochSeconds:number):string{
 const parts=Object.fromEntries(pragueDate.formatToParts(new Date(epochSeconds*1000)).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
function nextLocalDate(date:string):string{
 const [year=0,month=1,day=1]=date.split('-').map(Number);
 return new Date(Date.UTC(year,month-1,day+1)).toISOString().slice(0,10);
}
function utcHourStart(endEpoch:number):number{return Math.floor((endEpoch-1)/3600)*3600;}
function hourlyBucketCount(from:number,to:number):number{
 return Math.floor((to-1)/3600)-Math.floor(from/3600)+1;
}
function dailyBucketCount(from:number,to:number):number{
 const first=localDateAt(from),last=localDateAt(to-1);
 return Math.floor((Date.parse(`${last}T00:00:00Z`)-Date.parse(`${first}T00:00:00Z`))/86400000)+1;
}
function localDayAligned(from:number,to:number):boolean{
 return localMidnight(localDateAt(from))===from&&localMidnight(localDateAt(to))===to;
}
function pointQuality(value:number|null):'measured'|'derived'|'missing'{
 return value===null?'missing':'derived';
}
function rowIsValid(row:ArchiveRow,previousEnd:number|null):number{
 if(!Number.isSafeInteger(row.dateTime)||row.dateTime<0||!Number.isSafeInteger(row.interval)||row.interval<1||row.interval>1440||
   (row.usUnits!==1&&row.usUnits!==16&&row.usUnits!==17))throw new Error('Invalid archive record metadata');
 const rowStart=row.dateTime-row.interval*60;
 if(previousEnd!==null&&rowStart<previousEnd)throw new Error('Overlapping archive intervals');
 return rowStart;
}
function rawHistoryPoints(metric:Metric,rows:ArchiveRow[],from:number,to:number,units:OutputUnits){
 const points:any[]=[];let previous=from,valid=0,lastEnd:number|null=null;
 for(const row of rows){
  if(row.dateTime<=previous||row.dateTime>to)throw new Error('Archive records are out of order');
  const rowStart=rowIsValid(row,lastEnd);
  if(rowStart>previous)points.push({startTime:utcIso(previous),endTime:utcIso(rowStart),value:null,
   quality:'missing',source:'derived',provenance:null,sourceUsUnits:null});
  const reading=converted(metric,row[metric],row.usUnits,units);
  points.push({startTime:utcIso(Math.max(rowStart,from)),endTime:utcIso(row.dateTime),value:reading.value,
   quality:reading.quality,...source,sourceUsUnits:reading.sourceUsUnits});
  if(reading.value!==null)valid++;
  previous=row.dateTime;lastEnd=row.dateTime;
 }
 if(rows.length&&previous<to)points.push({startTime:utcIso(previous),endTime:utcIso(to),value:null,
  quality:'missing',source:'derived',provenance:null,sourceUsUnits:null});
 return {points,valid};
}
type HourBucket={count:number;sum:number;weightedSum:number;weight:number;min:number|null;minAt:number|null;
 max:number|null;maxAt:number|null;xsum:number;ysum:number;peakGust:number|null;peakDirection:number|null;peakAt:number|null};
function newHourBucket():HourBucket{return {count:0,sum:0,weightedSum:0,weight:0,min:null,minAt:null,max:null,maxAt:null,
 xsum:0,ysum:0,peakGust:null,peakDirection:null,peakAt:null};}
function addHourlyRow(buckets:Map<number,HourBucket>,metric:Metric,aggregation:Aggregation,row:ArchiveRow,
 units:OutputUnits,from:number,to:number){
 const seconds=row.interval*60;
 const rowStart=row.dateTime-seconds;
 const weightedStart=Math.max(rowStart,from),weightedEnd=Math.min(row.dateTime,to);
 const bucketAt=(start:number)=>{
  const bucket=buckets.get(start)??newHourBucket();
  buckets.set(start,bucket);
  return bucket;
 };
 if(aggregation==='vecdir'){
  const speed=converted('windSpeed',row.windSpeed,row.usUnits,units).value;
  const direction=converted('windDir',row.windDir,row.usUnits,units).value;
  if(speed!==null&&direction!==null){
   const radians=direction*Math.PI/180;
   for(let bucketStart=Math.floor(weightedStart/3600)*3600;bucketStart<weightedEnd;bucketStart+=3600){
    const overlap=Math.min(weightedEnd,bucketStart+3600)-Math.max(weightedStart,bucketStart);
    if(overlap<=0)continue;
    const bucket=bucketAt(bucketStart);
    bucket.xsum+=speed*Math.sin(radians)*overlap;
    bucket.ysum+=speed*Math.cos(radians)*overlap;bucket.count++;
   }
  }
 }else if(aggregation==='dir_at_max'){
  const bucket=bucketAt(utcHourStart(row.dateTime));
  const gust=converted('windGust',row.windGust,row.usUnits,units).value;
  const direction=converted('windGustDir',row.windGustDir,row.usUnits,units).value;
  if(gust!==null){
   if(bucket.peakGust===null||gust>bucket.peakGust){bucket.peakGust=gust;bucket.peakDirection=direction;bucket.peakAt=row.dateTime;}
   if(direction!==null)bucket.count++;
  }
 }else{
  const bucket=bucketAt(utcHourStart(row.dateTime));
  const reading=converted(metric,row[metric],row.usUnits,units).value;
  if(reading!==null){
   if(aggregation==='mean'){
    for(let bucketStart=Math.floor(weightedStart/3600)*3600;bucketStart<weightedEnd;bucketStart+=3600){
     const overlap=Math.min(weightedEnd,bucketStart+3600)-Math.max(weightedStart,bucketStart);
     if(overlap<=0)continue;
     const weightedBucket=bucketAt(bucketStart);
     weightedBucket.count++;weightedBucket.weightedSum+=reading*overlap;weightedBucket.weight+=overlap;
    }
   }else bucket.count++;
   if(aggregation==='sum')bucket.sum+=reading;
   if(bucket.min===null||reading<bucket.min){bucket.min=reading;bucket.minAt=row.dateTime;}
   if(bucket.max===null||reading>bucket.max){bucket.max=reading;bucket.maxAt=row.dateTime;}
  }
 }
}
function hourlyHistoryPoints(metric:Metric,aggregation:Aggregation,rows:Map<number,HourBucket>,from:number,to:number,units:OutputUnits){
 const first=Math.floor(from/3600)*3600,last=utcHourStart(to),points:any[]=[];let valid=0;
 const angular=metric==='windDir'||metric==='windGustDir';
 for(let bucket=first;bucket<=last;bucket+=3600){
  const data=rows.get(bucket);
  let value:number|null=null;
  if(data){
   if(aggregation==='count')value=data.count;
   else if(aggregation==='mean')value=data.weight>0?data.weightedSum/data.weight:null;
   else if(aggregation==='sum')value=data.count?data.sum:null;
   else if(aggregation==='min')value=data.min;
   else if(aggregation==='max')value=data.max;
   else if(aggregation==='vecdir')value=Math.hypot(data.xsum,data.ysum)>1e-9?
    (Math.atan2(data.xsum,data.ysum)*180/Math.PI+360)%360:null;
   else if(aggregation==='dir_at_max')value=data.peakGust===null?null:data.peakDirection;
  }
  const minValue=angular?null:data?.min??null,maxValue=angular?null:data?.max??null;
  if(data)valid+=aggregation==='dir_at_max'&&value===null?0:data.count;
  const maxObservedAt=aggregation==='dir_at_max'?data?.peakAt:data?.maxAt;
  points.push({startTime:utcIso(Math.max(bucket,from)),endTime:utcIso(Math.min(bucket+3600,to)),value,
   quality:pointQuality(value),source:data?'weewx_archive':'derived',
   provenance:value===null?null:`weewx-archive-${aggregation}`,sourceUsUnits:null,
   minValue,maxValue,minObservedAt:data?.minAt===null||data?.minAt===undefined?null:utcIso(data.minAt),
   maxObservedAt:maxObservedAt===null||maxObservedAt===undefined?null:utcIso(maxObservedAt),validCount:data?.count??0});
 }
 return {points,valid};
}
function dailyHistoryPoints(metric:Metric,aggregation:Aggregation,rows:DailySummaryRow[],fromDate:string,toDate:string,units:OutputUnits){
 const byDate=new Map<string,DailySummaryRow>();
 let previousDateTime=-1;
 for(const row of rows){
  const date=localDateAt(row.dateTime);
  if(date<fromDate||date>=toDate||localMidnight(date)!==row.dateTime||row.dateTime<=previousDateTime||byDate.has(date))
   throw new Error('Invalid daily summary boundaries or ordering');
  previousDateTime=row.dateTime;byDate.set(date,row);
 }
 const points:any[]=[];let valid=0;
 for(let date=fromDate;date<toDate;date=nextLocalDate(date)){
  const start=localMidnight(date),end=localMidnight(nextLocalDate(date));
  if(start===null||end===null)throw new Error('Invalid local daily boundary');
  const row=byDate.get(date);
  if(!row){points.push({startTime:utcIso(start),endTime:utcIso(end),value:null,quality:'missing',
    source:'derived',provenance:null,sourceUsUnits:null,minValue:null,maxValue:null,
    minObservedAt:null,maxObservedAt:null,validCount:0});continue;}
  const aggregate=aggregateSummaryRows(metric,aggregation,[row],units);
  const angular=metric==='windDir'||metric==='windGustDir';
  const minValue=!angular&&row.min!==null&&row.min!==undefined?converted(metric,row.min,row.usUnits,units).value:null;
  const maxValue=!angular&&row.max!==null&&row.max!==undefined?converted(metric,row.max,row.usUnits,units).value:null;
  points.push({startTime:utcIso(start),endTime:utcIso(end),value:aggregate.value,
   quality:pointQuality(aggregate.value),source:'weewx_daily',
   provenance:aggregate.value===null?null:`weewx-daily-${aggregation}`,sourceUsUnits:row.usUnits,
   minValue,maxValue,minObservedAt:row.min===null||row.min===undefined||row.mintime===null||row.mintime===undefined?null:utcIso(row.mintime),
   maxObservedAt:row.max===null||row.max===undefined||row.maxtime===null||row.maxtime===undefined?null:utcIso(row.maxtime),validCount:aggregate.valid});
  valid+=aggregate.valid;
 }
 return {points,valid};
}
function aggregateSummaryRows(metric:Metric,aggregation:string,rows:DailySummaryRow[],units:OutputUnits){
 for(const row of rows){
  if(!Number.isSafeInteger(row.dateTime)||row.dateTime<0||(row.usUnits!==1&&row.usUnits!==16&&row.usUnits!==17))
   throw new Error('Invalid daily summary metadata');
  for(const value of [row.min,row.mintime,row.max,row.maxtime,row.sum,row.count,row.wsum,row.sumtime,
   row.xsum,row.ysum,row.dirsumtime,row.max_dir])if(value!==undefined&&value!==null&&!Number.isFinite(value))
    throw new Error('Invalid daily summary value');
  if(row.sumtime!==null&&row.sumtime!==undefined&&row.sumtime<0||
     row.dirsumtime!==null&&row.dirsumtime!==undefined&&row.dirsumtime<0)
   throw new Error('Invalid daily summary duration');
  const minMissing=row.min===null||row.min===undefined,minTimeMissing=row.mintime===null||row.mintime===undefined;
  const maxMissing=row.max===null||row.max===undefined,maxTimeMissing=row.maxtime===null||row.maxtime===undefined;
  if(minMissing!==minTimeMissing||maxMissing!==maxTimeMissing)
   throw new Error('Incomplete daily summary extrema');
  if(row.mintime!==null&&row.mintime!==undefined&&(!Number.isSafeInteger(row.mintime)||row.mintime<0)||
     row.maxtime!==null&&row.maxtime!==undefined&&(!Number.isSafeInteger(row.maxtime)||row.maxtime<0))
   throw new Error('Invalid daily summary extrema time');
  if(row.count===null||row.count===undefined||!Number.isInteger(row.count)||row.count<0)
   throw new Error('Invalid daily summary count');
  if(row.count>0&&aggregation==='mean'&&(row.wsum===null||row.wsum===undefined||
      row.sumtime===null||row.sumtime===undefined||row.sumtime<=0))
   throw new Error('Incomplete weighted daily summary');
  if(row.count>0&&aggregation==='sum'&&(row.sum===null||row.sum===undefined))
   throw new Error('Incomplete additive daily summary');
  if(row.count>0&&(aggregation==='min'||aggregation==='max')&&row[aggregation]===null)
   throw new Error('Incomplete extrema daily summary');
  if(row.count>0&&aggregation==='dir_at_max'&&row.max===null)
   throw new Error('Incomplete gust daily summary');
  if(aggregation==='vecdir'&&((row.xsum===null)!==(row.ysum===null)))
   throw new Error('Incomplete wind vector daily summary');
 }
 let valid=aggregation==='dir_at_max'?
  rows.filter(row=>row.max!==null&&row.max_dir!==null).length:
  rows.reduce((total,row)=>total+Number(row.count||0),0);
 let raw:number|null=null,extremaObservedAt:number|null=null;
 if(aggregation==='count')raw=valid;
 else if(aggregation==='mean'){
  const weight=rows.reduce((total,row)=>total+Number(row.sumtime||0),0);
  raw=weight>0?rows.reduce((total,row)=>total+Number(row.wsum||0),0)/weight:null;
 }else if(aggregation==='sum')raw=rows.length?rows.reduce((total,row)=>total+Number(row.sum||0),0):null;
 else if(aggregation==='vecdir'){
  const x=rows.reduce((total,row)=>total+(row.xsum===null||row.xsum===undefined?0:row.xsum),0);
  const y=rows.reduce((total,row)=>total+(row.ysum===null||row.ysum===undefined?0:row.ysum),0);
  raw=Math.hypot(x,y)>1e-9?(Math.atan2(x,y)*180/Math.PI+360)%360:null;
 }else if(aggregation==='dir_at_max'){
  const peak=rows.filter(row=>row.max!==null)
   .reduce<DailySummaryRow|null>((best,row)=>best===null||Number(row.max)>Number(best.max)?row:best,null);
  raw=peak?.max_dir??null;extremaObservedAt=peak?.maxtime??null;
  if(raw===null)valid=0;
 }else if(aggregation==='min'||aggregation==='max'){
  const selected=rows.filter(row=>row[aggregation]!==null&&row[aggregation]!==undefined).reduce<DailySummaryRow|null>((best,row)=>
   best===null||(aggregation==='min'?Number(row.min)<Number(best.min):Number(row.max)>Number(best.max))?row:best,null);
  raw=selected?Number(selected[aggregation]):null;
  extremaObservedAt=selected?(aggregation==='min'?selected.mintime:selected.maxtime)??null:null;
 }
 if(valid===0&&aggregation!=='count')raw=null;
 const unit=aggregation==='count'?'count':aggregation==='vecdir'||aggregation==='dir_at_max'?'degree':outputUnit(metric,units);
 const sourceUnits=rows[0]?.usUnits;
 const value=raw===null?null:aggregation==='count'||aggregation==='vecdir'||aggregation==='dir_at_max'
  ?raw:sourceUnits===undefined?null:converted(metric,raw,sourceUnits,units).value;
 return {value,unit,valid,extremaObservedAt};
}
export function buildApp(reader:ArchiveReader,now:()=>Date=()=>new Date(),liveHub?:LiveHub){
 const app=Fastify({logger:false,ajv:{customOptions:{removeAdditional:false,coerceTypes:false}}});
 const metadataCheckedAt=now().toISOString();
 const errorBody=(code:string,message:string,requestId:string)=>({
  schemaVersion:'1',error:{code,message,requestId}
 });
 const bad=(reply:any,reqId:string,code:string,message:string,status=400)=>
  reply.code(status).send(errorBody(code,message,reqId));
 const conditional=(req:any,reply:any,body:unknown)=>{
  const etag=responseEtag(body);
  reply.header('ETag',etag).header('Cache-Control','no-cache');
  const supplied=req.headers['if-none-match'];
  const candidates=typeof supplied==='string'?supplied.split(',').map((tag:string)=>tag.trim()):[];
  const matches=candidates.includes('*')||candidates.includes(etag)||candidates.includes(`W/${etag}`);
  return matches?reply.code(304).send():body;
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
   components:{api:'ok',archive:'ok',live:liveHub?'degraded':'disabled',camera:'disabled'}};
 });
 app.get('/api/v1/station',async(req,reply)=>conditional(req,reply,{
  schemaVersion:'1',stationId:'loucka',name:'Počasí Loučka',timezone:'Europe/Prague',
  location:{latitude:null,longitude:null,altitudeMeters:null,verified:false},
  archivalSource:'weewx',supportedOutputUnits:['us','metric','metricwx'],
  dataRevision:liveHub?.dataRevision??'original-unverified',updatedAt:metadataCheckedAt,
  capabilities:['current','history','sensors',...(reader.dailySummaries?
   ['daily_statistics','monthly_statistics','yearly_statistics']:[]),...(liveHub?['live_sse']:[])],
  availableDatasets:['original']
 }));
 app.get('/api/v1/sensors',async(req,reply)=>conditional(req,reply,{
  schemaVersion:'1',stationId:'loucka',updatedAt:metadataCheckedAt,
  sensors:[] // Verified physical mapping and installation epochs are not supplied.
 }));
 app.get('/api/v1/camera/status',async(req,reply)=>conditional(req,reply,{
  schemaVersion:'1',cameraId:'west',status:'disabled',
  capturedAt:null,publishedAt:null,latestUrl:null,ageSeconds:null,
  width:null,height:null,privacyMaskApplied:null,
  updatedAt:metadataCheckedAt
 }));
 const statisticsRoute=(period:'day'|'month'|'year')=>async(req:any,reply:any)=>{
  const {metric,aggregation,units='metricwx',dataset='original'}=req.query as StatisticsQuery;
  const label=period==='day'?(req.query as StatisticsQuery).date!:period==='month'?
   (req.query as StatisticsQuery).month!:(req.query as StatisticsQuery).year!;
  if(dataset==='approved')return bad(reply,req.id,'DATASET_UNAVAILABLE','No approved dataset published',503);
  if(!metric||!isMetric(metric))return bad(reply,req.id,'UNKNOWN_METRIC','Unsupported public metric');
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
    dataRevision:`daily-${fingerprint}`,completeness:{expected:null,valid:result.valid,fraction:null},
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
  const close=()=>{if(closed)return;closed=true;if(heartbeat)clearInterval(heartbeat);unsubscribe();if(!raw.destroyed)raw.end();};
  const write=(event:Parameters<typeof serializeSse>[0])=>{
   if(closed)return;
   try{if(!raw.write(serializeSse(event)))close();}catch{close();}
  };
  unsubscribe=liveHub.subscribe(write);
  const snapshot=(eventType:'snapshot'|'reset')=>{
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
  heartbeat=setInterval(()=>{if(!closed&&!raw.write(`: heartbeat ${now().toISOString()}\n\n`))close();},15000);
  heartbeat.unref();
  raw.on('close',close);
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
    readings,units,dataset,dataRevision:`archive-${revisionAtStart??'unobserved'}-${fingerprint}`});
  }catch{return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Unsupported archived observation',503);}
 });
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
  const start=from?epoch(from):null,end=to?epoch(to):null;
  if(start===null||end===null||end<=start)return bad(reply,req.id,'INVALID_RANGE','Invalid UTC time range',422);
  const policy=historyPolicy(metric);
  const overRawRange=end-start>31*86400;
  const overHourlyRange=end-start>2*366*86400;
  const rawCandidate=resolution==='raw'||resolution==='auto'&&!overRawRange;
  const revisionAtStart=liveHub?.dataRevision;
  const makeResponse=(selectedResolution:'raw'|'hourly'|'daily',aggregation:string,points:any[],valid:number,fingerprint:string)=>{
   if(points.length>limit)return bad(reply,req.id,'LIMIT_EXCEEDED','Too many points for requested limit',422);
   if(liveHub&&revisionAtStart!==liveHub.dataRevision)
    return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Archive changed during history request; retry',503);
   const unit=aggregation==='count'?'count':aggregation==='vecdir'||aggregation==='dir_at_max'?'degree':outputUnit(metric,units);
   return conditional(req,reply,{schemaVersion:'1',metric,unit,
    range:{from:utcIso(start),to:utcIso(end),boundary:'(start,end]',calendarTimezone:'Europe/Prague'},
    resolution:selectedResolution,points,count:points.length,
    completeness:{expected:null,valid,fraction:null},units,dataset,
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
    }catch{return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Unsupported archived observation',503);}
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
   let cursor=start,previousEnd:number|null=null,scanned=0;
   try{
    for(let page=0;page<300;page++){
     const rows=reader.historyPage?await reader.historyPage(selectedMetrics,start,end,cursor,5000):
      await reader.history(metric,start,end,500001);
     for(const row of rows){
      if(row.dateTime<=cursor||row.dateTime>end)throw new Error('Invalid archive page ordering');
      rowIsValid(row,previousEnd);
      digest.update(JSON.stringify(row)).update('\n');
      addHourlyRow(buckets,metric,aggregation,row,units,start,end);
      cursor=row.dateTime;previousEnd=row.dateTime;scanned++;
      if(scanned>500000)throw new Error('Hourly input row limit exceeded');
     }
     if(!reader.historyPage||rows.length<5000)break;
     if(page===299)throw new Error('Hourly input paging limit exceeded');
    }
    const result=hourlyHistoryPoints(metric,aggregation,buckets,start,end,units);
    return makeResponse('hourly',aggregation,result.points,result.valid,digest.digest('hex').slice(0,20));
   }catch(error){
    const message=error instanceof Error?error.message:'';
    if(message.includes('limit exceeded'))return bad(reply,req.id,'LIMIT_EXCEEDED','Hourly archive scan exceeds its safety limit',422);
    return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Hourly archive unavailable or invalid',503);
   }
  }
  if(selectedResolution!=='daily')return bad(reply,req.id,'BAD_REQUEST','Unknown history resolution');
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
 return app;
}
