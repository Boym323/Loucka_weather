import {rainDayRisk} from './rainfall-atlas.ts';

/** Display ORIGINAL preliminary records only. Never promote an unapproved
 * dataset, missing sample, uncertain unit or malformed date to a record. */
export const highlightMetrics=[
 {id:'maxTemp',label:'Nejteplejší zaznamenaný den',unit:'°C'},
 {id:'minTemp',label:'Nejchladnější zaznamenaný den',unit:'°C'},
 {id:'maxDailyRain',label:'Nejvyšší zaznamenané denní srážky',unit:'mm'},
 {id:'maxWindGust',label:'Nejsilnější zaznamenaný náraz větru',unit:'m/s'}
] as const;
export type HighlightMetric=typeof highlightMetrics[number]['id'];
export interface HighlightView{
 id:HighlightMetric;
 value:string;
 date:string;
 isoDate:string|null;
 caution:string|null;
 available:boolean;
}
const asObject=(value:unknown):Record<string,unknown>|null=>
 typeof value==='object'&&value!==null&&!Array.isArray(value)?
  value as Record<string,unknown>:null;
const validDate=(date:unknown):date is string=>{
 if(typeof date!=='string'||!/^(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(date))return false;
 const parsed=new Date(date+'T12:00:00Z');
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date;
};
const number=(n:number)=>new Intl.NumberFormat('cs-CZ',{
 minimumFractionDigits:1,maximumFractionDigits:1
}).format(n);
const dateLabel=(iso:string)=>new Intl.DateTimeFormat('cs-CZ',{
 timeZone:'UTC',day:'numeric',month:'long',year:'numeric'
}).format(new Date(iso+'T12:00:00Z'));

export function featuredClimateRecords(payload:unknown):HighlightView[]|null{
 const source=asObject(payload);
 if(!source||source.schemaVersion!=='1'||source.status!=='preliminary'||
    source.dataset!=='original')return null;
 const records=asObject(source.records);
 if(!records)return null;
 return highlightMetrics.map(metric=>{
  const record=asObject(records[metric.id]);
  const value=record?.value;
  const good=record?.quality==='unverified_original'&&
   record?.unit===metric.unit&&validDate(record?.localDate)&&
   typeof value==='number'&&Number.isFinite(value)&&
   (metric.id!=='maxDailyRain'&&metric.id!=='maxWindGust'||value>=0);
  if(!good){
   return {id:metric.id,value:'—',date:'Bez doloženého údaje',
    isoDate:null,caution:null,available:false};
  }
  const isoDate=record.localDate as string;
  return {id:metric.id,value:number(value as number)+' '+metric.unit,
   date:dateLabel(isoDate),isoDate,
   caution:metric.id==='maxDailyRain'?rainDayRisk(isoDate):null,
   available:true};
 });
}
