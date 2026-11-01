/** Bounded read-only weather archive adapter. End timestamp is UTC epoch seconds. */
import type {Metric} from './metrics.js';
export type ArchiveRow={
  dateTime:number;
  usUnits:number;
  interval:number;
} & Partial<Record<Metric,number|null>>;
export interface ArchiveReader {
  latest(asOfEpoch:number):Promise<ArchiveRow|null>;
  history(metric:Metric,fromExclusive:number,toInclusive:number,limit:number):Promise<ArchiveRow[]>;
  ping():Promise<void>;
  close?():Promise<void>;
}
