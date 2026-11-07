import type {HistoryPoint} from './weather.ts';
import {pragueLocalDate} from './year-comparison.ts';

/** Calendar windows in Europe/Prague. A winter is named by its December year. */
export type ClimateSeason='spring'|'summer'|'autumn'|'winter';
export const climateSeasonLabels:Record<ClimateSeason,string>={
 spring:'Jaro',summer:'Léto',autumn:'Podzim',winter:'Zima'
};
export function seasonWindow(year:number,season:ClimateSeason){
 if(!Number.isInteger(year)||year<2009||year>2100)throw Error('Neplatný rok');
 const dates={
  spring:[year+'-03-01',year+'-06-01'],
  summer:[year+'-06-01',year+'-09-01'],
  autumn:[year+'-09-01',year+'-12-01'],
  winter:[year+'-12-01',(year+1)+'-03-01']
 };
 const [from,toExclusive]=dates[season];
 return {from,toExclusive,
  label:climateSeasonLabels[season]+' '+year+(season==='winter'?'/'+(year+1):'')};
}
export function calendarDaysBetween(from:string,toExclusive:string):number{
 const a=Date.parse(from+'T00:00:00Z'),b=Date.parse(toExclusive+'T00:00:00Z');
 if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)throw Error('Neplatný interval');
 return Math.round((b-a)/86400000);
}
export function calendarDates(from:string,toExclusive:string):string[]{
 const count=calendarDaysBetween(from,toExclusive);
 if(count>400)throw Error('Příliš dlouhé období');
 const at=Date.parse(from+'T00:00:00Z');
 return Array.from({length:count},(_,i)=>new Date(at+i*86400000).toISOString().slice(0,10));
}
export type DailyMetricKind='mean'|'sum';
export interface PeriodRollup {
 value:number|null;validDays:number;expectedDays:number;coverage:number;
 days:Map<string,number|null>;
}
/** Daily archive aggregate: a mean of available daily means, NOT a time-weighted climate normal. */
export function periodRollup(
 points:readonly HistoryPoint[],from:string,toExclusive:string,kind:DailyMetricKind
):PeriodRollup{
 const days=new Map<string,number|null>(calendarDates(from,toExclusive).map(d=>[d,null]));
 for(const p of points){
  const date=pragueLocalDate(p.startTime);
  if(!date||!days.has(date))continue;
  const valid=p.quality!=='missing'&&p.quality!=='suspect'&&
   typeof p.value==='number'&&Number.isFinite(p.value);
  if(valid)days.set(date,p.value!);
 }
 const validValues=[...days.values()].filter((v):v is number=>v!==null);
 const expectedDays=days.size,validDays=validValues.length;
 return {
  value:validDays===0?null:
   kind==='sum'?validValues.reduce((a,b)=>a+b,0):
    validValues.reduce((a,b)=>a+b,0)/validDays,
  validDays,expectedDays,coverage:expectedDays?validDays/expectedDays:0,days
 };
}
export function matchSeasonDays(
 first:PeriodRollup,second:PeriodRollup,kind:DailyMetricKind
){
 const secondDays=new Map([...second.days].map(([date,value])=>[date.slice(5),value]));
 const pairs:[number,number][]=[];
 for(const [date,a] of first.days){
  const b=secondDays.get(date.slice(5));
  if(a!==null&&b!==null&&b!==undefined)pairs.push([a,b]);
 }
 const commonDays=pairs.length;
 const aggregate=(n:0|1)=>pairs.reduce((sum,p)=>sum+p[n],0)/
  (kind==='mean'?commonDays:1);
 const a=commonDays?aggregate(0):null,b=commonDays?aggregate(1):null;
 return {commonDays,possibleDays:Math.min(first.expectedDays,second.expectedDays),
  first:a,second:b,difference:a!==null&&b!==null?b-a:null,
  sufficient:commonDays>=Math.ceil(.8*Math.min(first.expectedDays,second.expectedDays))};
}

/** Robust descriptive slope. Never interpret short, sparse archives as climate significance. */
export function theilSen(points:readonly {year:number;value:number}[]):number|null{
 const ordered=points.filter(p=>Number.isInteger(p.year)&&Number.isFinite(p.value))
  .sort((a,b)=>a.year-b.year);
 if(ordered.length<8||ordered.at(-1)!.year-ordered[0]!.year<10||
  new Set(ordered.map(p=>p.year)).size!==ordered.length)return null;
 const slopes:number[]=[];
 for(let i=0;i<ordered.length;i++)for(let j=i+1;j<ordered.length;j++)
  slopes.push((ordered[j]!.value-ordered[i]!.value)/(ordered[j]!.year-ordered[i]!.year));
 slopes.sort((a,b)=>a-b);
 const mid=Math.floor(slopes.length/2);
 return slopes.length%2?slopes[mid]!: (slopes[mid-1]!+slopes[mid]!)/2;
}
export function monthlyRollups(
 points:readonly HistoryPoint[],year:number,kind:DailyMetricKind
){
 return Array.from({length:12},(_,i)=>{
  const month=String(i+1).padStart(2,'0');
  const from=year+'-'+month+'-01';
  const toExclusive=i===11?(year+1)+'-01-01':
   year+'-'+String(i+2).padStart(2,'0')+'-01';
  return {month:i+1,...periodRollup(points,from,toExclusive,kind)};
 });
}
