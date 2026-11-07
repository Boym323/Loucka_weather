import type {TemperatureYears,TemperatureDay} from './temperature-years.ts';
import type {ClimateSeason} from './climate-atlas.ts';
import {seasonWindow,calendarDates} from './climate-atlas.ts';
import {pragueMidnightIso} from './statistics.ts';

/** Read-only season ranking computed from the single all-years daily-temperature API.
 * Mean is weighted by valid observation seconds, never by missing calendar days.
 * Entries with insufficient coverage are reported but NEVER ranked. */
export interface RankedTemperatureSeason{
 year:number;label:string;mean:number|null;
 validDays:number;expectedDays:number;
 dayCoverage:number;timeCoverage:number;
 qualified:boolean;
}
const DAY_MIN_COVERAGE=.8;
const SEASON_MIN_COVERAGE=.9;
export function temperatureSeasonRanking(
 payload:TemperatureYears,season:ClimateSeason
):{ranked:RankedTemperatureSeason[];excluded:RankedTemperatureSeason[]}{
 if(payload.schemaVersion!=='1'||payload.dataset!=='original'||
  payload.source!=='weewx_daily'||payload.qcStatus!=='original_unverified'||
  !/^\d{4}-\d{2}-\d{2}$/.test(payload.endsBefore)||
  payload.firstYear<2009||payload.firstYear>2100)throw Error('Invalid temperature evidence');
 const values=new Map<string,TemperatureDay>();
 for(const point of payload.points){
  if(values.has(point.date))throw Error('Duplicated daily temperature date');
  if(point.date!==point.year+'-'+point.monthDay)throw Error('Incorrect daily date');
  values.set(point.date,point);
 }
 const ranked:RankedTemperatureSeason[]=[];
 const excluded:RankedTemperatureSeason[]=[];
 const lastYear=Number(payload.endsBefore.slice(0,4));
 for(let year=payload.firstYear;year<=lastYear;year++){
  const window=seasonWindow(year,season);
  if(window.toExclusive>payload.endsBefore)continue;
  const days=calendarDates(window.from,window.toExclusive);
  const expectedSeconds=(Date.parse(pragueMidnightIso(window.toExclusive))-
   Date.parse(pragueMidnightIso(window.from)))/1000;
  let observedSeconds=0,weightedSum=0,validDays=0;
  for(const date of days){
   const observation=values.get(date);
   if(!observation||observation.quality!=='derived'||
    observation.value===null||!Number.isFinite(observation.value)||
    observation.validSeconds===null||
    !Number.isFinite(observation.validSeconds)||
    observation.validSeconds<=0||
    observation.expectedSeconds<=0||
    observation.validSeconds>observation.expectedSeconds*1.01||
    observation.validSeconds/observation.expectedSeconds<DAY_MIN_COVERAGE)continue;
   weightedSum+=observation.value*observation.validSeconds;
   observedSeconds+=observation.validSeconds;
   validDays++;
  }
  const expectedDays=days.length;
  const dayCoverage=validDays/expectedDays;
  const timeCoverage=Math.min(1,observedSeconds/expectedSeconds);
  const qualified=dayCoverage>=SEASON_MIN_COVERAGE&&
   timeCoverage>=SEASON_MIN_COVERAGE;
  const item:RankedTemperatureSeason={
   year,label:window.label,
   mean:observedSeconds?weightedSum/observedSeconds:null,
   validDays,expectedDays,dayCoverage,timeCoverage,qualified
  };
  (qualified?ranked:excluded).push(item);
 }
 ranked.sort((a,b)=>(b.mean??-Infinity)-(a.mean??-Infinity)||a.year-b.year);
 excluded.sort((a,b)=>b.year-a.year);
 return {ranked,excluded};
}
