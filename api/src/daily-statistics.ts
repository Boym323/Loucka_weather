import type {DailySummaryRow} from './store.js';
import type {Metric} from './metrics.js';
import type {Aggregation} from './aggregation.js';
import {converted,outputUnit} from './units.js';
import type {OutputUnits} from './units.js';
import {utcIso,localDateAt,localMidnight,nextLocalDate} from './calendar-time.js';
import {pointQuality} from './archive-history.js';

/** Daily points preserve source timestamps, units and explicit missing days. */
export type DailyHistoryPoint={
 startTime:string;endTime:string;value:number|null;
 quality:'measured'|'derived'|'missing';
 source:'weewx_daily'|'derived';provenance:string|null;sourceUsUnits:number|null;
 minValue:number|null;maxValue:number|null;minObservedAt:string|null;maxObservedAt:string|null;validCount:number;
};

export function dailyHistoryPoints(metric:Metric,aggregation:Aggregation,rows:DailySummaryRow[],fromDate:string,toDate:string,units:OutputUnits){
 const byDate=new Map<string,DailySummaryRow>();
 let previousDateTime=-1;
 for(const row of rows){
  const date=localDateAt(row.dateTime);
  if(date<fromDate||date>=toDate||localMidnight(date)!==row.dateTime||row.dateTime<=previousDateTime||byDate.has(date))
   throw new Error('Invalid daily summary boundaries or ordering');
  previousDateTime=row.dateTime;byDate.set(date,row);
 }
 const points:DailyHistoryPoint[]=[];let valid=0;
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
export function aggregateSummaryRows(metric:Metric,aggregation:string,rows:DailySummaryRow[],units:OutputUnits){
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
