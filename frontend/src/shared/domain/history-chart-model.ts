import type {HistoryPoint} from './weather';

/** Only public numeric, nonsuspect observations become plotted values. */
export function validHistoryPoint(p:HistoryPoint|undefined|null):p is HistoryPoint&{value:number}{
 return !!p&&typeof p.value==='number'&&Number.isFinite(p.value)&&
  (p.quality==='measured'||p.quality==='derived'||p.quality==='reconstructed');
}
export function historyQualityName(quality:HistoryPoint['quality']):string{
 return {measured:'měřeno',derived:'odvozeno',reconstructed:'rekonstruováno',suspect:'podezřelé',missing:'chybí'}[quality]??'neznámá';
}
export const escapeChartHtml=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));
export function historyAxisPoints(points:readonly HistoryPoint[]):[number,number|null][]{
 return points.map(p=>[Date.parse(p.endTime),validHistoryPoint(p)?p.value:null]);
}
export interface HistoryQualityCounts {measured:number;derived:number;reconstructed:number;missing:number}
export interface HistorySeriesSummary extends HistoryQualityCounts {minimum:number|null;maximum:number|null}
export function summarizeHistorySeries(points:readonly HistoryPoint[]):HistorySeriesSummary{
 const out:HistorySeriesSummary={measured:0,derived:0,reconstructed:0,missing:0,minimum:null,maximum:null};
 for(const p of points){
  if(!validHistoryPoint(p)){out.missing++;continue;}
  if(p.quality==='measured')out.measured++;
  else if(p.quality==='reconstructed')out.reconstructed++;
  else out.derived++;
  out.minimum=out.minimum===null?p.value:Math.min(out.minimum,p.value);
  out.maximum=out.maximum===null?p.value:Math.max(out.maximum,p.value);
 }
 return out;
}
export function historyTotals(summaries:readonly HistoryQualityCounts[]):HistoryQualityCounts{
 return summaries.reduce((n,p)=>({measured:n.measured+p.measured,derived:n.derived+p.derived,
  reconstructed:n.reconstructed+p.reconstructed,missing:n.missing+p.missing}),
  {measured:0,derived:0,reconstructed:0,missing:0});
}
