#!/usr/bin/env node
/** Read-only fair RH 2022 triplet comparison, resumable with private immutable daily evidence. */
import mariadb from 'mariadb';
import {existsSync,lstatSync,readFileSync,openSync,closeSync,writeFileSync,
  renameSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {dateRange,validateRhDay} from './qc-humidity-lib.mjs';
import {buildCommonDay,validateCommonDay,summarizeCommonDays} from './qc-rh-triplets-lib.mjs';
const fixture=process.env.CI==='true'&&process.env.GITHUB_ACTIONS==='true'&&
  process.env.WEATHER_TEST_LOCAL_FIXTURE==='YES'&&process.env.WEATHER_QC_CI_FIXTURE==='YES';
const q=s=>String.fromCharCode(96)+s+String.fromCharCode(96);
const OWN=q(fixture?'weewx_qc_original_ci_fixture':'pocasi-loucka.eu')+'.'+q('archive');
const REF=q(fixture?'weewx_qc_reference_ci_fixture':'loucka_reconstruction')+
  '.'+q('reference_observations');
const tripletName=day=>'qc-rh-triplet-2022-'+day+'.json';
const baseName=day=>'qc-rh-2022-'+day+'.json';
const REPORT='qc-rh-2022-triplets-summary.json';
const CSV='qc-rh-2022-triplets-monthly.csv';
function cli(argv){
  if(argv.length===1&&argv[0]==='--help')return {help:true};
  const options=new Map();
  for(let i=0;i<argv.length;i++){
    const v=argv[i];
    if(['--dry-run','--run','--summary'].includes(v)){
      if(options.has(v))throw Error('Duplicate action');options.set(v,true);continue;
    }
    if(!['--reports-dir','--from','--to','--max-days','--delay-ms'].includes(v)||
       options.has(v)||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('Invalid argument');
    options.set(v,argv[++i]);
  }
  const actions=['--dry-run','--run','--summary'].filter(k=>options.has(k));
  if(actions.length!==1)throw Error('One action is required');
  const dir=options.get('--reports-dir');
  if(!dir||!path.isAbsolute(dir))throw Error('Absolute reports dir required');
  const range=dateRange(options.get('--from')||'2022-01-01',
    options.get('--to')||'2023-01-01');
  const maxDays=Number(options.get('--max-days')??7),
    delayMs=Number(options.get('--delay-ms')??200);
  if(!Number.isSafeInteger(maxDays)||maxDays<1||maxDays>365||
     !Number.isSafeInteger(delayMs)||delayMs<0||delayMs>60000)throw Error('Invalid cap');
  if(actions[0]!=='--run'&&(options.has('--max-days')||options.has('--delay-ms')))
    throw Error('Limits require --run');
  return {dir:path.resolve(dir),range,maxDays,delayMs,action:actions[0]};
}
function privateFolder(dir){
  const s=lstatSync(dir);
  if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||
     (s.mode&0o077)!==0)throw Error('Private directory must be owner-only 0700');
  for(const root of ['/srv/loucka-preview','/home/loucka/Loucka_weather'])
    if(dir===root||dir.startsWith(root+'/'))throw Error('Never write to public directory');
}
function readPrivate(dir,name){
  const p=path.join(dir,name),s=lstatSync(p);
  if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid()||
     (s.mode&0o077)!==0||s.size>2*1024*1024)throw Error('Unsafe QC report file');
  return JSON.parse(readFileSync(p,'utf8'));
}
function baseline(dir,day){return validateRhDay(readPrivate(dir,baseName(day)),day);}
function prior(dir,day){
  if(!existsSync(path.join(dir,tripletName(day))))return null;
  return validateCommonDay(readPrivate(dir,tripletName(day)),day,baseline(dir,day));
}
function createOnce(dir,name,json){
  const p=path.join(dir,name),f=openSync(p,'wx',0o600);
  try{writeFileSync(f,json,'utf8');}finally{closeSync(f);}
}
function publishDerived(dir,name,text){
  const dest=path.join(dir,name),temp=dest+'.tmp-'+process.pid;
  const fd=openSync(temp,'wx',0o600);
  try{writeFileSync(fd,text,'utf8');}finally{closeSync(fd);}
  try{
    if(existsSync(dest)){
      const s=lstatSync(dest);
      if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid()||
         (s.mode&0o077)!==0)throw Error('Refuse unsafe output');
    }
    renameSync(temp,dest);
  }catch(error){unlinkSync(temp);throw error;}
}
function validateGrants(rows){
  const grants=rows.flatMap(r=>Object.values(r)).filter(v=>typeof v==='string');
  if(!grants.length)throw Error('Missing SELECT grants');
  let original=false,reference=false;
  const ownDb=OWN.slice(0,OWN.lastIndexOf('.'));
  for(const g of grants){
    if(/\bWITH GRANT OPTION\b/i.test(g))throw Error('Unsafe SELECT grants');
    if(/^GRANT USAGE ON \*\.\* TO /i.test(g))continue;
    const match=/^GRANT SELECT ON (\x60[^\x60]+\x60\.(?:\x60[^\x60]+\x60|\*)) TO /i.exec(g);
    if(!match)throw Error('Write-capable or unexpected grant');
    if(match[1]===OWN||match[1]===ownDb+'.*')original=true;
    else if(match[1]===REF)reference=true;
    else throw Error('Unexpected read grant');
  }
  if(!original||!reference)throw Error('Missing scoped SELECT grant');
}
function connectionConfig(){
  if(process.env.WEATHER_STAGING_ENABLED!=='YES'||process.env.WEATHER_QC_READ_ONLY!=='YES')
    throw Error('Explicit staging SELECT-only mode is required');
  const get=k=>{if(!process.env[k])throw Error('Missing database env');return process.env[k];};
  const port=Number(process.env.WEATHER_QC_DB_PORT||3306);
  if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('Invalid database port');
  return {host:get('WEATHER_QC_DB_HOST'),port,user:get('WEATHER_QC_DB_USER'),
    password:get('WEATHER_QC_DB_PASSWORD'),connectionLimit:1,
    connectTimeout:3000,acquireTimeout:5000,multipleStatements:false};
}
async function readDay(connection,day){
  const start=Date.parse(day+'T00:00:00Z')/1000,end=start+86400;
  const original=await connection.query('SELECT dateTime,outHumidity FROM '+OWN+
    ' WHERE dateTime>=? AND dateTime<? ORDER BY dateTime LIMIT 401',[start,end]);
  if(original.length>400)throw Error('Original read exceeded cap');
  const references={};
  for(const station of ['luhamet_sehradice','wu_ilouka4']){
    const rows=await connection.query(
      'SELECT station_id,observed_at_utc,relative_humidity_pct,quality_status FROM '+REF+
      ' WHERE station_id=? AND observed_at_utc>=? AND observed_at_utc<?'+
      ' ORDER BY observed_at_utc LIMIT 401',[station,start-30,end+30]);
    if(rows.length>400)throw Error('Reference read exceeded cap');
    references[station]=rows.map(r=>({
      station_id:r.station_id,observed_at_utc:Number(r.observed_at_utc),
      relative_humidity_pct:r.relative_humidity_pct,quality_status:r.quality_status}));
  }
  return {original:original.map(r=>({dateTime:Number(r.dateTime),
    outHumidity:r.outHumidity})),references};
}
function summarize(dir,days){
  const reports=days.map(day=>prior(dir,day)).filter(Boolean);
  return summarizeCommonDays(reports);
}
function monthCsv(summary){
  const heads=['month','processedDays','daysWithAtLeast24Triplets','pairs',
    'maeLuhaPctPoints','maeWuPctPoints','advantageWuMaePctPoints',
    'biasOwnMinusLuhaPctPoints','biasOwnMinusWuPctPoints',
    'rmseLuhaPctPoints','rmseWuPctPoints','wuBetterSlots',
    'luhaBetterSlots','tiedSlots','sampleStatus'];
  const rows=summary.months.map(m=>heads.map(k=>m[k]??'').join(','));
  return '\uFEFF'+heads.join(',')+'\r\n'+rows.join('\r\n')+'\r\n';
}
async function main(){
  const args=cli(process.argv.slice(2));
  if(args.help){
    process.stdout.write('Usage: node scripts/qc-rh-triplets.mjs --reports-dir /var/lib/loucka-qc --dry-run|--summary|--run [--max-days 365 --delay-ms 200] [--from 2022-01-01 --to 2023-01-01]\n');
    return;
  }
  privateFolder(args.dir);
  // Check all 365 original daily RH evidence files before doing any work.
  const year=dateRange();
  for(const day of year)baseline(args.dir,day);
  const before=summarize(args.dir,year);
  const selectedPending=args.range.filter(day=>!prior(args.dir,day));
  if(args.action!=='--run'){
    process.stdout.write(JSON.stringify({status:'screening_only',action:args.action,
      analyzedDays:before.analyzedDays,pendingDays:before.pendingDays,
      selectedPendingDays:selectedPending.length,complete:before.complete,
      overall:before.overall,databaseWrites:0})+'\n');return;
  }
  if(existsSync(path.join(args.dir,'.qc-rh-2022.lock'))||
     existsSync(path.join(args.dir,'.qc-batch.lock')))
    throw Error('Another RH or QC scan is active');
  const lock=path.join(args.dir,'.qc-rh-triplets-2022.lock');
  const lockFd=openSync(lock,'wx',0o600);let pool;
  try{
    writeFileSync(lockFd,String(process.pid)+'\n');
    const pending=selectedPending.slice(0,args.maxDays);
    if(pending.length){
      pool=mariadb.createPool(connectionConfig());
      const connection=await pool.getConnection();
      try{
        validateGrants(await connection.query('SHOW GRANTS'));
        for(let i=0;i<pending.length;i++){
          const day=pending[i],rows=await readDay(connection,day);
          const report=buildCommonDay({...rows,day,baseline:baseline(args.dir,day)});
          createOnce(args.dir,tripletName(day),JSON.stringify(report));
          if((i+1)%10===0)process.stdout.write(JSON.stringify({
            event:'triplet_progress',processedThisRun:i+1,totalInBatch:pending.length,
            lastDay:day})+'\n');
          if(i+1<pending.length&&args.delayMs)await delay(args.delayMs);
        }
      }finally{connection.release();}
    }
    const after=summarize(args.dir,year);
    publishDerived(args.dir,REPORT,JSON.stringify(after));
    publishDerived(args.dir,CSV,monthCsv(after));
    process.stdout.write(JSON.stringify({status:'screening_only',
      processedThisRun:pending.length,analyzedDays:after.analyzedDays,
      pendingDays:after.pendingDays,complete:after.complete,
      overall:after.overall,months:after.months,report:path.join(args.dir,REPORT),
      csv:path.join(args.dir,CSV),safety:after.safety},null,2)+'\n');
  }finally{
    if(pool)await pool.end();
    closeSync(lockFd);
    unlinkSync(lock);
  }
}
main().catch(()=>{
  process.stderr.write('Triplet RH screening failed; check 365 private baseline reports, read-only grants, bounds and process locks. No database records modified.\n');
  process.exitCode=1;
});
