import type {HistoryResponse} from './weather.ts';
import {calendarDates} from './climate-atlas.ts';
import {pragueLocalDate} from './year-comparison.ts';
import {pragueMidnightIso,nextDate} from './statistics.ts';

/** Availability of ORIGINAL daily RH summaries, not a sensor-QC certificate. */
export type RhDayState='available'|'missing'|'suspect';
export interface RhMonth {
 month:number;expectedDays:number;availableDays:number;missingDays:number;suspectDays:number;
}
export interface RhYearCoverage {
 year:number;expectedDays:number;availableDays:number;missingDays:number;suspectDays:number;
 months:RhMonth[];
}
export function humidityCoverage(year:number,history:HistoryResponse):RhYearCoverage{
 if(!Number.isInteger(year)||year<2009||year>2100)throw Error('Neplatný rok');
 if(history.schemaVersion!=='1'||history.metric!=='outHumidity'||history.unit!=='%'||
    history.resolution!=='daily'||!Array.isArray(history.points)||history.points.length>366)
  throw Error('Neplatná denní historie vlhkosti');
 const from=year+'-01-01',until=(year+1)+'-01-01';
 const days=calendarDates(from,until);
 const states=new Map<string,RhDayState>(days.map(day=>[day,'missing']));
 const seen=new Set<string>();
 for(const point of history.points){
  const date=pragueLocalDate(point.startTime);
  if(!date||!states.has(date)||seen.has(date)||
     Date.parse(point.startTime)!==Date.parse(pragueMidnightIso(date))||
     Date.parse(point.endTime)!==Date.parse(pragueMidnightIso(nextDate(date))))
   throw Error('Neplatné nebo duplicitní hranice dne');
  seen.add(date);
  // Never allow reconstructed or unrecognized provenance into this ORIGINAL view.
  if(!['measured','derived','missing','suspect'].includes(point.quality)||
     !['weewx_daily','derived'].includes(point.source))
   throw Error('Nepodporovaný původ denní hodnoty');
  if(point.quality==='suspect'){
   states.set(date,'suspect');continue;
  }
  if(point.quality==='missing'||point.value===null)continue;
  if(point.source!=='weewx_daily')throw Error('Hodnota bez původního denního zdroje');
  if(typeof point.value!=='number'||!Number.isFinite(point.value)||
     point.value<1||point.value>100||
     (point.validCount!==undefined&&(!Number.isSafeInteger(point.validCount)||point.validCount<1))){
   states.set(date,'suspect');continue;
  }
  states.set(date,'available');
 }
 const months:RhMonth[]=Array.from({length:12},(_,i)=>({
  month:i+1,expectedDays:0,availableDays:0,missingDays:0,suspectDays:0
 }));
 for(const [date,state] of states){
  const month=months[Number(date.slice(5,7))-1]!;
  month.expectedDays++;
  if(state==='available')month.availableDays++;
  else if(state==='suspect')month.suspectDays++;
  else month.missingDays++;
 }
 const sum=(key:'expectedDays'|'availableDays'|'missingDays'|'suspectDays')=>
  months.reduce((n,m)=>n+m[key],0);
 return {year,months,expectedDays:sum('expectedDays'),availableDays:sum('availableDays'),
  missingDays:sum('missingDays'),suspectDays:sum('suspectDays')};
}
