export type ReadingQuality = 'measured' | 'derived' | 'reconstructed' | 'suspect' | 'missing' | 'sensor_error' | 'unverified';
export interface Reading {
  value: number | null;
  unit: string;
  quality: ReadingQuality;
  source: string;
  provenance: string | null;
}
export interface CurrentResponse {
  schemaVersion: '1';
  observedAt: string;
  stale: boolean;
  readings: Record<string, Reading | undefined>;
  units: 'us' | 'metric' | 'metricwx';
  dataset: 'original' | 'approved';
  dataRevision: string;
}
export interface HistoryPoint {
  startTime: string;
  endTime: string;
  value: number | null;
  quality: ReadingQuality;
  source: string;
  provenance: string | null;
  minValue?: number | null;
  maxValue?: number | null;
  minObservedAt?: string | null;
  maxObservedAt?: string | null;
  validCount?: number;
}
export interface HistoryResponse {
  schemaVersion: '1';
  metric: string;
  unit: string;
  points: HistoryPoint[];
  resolution: 'raw' | 'hourly' | 'daily';
  aggregation?: string;
  completeness?: { expected: number | null; valid: number; fraction: number | null };
  dataRevision: string;
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const nonempty=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const nullableNumber=(v:unknown)=>v===null||finite(v);
const timestamp=(v:unknown):v is string=>typeof v==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
const count=(v:unknown)=>finite(v)&&Number.isSafeInteger(v)&&v>=0;
const qualities=new Set<unknown>(['measured','derived','reconstructed','suspect','missing','sensor_error','unverified']);
function validObservation(v:unknown):v is Record<string,unknown>{
 return record(v)&&nullableNumber(v.value)&&qualities.has(v.quality)&&
  nonempty(v.source)&&(v.provenance===null||nonempty(v.provenance))&&
  (!['missing','sensor_error','unverified'].includes(v.quality as string)||v.value===null);
}
export function isCurrentResponse(data: unknown): data is CurrentResponse {
 return record(data)&&data.schemaVersion==='1'&&timestamp(data.observedAt)&&
  typeof data.stale==='boolean'&&record(data.readings)&&
  typeof data.units==='string'&&['us','metric','metricwx'].includes(data.units)&&
  (data.dataset==='original'||data.dataset==='approved')&&nonempty(data.dataRevision)&&
  Object.values(data.readings).every(v=>validObservation(v)&&nonempty(v.unit));
}
function validHistoryPoint(v:unknown):boolean{
 return validObservation(v)&&timestamp(v.startTime)&&timestamp(v.endTime)&&Date.parse(v.startTime)<Date.parse(v.endTime)&&
  (v.minValue===undefined||nullableNumber(v.minValue))&&(v.maxValue===undefined||nullableNumber(v.maxValue))&&
  (v.minObservedAt===undefined||v.minObservedAt===null||timestamp(v.minObservedAt))&&
  (v.maxObservedAt===undefined||v.maxObservedAt===null||timestamp(v.maxObservedAt))&&
  (v.validCount===undefined||count(v.validCount));
}
export function isHistoryResponse(data: unknown): data is HistoryResponse {
 if(!record(data)||data.schemaVersion!=='1'||!nonempty(data.metric)||!nonempty(data.unit)||
  !nonempty(data.dataRevision)||typeof data.resolution!=='string'||!['raw','hourly','daily'].includes(data.resolution)||
  !Array.isArray(data.points)||!data.points.every(validHistoryPoint))return false;
 const c=data.completeness;
 return c===undefined||(record(c)&&count(c.valid)&&(c.expected===null||count(c.expected))&&
  (c.fraction===null||finite(c.fraction)&&c.fraction>=0&&c.fraction<=1));
}
export function formatTimestamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'Neznámý čas';
  return new Intl.DateTimeFormat('cs-CZ', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Prague'
  }).format(parsed);
}
