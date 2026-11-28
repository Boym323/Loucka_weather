export interface HourlyPoint {time:number;temperature:number|null;precipitation:number|null;probability:number|null;wind:number|null}
const finite=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)?v:null;
/** Open-Meteo Unix seconds are UTC; convert only at display time. Missing values stay missing. */
export function parseHourlyForecast(payload:unknown,now:number,limit=24):HourlyPoint[]{
 if(!payload||typeof payload!=='object')return [];
 const obj=payload as {hourly?:Record<string,unknown>;hourly_units?:Record<string,unknown>};
 const h=obj.hourly,u=obj.hourly_units;
 if(!h||!u||u.temperature_2m!=='°C'||u.precipitation!=='mm'||u.precipitation_probability!=='%'||u.wind_speed_10m!=='m/s')return [];
 const fields=['time','temperature_2m','precipitation','precipitation_probability','wind_speed_10m'];
 if(!fields.every(k=>Array.isArray(h[k])))return [];
 const arrays=fields.map(k=>h[k] as unknown[]);
 if(!arrays.every(a=>a.length===arrays[0]!.length))return [];
 const start=Math.floor(now/3600000)*3600000;
 const result:HourlyPoint[]=[];
 let previous=-Infinity;
 for(let i=0;i<arrays[0]!.length;i++){
  const seconds=finite(arrays[0]![i]);if(seconds===null||!Number.isSafeInteger(seconds))return [];
  const time=seconds*1000;
  if(time<=previous||!Number.isFinite(time))return [];
  previous=time;
  if(time<start||time>=start+limit*3600000)continue;
  const precipitation=finite(arrays[2]![i]),probability=finite(arrays[3]![i]),wind=finite(arrays[4]![i]);
  result.push({time,temperature:finite(arrays[1]![i]),precipitation:precipitation!==null&&precipitation>=0?precipitation:null,
   probability:probability!==null&&probability>=0&&probability<=100?probability:null,wind:wind!==null&&wind>=0?wind:null});
 }
 return result;
}
