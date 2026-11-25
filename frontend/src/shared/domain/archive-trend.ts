import type {HistoryPoint} from './weather.ts';
/** Difference between two actual archive values ~60 min apart. No interpolation. */
export function archiveHourChange(points:HistoryPoint[],now:number):{delta:number;from:number;to:number}|null{
 const valid=points.filter(p=>p.quality==='measured'&&p.source==='weewx_archive'&&typeof p.value==='number'&&Number.isFinite(p.value))
  .map(p=>({t:Date.parse(p.endTime),v:p.value!})).filter(p=>Number.isFinite(p.t)&&p.t<=now)
  .sort((a,b)=>a.t-b.t);
 const last=valid.at(-1);if(!last||now-last.t>20*60000)return null;
 const target=last.t-3600000;
 const candidates=valid.filter(p=>p.t<last.t&&Math.abs(p.t-target)<=10*60000).sort((a,b)=>Math.abs(a.t-target)-Math.abs(b.t-target));
 const first=candidates[0];if(!first)return null;
 return {delta:last.v-first.v,from:first.t,to:last.t};
}
