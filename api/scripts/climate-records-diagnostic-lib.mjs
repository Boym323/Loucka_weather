// Read-only staging diagnostics for climate records. No SQL writes or weather values in output.
const metrics=['outTemp','rain','windGust'];
const pragueDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',
 year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',
 second:'2-digit',hourCycle:'h23'});
const pragueDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',
 year:'numeric',month:'2-digit',day:'2-digit'});
const localDateAt=seconds=>pragueDay.format(new Date(seconds*1000));
const localMidnight=date=>{
 const [year,month,day]=date.split('-').map(Number);
 const desired=Date.UTC(year,month-1,day);
 let guess=desired;
 for(let i=0;i<3;i++){
  const p=Object.fromEntries(pragueDate.formatToParts(new Date(guess))
   .map(part=>[part.type,part.value]));
  const local=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),
   Number(p.hour),Number(p.minute),Number(p.second));
  guess+=desired-local;
 }
 return Math.floor(guess/1000);
};
const round=value=>Math.round(value*100)/100;
const safeCode=error=>{
 const code=error&&typeof error==='object'&&'code' in error?error.code:null;
 return typeof code==='string'&&/^ER_[A-Z0-9_]{2,48}$/.test(code)?
  code:'UNCLASSIFIED';
};
const safeMonth=row=>
 Number.isSafeInteger(row?.dateTime)&&row.dateTime>=0?
  localDateAt(row.dateTime).slice(0,7):'invalid';
function validateRows(rows,start,end,days){
 if(rows.length>days)return {status:'invalid',reason:'too_many_days',firstMonth:null};
 let previous=-1;
 for(const row of rows){
  if(!Number.isSafeInteger(row?.dateTime))
   return {status:'invalid',reason:'invalid_timestamp',firstMonth:'invalid'};
  if(row.dateTime<=previous)
   return {status:'invalid',reason:'unordered_or_duplicate',firstMonth:safeMonth(row)};
  if(row.dateTime<start||row.dateTime>=end)
   return {status:'invalid',reason:'outside_calendar_range',firstMonth:safeMonth(row)};
  if(localMidnight(localDateAt(row.dateTime))!==row.dateTime)
   return {status:'invalid',reason:'not_local_midnight',firstMonth:safeMonth(row)};
  previous=row.dateTime;
 }
 return {status:'ok',reason:null,firstMonth:null};
}
export async function probeClimateRecords(reader,compute,clock=new Date()){
 if(!reader||typeof reader.dailySummaries!=='function'||typeof compute!=='function'||
  !Number.isFinite(clock?.getTime?.()))throw Error('Invalid diagnostic dependencies');
 const from='2009-01-01',toExclusive=localDateAt(Math.floor(clock.getTime()/1000));
 const start=localMidnight(from),end=localMidnight(toExclusive);
 const days=Math.round((Date.parse(toExclusive+'T00:00:00Z')-
  Date.parse(from+'T00:00:00Z'))/86400000);
 if(days<1||days>7500||end<=start)throw Error('Invalid bounded calendar');
 const reads=await Promise.all(metrics.map(async metric=>{
  const begun=performance.now();
  try{
   const rows=await reader.dailySummaries(metric,start,end,days+1);
   if(!Array.isArray(rows))return {metric,status:'invalid_result',
    elapsedMs:round(performance.now()-begun),rows:null,
    diagnostic:{reason:'not_array',firstMonth:null}};
   const v=validateRows(rows,start,end,days);
   return {metric,status:v.status,elapsedMs:round(performance.now()-begun),
    rows,diagnostic:v};
  }catch(error){
   return {metric,status:'read_failed',elapsedMs:round(performance.now()-begun),
    rows:null,diagnostic:{reason:'database_read_failed',
     code:safeCode(error),firstMonth:null}};
  }
 }));
 const checks=reads.map(item=>({
  metric:item.metric,status:item.status,elapsedMs:item.elapsedMs,
  rowCount:item.rows?.length??null,
  ...(item.diagnostic.reason?{reason:item.diagnostic.reason}:{}),
  ...(item.diagnostic.code?{errorCode:item.diagnostic.code}:{}),
  ...(item.diagnostic.firstMonth?{firstAffectedMonth:item.diagnostic.firstMonth}:{})
 }));
 let stage='complete',passed=reads.every(item=>item.status==='ok');
 if(!passed)stage=reads.some(item=>item.status==='read_failed')?'daily_summary_read':
  'calendar_validation';
 let computeElapsedMs=null;
 if(passed){
  const started=performance.now();
  try{
   const output=compute({temperature:reads[0].rows,rain:reads[1].rows,
    gust:reads[2].rows,from,toExclusive,calendarDays:days,
    todayMonthDay:toExclusive.slice(5)});
   if(!output||output.status!=='preliminary')throw Error('Invalid record result');
   computeElapsedMs=round(performance.now()-started);
  }catch{
   computeElapsedMs=round(performance.now()-started);
   passed=false;stage='record_computation';
  }
 }
 return {schemaVersion:'1',stagingOnly:true,readOnly:true,
  source:'active_api_database_credentials',dateRange:{from,toExclusive},
  limitPerMetric:days+1,passed,stage,metrics:checks,computeElapsedMs,
  caution:'A single bounded SELECT-only probe cannot certify SQL performance, backups or historical data quality.'};
}
