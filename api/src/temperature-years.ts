/** Single-scan, read-only daily temperature evidence for 2009–today.
 * Each date belongs to Europe/Prague; no row is invented for a gap. */
import type {DailySummaryRow} from './store.js';

export type TemperatureDay={
 date:string;year:number;monthDay:string;value:number|null;
 validSeconds:number|null;expectedSeconds:number;
 quality:'derived'|'partial'|'missing'|'suspect';
};
type Options={
 rows:DailySummaryRow[];from:number;until:number;today:string;
 localDateAt:(epoch:number)=>string;
 localMidnight:(date:string)=>number|null;
 convert:(value:number,usUnits:number)=>number|null;
};
const next=(date:string)=>new Date(Date.parse(date+'T00:00:00Z')+86_400_000).toISOString().slice(0,10);
export function buildTemperatureDays(o:Options):TemperatureDay[]{
 const output:TemperatureDay[]=[];
 let previous=-1;
 for(const row of o.rows){
  if(!Number.isSafeInteger(row.dateTime)||row.dateTime<=previous||
   row.dateTime<o.from||row.dateTime>=o.until)
   throw new Error('Invalid daily summary ordering or bound');
  previous=row.dateTime;
  const date=o.localDateAt(row.dateTime);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<'2009-01-01'||
   date>=o.today||o.localMidnight(date)!==row.dateTime)
   throw new Error('Invalid Europe/Prague daily boundary');
  const end=o.localMidnight(next(date));
  if(end===null||end<=row.dateTime)throw new Error('Invalid local day duration');
  const expectedSeconds=end-row.dateTime;
  let value:number|null=null;
  let seconds:number|null=null;
  let quality:TemperatureDay['quality']='missing';
  if(row.count!==0){
   const validMetadata=Number.isSafeInteger(row.count)&&row.count!==null&&row.count>0&&
    (row.usUnits===1||row.usUnits===16||row.usUnits===17)&&
    typeof row.wsum==='number'&&Number.isFinite(row.wsum)&&
    typeof row.sumtime==='number'&&Number.isFinite(row.sumtime)&&
    row.sumtime>0&&row.sumtime<=expectedSeconds*1.01;
   if(!validMetadata)quality='suspect';
   else{
    const converted=o.convert(row.wsum!/row.sumtime!,row.usUnits);
    if(converted===null||!Number.isFinite(converted))quality='suspect';
    else{
     value=converted;seconds=row.sumtime!;
     quality=seconds/expectedSeconds>=0.8?'derived':'partial';
    }
   }
  }
  output.push({date,year:Number(date.slice(0,4)),monthDay:date.slice(5),
   value,validSeconds:seconds,expectedSeconds,quality});
 }
 return output;
}
