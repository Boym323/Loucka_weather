import { isCurrentResponse, isHistoryResponse } from '../domain/weather';
import type { CurrentResponse, HistoryResponse } from '../domain/weather';
import { getMetric } from '../domain/metrics';

// Staging nginx explicitly limits /api/v1 to 5 requests/s and returns 429 with Retry-After.
// Retry that transient response, but never silently retry other API errors.
async function retryDelay(ms:number,signal?:AbortSignal):Promise<void>{
 if(signal?.aborted)throw new DOMException('Požadavek přerušen','AbortError');
 await new Promise<void>((resolve,reject)=>{
  const cancel=()=>{clearTimeout(timeout);reject(new DOMException('Požadavek přerušen','AbortError'));};
  const timeout=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},ms);
  signal?.addEventListener('abort',cancel,{once:true});
 });
}
async function request(path: string, signal?: AbortSignal): Promise<unknown> {
 for(let attempt=0;attempt<3;attempt++){
  const response=await fetch(path,{signal,headers:{Accept:'application/json'},credentials:'same-origin'});
  // Shared proxy rate limit and brief DB-read revision overlaps are transient.
  // Do not retry invalid requests (400/422), and bound extra traffic.
  if([429,503,504].includes(response.status)&&attempt<2){
   const raw=response.headers.get('Retry-After');
   const parsed=raw===null?NaN:Number(raw);
   const base=Number.isFinite(parsed)?Math.max(1000,Math.min(3000,parsed*1000)):1200;
   await retryDelay(base*(attempt+1),signal);
   continue;
  }
  if(!response.ok)throw new Error('API HTTP '+response.status);
  return response.json() as Promise<unknown>;
 }
 throw new Error('API retry exhausted');
}
export async function getCurrent(signal?:AbortSignal):Promise<CurrentResponse>{
 const data=await request('/api/v1/current?units=metricwx&dataset=original',signal);
 if(!isCurrentResponse(data))throw new Error('Neplatný formát aktuálních dat');
 return data;
}
export async function getHistoryRange(metric:string,hours:number,signal?:AbortSignal):Promise<HistoryResponse>{
 if(!getMetric(metric))throw new Error('Nepodporovaná veličina');
 if(!Number.isInteger(hours)||hours<1||hours>72)throw new Error('Nepodporované časové období');
 const to=new Date(),from=new Date(to.getTime()-hours*3600_000);
 const query=new URLSearchParams({
  metric,from:from.toISOString(),to:to.toISOString(),
  resolution:'raw',units:'metricwx',dataset:'original',limit:'1000'
 });
 const data=await request('/api/v1/history?'+query.toString(),signal);
 if(!isHistoryResponse(data)||data.metric!==metric)throw new Error('Neplatný formát historie');
 return data;
}
export const getHistory24h=(metric:string,signal?:AbortSignal)=>getHistoryRange(metric,24,signal);


export async function getStatistics(
 period: import('../domain/statistics').StatsPeriod,
 metric:string,
 aggregation:import('../domain/statistics').Aggregation,
 value:string,
 signal?:AbortSignal
):Promise<import('../domain/statistics').StatisticsResult> {
 const {isStatisticsResult}=await import('../domain/statistics');
 const key=period==='daily'?'date':period==='monthly'?'month':'year';
 if(!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(metric))throw new Error('Neplatná veličina');
 if(!/^(20\d{2}-\d{2}(-\d{2})?|20\d{2})$/.test(value))throw new Error('Neplatné období');
 const params=new URLSearchParams({metric,aggregation,[key]:value,units:'metricwx',dataset:'original'});
 const data=await request('/api/v1/statistics/'+period+'?'+params,signal);
 if(!isStatisticsResult(data)||data.metric!==metric||data.aggregation!==aggregation)
  throw new Error('Neplatná odpověď statistiky');
 return data;
}

export async function getHistoryInterval(
 metric:string,from:string,to:string,resolution:'raw'|'hourly'|'daily',
 signal?:AbortSignal
):Promise<HistoryResponse>{
 if(!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(metric))throw new Error('Neplatná veličina');
 if(!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||Date.parse(from)>=Date.parse(to))
  throw new Error('Neplatný časový rozsah');
 const query=new URLSearchParams({metric,from,to,resolution,units:'metricwx',dataset:'original',limit:'1000'});
 const data=await request('/api/v1/history?'+query,signal);
 if(!isHistoryResponse(data)||data.metric!==metric||data.resolution!==resolution)
  throw new Error('Neplatný formát agregované historie');
 return data;
}

