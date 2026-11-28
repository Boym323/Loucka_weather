import {createHash} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import type {ArchiveReader,DailySummaryRow} from './store.js';
import {isMetric} from './metrics.js';
import {converted,outputUnit} from './units.js';
import type {OutputUnits} from './units.js';
import {aggregateSummaryRows} from './daily-statistics.js';
import {localMidnight,localDateAt} from './calendar-time.js';
import {hasUnverifiedLightningMapping} from './lightning-publication.js';
import {climateRecordsFromDaily} from './records.js';
import {DayScopedCache} from './records-cache.js';
import {consolidateAnnualSummaries} from './climate-consolidation.js';
import {buildTemperatureDays} from './temperature-years.js';
import {originalAnnualAggregateHeld} from './sensor-publication-qc.js';
import {bad,conditional,commonQuery,historyPolicy} from './http-contract.js';

type Dataset='original'|'approved';

/** Register climate endpoints on the existing Fastify instance.
 * Caches are scoped to each registration, not to the module or process.
 * Preserve existing bounds, fingerprints, query count and failure handling.
 */
export function registerClimateRoutes(app:FastifyInstance,reader:ArchiveReader,now:()=>Date){
 // All historical years in a single request; bounded, SELECT-only and cache-coalesced.
 // The source is ORIGINAL WeeWX daily summaries, never approved reconstruction.
 type TemperatureYearsQuery={units?:'metricwx';dataset?:Dataset};
 let temperatureYearsCache:
  {key:string;expires:number;load:Promise<unknown>}|undefined;
 app.get<{Querystring:TemperatureYearsQuery}>('/api/v1/climate/temperature-years',{
  schema:{querystring:{type:'object',additionalProperties:false,properties:{
   units:{type:'string',enum:['metricwx']},
   dataset:{type:'string',enum:['original','approved']}
  }}}
 },async(req,reply)=>{
  if(req.query.dataset==='approved')
   return bad(reply,req.id,'DATASET_UNAVAILABLE','Approved temperature reconstruction is not published',503);
  if(!reader.dailySummaries)
   return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Daily source is not available',503);
  const today=localDateAt(Math.floor(now().getTime()/1000));
  const from=localMidnight('2009-01-01'),until=localMidnight(today);
  if(from===null||until===null||until<=from)
   return bad(reply,req.id,'INVALID_RANGE','Daily boundaries unavailable',422);
  const days=Math.round((Date.parse(today+'T00:00:00Z')-
   Date.parse('2009-01-01T00:00:00Z'))/86400000);
  if(days<1||days>7500)
   return bad(reply,req.id,'LIMIT_EXCEEDED','Historical range exceeds bounded reader limit',422);
  const key=today,at=Date.now();
  let load=temperatureYearsCache?.key===key&&temperatureYearsCache.expires>at?
   temperatureYearsCache.load:null;
  if(!load){
   load=(async()=>{
    const rows=await reader.dailySummaries!('outTemp',from,until,days+1);
    if(rows.length>days)throw new Error('Truncated temperature daily source');
    const points=buildTemperatureDays({
     rows,from,until,today,localDateAt,localMidnight,
     convert:(value,usUnits)=>converted('outTemp',value,usUnits,'metricwx').value
    });
    return {schemaVersion:'1',metric:'outTemp',unit:'°C',dataset:'original',
     source:'weewx_daily',qcStatus:'original_unverified',
     firstYear:2009,endsBefore:today,
     dataRevision:'temp-years-'+createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0,20),
     points,
     description:'Daily time-weighted means from original WeeWX summaries. Missing dates are not zero-filled; reference stations are not substituted.'};
   })();
   temperatureYearsCache={key,expires:at+15*60_000,load};
  }
  try{return conditional(req,reply,await load,'public, max-age=300');}
  catch{
   if(temperatureYearsCache?.load===load)temperatureYearsCache=undefined;
   return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Temperature year-series could not be verified',503);
  }
 });

 // Single bounded scan, one selected metric, all calendar years; no database writes.
 type AnnualMatrixQuery={metric?:string;units?:OutputUnits;dataset?:Dataset};
 const annualCache=new Map<string,{expires:number;load:Promise<unknown>}>();
 app.get<{Querystring:AnnualMatrixQuery}>('/api/v1/climate/annual-matrix',{
  schema:{querystring:{...commonQuery,required:['metric'],
   properties:{...commonQuery.properties,metric:{type:'string'}}}}
 },async(req,reply)=>{
  const {metric,units='metricwx',dataset='original'}=req.query;
  if(dataset==='approved')return bad(reply,req.id,'DATASET_UNAVAILABLE','No approved dataset published',503);
  if(!metric||!isMetric(metric))return bad(reply,req.id,'UNKNOWN_METRIC','Unknown metric',400);
   if(hasUnverifiedLightningMapping(metric))return bad(reply,req.id,'UNVERIFIED_FIELD_MAPPING','Original lightning counter mapping is unverified',503);
  if(originalAnnualAggregateHeld(metric))return bad(reply,req.id,'HISTORICAL_QC_HOLD','Unverified original daily summaries could contain known sensor anomalies',503);
  const policy=historyPolicy(metric),aggregation=policy.aggregation;
  if(!policy.enabled||!['mean','sum','min','max'].includes(aggregation))
   return bad(reply,req.id,'INVALID_AGGREGATION','No safe annual aggregation',422);
  if(!reader.dailySummaries)
   return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Daily summaries unavailable',503);
  const today=localDateAt(Math.floor(now().getTime()/1000));
  const first=localMidnight('2009-01-01'),until=localMidnight(today);
  if(first===null||until===null||until<first)
   return bad(reply,req.id,'INVALID_RANGE','Invalid local calendar',422);
  const n=Math.round((Date.parse(today+'T00:00:00Z')-
   Date.parse('2009-01-01T00:00:00Z'))/86400000);
  if(n<0||n>7500)return bad(reply,req.id,'LIMIT_EXCEEDED','Range exceeds safe limit',422);
  const key=metric+'|'+units+'|'+today,at=Date.now(),existing=annualCache.get(key);
  let load=existing&&existing.expires>at?existing.load:null;
  if(!load){
   load=(async()=>{
    const rows=await reader.dailySummaries!(metric,first,until,n+1);
    if(rows.length>n)throw new Error('Truncated daily consolidation');
    const years=consolidateAnnualSummaries({rows,startYear:2009,currentDate:today,
     aggregation:aggregation as 'mean'|'sum'|'min'|'max',
     unit:outputUnit(metric,units),localDateAt,localMidnight,
     aggregate:(items)=>aggregateSummaryRows(metric,aggregation,items,units)});
    return {schemaVersion:'1',metric,aggregation,units,dataset:'original',
     source:'weewx_daily',qcStatus:'original_unverified',
     startsAt:'2009-01-01',endsBefore:today,
     dataRevision:'annual-'+createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0,20),
     years,
     disclaimer:'Original WeeWX daily summaries; reconstruction and reference data are not published as approved.'};
   })();
   annualCache.set(key,{expires:at+900000,load});
   if(annualCache.size>12){
    const oldest=annualCache.keys().next().value;
    if(oldest!==undefined)annualCache.delete(oldest);
   }
  }
  try{return conditional(req,reply,await load,'public, max-age=300');}
  catch{
   annualCache.delete(key);
   return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Cannot consolidate daily summaries',503);
  }
 });


 // One visitor-oriented climate response replaces 58+ small HTTP requests with
 // exactly three bounded SELECT-only day-summary reads. All aggregation is the
 // same server-side WeeWX routine used by /statistics/{monthly,yearly}.
 type ClimateDashboardQuery={year?:string;units?:OutputUnits;dataset?:Dataset};
 const dashboardCache=new Map<string,{expires:number;load:Promise<unknown>}>();
 app.get<{Querystring:ClimateDashboardQuery}>('/api/v1/climate/dashboard',{
  schema:{querystring:{...commonQuery,required:['year'],
   properties:{...commonQuery.properties,year:{type:'string'}}}}
 },async(req,reply)=>{
  const {year:label,units='metricwx',dataset='original'}=req.query;
  if(dataset==='approved')
   return bad(reply,req.id,'DATASET_UNAVAILABLE','No approved dataset published',503);
  const currentDate=localDateAt(Math.floor(now().getTime()/1000));
  const currentYear=Number(currentDate.slice(0,4));
  if(!label||!/^20[0-9]{2}$/.test(label)||Number(label)<2009||
   Number(label)>Math.min(2100,currentYear))
   return bad(reply,req.id,'INVALID_RANGE','Select a year from 2009 through the current Prague year',422);
  if(!reader.dailySummaries)
   return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Daily summaries unavailable',503);
  const selected=Number(label),completed=Math.min(selected,currentYear-1);
  const annualYears=Array.from({length:Math.min(6,Math.max(0,completed-2008))},(_,i)=>completed-i);
  const earliest=Math.min(selected,...annualYears);
  const last=Math.max(selected,...annualYears);
  const start=localMidnight(earliest+'-01-01'),end=localMidnight((last+1)+'-01-01');
  const days=Math.round((Date.parse((last+1)+'-01-01T00:00:00Z')-
   Date.parse(earliest+'-01-01T00:00:00Z'))/86400000);
  if(start===null||end===null||end<=start||days<1||days>2600)
   return bad(reply,req.id,'LIMIT_EXCEEDED','Requested annual span is not supported',422);
  const cacheKey=label+'|'+units+'|'+currentDate;
  const at=Date.now(),existing=dashboardCache.get(cacheKey);
  let load=existing&&existing.expires>at?existing.load:null;
  if(!load){
   load=(async()=>{
    const buildStarted=performance.now();
    const selectedMetrics=['outTemp','rain','windSpeed'] as const;
    const readMs:Partial<Record<(typeof selectedMetrics)[number],number>>={};
    const sourceRows=await Promise.all(selectedMetrics.map(async metric=>{
     const readStarted=performance.now();
     try{return await reader.dailySummaries!(metric,start,end,days+1);}
     finally{readMs[metric]=Math.round((performance.now()-readStarted)*100)/100;}
    }));
    const queryWallMs=performance.now()-buildStarted;
    // Single-pass calendar validation and indexing. The previous dashboard
    // repeatedly reformatted the same Prague date for every year/month.
    // Keep the read order and original rows for identical aggregates and ETag.
    const byYear={
     outTemp:new Map<string,DailySummaryRow[]>(),
     rain:new Map<string,DailySummaryRow[]>(),
     windSpeed:new Map<string,DailySummaryRow[]>()
    };
    const byMonth={
     outTemp:new Map<string,DailySummaryRow[]>(),
     rain:new Map<string,DailySummaryRow[]>(),
     windSpeed:new Map<string,DailySummaryRow[]>()
    };
    selectedMetrics.forEach((metric,i)=>{
     const rows=sourceRows[i]!;
     if(rows.length>days)throw new Error('Climate day summary exceeded cap');
     let previous=-1;
     for(const row of rows){
      const date=localDateAt(row.dateTime);
      if(row.dateTime<=previous||row.dateTime<start||row.dateTime>=end||
       localMidnight(date)!==row.dateTime)
       throw new Error('Unsorted or off-calendar climate daily summary');
      previous=row.dateTime;
      for(const [index,key] of [[byYear[metric],date.slice(0,4)],
       [byMonth[metric],date.slice(0,7)]] as const){
       const bucket=index.get(key);
       if(bucket)bucket.push(row);
       else index.set(key,[row]);
      }
     }
    });
    const measure=(metric:(typeof selectedMetrics)[number],aggregation:'mean'|'sum'|'min'|'max',
     rows:DailySummaryRow[]):number|null=>{
     try{
      const result=aggregateSummaryRows(metric,aggregation,rows,units);
      return result.valid>0&&result.value!==null&&Number.isFinite(result.value)?result.value:null;
     }catch{return null;} // One bad month does not invent a value for other months.
    };
    const groupedYear=(metric:(typeof selectedMetrics)[number],year:number)=>
     byYear[metric].get(String(year))??[];
    const selectedRows={
     outTemp:groupedYear('outTemp',selected),
     rain:groupedYear('rain',selected),
     windSpeed:groupedYear('windSpeed',selected)
    };
    const summary={
     temperature:measure('outTemp','mean',selectedRows.outTemp),
     rain:measure('rain','sum',selectedRows.rain),
     wind:measure('windSpeed','mean',selectedRows.windSpeed),
     maxTemp:measure('outTemp','max',selectedRows.outTemp)
    };
    const annual={temperature:[] as (number|null)[],rain:[] as (number|null)[],
     wind:[] as (number|null)[],temperatureCoverage:[] as (number|null)[]};
    for(const y of annualYears){
     const temp=groupedYear('outTemp',y);
     annual.temperature.push(measure('outTemp','mean',temp));
     annual.rain.push(measure('rain','sum',groupedYear('rain',y)));
     annual.wind.push(measure('windSpeed','mean',groupedYear('windSpeed',y)));
     const from=localMidnight(y+'-01-01'),to=localMidnight((y+1)+'-01-01');
     const expected=(to??0)-(from??0);
     const coverageKnown=temp.length>0&&temp.every(row=>row.count===0||
      (row.sumtime!==null&&row.sumtime!==undefined&&Number.isFinite(row.sumtime)&&row.sumtime>=0));
     const seconds=temp.reduce((n,row)=>n+Number(row.sumtime??0),0);
     annual.temperatureCoverage.push(annual.temperature.at(-1)!==null&&coverageKnown&&
      expected>0&&seconds<=expected*1.01?Math.min(1,seconds/expected):null);
    }
    const monthly={temperature:[] as (number|null)[],rain:[] as (number|null)[],
     wind:[] as (number|null)[],temperatureLow:[] as (number|null)[],
     temperatureHigh:[] as (number|null)[]};
    for(let month=1;month<=12;month++){
     const monthKey=label+'-'+String(month).padStart(2,'0');
     const matching=(metric:(typeof selectedMetrics)[number])=>
      byMonth[metric].get(monthKey)??[];
     const temp=matching('outTemp');
     monthly.temperature.push(measure('outTemp','mean',temp));
     monthly.temperatureLow.push(measure('outTemp','min',temp));
     monthly.temperatureHigh.push(measure('outTemp','max',temp));
     monthly.rain.push(measure('rain','sum',matching('rain')));
     monthly.wind.push(measure('windSpeed','mean',matching('windSpeed')));
    }
    const result={schemaVersion:'1',year:selected,units,dataset:'original',
     source:'weewx_daily',qcStatus:'original_unverified',
     annualYears,summary,annual,monthly,
     calendarTimezone:'Europe/Prague',dataRevision:'dashboard-'+
      createHash('sha256').update(JSON.stringify(sourceRows)).digest('hex').slice(0,20),
     disclaimer:'Preliminary original WeeWX summaries; missing data remain null and historical extremes are not QC-certified.'};
    // One bounded diagnostic event per cold cache refresh, only when explicitly
    // enabled. No HTTP addresses, user identifiers, archive values or secrets.
    if(process.env.WEATHER_API_PERF_LOG==='YES'){
     const memory=process.memoryUsage();
     const round=(n:number)=>Math.round(n*100)/100;
     const mib=(n:number)=>Math.round(n/1048576*10)/10;
     console.info(JSON.stringify({event:'climate_dashboard_refresh',year:selected,
      durationMs:round(performance.now()-buildStarted),
      queryWallMs:round(queryWallMs),
      processingMs:round(performance.now()-buildStarted-queryWallMs),
      queryMs:readMs,rows:Object.fromEntries(selectedMetrics.map((metric,i)=>
       [metric,sourceRows[i]!.length])),
      rssMiB:mib(memory.rss),heapUsedMiB:mib(memory.heapUsed)}));
    }
    return result;
   })();
   dashboardCache.set(cacheKey,{expires:at+300000,load});
   if(dashboardCache.size>10){
    const oldest=dashboardCache.keys().next().value;
    if(oldest!==undefined)dashboardCache.delete(oldest);
   }
  }
  try{return conditional(req,reply,await load,'public, max-age=120');}
  catch{
   dashboardCache.delete(cacheKey);
   return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Climate dashboard could not be verified',503);
  }
 });

 // Read-only provisional records for completed calendar days, never silently
 // promote original data to audited historical records.
 const recordsCache=new DayScopedCache<ReturnType<typeof climateRecordsFromDaily>>(20*60_000,60*60_000);
 app.get('/api/v1/climate/records',async(req,reply)=>{
  if(!reader.dailySummaries)return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Daily summary tables unavailable',503);
  const nowMs=now().getTime();
  // A result for yesterday must not be presented as today's calendar record.
  const from='2009-01-01',toExclusive=localDateAt(Math.floor(nowMs/1000));
  const start=localMidnight(from),end=localMidnight(toExclusive);
  if(start===null||end===null||end<=start)return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Calendar range unavailable',503);
  const calendarDays=Math.round((Date.parse(toExclusive+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000);
  if(calendarDays<1||calendarDays>7500)return bad(reply,req.id,'LIMIT_EXCEEDED','Historical period exceeds bounded reader range',422);
  try{
   const result=await recordsCache.get(toExclusive,nowMs,async()=>{
    const refreshStart=performance.now(),times:Record<'outTemp'|'rain'|'windGust',number>={
     outTemp:0,rain:0,windGust:0
    };
    const read=async(metric:'outTemp'|'rain'|'windGust')=>{
     const started=performance.now();
     try{return await reader.dailySummaries!(metric,start,end,calendarDays+1);}
     finally{times[metric]=Math.round((performance.now()-started)*100)/100;}
    };
    const rows=await Promise.all([read('outTemp'),read('rain'),read('windGust')]);
    const sqlWallMs=performance.now()-refreshStart;
    if(rows.some(a=>a.length>calendarDays))throw new Error('Day-summary result truncated');
    for(const items of rows){
     let previous=-1;
     for(const record of items){
      if(record.dateTime<=previous||record.dateTime<start||record.dateTime>=end||
       localMidnight(localDateAt(record.dateTime))!==record.dateTime)throw new Error('Invalid daily boundary');
      previous=record.dateTime;
     }
    }
    const computed=climateRecordsFromDaily({temperature:rows[0],rain:rows[1],
     gust:rows[2],from,toExclusive,calendarDays,todayMonthDay:toExclusive.slice(5)});
    if(process.env.WEATHER_API_PERF_LOG==='YES'){
     const memory=process.memoryUsage();
     const mib=(bytes:number)=>Math.round(bytes/1048576*10)/10;
     console.info(JSON.stringify({event:'climate_records_refresh',day:toExclusive,
      durationMs:Math.round((performance.now()-refreshStart)*100)/100,
      queryWallMs:Math.round(sqlWallMs*100)/100,queryMs:times,
      processingMs:Math.round((performance.now()-refreshStart-sqlWallMs)*100)/100,
      rssMiB:mib(memory.rss),heapUsedMiB:mib(memory.heapUsed),
      heapTotalMiB:mib(memory.heapTotal),externalMiB:mib(memory.external),
      arrayBuffersMiB:mib(memory.arrayBuffers)}));
    }
    return computed;
   });
   return conditional(req,reply,{schemaVersion:'1',...result});
  }catch{
   return bad(reply,req.id,'UPSTREAM_UNAVAILABLE','Preliminary records unavailable',503);
  }
 });
}
