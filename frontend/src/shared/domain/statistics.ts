export type Aggregation = 'mean' | 'min' | 'max' | 'sum' | 'count' | 'vecdir' | 'dir_at_max';
export type StatsPeriod = 'daily' | 'monthly' | 'yearly';
export interface StatisticsResult {
 schemaVersion: '1';
 metric: string;
 aggregation: Aggregation;
 unit: string;
 units: string;
 value: number | null;
 quality: 'derived' | 'missing';
 source: string;
 provenance: string | null;
 dataRevision: string;
 completeness: { expected: number | null; valid: number; fraction: number | null };
 extremaObservedAt: string | null;
 extremaSource: string;
}
export function isStatisticsResult(data: unknown): data is StatisticsResult {
 if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
 const value = data as Record<string,unknown>;
 return value.schemaVersion === '1' &&
  typeof value.metric === 'string' &&
  typeof value.aggregation === 'string' &&
  (value.value === null || typeof value.value === 'number' && Number.isFinite(value.value)) &&
  typeof value.unit === 'string' &&
  typeof value.dataRevision === 'string' &&
  typeof value.completeness === 'object' && value.completeness !== null;
}
/** Date at local midnight in Europe/Prague as UTC ISO instant, including DST. */
export function pragueMidnightIso(localDate: string): string {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) throw new Error('Neplatné datum');
 const [year,month,day]=localDate.split('-').map(Number);
 const desired=Date.UTC(year,month-1,day);
 if (new Date(desired).toISOString().slice(0,10)!==localDate) throw new Error('Neplatné datum');
 const formatter=new Intl.DateTimeFormat('en-CA',{
  timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
 });
 let guess=desired;
 for(let i=0;i<4;i++){
  const parts=Object.fromEntries(formatter.formatToParts(new Date(guess)).map(p=>[p.type,p.value]));
  const localAsUtc=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),
   Number(parts.hour),Number(parts.minute),Number(parts.second));
  guess+=desired-localAsUtc;
 }
 return new Date(guess).toISOString();
}
export function nextDate(localDate:string,days=1):string{
 const [y,m,d]=localDate.split('-').map(Number);
 return new Date(Date.UTC(y,m-1,d+days)).toISOString().slice(0,10);
}
export const qualitySupported = (data:StatisticsResult): boolean =>
 data.value !== null && data.quality !== 'missing' && data.completeness.valid > 0;