export async function getStationCapabilities(signal?:AbortSignal):Promise<string[]>{
 const data=await request('/api/v1/station',signal) as {schemaVersion?:string;capabilities?:unknown};
 return data.schemaVersion==='1'&&Array.isArray(data.capabilities)
  ?data.capabilities.filter((item):item is string=>typeof item==='string'):[];
}


export interface AuditedSensor {
 id:string; metric:string; displayName:string;
 status:'active'|'unavailable'|'not_installed'|'retired'|'unknown';
 enabled:boolean; lastObservedAt:string|null; validFrom:string|null; validTo:string|null;
 depthCm:number|null;source:string;confidence:'verified'|'provisional'|'unknown';note:string|null;
}
export async function getSensorInventory(signal?:AbortSignal):Promise<AuditedSensor[]>{
 const data=await request('/api/v1/sensors',signal) as {schemaVersion?:unknown;sensors?:unknown};
 if(data.schemaVersion!=='1'||!Array.isArray(data.sensors))
  throw new Error('Neplatný inventář senzorů');
 return data.sensors.filter((s):s is AuditedSensor=>
  s!==null&&typeof s==='object'&&typeof s.id==='string'&&typeof s.displayName==='string'&&
  typeof s.status==='string'&&typeof s.metric==='string'&&
  (s.confidence==='verified'||s.confidence==='provisional'||s.confidence==='unknown'));
}
export interface CameraStatus {
 cameraId:'west'; status:'fresh'|'stale'|'unavailable'|'disabled';
 capturedAt:string|null; publishedAt:string|null; latestUrl:string|null;
 ageSeconds:number|null;width:number|null;height:number|null;privacyMaskApplied:boolean|null;
}
export async function getCameraStatus(signal?:AbortSignal):Promise<CameraStatus>{
 const d=await request('/api/v1/camera/status',signal) as Partial<CameraStatus>;
 if(d.cameraId!=='west'||!['fresh','stale','unavailable','disabled'].includes(d.status??''))
  throw new Error('Neplatný status kamery');
 return d as CameraStatus;
}

/** A read-only multi-year view, not a QC approval or a replacement database. */
export interface ConsolidatedAnnualYear {
 year:number;calendarDays:number;elapsedDays:number;sourceRows:number;
 validDays:number;invalidDays:number;missingDays:number;
 completenessFraction:number|null;timeCoverageFraction:number|null;
 value:number|null;unit:string;method:'time_weighted_mean'|'sum'|'minimum'|'maximum';
 periodStatus:'in_progress'|'finished';qcStatus:'original_unverified';source:'weewx_daily';
}
export interface AnnualMatrix {
 schemaVersion:'1';metric:string;aggregation:'mean'|'sum'|'min'|'max';
 units:string;dataset:'original';source:'weewx_daily';qcStatus:'original_unverified';
 startsAt:string;endsBefore:string;dataRevision:string;
 years:ConsolidatedAnnualYear[];
}
export async function getAnnualMatrix(metric:string,signal?:AbortSignal):Promise<AnnualMatrix>{
 const {isComparisonMetric}=await import('../domain/year-comparison');
 if(!isComparisonMetric(metric))throw new Error('Nepodporovaná srovnávací veličina');
 const params=new URLSearchParams({metric,units:'metricwx',dataset:'original'});
 const result=await request('/api/v1/climate/annual-matrix?'+params,signal) as Partial<AnnualMatrix>;
 if(result.schemaVersion!=='1'||result.metric!==metric||result.dataset!=='original'||
  result.qcStatus!=='original_unverified'||!Array.isArray(result.years)||
  result.years.length>100||result.years.some(year=>
   !Number.isInteger(year.year)||year.year<2009||
   !Number.isInteger(year.elapsedDays)||year.elapsedDays<0||year.elapsedDays>366||
   !Number.isInteger(year.validDays)||year.validDays<0||year.validDays>year.elapsedDays||
   year.value!==null&&(typeof year.value!=='number'||!Number.isFinite(year.value))||
   year.qcStatus!=='original_unverified'
  ))
  throw new Error('Neplatná roční konsolidace');
 return result as AnnualMatrix;
}
