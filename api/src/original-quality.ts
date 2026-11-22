/** Read-only, fail-closed per-variable quality overlay for ORIGINAL WeeWX data.
 *
 * No approved reconstruction is connected here. No original observation becomes
 * MEASURED, CORRECTED or ESTIMATED just because it is stored in the archive.
 * UTC end timestamps and literal NULL vs numeric zero are preserved.
 */
import type {ArchiveRow} from './store.js';
import type {Metric} from './metrics.js';
import {publiclySafeReading} from './units.js';
import type {OutputUnits} from './units.js';

export type OriginalFieldState='UNVERIFIED'|'MISSING'|'SENSOR_ERROR';
const localFormatter=new Intl.DateTimeFormat('en-GB',{
 timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit',
 hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
 timeZoneName:'longOffset'
});
function localParts(unixSeconds:number){
 const parts=Object.fromEntries(localFormatter.formatToParts(new Date(unixSeconds*1000))
   .map(p=>[p.type,p.value]));
 const offset=(parts.timeZoneName??'GMT+00:00').replace('GMT','')||'+00:00';
 const wall=[parts.year,parts.month,parts.day,parts.hour,parts.minute,parts.second].join('-');
 const iso=parts.year+'-'+parts.month+'-'+parts.day+'T'+parts.hour+':'+parts.minute+':'+parts.second+offset;
 return {wall,iso,offset};
}
function localEnd(unixSeconds:number){
 const current=localParts(unixSeconds);
 const previous=localParts(unixSeconds-3600);
 return {iso:current.iso,fold:Number(current.wall===previous.wall&&current.offset!==previous.offset)};
}
function utcIso(unixSeconds:number):string{
 return new Date(unixSeconds*1000).toISOString();
}
export type OriginalFieldResult={
 schema:'loucka-field-qc-v1';
 timestampUtc:number;endTime:string;localEndIso:string;localFold:number;
 variable:Metric;unit:string;sourceUsUnits:number;
 state:OriginalFieldState;measurementValue:number|null;displayValue:number|null;
 sourceRef:'weewx_original_archive';epochRef:null;changeRef:null;
 approved:false;independentValidation:false;extremaEligible:false;
 diagnosisConfidence:'UNRESOLVED';replacementConfidence:'UNRESOLVED';
 qcFlags:string[];joinChartLine:false;
};
export function originalFieldQuality(row:ArchiveRow,metric:Metric,units:OutputUnits):OriginalFieldResult{
 if(!Number.isSafeInteger(row.dateTime)||row.dateTime<0||
    !Number.isSafeInteger(row.interval)||row.interval<1||row.interval>1440)
  throw new Error('Invalid archive interval metadata');
 const reading=publiclySafeReading(metric,row[metric],row.usUnits,units);
 const state:OriginalFieldState=reading.quality==='sensor_error'?'SENSOR_ERROR':
   reading.value===null?'MISSING':'UNVERIFIED';
 const local=localEnd(row.dateTime);
 return {
  schema:'loucka-field-qc-v1',
  timestampUtc:row.dateTime,endTime:utcIso(row.dateTime),
  localEndIso:local.iso,localFold:local.fold,
  variable:metric,unit:reading.unit,sourceUsUnits:row.usUnits,
  state,measurementValue:reading.value,displayValue:reading.value,
  sourceRef:'weewx_original_archive',epochRef:null,changeRef:null,
  approved:false,independentValidation:false,extremaEligible:false,
  diagnosisConfidence:'UNRESOLVED',replacementConfidence:'UNRESOLVED',
  qcFlags:state==='SENSOR_ERROR'?['UNVERIFIED_FIELD_MAPPING']:
   state==='MISSING'?['ARCHIVE_FIELD_NULL']:['ORIGINAL_NOT_INDEPENDENTLY_VALIDATED'],
  joinChartLine:false
 };
}
export type OriginalGap={
 startTime:string;endTime:string;state:'MISSING';displayValue:null;
 qcFlags:['NO_ARCHIVE_ROW'];
};
export function originalQualityWindow(
 rows:ArchiveRow[],metric:Metric,units:OutputUnits,fromExclusive:number,toInclusive:number
):{observations:OriginalFieldResult[];gaps:OriginalGap[];summary:Record<OriginalFieldState,number>}{
 if(!Number.isSafeInteger(fromExclusive)||!Number.isSafeInteger(toInclusive)||
  fromExclusive<0||toInclusive<=fromExclusive)throw new Error('Invalid UTC window');
 const observations:OriginalFieldResult[]=[],gaps:OriginalGap[]=[];
 const summary:Record<OriginalFieldState,number>={UNVERIFIED:0,MISSING:0,SENSOR_ERROR:0};
 let previousEnd=fromExclusive;
 for(const row of rows){
  if(row.dateTime<=previousEnd||row.dateTime>toInclusive)
   throw new Error('Unordered archive intervals');
  const rowStart=row.dateTime-row.interval*60;
  if(rowStart<previousEnd&&previousEnd!==fromExclusive)
   throw new Error('Overlapping archive intervals');
  if(rowStart>previousEnd){
   gaps.push({startTime:utcIso(previousEnd),endTime:utcIso(rowStart),
    state:'MISSING',displayValue:null,qcFlags:['NO_ARCHIVE_ROW']});
  }
  const field=originalFieldQuality(row,metric,units);
  observations.push(field);summary[field.state]++;
  previousEnd=row.dateTime;
 }
 if(previousEnd<toInclusive){
  gaps.push({startTime:utcIso(previousEnd),endTime:utcIso(toInclusive),
   state:'MISSING',displayValue:null,qcFlags:['NO_ARCHIVE_ROW']});
 }
 return {observations,gaps,summary};
}
