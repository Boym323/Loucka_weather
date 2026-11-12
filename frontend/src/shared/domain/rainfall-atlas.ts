import type {HistoryResponse} from './weather.ts';
import type {ConsolidatedAnnualYear} from '../api/client.ts';
import {calendarDates} from './climate-atlas.ts';
import {pragueLocalDate} from './year-comparison.ts';
import {pragueMidnightIso,nextDate} from './statistics.ts';

/** Known ORIGINAL archive limitations, based on the dated forensic audit.
 * No corrected value, external observation or private proposal is substituted.
 * Not being on this list does not imply that a measurement passed QC.
 */
export const RAIN_QC_EVIDENCE_DATE='2026-11-12';
export function rainYearRisk(year:number):string|null{
 if(year>=2009&&year<=2013)return 'Historické srážkové artefakty a neuzavřená kalibrace do dubna 2013.';
 if(year===2020)return 'Rozsáhlé výpadky srážkových hodnot, zejména v září a listopadu.';
 if(year===2021)return 'Červenec 2021: původní srážkový úhrn obsahuje známé anomálie.';
 if(year===2025)return 'Únor 2025: doložený podezřelý srážkový impuls v originálu.';
 return null;
}
export function rainMonthRisk(year:number,month:number):string|null{
 if(year>=2009&&year<=2012||year===2013&&month<=4)return rainYearRisk(year);
 if(year===2020&&(month===9||month===11))return rainYearRisk(year);
 if(year===2021&&month===7||year===2025&&month===2)return rainYearRisk(year);
 return null;
}
export function rainDayRisk(date:string):string|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
 if(date==='2025-02-27')return rainYearRisk(2025);
 const year=Number(date.slice(0,4)),month=Number(date.slice(5,7));
 if(year===2025)return null;
 return rainMonthRisk(year,month);
}

/** Availability is not accuracy. A whole year must have adequate day AND
 * measured-time coverage; known material archive risks preclude a trend point.
 */
export function rainTrendEligible(row:ConsolidatedAnnualYear):boolean{
 return row.periodStatus==='finished'&&row.qcStatus==='original_unverified'&&
  row.source==='weewx_daily'&&row.method==='sum'&&row.unit==='mm'&&
  typeof row.value==='number'&&Number.isFinite(row.value)&&row.value>=0&&
  row.elapsedDays===row.calendarDays&&row.elapsedDays>=365&&row.elapsedDays<=366&&
  row.validDays/row.elapsedDays>=.9&&
  typeof row.timeCoverageFraction==='number'&&Number.isFinite(row.timeCoverageFraction)&&
  row.timeCoverageFraction>=.9&&row.timeCoverageFraction<=1&&rainYearRisk(row.year)===null;
}

export interface RainMonth{
 month:number;expectedDays:number;wetDays:number;dryDays:number;
 missingDays:number;suspectDays:number;sumMm:number|null;risk:string|null;
}
export interface RainYear{
 year:number;expectedDays:number;availableDays:number;wetDays:number;dryDays:number;
 missingDays:number;suspectDays:number;sumMm:number|null;months:RainMonth[];
}
type DayValue={state:'wet'|'dry'|'missing'|'suspect';value:number|null};

/** Calendar-day availability and sum of usable ORIGINAL daily rain summaries.
 * A valid dry day is zero. An absent, missing or suspect day is never zero-filled.
 * The result is not subdaily completeness or a QC-approved precipitation series.
 */
export function rainfallCoverage(year:number,history:HistoryResponse):RainYear{
 if(!Number.isInteger(year)||year<2009||year>2100)throw Error('Neplatný rok');
 if(history.schemaVersion!=='1'||history.metric!=='rain'||history.unit!=='mm'||
    history.resolution!=='daily'||!Array.isArray(history.points)||history.points.length>366)
  throw Error('Neplatná denní historie srážek');
 const dates=calendarDates(year+'-01-01',(year+1)+'-01-01');
 const values=new Map<string,DayValue>(dates.map(day=>[day,{state:'missing',value:null}]));
 const seen=new Set<string>();
 for(const p of history.points){
  const day=pragueLocalDate(p.startTime);
  if(!day||!values.has(day)||seen.has(day)||
     Date.parse(p.startTime)!==Date.parse(pragueMidnightIso(day))||
     Date.parse(p.endTime)!==Date.parse(pragueMidnightIso(nextDate(day))))
   throw Error('Neplatné nebo duplicitní hranice dne');
  seen.add(day);
  if(!['measured','derived','missing','suspect'].includes(p.quality)||
     !['weewx_daily','derived'].includes(p.source))
   throw Error('Nepodporovaný původ srážek');
  if(p.quality==='suspect'){
   values.set(day,{state:'suspect',value:null});continue;
  }
  if(p.quality==='missing'||p.value===null)continue;
  if(p.source!=='weewx_daily')throw Error('Hodnota bez původního denního zdroje');
  if(typeof p.value!=='number'||!Number.isFinite(p.value)||p.value<0||
     (p.validCount!==undefined&&(!Number.isSafeInteger(p.validCount)||p.validCount<1))){
   values.set(day,{state:'suspect',value:null});continue;
  }
  values.set(day,{state:p.value>0?'wet':'dry',value:p.value});
 }
 const months:RainMonth[]=Array.from({length:12},(_,i)=>({
  month:i+1,expectedDays:0,wetDays:0,dryDays:0,missingDays:0,suspectDays:0,
  sumMm:null,risk:rainMonthRisk(year,i+1)
 }));
 for(const [day,p] of values){
  const m=months[Number(day.slice(5,7))-1]!;
  m.expectedDays++;
  if(p.state==='missing')m.missingDays++;
  else if(p.state==='suspect')m.suspectDays++;
  else{
   if(p.state==='wet')m.wetDays++;else m.dryDays++;
   m.sumMm=(m.sumMm??0)+p.value!;
  }
 }
 const count=(key:'expectedDays'|'wetDays'|'dryDays'|'missingDays'|'suspectDays')=>
  months.reduce((n,m)=>n+m[key],0);
 const wetDays=count('wetDays'),dryDays=count('dryDays'),availableDays=wetDays+dryDays;
 const total=availableDays?months.reduce((n,m)=>n+(m.sumMm??0),0):null;
 if(total!==null&&!Number.isFinite(total))throw Error('Neplatný úhrn');
 return {year,expectedDays:count('expectedDays'),availableDays,wetDays,dryDays,
  missingDays:count('missingDays'),suspectDays:count('suspectDays'),sumMm:total,months};
}
