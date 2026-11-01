export type ReadingQuality = 'measured' | 'derived' | 'reconstructed' | 'suspect' | 'missing';
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
export function isCurrentResponse(data: unknown): data is CurrentResponse {
  if (data === null || typeof data !== 'object') return false;
  const value = data as Record<string, unknown>;
  return value.schemaVersion === '1' &&
    typeof value.observedAt === 'string' &&
    typeof value.stale === 'boolean' &&
    value.readings !== null && typeof value.readings === 'object' &&
    typeof value.dataRevision === 'string';
}
export function isHistoryResponse(data: unknown): data is HistoryResponse {
  if (data === null || typeof data !== 'object') return false;
  const value = data as Record<string, unknown>;
  return value.schemaVersion === '1' && typeof value.metric === 'string' &&
    typeof value.unit === 'string' && Array.isArray(value.points);
}
export function formatTimestamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'Neznámý čas';
  return new Intl.DateTimeFormat('cs-CZ', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Prague'
  }).format(parsed);
}
