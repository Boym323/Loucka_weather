import type {HistoryPoint} from './weather';

/** Stable scales: the same weather value always has the same color in both years. */
export const comparisonMetrics={
 outTemp:{label:'Průměrná denní teplota',unit:'°C',kind:'mean',limits:[-10,-5,0,5,10,15,20,25],
  colors:['#244a82','#3b75ad','#76a9c9','#afd2d7','#e3e5c2','#f2d18d','#e8a45a','#d47149','#a8463e']},
 rain:{label:'Denní srážky',unit:'mm',kind:'sum',limits:[0,0.1,1,3,6,12,25,40],
  colors:['#e8edf0','#d8edf2','#b0dce7','#83c1d5','#5ba4c6','#377daf','#25608d','#1d466f','#152f50']},
 outHumidity:{label:'Průměrná denní vlhkost',unit:'%',kind:'mean',limits:[20,35,45,55,65,75,85,95],
  colors:['#b87543','#d39962','#e9bf83','#e5deb1','#c9dec2','#a3d0cb','#72b6bd','#498da9','#235a80']},
 windSpeed:{label:'Průměrná rychlost větru',unit:'m/s',kind:'mean',limits:[0,0.5,1,1.5,2,3,5,8],
  colors:['#edf0ec','#d4e6dc','#b9d7ca','#99c7b4','#72b59d','#4d9e85','#327c6e','#256054','#143f3d']},
 windGust:{label:'Nejvyšší denní náraz větru',unit:'m/s',kind:'max',limits:[0,2,4,6,8,11,15,20],
  colors:['#edf0ec','#d4e6dc','#b9d7ca','#99c7b4','#72b59d','#4d9e85','#327c6e','#256054','#143f3d']}
} as const;
export type ComparisonMetric=keyof typeof comparisonMetrics;
export const isComparisonMetric=(value:string):value is ComparisonMetric=>
 Object.prototype.hasOwnProperty.call(comparisonMetrics,value);
export const comparisonMonths=['Led','Úno','Bře','Dub','Kvě','Čvn','Čvc','Srp','Zář','Říj','Lis','Pro'] as const;
const dayFormatter=new Intl.DateTimeFormat('en-GB',{
 timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'
});
export function pragueLocalDate(iso:string):string|null{
 const parsed=Date.parse(iso);
 if(!Number.isFinite(parsed))return null;
 const parts=Object.fromEntries(dayFormatter.formatToParts(new Date(parsed)).map(p=>[p.type,p.value]));
 return parts.year+'-'+parts.month+'-'+parts.day;
}
export function calendarDayExists(year:number,month:number,day:number):boolean{
 if(!Number.isInteger(year)||!Number.isInteger(month)||!Number.isInteger(day))return false;
 if(month<1||month>12||day<1||day>31)return false;
 const utc=new Date(Date.UTC(year,month-1,day));
 return utc.getUTCFullYear()===year&&utc.getUTCMonth()===month-1&&utc.getUTCDate()===day;
}
export const yearDays=(year:number)=>calendarDayExists(year,2,29)?366:365;
/** Align by MM-DD, not by ordinal day: March never shifts after leap day. */
export const alignedCalendarDays=Array.from({length:366},(_,i)=>{
 const date=new Date(Date.UTC(2024,0,i+1));
 return String(date.getUTCMonth()+1).padStart(2,'0')+'-'+String(date.getUTCDate()).padStart(2,'0');
});
export function dailyValues(year:number,points:HistoryPoint[]):Map<string,number|null>{
 const result=new Map<string,number|null>();
 for(const point of points){
  const day=pragueLocalDate(point.startTime);
  if(!day||!day.startsWith(year+'-'))continue;
  const key=day.slice(5);
  if(result.has(key))continue; // An API daily series must not duplicate calendar days.
  const valid=point.quality!=='missing'&&point.quality!=='suspect'&&
   typeof point.value==='number'&&Number.isFinite(point.value);
  result.set(key,valid?point.value:null);
 }
 return result;
}
export function colorBand(metric:ComparisonMetric,value:number):number{
 const limits=comparisonMetrics[metric].limits as readonly number[];
 let index=0;
 while(index<limits.length&&value>limits[index])index++;
 return index;
}
export function sharedDayComparison(
 metric:ComparisonMetric,
 first:ReadonlyMap<string,number|null>,
 second:ReadonlyMap<string,number|null>
){
 const matched=alignedCalendarDays.flatMap(day=>{
  const a=first.get(day),b=second.get(day);
  return a!==undefined&&a!==null&&b!==undefined&&b!==null?[[a,b] as const]:[];
 });
 if(matched.length===0)return {days:0,first:null,second:null,difference:null};
 const aggregate=(index:0|1)=>{
  const sum=matched.reduce((total,pair)=>total+pair[index],0);
  return metric==='rain'?sum:sum/matched.length;
 };
 const a=aggregate(0),b=aggregate(1);
 return {days:matched.length,first:a,second:b,difference:b-a};
}
export function validDayCount(values:ReadonlyMap<string,number|null>):number{
 return [...values.values()].filter(v=>v!==null&&Number.isFinite(v)).length;
}
