import {utcIso,utcHourStart} from './calendar-time.js';
import type {ArchiveRow} from './store.js';
import type {Metric} from './metrics.js';
import type {Aggregation} from './aggregation.js';
import {converted,publiclySafeReading,UnsupportedSourceError} from './units.js';
import type {OutputUnits,Reading} from './units.js';

/** Public raw/hourly history points, including deliberately withheld observations.
 * Transport, database pagination, revisions and HTTP error handling live in app.ts.
 */
export type ArchiveHistoryPoint={
 startTime:string;endTime:string;value:number|null;
 quality:Reading['quality']|'derived';
 source:'weewx_archive'|'derived';
 provenance:string|null;sourceUsUnits:Reading['sourceUsUnits']|null;
 qcFlags?:readonly string[];
 minValue?:number|null;maxValue?:number|null;
 minObservedAt?:string|null;maxObservedAt?:string|null;validCount?:number;
};

const source= {source:'weewx_archive',provenance:null} as const;
export function pointQuality(value:number|null):'measured'|'derived'|'missing'{
 return value===null?'missing':'derived';
}
// Only fixed, non-sensitive categories are exposed; never include row values,
// timestamps, driver messages or stack traces in the public error response.
type HistoryValidationReason='Invalid archive timestamp'|'Invalid archive interval'|
 'Unsupported archive units'|'Invalid archive ordering';
export class HistoryValidationError extends Error {
 constructor(readonly reason:HistoryValidationReason){super(reason);}
}
export function historyValidationMessage(error:unknown,fallback:string):string{
 if(error instanceof HistoryValidationError)return error.reason;
 if(error instanceof UnsupportedSourceError)return 'Invalid archive measurement or conversion';
 return fallback;
}
export function rowIsValid(row:ArchiveRow):number{
 if(!Number.isSafeInteger(row.dateTime)||row.dateTime<0)throw new HistoryValidationError('Invalid archive timestamp');
 if(!Number.isSafeInteger(row.interval)||row.interval<1||row.interval>1440)
  throw new HistoryValidationError('Invalid archive interval');
 if(row.usUnits!==1&&row.usUnits!==16&&row.usUnits!==17)
  throw new HistoryValidationError('Unsupported archive units');
 return row.dateTime-row.interval*60;
}
const OVERLAP_PROVENANCE='weewx-archive-overlapping-intervals';
type HistoryIntervalGroup={start:number;end:number;row:ArchiveRow|null};
/** Ordered by interval end, not start. A later long interval may reach back
 * across several earlier groups. Delay emission until no future valid row
 * (maximum 1440 minutes) can overlap; merge backwards, not only adjacent pairs.
 * A null row denotes an entire connected conflict group, never a chosen winner.
 */
export class HistoryIntervalGroups{
 private groups:HistoryIntervalGroup[]=[];
 private head=0;
 constructor(private readonly emit:(group:HistoryIntervalGroup)=>void){}
 add(row:ArchiveRow,start:number){
  const end=row.dateTime;
  this.flush(end-1440*60);
  let group:HistoryIntervalGroup={start,end,row};
  while(this.groups.length>this.head){
   const last=this.groups[this.groups.length-1]!;
   if(last.end<=group.start)break;
   this.groups.pop();
   group={start:Math.min(last.start,group.start),end,row:null};
  }
  this.groups.push(group);
 }
 private flush(before:number){
  while(this.head<this.groups.length&&this.groups[this.head]!.end<=before){
   this.emit(this.groups[this.head++]!);
  }
  if(this.head>=1024&&this.head*2>=this.groups.length){
   this.groups=this.groups.slice(this.head);this.head=0;
  }
 }
 finish(){this.flush(Infinity);}
}
export function rawHistoryPoints(metric:Metric,rows:ArchiveRow[],from:number,to:number,units:OutputUnits){
 const points:ArchiveHistoryPoint[]=[];let previous=from,valid=0,lastEnd=from;
 const groups=new HistoryIntervalGroups(group=>{
  if(group.start>previous)points.push({startTime:utcIso(previous),endTime:utcIso(group.start),value:null,
   quality:'missing',source:'derived',provenance:null,sourceUsUnits:null});
  if(group.row===null){
   points.push({startTime:utcIso(Math.max(group.start,from)),endTime:utcIso(group.end),value:null,
    quality:'missing',source:'derived',provenance:OVERLAP_PROVENANCE,sourceUsUnits:null});
  }else{
   const row=group.row;
   const reading=publiclySafeReading(metric,row[metric],row.usUnits,units,row.dateTime);
   points.push({startTime:utcIso(Math.max(group.start,from)),endTime:utcIso(group.end),value:reading.value,
    quality:reading.quality,qcFlags:reading.qcFlags,...source,sourceUsUnits:reading.sourceUsUnits});
   if(reading.value!==null)valid++;
  }
  previous=group.end;
 });
 for(const row of rows){
  if(row.dateTime<=lastEnd||row.dateTime>to)throw new HistoryValidationError('Invalid archive ordering');
  const rowStart=rowIsValid(row);
  // Preserve fail-closed conversion validation even for a quarantined row.
  publiclySafeReading(metric,row[metric],row.usUnits,units,row.dateTime);
  groups.add(row,rowStart);lastEnd=row.dateTime;
 }
 groups.finish();
 if(rows.length&&previous<to)points.push({startTime:utcIso(previous),endTime:utcIso(to),value:null,
  quality:'missing',source:'derived',provenance:null,sourceUsUnits:null});
 return {points,valid};
}
export type HourBucket={count:number;sum:number;weightedSum:number;weight:number;min:number|null;minAt:number|null;
 max:number|null;maxAt:number|null;xsum:number;ysum:number;peakGust:number|null;peakDirection:number|null;peakAt:number|null};
function newHourBucket():HourBucket{return {count:0,sum:0,weightedSum:0,weight:0,min:null,minAt:null,max:null,maxAt:null,
 xsum:0,ysum:0,peakGust:null,peakDirection:null,peakAt:null};}
export function addHourlyRow(buckets:Map<number,HourBucket>,metric:Metric,aggregation:Aggregation,row:ArchiveRow,
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
  const reading=publiclySafeReading(metric,row[metric],row.usUnits,units,row.dateTime).value;
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
export function hourlyHistoryPoints(metric:Metric,aggregation:Aggregation,rows:Map<number,HourBucket>,from:number,to:number,units:OutputUnits,conflicted:ReadonlySet<number>){
 const first=Math.floor(from/3600)*3600,last=utcHourStart(to),points:ArchiveHistoryPoint[]=[];let valid=0;
 const angular=metric==='windDir'||metric==='windGustDir';
 for(let bucket=first;bucket<=last;bucket+=3600){
  if(conflicted.has(bucket)){
   points.push({startTime:utcIso(Math.max(bucket,from)),endTime:utcIso(Math.min(bucket+3600,to)),
    value:null,quality:'missing',source:'derived',provenance:OVERLAP_PROVENANCE,sourceUsUnits:null,
    minValue:null,maxValue:null,minObservedAt:null,maxObservedAt:null,validCount:0});
   continue;
  }
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
