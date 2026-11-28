export type Aggregation = 'mean' | 'min' | 'max' | 'sum' | 'count' | 'vecdir' | 'dir_at_max';
export type StatsPeriod = 'daily' | 'monthly' | 'yearly';
export interface StatisticsResult {
 schemaVersion: '1';
 metric: string;
 aggregation: Aggregation;
 unit: string;
 units: string;
 value: number | null;
 quality: 'derived' | 'missing';
 source: string;
 provenance: string | null;
 dataRevision: string;
 completeness: { expected: number | null; valid: number; fraction: number | null };
 timeCoverage?: {validSeconds:number;expectedSeconds:number;fraction:number;basis:string;scope:string}|null;
 extremaObservedAt: string | null;
 extremaSource: string;
}
const record=(value:unknown):value is Record<string,unknown>=>
 typeof value==='object'&&value!==null&&!Array.isArray(value);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const count=(value:unknown):value is number=>finite(value)&&Number.isSafeInteger(value)&&value>=0;
const fraction=(value:unknown):value is number=>finite(value)&&value>=0&&value<=1;
const text=(value:unknown):value is string=>typeof value==='string'&&value.length>0;
const aggregations:readonly string[]=['mean','min','max','sum','count','vecdir','dir_at_max'];

export function isStatisticsResult(data: unknown): data is StatisticsResult {
 if(!record(data))return false;
 const c=data.completeness,t=data.timeCoverage;
 if(!record(c)||!count(c.valid)||
  !(c.expected===null||count(c.expected))||!(c.fraction===null||fraction(c.fraction)))return false;
 // Optional for backward compatibility. A supplied coverage object must have
 // actual numeric duration evidence; never turn an unverified fraction into coverage.
 if(t!==undefined&&t!==null&&(!record(t)||!finite(t.validSeconds)||t.validSeconds<0||
  !finite(t.expectedSeconds)||t.expectedSeconds<=0||!fraction(t.fraction)||
  t.validSeconds>t.expectedSeconds*1.01||
  Math.abs(t.fraction-Math.min(1,t.validSeconds/t.expectedSeconds))>1e-9||
  t.basis!=='weewx_daily_sumtime_seconds'||t.scope!=='metric_only'))return false;
 return data.schemaVersion==='1'&&text(data.metric)&&
  typeof data.aggregation==='string'&&aggregations.includes(data.aggregation)&&
  (data.value===null||finite(data.value))&&
  data.quality===(data.value===null?'missing':'derived')&&
  text(data.unit)&&['us','metric','metricwx'].includes(String(data.units))&&typeof data.units==='string'&&
  data.source==='weewx_daily'&&(data.provenance===null||text(data.provenance))&&
  text(data.dataRevision)&&
  (data.extremaObservedAt===null||typeof data.extremaObservedAt==='string'&&Number.isFinite(Date.parse(data.extremaObservedAt)))&&
  typeof data.extremaSource==='string'&&['unknown','archive','not_applicable'].includes(data.extremaSource);
}
/** Date at local midnight in Europe/Prague as UTC ISO instant, including DST. */
export function pragueMidnightIso(localDate: string): string {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) throw new Error('Neplatné datum');
 const [year,month,day]=localDate.split('-').map(Number);
 const desired=Date.UTC(year,month-1,day);
 if (new Date(desired).toISOString().slice(0,10)!==localDate) throw new Error('Neplatné datum');
 const formatter=new Intl.DateTimeFormat('en-CA',{
  timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
 });
 let guess=desired;
 for(let i=0;i<4;i++){
  const parts=Object.fromEntries(formatter.formatToParts(new Date(guess)).map(p=>[p.type,p.value]));
  const localAsUtc=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),
   Number(parts.hour),Number(parts.minute),Number(parts.second));
  guess+=desired-localAsUtc;
 }
 return new Date(guess).toISOString();
}
export function nextDate(localDate:string,days=1):string{
 const [y,m,d]=localDate.split('-').map(Number);
 return new Date(Date.UTC(y,m-1,d+days)).toISOString().slice(0,10);
}
export const qualitySupported = (data:StatisticsResult): boolean =>
 isStatisticsResult(data) && data.value !== null && data.quality === 'derived' && data.completeness.valid > 0;
