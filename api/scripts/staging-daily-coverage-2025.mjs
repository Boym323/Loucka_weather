#!/usr/bin/env node
/** Single-year, SELECT-only DEV QC probe. Do not publish as approved records.
 * Uses exactly the staging Fastify database identity (api.env).
 */
import {performance} from 'node:perf_hooks';
import {createMariaDbReader} from '../dist/src/db.js';
import {calendarDays,dailyCoverage,sharedMissingDates} from './daily-coverage-2025-lib.mjs';
import {safeDriverError} from './climate-db-probe-lib.mjs';

if(process.env.WEATHER_STAGING_ENABLED!=='YES'||process.argv.length!==2){
 console.error('This SELECT-only coverage probe is restricted to DEV staging.');
 process.exit(2);
}
const cal=calendarDays(2025),metrics=['outTemp','rain','windSpeed','windGust'];
const report={
 schemaVersion:'1',probe:'weewx-daily-coverage-2025',readOnly:true,
 checkedAtUtc:new Date().toISOString(),
 dataset:'original_unverified',year:2025,timezone:'Europe/Prague',
 expectedDays:cal.days,metrics:[],commonMissingDates:[],
 warning:'A missing daily SUMMARY row does not prove missing original raw measurements.'
};
let failure=false,reader;
try{
 reader=createMariaDbReader();
 await reader.ping();
 for(const metric of metrics){
  const at=performance.now();
  try{
   // Same bounded ArchiveReader as public Fastify; no custom SQL or data writes.
   const rows=await reader.dailySummaries(metric,cal.entries[0].dateTime,cal.end,cal.days+1);
   const result=dailyCoverage(rows,metric,cal);
   report.metrics.push({...result,elapsedMs:Math.round((performance.now()-at)*100)/100,
    status:'pass'});
  }catch(error){
   failure=true;
   report.metrics.push({metric,status:'fail',elapsedMs:Math.round((performance.now()-at)*100)/100,
    driver:safeDriverError(error)});
  }
 }
 if(!failure)report.commonMissingDates=sharedMissingDates(report.metrics);
}catch(error){
 failure=true;
 report.connectivity={status:'fail',driver:safeDriverError(error)};
}finally{
 if(reader)try{await reader.close?.();}catch{failure=true;report.closeStatus='fail';}
}
report.status=failure?'fail':'pass';
console.log(JSON.stringify(report,null,2));
if(failure)process.exitCode=1;
