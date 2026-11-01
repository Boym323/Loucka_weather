import type { ArchiveRow } from './store.js';

export type OutputUnits = 'us' | 'metric' | 'metricwx';
export type SampleMetric = 'outTemp' | 'rain' | 'windSpeed' | 'barometer';
type Reading = {
  value: number | null;
  unit: string;
  quality: 'measured' | 'missing';
  source: 'weewx_archive';
  provenance: null;
  sourceUsUnits: 1 | 16 | 17;
};

const UNIT: Record<SampleMetric, Record<OutputUnits,string>> = {
  outTemp: {us:'degF',metric:'degC',metricwx:'degC'},
  rain: {us:'inch',metric:'cm',metricwx:'mm'},
  windSpeed: {us:'mph',metric:'km_per_h',metricwx:'m_per_s'},
  barometer: {us:'inHg',metric:'hPa',metricwx:'hPa'}
};
const HPA_PER_INHG=33.8638866667;
export function converted(metric: SampleMetric, value: number|null, source: number, target: OutputUnits): Reading {
  if (![1,16,17].includes(source)) throw new Error('Unsupported WeeWX source usUnits');
  if (value!==null && !Number.isFinite(value)) throw new Error('Invalid numeric source measurement');
  let v=value;
  if(v!==null){
    if(metric==='outTemp') {
      const c=source===1?(v-32)*5/9:v;
      v=target==='us'?c*9/5+32:c;
    } else if(metric==='rain'){
      const mm=source===1?v*25.4:source===16?v*10:v;
      v=target==='us'?mm/25.4:target==='metric'?mm/10:mm;
    } else if(metric==='windSpeed'){
      const ms=source===1?v*0.44704:source===16?v/3.6:v;
      v=target==='us'?ms/0.44704:target==='metric'?ms*3.6:ms;
    } else {
      const hpa=source===1?v*HPA_PER_INHG:v;
      v=target==='us'?hpa/HPA_PER_INHG:hpa;
    }
  }
  if(v!==null && !Number.isFinite(v))throw new Error('Numeric overflow');
  return {value:v, unit:UNIT[metric][target],quality:v===null?'missing':'measured',
          source:'weewx_archive',provenance:null,sourceUsUnits:source as 1|16|17};
}
export function readingsFromRow(row: ArchiveRow, target:OutputUnits): Record<SampleMetric,Reading> {
  return {
    outTemp:converted('outTemp',row.outTemp,row.usUnits,target),
    rain:converted('rain',row.rain,row.usUnits,target),
    windSpeed:converted('windSpeed',row.windSpeed,row.usUnits,target),
    barometer:converted('barometer',row.barometer,row.usUnits,target)
  };
}
