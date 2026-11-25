import type {TemperatureYears,TemperatureDay} from './temperature-years.ts';
import {nextDate} from './statistics.ts';
export type ClimateComparison={current:number;baseline:number;delta:number;days:number;expected:number;years:number[];from:string;toExclusive:string};
const good=(p:TemperatureDay|undefined):p is TemperatureDay&{value:number}=>!!p&&p.quality==='derived'&&typeof p.value==='number'&&Number.isFinite(p.value)&&p.validSeconds!==null&&p.expectedSeconds>0&&p.validSeconds/p.expectedSeconds>=.9;
const mean=(v:number[])=>v.reduce((a,b)=>a+b,0)/v.length;
/** Identical civil days in each reference year, exclude leap day for comparability. */
export function compareTemperaturePeriod(data:TemperatureYears,from:string,toExclusive:string):ClimateComparison|null{
 if(from>=toExclusive||from.slice(0,4)!==nextDate(toExclusive,-1).slice(0,4)||toExclusive>data.endsBefore)return null;
 const year=Number(from.slice(0,4)),dates:string[]=[];
 for(let day=from;day<toExclusive;day=nextDate(day)){if(day.slice(5)!=='02-29')dates.push(day);if(dates.length>366)return null;}
 if(!dates.length)return null;
 const map=new Map(data.points.map(p=>[p.date,p]));
 const current=dates.filter(d=>good(map.get(d)));
 if(current.length/dates.length<.9)return null;
 const actual=mean(current.map(d=>map.get(d)!.value!));
 const comparisons:number[]=[],years:number[]=[];
 for(let y=data.firstYear;y<year;y++){
  const match=current.map(d=>map.get(y+'-'+d.slice(5)));
  if(!match.every(good))continue;
  comparisons.push(mean(match.map(p=>p.value)));years.push(y);
 }
 if(years.length<3)return null;
 const baseline=mean(comparisons);
 return {current:actual,baseline,delta:actual-baseline,days:current.length,expected:dates.length,years,from,toExclusive};
}
