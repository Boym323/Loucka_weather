import { isCurrentResponse, isHistoryResponse } from '../domain/weather';
import type { CurrentResponse, HistoryResponse } from '../domain/weather';
import { getMetric } from '../domain/metrics';

async function request(path: string, signal?: AbortSignal): Promise<unknown> {
 const response=await fetch(path,{signal,headers:{Accept:'application/json'},credentials:'same-origin'});
 if(!response.ok)throw new Error('API HTTP '+response.status);
 return response.json() as Promise<unknown>;
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
