/** Contract for one bounded, read-only latest-archive query. */
export interface ArchiveRow {
  dateTime: number;
  usUnits: number;
  interval: number;
  outTemp: number | null;
  rain: number | null;
  windSpeed: number | null;
  barometer: number | null;
}
export interface ArchiveReader {
  latest(asOfEpoch: number): Promise<ArchiveRow | null>;
  ping(): Promise<void>;
  close?(): Promise<void>;
}
