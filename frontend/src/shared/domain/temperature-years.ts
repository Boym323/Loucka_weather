/** Calendar-day overlays for all available temperature years, never fill missing with 0. */
export type TemperatureDay={
 date:string;year:number;monthDay:string;value:number|null;
 validSeconds:number|null;expectedSeconds:number;
 quality:'derived'|'partial'|'missing'|'suspect';
};
export type TemperatureYears={
 schemaVersion:'1';metric:'outTemp';unit:'°C';dataset:'original';
 source:'weewx_daily';qcStatus:'original_unverified';
 firstYear:number;endsBefore:string;dataRevision:string;points:TemperatureDay[];
};
export type TemperatureResolution='daily'|'monthly';
export const monthLabels=['Led','Úno','Bře','Dub','Kvě','Čvn','Čvc','Srp','Zář','Říj','Lis','Pro'] as const;
export const calendarKeys=Array.from({length:366},(_,i)=>{
 const d=new Date(Date.UTC(2024,0,i+1));
 return String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
});
export type TemperatureOverlay={
 keys:string[];years:number[];
 values:Map<number,(number|null)[]>;
 validDays:Map<number,number>;
 average:(number|null)[];minimum:(number|null)[];maximum:(number|null)[];
 baselineYears:number[];
};
/** Stable alignment by MM-DD: 29 February is never silently shifted to March. */
export function overlayTemperatureYears(
 payload:TemperatureYears,resolution:TemperatureResolution
):TemperatureOverlay{
 const currentYear=Number(payload.endsBefore.slice(0,4));
 const years=Array.from({length:currentYear-payload.firstYear+1},(_,i)=>payload.firstYear+i);
 if(years.length<1||years.length>100)throw new Error('Invalid temperature year horizon');
 const perYear=new Map<number,Map<string,TemperatureDay>>();
 for(const y of years)perYear.set(y,new Map());
 let lastDate='';
 for(const point of payload.points){
  if(point.date<=lastDate)throw new Error('Duplicate or unsorted temperature dates');
  lastDate=point.date;
  if(!perYear.has(point.year)||point.date!==point.year+'-'+point.monthDay)
   throw new Error('Date outside temperature years');
  perYear.get(point.year)!.set(point.monthDay,point);
 }
 const keys=resolution==='daily'?[...calendarKeys]:Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0'));
 const values=new Map<number,(number|null)[]>();
 const validDays=new Map<number,number>();
 for(const year of years){
  const daily=perYear.get(year)!;
  validDays.set(year,[...daily.values()].filter(d=>d.value!==null&&Number.isFinite(d.value)).length);
  if(resolution==='daily'){
   values.set(year,keys.map(key=>daily.get(key)?.value??null));
   continue;
  }
  values.set(year,keys.map(month=>{
   let weighted=0,seconds=0,expected=0;
   const days=new Date(Date.UTC(year,Number(month),0)).getUTCDate();
   for(let date=1;date<=days;date++){
    const key=month+'-'+String(date).padStart(2,'0');
    const record=daily.get(key);
    // Missing days count as zero coverage, not zero temperature.
    expected+=record?.expectedSeconds??86400;
    if(record?.value!==null&&record?.value!==undefined&&
     record.validSeconds!==null&&record.validSeconds>0){
     weighted+=record.value*record.validSeconds;
     seconds+=record.validSeconds;
    }
   }
   // A one-day fragment cannot masquerade as a representative monthly mean.
   return seconds>0&&seconds/expected>=0.5?weighted/seconds:null;
  }));
 }
 // Exclude the current unfinished year from the comparison baseline.
 const baselineYears=years.filter(y=>y<currentYear);
 const average:number[]=[],minimum:number[]=[],maximum:number[]=[];
 for(let i=0;i<keys.length;i++){
  const found=baselineYears.map(y=>values.get(y)![i]).filter(
   (v):v is number=>typeof v==='number'&&Number.isFinite(v)
  );
  // Require multiple independent years before claiming an indicative baseline.
  average.push(found.length>=3?found.reduce((s,v)=>s+v,0)/found.length:NaN);
  minimum.push(found.length>=3?Math.min(...found):NaN);
  maximum.push(found.length>=3?Math.max(...found):NaN);
 }
 const nullFromNan=(v:number)=>Number.isFinite(v)?v:null;
 return {keys,years,values,validDays,baselineYears,
  average:average.map(nullFromNan),minimum:minimum.map(nullFromNan),
  maximum:maximum.map(nullFromNan)};
}
export function hasValidTemperature(value:unknown):value is number{
 return typeof value==='number'&&Number.isFinite(value);
}
