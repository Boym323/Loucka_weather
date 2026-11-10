#!/usr/bin/env node
/** On-demand, bounded SELECT-only quality report. Never an HTTP endpoint. */
import mariadb from 'mariadb';
import {buildQcReport,parseWindow,validateStations,STATIONS} from './qc-engine.mjs';

const usage=[
  'Usage: npm run qc:report -- --from YYYY-MM-DDTHH:mm:ssZ --to YYYY-MM-DDTHH:mm:ssZ [--station luhamet_sehradice,wu_ilouka4]',
  'All timestamps must be aligned to UTC 5-minute boundaries; max window: 7 days.',
  'Required: WEATHER_STAGING_ENABLED=YES, WEATHER_QC_READ_ONLY=YES,',
  'WEATHER_QC_DB_HOST, WEATHER_QC_DB_USER, WEATHER_QC_DB_PASSWORD.',
  'Use a dedicated MariaDB account with SELECT on original archive and reference_observations ONLY.',
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
  const forbidden=/\b(?:ALL PRIVILEGES|INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRIGGER|EVENT|FILE|SUPER|RELOAD|GRANT OPTION|REFERENCES|LOCK TABLES|PROCESS|EXECUTE)\b/i;
  if(!grants.length||grants.some(line=>forbidden.test(line)||
       !/^GRANT (?:USAGE|SELECT) ON /i.test(line))||
     !grants.some(line=>/^GRANT SELECT ON /i.test(line)))
    throw new Error('QC credentials must be SELECT-only');
}
const qt=name=>String.fromCharCode(96)+name+String.fromCharCode(96);
const source=qt('pocasi-loucka.eu')+'.'+qt('archive');
const reference=qt('loucka_reconstruction')+'.'+qt('reference_observations');
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
