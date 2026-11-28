import {pragueMidnightIso,nextDate} from '../../shared/domain/statistics.ts';
import {severityDisplay,type LocalAlert} from './warning-display.ts';
const rank=['unknown','minor','moderate','severe','extreme'];
/** Half-open civil day and alert intervals; exclude expired, unknown and invalid intervals. */
export function warningsForDay(alerts:LocalAlert[],date:string,now:number):LocalAlert[]{
 try{
  const start=Date.parse(pragueMidnightIso(date)),end=Date.parse(pragueMidnightIso(nextDate(date)));
  return alerts.filter(a=>{
   const from=Date.parse(a.onset),to=Date.parse(a.expires);
   return Number.isFinite(from)&&Number.isFinite(to)&&from<to&&to>now&&from<end&&to>start;
  }).sort((a,b)=>rank.indexOf(severityDisplay(b.severity).level)-rank.indexOf(severityDisplay(a.severity).level));
 }catch{return [];}
}
