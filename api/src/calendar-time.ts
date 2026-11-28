const datePattern=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
export function epoch(raw:string):number|null{
 if(!datePattern.test(raw))return null;
 // Date.parse accepts and normalizes impossible dates (for example February 30).
 // Validate the calendar components before converting the RFC3339 instant.
 const parts=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(raw);
 if(!parts)return null;
 const [,year,month,day,hour,minute,second,,sign,offsetHour,offsetMinute]=parts;
 const y=Number(year),m=Number(month),d=Number(day),h=Number(hour),mi=Number(minute),s=Number(second);
 const maxDay=new Date(Date.UTC(y,m,0)).getUTCDate();
 if(m<1||m>12||d<1||d>maxDay||h>23||mi>59||s>59)return null;
 if(sign&&(Number(offsetHour)>23||Number(offsetMinute)>59))return null;
 const millis=Date.parse(raw);
 return Number.isFinite(millis)&&millis>=0?Math.floor(millis/1000):null;
}
const pragueDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const pragueDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',
 year:'numeric',month:'2-digit',day:'2-digit'});
// Bounded memoization saves three costly timezone conversions per archived day.
// Keep the small set of day boundaries across 20-minute records refreshes.
const midnightCache=new Map<string,number>();
const MAX_MIDNIGHT_CACHE=8000;
export function localMidnight(date:string):number|null{
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
 if(!match)return null;
 const y=Number(match[1]),m=Number(match[2]),d=Number(match[3]);
 if(y<2009||y>2101||m<1||m>12||d<1||d>new Date(Date.UTC(y,m,0)).getUTCDate())return null;
 const cached=midnightCache.get(date);
 if(cached!==undefined)return cached;
 const desired=Date.UTC(y,m-1,d);
 let guess=desired;
 for(let i=0;i<3;i++){
  const parts=Object.fromEntries(pragueDate.formatToParts(new Date(guess)).map(p=>[p.type,p.value]));
  const localAsUtc=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));
  guess+=desired-localAsUtc;
 }
 const result=Math.floor(guess/1000);
 midnightCache.set(date,result);
 if(midnightCache.size>MAX_MIDNIGHT_CACHE){
  const first=midnightCache.keys().next().value;
  if(first!==undefined)midnightCache.delete(first);
 }
 return result;
}
export function localDateAt(epochSeconds:number):string{
 return pragueDay.format(new Date(epochSeconds*1000));
}
export function nextLocalDate(date:string):string{
 const [year=0,month=1,day=1]=date.split('-').map(Number);
 return new Date(Date.UTC(year,month-1,day+1)).toISOString().slice(0,10);
}
export function hourlyBucketCount(from:number,to:number):number{
 return Math.floor((to-1)/3600)-Math.floor(from/3600)+1;
}
export function dailyBucketCount(from:number,to:number):number{
 const first=localDateAt(from),last=localDateAt(to-1);
 return Math.floor((Date.parse(`${last}T00:00:00Z`)-Date.parse(`${first}T00:00:00Z`))/86400000)+1;
}
export function localDayAligned(from:number,to:number):boolean{
 return localMidnight(localDateAt(from))===from&&localMidnight(localDateAt(to))===to;
}

export function utcIso(seconds:number):string{return new Date(seconds*1000).toISOString();}
export function utcHourStart(endEpoch:number):number{return Math.floor((endEpoch-1)/3600)*3600;}
