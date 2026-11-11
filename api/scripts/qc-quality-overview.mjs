#!/usr/bin/env node
/** Generate a PRIVATE offline HTML quality dashboard. SELECT-only SQL; no HTTP route or DB writes. */
import mariadb from 'mariadb';
import {readFileSync,lstatSync,openSync,writeFileSync,closeSync,renameSync,unlinkSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {summarizePrivateQc,monthWindows,combineOverview,WINDOWS} from './qc-quality-lib.mjs';
import {SIDECAR_FILE} from './qc-overflow-lib.mjs';

const SOURCE='\x60pocasi-loucka.eu\x60.\x60archive\x60';
const REF='\x60loucka_reconstruction\x60.\x60reference_observations\x60';
function validateReadOnlyGrants(rows){
  const grants=rows.flatMap(r=>Object.values(r)).filter(x=>typeof x==='string');
  if(!grants.length)throw new Error('Unsafe QC database grants');
  let original=false,reference=false;
  for(const grant of grants){
    if(/\bWITH GRANT OPTION\b/i.test(grant))throw new Error('Unsafe QC database grants');
    if(/^GRANT USAGE ON \*\.\* TO /i.test(grant))continue;
    const m=/^GRANT SELECT ON (\x60[^\x60]+\x60\.(?:\x60[^\x60]+\x60|\*)) TO /i.exec(grant);
    if(!m)throw new Error('Unsafe QC database grants');
    if(m[1]===SOURCE||m[1]==='\x60pocasi-loucka.eu\x60.*')original=true;
    else if(m[1]===REF)reference=true;
    else throw new Error('Unsafe QC database grants');
  }
  if(!original||!reference)throw new Error('Unsafe QC database grants');
}
function privateDir(dir){
  const stat=lstatSync(dir);
  if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid()||
     (stat.mode&0o077)!==0)throw new Error('QC output directory is not private 0700');
  for(const root of ['/srv/loucka-preview','/home/loucka/Loucka_weather'])
    if(dir===root||dir.startsWith(root+'/'))
      throw new Error('Refusing to write QC output into public web or Git checkout');
}
function checkedReport(dir,name){
  const file=path.join(dir,name),st=lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||
     (st.mode&0o077)!==0||st.size>5*1024*1024)
    throw new Error('QC evidence file has unsafe metadata');
  return JSON.parse(readFileSync(file,'utf8'));
}
function connectionConfig(){
  if(process.env.WEATHER_STAGING_ENABLED!=='YES'||process.env.WEATHER_QC_READ_ONLY!=='YES')
    throw new Error('QC mode must be explicitly SELECT-only on staging');
  const get=name=>{const value=process.env[name];if(!value)throw new Error('Missing QC database setting');return value;};
  const port=Number(process.env.WEATHER_QC_DB_PORT||3306);
  if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('Invalid QC port');
  return {host:get('WEATHER_QC_DB_HOST'),port,
    user:get('WEATHER_QC_DB_USER'),password:get('WEATHER_QC_DB_PASSWORD'),
    connectionLimit:1,connectTimeout:3000,acquireTimeout:5000,multipleStatements:false};
}
async function sqlMonthAggregates(connection){
  const months=monthWindows(),results=[];
  for(let i=0;i<months.length;i+=12){
    const section=months.slice(i,i+12),params=[];
    const parts=section.map(m=>{
      params.push(m.from,m.to);
      return "SELECT '"+m.month+"' AS month, COUNT(*) AS totalRows, "+
        'COUNT(DISTINCT CASE WHEN MOD(dateTime,300)=0 THEN dateTime END) AS onGridSlots, '+
        'COUNT(DISTINCT CASE WHEN MOD(dateTime,300)=0 AND outTemp IS NOT NULL THEN dateTime END) AS temperatureSlots, '+
        'COUNT(DISTINCT CASE WHEN MOD(dateTime,300)=0 AND outHumidity IS NOT NULL THEN dateTime END) AS humiditySlots, '+
        'COALESCE(SUM(outTemp IS NULL),0) AS temperatureNull, '+
        'COALESCE(SUM(outHumidity IS NULL),0) AS humidityNull '+
        'FROM '+SOURCE+' WHERE dateTime>=? AND dateTime<?';
    });
    const rows=await connection.query(parts.join(' UNION ALL '),params);
    results.push(...rows);
    // Bounded indexed reads; avoid a burst of annual scans on the shared MariaDB.
    if(i+12<months.length)await sleep(150);
  }
  return results;
}
function writeAtomic(file,contents){
  const temporary=file+'.tmp-'+process.pid;
  const fd=openSync(temporary,'wx',0o600);
  try{writeFileSync(fd,contents,'utf8');}finally{closeSync(fd);}
  try{renameSync(temporary,file);}catch(err){unlinkSync(temporary);throw err;}
}
async function main(){
  if(process.argv.includes('--help')){
    process.stdout.write('Usage: node scripts/qc-quality-overview.mjs --reports-dir /var/lib/loucka-qc\n'+
      'Creates private 0600 qc-quality-overview.html, with bounded read-only annual SQL queries.\n');
    return;
  }
  const args=process.argv.slice(2);
  if(args.length!==2||args[0]!=='--reports-dir'||!path.isAbsolute(args[1]))
    throw new Error('Expected --reports-dir absolute path');
  const dir=path.resolve(args[1]);
  privateDir(dir);
  const sidecarPath=path.join(dir,SIDECAR_FILE);
  const sidecar=existsSync(sidecarPath)?checkedReport(dir,SIDECAR_FILE):null;
  const qc=summarizePrivateQc(name=>checkedReport(dir,name),sidecar);
  if(qc.processed!==WINDOWS.length)throw new Error('Incomplete QC history');
  const config=connectionConfig();
  const pool=mariadb.createPool(config);
  let monthly;
  try{
    const connection=await pool.getConnection();
    try{
      validateReadOnlyGrants(await connection.query('SHOW GRANTS'));
      monthly=await sqlMonthAggregates(connection);
    }finally{connection.release();}
  }finally{await pool.end();}
  const overview=combineOverview(qc,monthly);
  const viewer=readFileSync(fileURLToPath(new URL('./qc-quality-viewer.html',import.meta.url)),'utf8');
  const placeholder='__QUALITY_DATA__';
  if(viewer.split(placeholder).length!==2)throw new Error('Invalid viewer template');
  const safeJson=JSON.stringify(overview).replace(/</g,'\\u003c')
    .replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
  const html=viewer.replace(placeholder,safeJson);
  const output=path.join(dir,'qc-quality-overview.html');
  if(qc.completeCandidates!==null){
    const fields=['id','kind','source','fromUtc','toExclusiveUtc','reason',
      'reviewState','automaticWriteAllowed','detailsJson'];
    const escapeCsv=value=>{
      const safe=String(value??'').replace(/^[=+@\-\t\r]/,"'  const output=path.join(dir,'qc-quality-overview.html');
  writeAtomic(output,html);");
      return '"'+safe.replaceAll('"','""')+'"';
    };
    const rows=[fields.join(',')];
    for(const item of qc.completeCandidates)
      rows.push(fields.map(field=>escapeCsv(field==='detailsJson'?
        JSON.stringify(item.details??{}):item[field])).join(','));
    writeAtomic(path.join(dir,'qc-candidates-complete.csv'),'\uFEFF'+rows.join('\r\n')+'\r\n');
  }
  writeAtomic(output,html);
  process.stdout.write(JSON.stringify({status:'screening_only',output,months:overview.months.length,
    processedWindows:overview.windows,totals:overview.totals,
    candidateDetailsComplete:overview.candidateDetailsComplete,
    recoveredCandidates:overview.recoveredCandidates,
    safety:overview.safety},null,2)+'\n');
}
main().catch(()=>{
  // Deliberately avoid printing SQL, account names, connection strings or paths.
  process.stderr.write('Private QC overview failed: verify reports, SELECT-only credentials and available database.\n');
  process.exitCode=1;
});
