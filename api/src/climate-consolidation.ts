/** Annual consolidation is derived from unapproved original WeeWX daily summaries.
 * Never silently merges external reference data or reconstruction candidates. */
import type {DailySummaryRow} from './store.js';
export interface AnnualSummary{
 year:number;calendarDays:number;elapsedDays:number;sourceRows:number;
 validDays:number;invalidDays:number;missingDays:number;
 completenessFraction:number|null;timeCoverageFraction:number|null;
 validSeconds:number|null;expectedSeconds:number;value:number|null;unit:string;
 method:'time_weighted_mean'|'sum'|'minimum'|'maximum';
 periodStatus:'in_progress'|'finished';qcStatus:'original_unverified';source:'weewx_daily';
}
export interface Options{
 rows:DailySummaryRow[];startYear:number;currentDate:string;
 aggregation:'mean'|'sum'|'min'|'max';unit:string;
 localDateAt:(epoch:number)=>string;localMidnight:(date:string)=>number|null;
 aggregate:(rows:DailySummaryRow[])=>{value:number|null;unit:string;valid:number};
}
const civilDays=(a:string,b:string)=>Math.round((Date.parse(b+'T00:00:00Z')-
 Date.parse(a+'T00:00:00Z'))/86400000);
export function consolidateAnnualSummaries(o:Options):AnnualSummary[]{
 const last=Number(o.currentDate.slice(0,4));
 if(!/^\d{4}-\d{2}-\d{2}$/.test(o.currentDate)||o.startYear<2009||last>2100||last<o.startYear)
  throw new Error('Invalid annual range');
 const groups=new Map<number,DailySummaryRow[]>();
 for(let year=o.startYear;year<=last;year++)groups.set(year,[]);
 let previous=-1;
 for(const row of o.rows){
  if(!Number.isSafeInteger(row.dateTime)||row.dateTime<=previous)
   throw new Error('Duplicate or unsorted daily rows');
  previous=row.dateTime;
  const date=o.localDateAt(row.dateTime);
  if(o.localMidnight(date)!==row.dateTime)throw new Error('Wrong local midnight');
  const year=Number(date.slice(0,4));
  if(date>=o.currentDate||!groups.has(year))throw new Error('Daily record out of range');
  groups.get(year)!.push(row);
 }
 const output:AnnualSummary[]=[];
 for(let year=o.startYear;year<=last;year++){
  const from=year+'-01-01',end=year===last?o.currentDate:(year+1)+'-01-01';
  const startTime=o.localMidnight(from),endTime=o.localMidnight(end);
  if(startTime===null||endTime===null||endTime<startTime)throw new Error('Bad year bounds');
  const calendarDays=civilDays(from,(year+1)+'-01-01'),elapsedDays=civilDays(from,end);
  const rows=groups.get(year)!;const valid:DailySummaryRow[]=[];
  let invalidDays=0,seconds=0,coverageKnown=true;
  for(const row of rows){
   const day=o.localDateAt(row.dateTime);
   const tomorrow=new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10);
   const midnight=o.localMidnight(tomorrow);
   if(midnight===null)throw new Error('Bad day bounds');
   try{
    if(row.count===0)continue;
    if(row.count===null||!Number.isSafeInteger(row.count)||row.count<0)
     throw new Error('Invalid daily sample count');
    if(row.sumtime!=null&&(!Number.isFinite(row.sumtime)||row.sumtime<0||
     row.sumtime>(midnight-row.dateTime)*1.01))throw new Error('Invalid sumtime');
    const a=o.aggregate([row]);
    if(a.value===null||!Number.isFinite(a.value))continue;
    valid.push(row);
    if(row.sumtime==null||row.sumtime<=0)coverageKnown=false;
    else seconds+=row.sumtime;
   }catch{invalidDays++;}
  }
  let value:number|null=null;
  if(valid.length){
   try{const result=o.aggregate(valid);if(result.value!==null&&Number.isFinite(result.value))value=result.value;}
   catch{invalidDays+=valid.length;}
  }
  const validDays=value===null?0:valid.length,expectedSeconds=endTime-startTime;
  const timeCoverageFraction=value!==null&&coverageKnown&&expectedSeconds>0?
   Math.min(1,seconds/expectedSeconds):null;
  output.push({year,calendarDays,elapsedDays,sourceRows:rows.length,validDays,
   invalidDays,missingDays:Math.max(0,elapsedDays-validDays),
   completenessFraction:elapsedDays>0?validDays/elapsedDays:null,
   timeCoverageFraction,validSeconds:value!==null&&coverageKnown?seconds:null,
   expectedSeconds,value,unit:o.unit,
   method:o.aggregation==='mean'?'time_weighted_mean':o.aggregation==='sum'?'sum':
    o.aggregation==='min'?'minimum':'maximum',
   periodStatus:year===last?'in_progress':'finished',
   qcStatus:'original_unverified',source:'weewx_daily'});
 }
 return output;
}
