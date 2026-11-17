#!/usr/bin/env node
// Staging-only, read-only diagnosis of climate records HTTP 503.
// Uses three bounded SELECT queries from the active original DB API identity;
// no writes, raw weather values, credentials, SQL text or hostnames are output.
import {createMariaDbReader} from '../dist/src/db.js';
import {climateRecordsFromDaily} from '../dist/src/records.js';
import {probeClimateRecords} from './climate-records-diagnostic-lib.mjs';

async function main(){
 if(process.env.WEATHER_STAGING_ENABLED!=='YES')throw Error('Staging required');
 if(process.argv.length!==2)throw Error('No arguments accepted');
 const reader=createMariaDbReader();
 try{
  const report=await probeClimateRecords(reader,climateRecordsFromDaily);
  console.log(JSON.stringify({...report,checkedAtUtc:new Date().toISOString()},null,2));
  if(!report.passed)process.exitCode=1;
 }finally{await reader.close?.();}
}
try{await main();}
catch{
 console.error('Staging climate-records diagnostic unavailable; private errors suppressed.');
 process.exitCode=1;
}
