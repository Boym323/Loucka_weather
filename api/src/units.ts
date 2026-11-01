import { metrics,metricNames } from './metrics.js';
import type { Metric } from './metrics.js';
import type { ArchiveRow } from './store.js';

export type OutputUnits='us'|'metric'|'metricwx';
export const outputModes=['us','metric','metricwx'] as const;
type Source=1|16|17;
const inHg=33.8638866667;
const factors:Record<string,Record<string,number>>={
 rain:{inch:25.4,cm:10,mm:1},
 rainrate:{inch_per_h:25.4,cm_per_h:10,mm_per_h:1},
 speed:{mph:0.44704,km_per_h:1/3.6,m_per_s:1},
 pressure:{inHg,hPa:1},
 altitude:{ft:0.3048,m:1},
 distance:{mi:1.609344,km:1}
};
export type Reading={
 value:number|null; unit:string; quality:'measured'|'missing';
 source:'weewx_archive'; provenance:null; sourceUsUnits:Source;
};
export class UnsupportedSourceError extends Error {}
export function converted(metric:Metric,value:number|null|undefined,source:number,target:OutputUnits):Reading{
 if(source!==1&&source!==16&&source!==17)throw new UnsupportedSourceError('Unsupported WeeWX usUnits');
 if(!outputModes.includes(target))throw new UnsupportedSourceError('Unknown output mode');
 const metadata=metrics[metric];
 // Metadata comes only from generated public catalogue.
 const sourceUnit=metadata.sources[String(source) as keyof typeof metadata.sources];
 const unit=metadata.outputs[target];
 if(sourceUnit===undefined||unit===undefined)throw new UnsupportedSourceError('Unsupported unit mapping');
 const v=value===undefined?null:value;
 if(v!==null && (typeof v!=='number'||!Number.isFinite(v)))throw new UnsupportedSourceError('Nonfinite measurement');
 let number=v;
 if(number!==null && unit!==sourceUnit){
   if(metadata.group==='temperature'){
     const celsius=sourceUnit==='degF'?(number-32)*5/9:number;
     number=unit==='degF'?celsius*9/5+32:celsius;
   }else{
     const group=factors[metadata.group];
     const from=group?.[sourceUnit],to=group?.[unit];
     if(from===undefined||to===undefined)throw new UnsupportedSourceError('Unit group mismatch');
     number=number*from/to;
   }
   if(!Number.isFinite(number))throw new UnsupportedSourceError('Numeric overflow');
 }
 return {value:number,unit,quality:number===null?'missing':'measured',
   source:'weewx_archive',provenance:null,sourceUsUnits:source};
}
export function readingsFromRow(row:ArchiveRow,target:OutputUnits){
 const readings:Partial<Record<Metric,Reading>>={};
 for(const name of metricNames)readings[name]=converted(name,row[name],row.usUnits,target);
 return readings;
}
export function outputUnit(metric:Metric,output:OutputUnits):string {return metrics[metric].outputs[output];}
