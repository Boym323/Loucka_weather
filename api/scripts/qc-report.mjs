#!/usr/bin/env node
/** On-demand, bounded SELECT-only quality report. Never an HTTP endpoint. */
import mariadb from 'mariadb';
import {buildQcReport,parseWindow,validateStations,STATIONS} from './qc-engine.mjs';

const usage=[
  'Usage: npm run qc:report -- --from YYYY-MM-DDTHH:mm:ssZ --to YYYY-MM-DDTHH:mm:ssZ [--station luhamet_sehradice,wu_ilouka4]',
  'All timestamps must be aligned to UTC 5-minute boundaries; max window: 7 days.',
  'Required: WEATHER_STAGING_ENABLED=YES, WEATHER_QC_READ_ONLY=YES,',
  'WEATHER_QC_DB_HOST, WEATHER_QC_DB_USER, WEATHER_QC_DB_PASSWORD.',
  'Read-only grants: SELECT on original archive table OR its database, plus SELECT on reference_observations.',
  'Output is advisory JSON on stdout; no database/file writes or automatic corrections.'
].join('\n');
function argumentsFromCli(args){
  if(args.includes('--help'))return {help:true};
  const options=new Map();
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(!['--from','--to','--station'].includes(key)||options.has(key)||!args[i+1]||
       args[i+1].startsWith('--'))throw new Error('Invalid or duplicate CLI argument');
    options.set(key,args[++i]);
  }
  const from=options.get('--from'),to=options.get('--to');
  parseWindow(from,to);
  const stations=options.has('--station')?
    options.get('--station').split(','):STATIONS;
  validateStations(stations);
  return {from,to,stations};
}
function config(){
  if(process.env.WEATHER_STAGING_ENABLED!=='YES'||process.env.WEATHER_QC_READ_ONLY!=='YES')
    throw new Error('QC requires explicit staging and read-only mode');
  const required=key=>{
    const value=process.env[key];
    if(!value)throw new Error('Missing required QC configuration');
    return value;
  };
  const port=Number(process.env.WEATHER_QC_DB_PORT||3306);
  if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('Invalid QC port');
  return {host:required('WEATHER_QC_DB_HOST'),port,
    user:required('WEATHER_QC_DB_USER'),password:required('WEATHER_QC_DB_PASSWORD'),
    connectionLimit:1,connectTimeout:3000,acquireTimeout:5000,
    multipleStatements:false};
}
function assertSelectOnly(rows){
  const grants=rows.flatMap(row=>Object.values(row)).filter(v=>typeof v==='string');
  // Existing web reader may have SELECT on its original WeeWX schema.
  // Allow that *one* broader read-only scope, never global grants, additional
  // schemas, a reference-schema wildcard, or any write-capable permission.
  const sourceSchema=source.slice(0,source.lastIndexOf('.'));
  const acceptedOriginal=new Set([source,sourceSchema+'.*']);
  let originalReadable=false,referenceReadable=false,safe=grants.length>0;
  for(const line of grants){
    if(/\bWITH GRANT OPTION\b/i.test(line)){safe=false;break;}
    if(/^GRANT USAGE ON \*\.\* TO /i.test(line))continue;
    const match=/^GRANT SELECT ON (`[^`]+`\.(?:`[^`]+`|\*)) TO /i.exec(line);
    if(!match){safe=false;break;}
    const scope=match[1];
    if(acceptedOriginal.has(scope))originalReadable=true;
    else if(scope===reference)referenceReadable=true;
    else {safe=false;break;}
  }
  if(!safe||!originalReadable||!referenceReadable)
    throw new Error('QC credentials must be SELECT-only on the original archive/schema and exact reference table');
}
const qt=name=>String.fromCharCode(96)+name+String.fromCharCode(96);
const isolatedFixture=process.env.CI==='true'&&process.env.GITHUB_ACTIONS==='true'&&
  process.env.WEATHER_TEST_LOCAL_FIXTURE==='YES'&&process.env.WEATHER_QC_CI_FIXTURE==='YES';
// Non-production schema names exist only in the ephemeral MariaDB CI service.
const source=qt(isolatedFixture?'weewx_qc_original_ci_fixture':'pocasi-loucka.eu')+'.'+qt('archive');
const reference=qt(isolatedFixture?'weewx_qc_reference_ci_fixture':'loucka_reconstruction')+
  '.'+qt('reference_observations');
async function run(){
  const args=argumentsFromCli(process.argv.slice(2));
  if(args.help){process.stdout.write(usage+'\n');return;}
  const window=parseWindow(args.from,args.to);
  const pool=mariadb.createPool(config());
  try{
    const connection=await pool.getConnection();
    try{
      assertSelectOnly(await connection.query('SHOW GRANTS'));
      const original=(await connection.query('SELECT dateTime,usUnits,'+
        qt('interval')+' AS interval_minutes,outTemp,outHumidity FROM '+source+
        ' WHERE dateTime>=? AND dateTime<? ORDER BY dateTime LIMIT ?',
        [window.start-3600,window.end,2801])).map(row=>({
          dateTime:Number(row.dateTime),usUnits:Number(row.usUnits),
          interval:Number(row.interval_minutes),outTemp:row.outTemp,outHumidity:row.outHumidity
        }));
      if(original.length>2800)throw new Error('Original query exceeded bounded input');
      const references={};
      for(const station of args.stations){
        const rows=await connection.query(
          'SELECT observed_at_utc,temperature_c,relative_humidity_pct,quality_status '+
          'FROM '+reference+' WHERE station_id=? AND observed_at_utc>=? '+
          'AND observed_at_utc<? ORDER BY observed_at_utc LIMIT ?',
          [station,window.start-150,window.end+150,2801]);
        if(rows.length>2800)throw new Error('Reference query exceeded bounded input');
        references[station]=rows.map(row=>({
          observed_at_utc:Number(row.observed_at_utc),
          temperature_c:row.temperature_c,
          relative_humidity_pct:row.relative_humidity_pct,
          quality_status:row.quality_status
        }));
      }
      process.stdout.write(JSON.stringify(buildQcReport({
        from:args.from,to:args.to,original,references,stations:args.stations
      }),null,2)+'\n');
    }finally{connection.release();}
  }finally{await pool.end();}
}
run().catch(error=>{
  // Never print driver errors, SQL, hostnames, passwords or grant contents.
  const safe=error instanceof Error&&(
    /^(Specify|Invalid UTC|Window must|Only allowlisted|QC requires|Missing required|Invalid QC port|QC credentials|Original query|Reference query|Invalid or duplicate CLI)/.test(error.message));
  process.stderr.write('QC report failed: '+(safe?error.message:'read-only DB query or validation failed')+'\n');
  process.exitCode=1;
});
