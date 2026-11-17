#!/usr/bin/env node
/** One-shot, bounded, read-only DEV LXC diagnostic for climate issue #133.
 * Uses the SAME Fastify DB environment credentials. No SQL, passwords or
 * meteorological measurement values are printed. No service restarts.
 *
 * Run with systemd-run --pipe --wait as User=loucka and api.env EnvironmentFile.
 */
import {performance} from 'node:perf_hooks';
import {createMariaDbReader} from '../dist/src/db.js';
import {safeDriverError,countValidDailyRows} from './climate-db-probe-lib.mjs';

// Never use production or arbitrary CLI arguments for a staging-only diagnostic.
if(process.env.WEATHER_STAGING_ENABLED!=='YES'||process.argv.length!==2){
 console.error('This read-only climate probe is restricted to the configured DEV staging environment.');
 process.exit(2);
}
const start=Math.floor(Date.parse('2025-01-01T00:00:00+01:00')/1000);
const end=Math.floor(Date.parse('2026-01-01T00:00:00+01:00')/1000);
const maxRows=367;
const metrics=['outTemp','rain','windSpeed'];
const report={
 schemaVersion:'1',
 probe:'staging-climate-daily-2025',
 checkedAtUtc:new Date().toISOString(),
 readOnly:true,
 originalArchiveUntouched:true,
 status:'pass',
 ping:null,
 sequential:[],
 concurrent:[],
 warnings:['An independent DB pool passing does not prove the already-running API pool is healthy.']
};
let reader;
let failure=false;
const record=(status,metric,phase,time,extra={})=>({
 phase,metric,status,elapsedMs:Math.round((performance.now()-time)*100)/100,...extra
});
try{
 reader=createMariaDbReader();
 const before=performance.now();
 try{
  await reader.ping();
  report.ping=record('pass','archive','ping',before);
 }catch(error){
  failure=true;
  report.ping=record('fail','archive','ping',before,{driver:safeDriverError(error)});
 }
 if(!failure){
  for(const metric of metrics){
   const at=performance.now();
   try{
    const rows=await reader.dailySummaries(metric,start,end,maxRows);
    const count=countValidDailyRows(rows,start,end,maxRows);
    report.sequential.push(record('pass',metric,'sequential',at,{rows:count}));
   }catch(error){
    failure=true;
    report.sequential.push(record('fail',metric,'sequential',at,{driver:safeDriverError(error)}));
   }
  }
  if(!failure){
   const result=await Promise.all(metrics.map(async metric=>{
    const at=performance.now();
    try{
     const rows=await reader.dailySummaries(metric,start,end,maxRows);
     const count=countValidDailyRows(rows,start,end,maxRows);
     return record('pass',metric,'concurrent',at,{rows:count});
    }catch(error){
     failure=true;
     return record('fail',metric,'concurrent',at,{driver:safeDriverError(error)});
    }
   }));
   report.concurrent.push(...result);
  }
 }
}catch(error){
 failure=true;
 report.initialization={status:'fail',driver:safeDriverError(error)};
}finally{
 if(reader){
  try{await reader.close?.();}
  catch(error){
   failure=true;
   report.shutdown={status:'fail',driver:safeDriverError(error)};
  }
 }
}
if(failure){report.status='fail';process.exitCode=1;}
console.log(JSON.stringify(report,null,2));
