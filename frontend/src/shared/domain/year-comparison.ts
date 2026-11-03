import type {HistoryPoint} from './weather';

/** Fixed color bands shared by every calendar year. No invented sensor epochs. */
const temperature={limits:[-10,-5,0,5,10,15,20,25],
 colors:['#244a82','#3b75ad','#76a9c9','#afd2d7','#e3e5c2','#f2d18d','#e8a45a','#d47149','#a8463e']};
const precipitation={limits:[0,0.1,1,3,6,12,25,40],
 colors:['#e8edf0','#d8edf2','#b0dce7','#83c1d5','#5ba4c6','#377daf','#25608d','#1d466f','#152f50']};
const humidity={limits:[20,35,45,55,65,75,85,95],
 colors:['#b87543','#d39962','#e9bf83','#e5deb1','#c9dec2','#a3d0cb','#72b6bd','#498da9','#235a80']};
const wind={limits:[0,0.5,1,1.5,2,3,5,8],
 colors:['#edf0ec','#d4e6dc','#b9d7ca','#99c7b4','#72b59d','#4d9e85','#327c6e','#256054','#143f3d']};
const windPeak={limits:[0,2,4,6,8,11,15,20],colors:wind.colors};
const pressure={limits:[980,990,1000,1005,1010,1015,1020,1030],
 colors:['#31567a','#5486ab','#8db6c8','#c7d6cf','#ede5c3','#efcc98','#d9a37a','#b87b65','#8a4f4e']};
const radiation={limits:[0,25,50,100,200,300,450,600],
 colors:['#dce9ed','#bbdfe3','#9dcfcb','#b2d9ac','#e0e1a3','#efd284','#e8b465','#d8894b','#bb5e42']};
const airQuality={limits:[0,5,10,15,20,25,35,55],
 colors:['#eaf1ec','#cde8d6','#a8d9c7','#83c3ba','#e5de97','#efc17d','#df9a64','#ca6e55','#944957']};
const elevation={limits:[0,50,100,200,400,700,1000,1500],colors:pressure.colors};
const rate={limits:[0,0.1,0.5,1,2,5,10,20],colors:precipitation.colors};
const et={limits:[0,0.1,0.3,0.5,1,2,4,6],colors:radiation.colors};
export const comparisonMetrics={
 outTemp:{label:'Venkovní teplota · denní průměr',unit:'°C',kind:'mean',...temperature},
 rain:{label:'Srážky · denní úhrn',unit:'mm',kind:'sum',...precipitation},
 outHumidity:{label:'Venkovní vlhkost · denní průměr',unit:'%',kind:'mean',...humidity},
 windSpeed:{label:'Vítr · denní průměr',unit:'m/s',kind:'mean',...wind},
 windGust:{label:'Vítr · nejvyšší denní náraz',unit:'m/s',kind:'max',...windPeak},
 dewpoint:{label:'Rosný bod',unit:'°C',kind:'mean',...temperature},
 appTemp:{label:'Pocitová teplota',unit:'°C',kind:'mean',...temperature},
 heatindex:{label:'Tepelný index',unit:'°C',kind:'mean',...temperature},
 windchill:{label:'Wind chill',unit:'°C',kind:'mean',...temperature},
 inTemp:{label:'Vnitřní teplota',unit:'°C',kind:'mean',...temperature},
 inDewpoint:{label:'Vnitřní rosný bod',unit:'°C',kind:'mean',...temperature},
 inHumidity:{label:'Vnitřní vlhkost',unit:'%',kind:'mean',...humidity},
 barometer:{label:'Barometrický tlak',unit:'hPa',kind:'mean',...pressure},
 pressure:{label:'Tlak na stanici',unit:'hPa',kind:'mean',...pressure},
 altimeter:{label:'Tlak přepočtený na výšku',unit:'hPa',kind:'mean',...pressure},
 cloudbase:{label:'Základna oblačnosti',unit:'m',kind:'mean',...elevation},
 rainRate:{label:'Maximum denní intenzity deště',unit:'mm/h',kind:'max',...rate},
 ET:{label:'Evapotranspirace · součet',unit:'mm',kind:'sum',...et},
 dayET:{label:'Denní evapotranspirace · archiv',unit:'mm',kind:'max',...et},
 ET24:{label:'Evapotranspirace 24 h · archiv',unit:'mm',kind:'max',...et},
 radiation:{label:'Sluneční záření · průměr',unit:'W/m²',kind:'mean',...radiation},
 maxSolarRad:{label:'Maximální záření',unit:'W/m²',kind:'max',...radiation},
 UV:{label:'UV index · denní maximum',unit:'',kind:'max',...rate},
 luminosity:{label:'Intenzita osvětlení',unit:'lux',kind:'mean',
  limits:[0,500,2000,5000,10000,20000,40000,60000],colors:radiation.colors},
 pm25_1:{label:'PM2,5 · průměr',unit:'µg/m³',kind:'mean',...airQuality},
 extraTemp1:{label:'Teplota · další kanál 1',unit:'°C',kind:'mean',...temperature},
 extraTemp2:{label:'Teplota · další kanál 2',unit:'°C',kind:'mean',...temperature},
 extraHumid1:{label:'Vlhkost · další kanál 1',unit:'%',kind:'mean',...humidity},
 extraHumid2:{label:'Vlhkost · další kanál 2',unit:'%',kind:'mean',...humidity},
 soilTemp1:{label:'Půdní teplota · kanál 1',unit:'°C',kind:'mean',...temperature},
 soilTemp2:{label:'Půdní teplota · kanál 2',unit:'°C',kind:'mean',...temperature},
 soilTemp3:{label:'Půdní teplota · kanál 3',unit:'°C',kind:'mean',...temperature},
 soilTemp4:{label:'Půdní teplota · kanál 4',unit:'°C',kind:'mean',...temperature},
 soilTemp5:{label:'Půdní teplota · kanál 5',unit:'°C',kind:'mean',...temperature},
 soilTemp6:{label:'Půdní teplota · kanál 6',unit:'°C',kind:'mean',...temperature}
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
  return comparisonMetrics[metric].kind==='sum'?sum:
   comparisonMetrics[metric].kind==='max'?Math.max(...matched.map(pair=>pair[index])):
   sum/matched.length;
 };
 const a=aggregate(0),b=aggregate(1);
 return {days:matched.length,first:a,second:b,difference:b-a};
}
export function validDayCount(values:ReadonlyMap<string,number|null>):number{
 return [...values.values()].filter(v=>v!==null&&Number.isFinite(v)).length;
}
