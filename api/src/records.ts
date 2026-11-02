/** Bounded, explicitly unaudited climatology records from original WeeWX day summary tables.
 * No direct SQL here, no writes, no claims of final certified historical records.
 */
import type {DailySummaryRow} from './store.js';
import {converted} from './units.js';
import type {Metric} from './metrics.js';

export type EvidenceRecord={value:number;unit:string;localDate:string;source:'weewx_daily_original';
 quality:'unverified_original'};
const bounds:{minTemp:[number,number];maxTemp:[number,number];maxRain:[number,number];maxWindGust:[number,number]}={
 minTemp:[-55,45],maxTemp:[-45,55],maxRain:[0,500],maxWindGust:[0,90]
};
export type ClimateRecords={
 status:'preliminary';source:'weewx_daily_original';dataset:'original';
 calendarTimezone:'Europe/Prague';range:{from:string;toExclusive:string};
 records:{minTemp:EvidenceRecord|null;maxTemp:EvidenceRecord|null;
   maxDailyRain:EvidenceRecord|null;maxWindGust:EvidenceRecord|null};
 dayTypes:{frost:number;ice:number;summer:number;tropical:number;validTempDays:number};
 todayCalendar:{monthDay:string;minTemp:EvidenceRecord|null;maxTemp:EvidenceRecord|null;sampleYears:number};
 coverage:{temperatureDays:number;rainDays:number;windDays:number;calendarDays:number};
 notes:string[];
};
function extract(metric:Metric,row:DailySummaryRow,type:'min'|'max'|'sum',range:[number,number]):number|null{
 const raw=row[type];
 if(raw===null||typeof raw!=='number'||!Number.isFinite(raw)||row.count===null||!Number.isFinite(row.count)||row.count<=0)return null;
 try{
  const value=converted(metric,raw,row.usUnits,'metricwx').value;
  return value!==null&&Number.isFinite(value)&&value>=range[0]&&value<=range[1]?value:null;
 }catch{return null;}
}
const localDate=(epoch:number)=>new Intl.DateTimeFormat('en-CA',{
 timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date(epoch*1000));
function choose(value:number|null,unit:string,day:string,existing:EvidenceRecord|null,compare:'min'|'max'):EvidenceRecord|null{
 if(value===null)return existing;
 if(existing&&(compare==='min'?value>=existing.value:value<=existing.value))return existing;
 return {value,unit,localDate:day,source:'weewx_daily_original',quality:'unverified_original'};
}
export function climateRecordsFromDaily(input:{
 temperature:DailySummaryRow[];rain:DailySummaryRow[];gust:DailySummaryRow[];
 from:string;toExclusive:string;calendarDays:number;todayMonthDay?:string;
}):ClimateRecords{
 let minTemp:EvidenceRecord|null=null,maxTemp:EvidenceRecord|null=null;
 let maxDailyRain:EvidenceRecord|null=null,maxWindGust:EvidenceRecord|null=null;
 let frost=0,ice=0,summer=0,tropical=0,validTempDays=0;
 let tempDays=0,rainDays=0,windDays=0;
 let todayMin:EvidenceRecord|null=null,todayMax:EvidenceRecord|null=null,sampleYears=0;
 for(const row of input.temperature){
  const min=extract('outTemp',row,'min',bounds.minTemp);
  const max=extract('outTemp',row,'max',bounds.maxTemp);
  const date=localDate(row.dateTime);
  if(min!==null||max!==null)tempDays++;
  minTemp=choose(min,'°C',date,minTemp,'min');
  maxTemp=choose(max,'°C',date,maxTemp,'max');
  if(input.todayMonthDay&&date.slice(5)===input.todayMonthDay){
   if(min!==null||max!==null)sampleYears++;
   todayMin=choose(min,'°C',date,todayMin,'min');
   todayMax=choose(max,'°C',date,todayMax,'max');
  }
  // Day classification requires both physically plausible min and max.
  if(min===null||max===null||min>max)continue;
  validTempDays++;
  if(min<0)frost++;
  if(max<0)ice++;
  if(max>=25)summer++;
  if(max>=30)tropical++;
 }
 for(const row of input.rain){
  const value=extract('rain',row,'sum',bounds.maxRain);
  if(value!==null)rainDays++;
  maxDailyRain=choose(value,'mm',localDate(row.dateTime),maxDailyRain,'max');
 }
 for(const row of input.gust){
  const value=extract('windGust',row,'max',bounds.maxWindGust);
  if(value!==null)windDays++;
  maxWindGust=choose(value,'m/s',localDate(row.dateTime),maxWindGust,'max');
 }
 return {
  status:'preliminary',source:'weewx_daily_original',dataset:'original',
  calendarTimezone:'Europe/Prague',range:{from:input.from,toExclusive:input.toExclusive},
  records:{minTemp,maxTemp,maxDailyRain,maxWindGust},
  dayTypes:{frost,ice,summer,tropical,validTempDays},
  todayCalendar:{monthDay:input.todayMonthDay??'',minTemp:todayMin,maxTemp:todayMax,sampleYears},
  coverage:{temperatureDays:tempDays,rainDays,windDays,calendarDays:input.calendarDays},
  notes:[
   'Předběžná maxima a minima z původních denních souhrnů WeeWX bez dokončené historické QC.',
   'Fyzikální meze odmítají zjevně nepravděpodobné hodnoty, ale nejsou forenzním ověřením.',
   'Počty charakteristických dní se vztahují jen k dnům s platnými oběma teplotními extrémy.',
   'Počet dní s daty není úplnost minutových měření a nevypovídá o kvalitě historických srážek.'
  ]
 };
}
