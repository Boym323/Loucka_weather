/** Bounded read-only weather archive adapter. End timestamp is UTC epoch seconds. */
import type {Metric} from './metrics.js';
export type ArchiveRow={
  dateTime:number;
  usUnits:number;
  interval:number;
} & Partial<Record<Metric,number|null>>;
export type DailySummaryRow={dateTime:number;usUnits:number;min:number|null;mintime:number|null;max:number|null;
  maxtime:number|null;sum:number|null;count:number|null;wsum:number|null;sumtime:number|null;
  xsum?:number|null;ysum?:number|null;dirsumtime?:number|null;max_dir?:number|null};
export type TelemetryReading={column:string;dateTime:number;value:number};
export type SensorPresence={metric:string;count:number;lastObservedAt:number|null};
export type SolarYear={records:number;validRecords:number;validMinutes:number;energyKwhM2:number|null};
export interface ArchiveReader {
  latest(asOfEpoch:number):Promise<ArchiveRow|null>;
  history(metric:Metric,fromExclusive:number,toInclusive:number,limit:number):Promise<ArchiveRow[]>;
  historyPage?(selectedMetrics:Metric[],fromExclusive:number,toInclusive:number,afterExclusive:number,limit:number):Promise<ArchiveRow[]>;
  dailySummaries?(metric:Metric,fromInclusive:number,toExclusive:number,limit:number):Promise<DailySummaryRow[]>;
  archiveWindow?(fromInclusive:number,toInclusive:number,limit:number):Promise<ArchiveRow[]>;
  archiveAfter?(afterExclusive:number,toInclusive:number,limit:number):Promise<ArchiveRow[]>;
  telemetrySnapshot?(asOfEpoch:number):Promise<TelemetryReading[]>;
  sensorPresence?(fromExclusive:number,toInclusive:number):Promise<SensorPresence[]>;
  solarYear?(startExclusive:number,endInclusive:number):Promise<SolarYear>;
  ping():Promise<void>;
  close?():Promise<void>;
}
