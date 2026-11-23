/** Audit-backed, bounded ORIGINAL-archive sensor exclusion policy.
 * Source is never rewritten here. Original values remain accessible in DB;
 * this PUBLICATION overlay withholds unverified peaks, not measurements
 * claimed independently invalid. Cohorts from Meteo_audit PR #69 and
 * targeted reconstruction journal batches 2026-11-23.
 */
import type {Metric} from './metrics.js';

export type SensorHold={flag:string;status:'sensor_error'|'unverified'};

type Period={from:number;to:number};
const Y2024={from:1704067200,to:1735689600};
const EXTRA2_2022={from:1662108300,to:1662640201};
const MASKED_DAILY:Partial<Record<Metric,readonly Period[]>>={
 pm25_1:[Y2024], // daily uncorrected cache could otherwise leak 999.9 into extrema
 extraTemp1:[{from:1708128000,to:1708214400}],
 extraTemp2:[{from:1662076800,to:1662681600},{from:1708128000,to:1708214400}],
 soilTemp1:[{from:1646092800,to:1648771200},{from:1780272000,to:1788307200}],
 soilTemp5:[{from:1773878400,to:1792627200}],
 soilTemp6:[{from:1773878400,to:1792627200}]
};
const affected=new Set<Metric>(Object.keys(MASKED_DAILY) as Metric[]);

export function originalSensorHold(
 metric:Metric,originalValue:number|null|undefined,sourceUsUnits:number,dateTime:number|undefined
):SensorHold|null{
 if(originalValue===null||originalValue===undefined||!affected.has(metric))return null;
 // All flagged source rows are WeeWX METRIC (usUnits=16). Without provenance
 // reject the publication rather than treating a different unit as Celsius.
 if(sourceUsUnits!==16||!Number.isSafeInteger(dateTime))
  return {flag:'UNVERIFIED_SENSOR_EPOCH',status:'unverified'};
 const t=dateTime!;
 if(metric==='pm25_1'&&t>=Y2024.from&&t<Y2024.to&&originalValue>=500)
  return {flag:'SUSPECT_PM25_SENSOR_SATURATION',status:'unverified'};
 if(metric==='extraTemp2'){
  if(t>=EXTRA2_2022.from&&t<EXTRA2_2022.to)
   return {flag:'UNVERIFIED_2022_EXTRA_TEMP2_CHANNEL',status:'unverified'};
  if(originalValue>100)return {flag:'IMPOSSIBLE_EXTRA_TEMPERATURE',status:'sensor_error'};
 }
 if(metric==='extraTemp1'&&originalValue>80)
  return {flag:'IMPOSSIBLE_EXTRA_TEMPERATURE',status:'sensor_error'};
 if(metric==='soilTemp1'&&originalValue< -20)
  return {flag:'IMPLAUSIBLE_SOIL_SENSOR_OUTLIER',status:'sensor_error'};
 if(metric==='soilTemp5'||metric==='soilTemp6'){
  if(originalValue< -40)return {flag:'IMPLAUSIBLE_SOIL_SENSOR_OUTLIER',status:'sensor_error'};
  // This second band is NOT a confirmed error. During the 2026 warm-season
  // sensor-mapping transition thousands of source values <-10 coexist with
  // positive outdoor and neighboring soil probes. Hold from public extremes.
  if(t>=1772972100&&t<1795415701&&originalValue< -10)
   return {flag:'SUSPECT_2026_SOIL_SENSOR_NEGATIVE_SPIKE',status:'unverified'};
 }
 return null;
}

/** Day-summary aggregates cannot be repaired from raw-row exclusions without
 * rebuilding WeeWX archive_day_*; refuse unsafe cached aggregates entirely.
 * Ranges are intentionally conservative and correspond to known QC episodes.
 */
export function originalDailyAggregateHeld(metric:Metric,from:number,to:number):boolean{
 return (MASKED_DAILY[metric]??[]).some(p=>from<p.to&&to>p.from);
}
export function originalAnnualAggregateHeld(metric:Metric):boolean{
 return affected.has(metric);
}
