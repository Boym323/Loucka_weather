/**
 * WeeWX daily summary coverage by Prague LOCAL calendar day.
 * Pure functions: never create or change database records.
 */
const clock=new Intl.DateTimeFormat('en-CA',{
 timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit',
 hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
});

export function localMidnight(date){
 if(!/^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date))
  throw Error('INVALID_DAY');
 const [year,month,day]=date.split('-').map(Number);
 if(new Date(Date.UTC(year,month-1,day)).toISOString().slice(0,10)!==date)
  throw Error('INVALID_DAY');
 const target=Date.UTC(year,month-1,day);
 let guess=target;
 for(let i=0;i<3;i++){
  const p=Object.fromEntries(clock.formatToParts(new Date(guess))
   .map(part=>[part.type,part.value]));
  const local=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),
   Number(p.hour),Number(p.minute),Number(p.second));
  guess+=target-local;
 }
 return Math.floor(guess/1000);
}

export function calendarDays(year=2025){
 if(!Number.isInteger(year)||year<2009||year>2026)throw Error('UNSUPPORTED_YEAR');
 const days=(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/86400000;
 const labels=Array.from({length:days},(_,i)=>
  new Date(Date.UTC(year,0,i+1)).toISOString().slice(0,10));
 const entries=labels.map(label=>({day:label,dateTime:localMidnight(label)}));
 const end=localMidnight(String(year+1)+'-01-01');
 return {year,entries,end,days};
}

export function dailyCoverage(rows,metric,calendar=calendarDays()){
 if(!Array.isArray(rows)||rows.length>calendar.days+1)
  throw Error('INVALID_ROW_SET');
 const table=new Map(calendar.entries.map((entry,i)=>[entry.dateTime,{
  label:entry.day,duration:i+1<calendar.entries.length
   ?calendar.entries[i+1].dateTime-entry.dateTime
   :calendar.end-entry.dateTime
 }]));
 const found=new Set(),zeroSampleDates=[],overCoveredDates=[];
 let previous=-1;
 for(const row of rows){
  const timestamp=Number(row?.dateTime);
  if(!Number.isSafeInteger(timestamp)||timestamp<=previous||
     !table.has(timestamp)||found.has(timestamp))throw Error('INVALID_DAILY_BOUNDARY');
  previous=timestamp;
  found.add(timestamp);
  const {label,duration}=table.get(timestamp);
  if(row.count!==null&&row.count!==undefined&&Number(row.count)===0)
   zeroSampleDates.push(label);
  const seconds=Number(row.sumtime);
  if(row.sumtime!==null&&row.sumtime!==undefined&&
     Number.isFinite(seconds)&&seconds>duration+1)
   overCoveredDates.push({date:label,excessSeconds:Math.round(seconds-duration)});
 }
 const missingDates=calendar.entries
  .filter(entry=>!found.has(entry.dateTime)).map(entry=>entry.day);
 return {metric,expectedDays:calendar.days,returnedRows:rows.length,
  missingDates,zeroSampleDates,overCoveredDates};
}

export function sharedMissingDates(results){
 if(!Array.isArray(results)||results.length===0)return [];
 const [first,...rest]=results;
 return first.missingDates.filter(day=>rest.every(r=>r.missingDates.includes(day)));
}
