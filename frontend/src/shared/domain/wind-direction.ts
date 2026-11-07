/**
 * Meteorological bearings specify WHERE the wind comes FROM (0° = north).
 * Pure presentation helpers: no device access, no conversion of missing to zero.
 */
export const windSectorsLong=[
 'severní','severoseverovýchodní','severovýchodní','východoseverovýchodní',
 'východní','východojihovýchodní','jihovýchodní','jihojihovýchodní',
 'jižní','jihojihozápadní','jihozápadní','západojihozápadní',
 'západní','západoseverozápadní','severozápadní','severoseverozápadní'
] as const;
export const windSectorsShort=[
 'S','SSV','SV','VSV','V','VJV','JV','JJV','J','JJZ','JZ','ZJZ','Z','ZSZ','SZ','SSZ'
] as const;

export function describeWindFrom(value:number):{
 degrees:number;rounded:number;long:string;short:string
}|null{
 if(!Number.isFinite(value))return null;
 const degrees=((value%360)+360)%360;
 const rounded=Math.round(degrees)%360;
 const sector=Math.round(degrees/22.5)%16;
 return {degrees,rounded,long:windSectorsLong[sector],short:windSectorsShort[sector]};
}

/** Rotate in the shortest direction through north, without a full 359° spin. */
export function nearestWindRotation(previous:number|null,next:number):number{
 if(previous===null)return next;
 const normalized=((previous%360)+360)%360;
 const delta=((next-normalized+540)%360)-180;
 return previous+delta;
}
