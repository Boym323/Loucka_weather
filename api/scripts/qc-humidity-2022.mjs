#!/usr/bin/env node
/** Private SELECT-only daily RH evidence. No HTTP API, no DB write and no replacement data. */
import mariadb from 'mariadb';
import {existsSync,lstatSync,mkdirSync,readFileSync,openSync,closeSync,writeFileSync,
  unlinkSync,renameSync,statSync} from 'node:fs';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {dateRange,buildRhDay,validateRhDay,summarizeRhDays,RH_FIRST,RH_END}
  from './qc-humidity-lib.mjs';

const schema=process.env.CI==='true'&&process.env.GITHUB_ACTIONS==='true'&&
  process.env.WEATHER_TEST_LOCAL_FIXTURE==='YES'&&
  process.env.WEATHER_QC_CI_FIXTURE==='YES';
const q=s=>String.fromCharCode(96)+s+String.fromCharCode(96);
const OWN=q(schema?'weewx_qc_original_ci_fixture':'pocasi-loucka.eu')+'.'+q('archive');
const REF=q(schema?'weewx_qc_reference_ci_fixture':'loucka_reconstruction')+
  '.'+q('reference_observations');
const REPORT='qc-rh-2022-summary.json';
const fileFor=day=>'qc-rh-2022-'+day+'.json';
function parseArgs(argv){
  if(argv.length===1&&argv[0]==='--help')return {help:true};
  const a=new Map();
  for(let i=0;i<argv.length;i++){
    const k=argv[i];
    if(['--run','--dry-run','--summary'].includes(k)){
      if(a.has(k))throw new Error('Duplicate RH flag');
      a.set(k,true);continue;
    }
    if(!['--reports-dir','--from','--to','--max-days','--delay-ms'].includes(k)||
       a.has(k)||!argv[i+1]||argv[i+1].startsWith('--'))
      throw new Error('Invalid RH argument');
    a.set(k,argv[++i]);
  }
  if(['--run','--dry-run','--summary'].filter(k=>a.has(k)).length!==1)
    throw new Error('Specify exactly one RH action');
  if(!a.has('--reports-dir')||!path.isAbsolute(a.get('--reports-dir')))
    throw new Error('RH reports dir must be absolute');
  const range=dateRange(a.get('--from')||RH_FIRST,a.get('--to')||RH_END);
  const n=Number(a.get('--max-days')||7),ms=Number(a.get('--delay-ms')||200);
  if(!Number.isSafeInteger(n)||n<1||n>366||
     !Number.isSafeInteger(ms)||ms<0||ms>60000)
    throw new Error('Invalid RH processing limit');
  if(!a.has('--run')&&(a.has('--max-days')||a.has('--delay-ms')))
    throw new Error('RH limits only apply to --run');
  return {action:['--run','--dry-run','--summary'].find(k=>a.has(k)),
    dir:path.resolve(a.get('--reports-dir')),range,maxDays:n,delayMs:ms};
}
function privateDir(dir){
  const st=lstatSync(dir);
  if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||
     (st.mode&0o077)!==0)throw new Error('QC folder must be owned 0700');
  for(const root of ['/srv/loucka-preview','/home/loucka/Loucka_weather'])
    if(dir===root||dir.startsWith(root+'/'))
      throw new Error('RH reports cannot be written into public or Git paths');
}
function existingReport(dir,day){
  const file=path.join(dir,fileFor(day));
  if(!existsSync(file))return null;
  const st=lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||
     (st.mode&0o077)!==0||st.size>2*1024*1024)
    throw new Error('Unsafe RH evidence metadata');
  return validateRhDay(JSON.parse(readFileSync(file,'utf8')),day);
}
function writeOnce(file,body){
  const fd=openSync(file,'wx',0o600);
  try{writeFileSync(fd,body,'utf8');}finally{closeSync(fd);}
}
function updateDerivedSummary(dir,summary){
  const target=path.join(dir,REPORT),tmp=target+'.tmp-'+process.pid;
  const fd=openSync(tmp,'wx',0o600);
  try{writeFileSync(fd,JSON.stringify(summary),'utf8');}
  finally{closeSync(fd);}
  try{
    if(existsSync(target)){
      const st=lstatSync(target);
      if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||
         (st.mode&0o077)!==0)throw new Error('Unsafe existing RH summary');
    }
    renameSync(tmp,target);
  }catch(error){unlinkSync(tmp);throw error;}
}
function writeDerivedHtml(dir,summary){
  const template=readFileSync(new URL('./qc-humidity-viewer.html',import.meta.url),'utf8');
  if(template.split('__RH_DATA__').length!==2)throw new Error('Invalid RH viewer template');
  const payload=JSON.stringify(summary).replace(/</g,'\\u003c')
    .replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
  const target=path.join(dir,'qc-rh-2022-overview.html');
  const tmp=target+'.tmp-'+process.pid;
  const fd=openSync(tmp,'wx',0o600);
  try{writeFileSync(fd,template.replace('__RH_DATA__',payload),'utf8');}
  finally{closeSync(fd);}
  try{
    if(existsSync(target)){
      const st=lstatSync(target);
      if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||
         (st.mode&0o077)!==0)throw new Error('Unsafe existing RH viewer');
    }
    renameSync(tmp,target);
  }catch(error){unlinkSync(tmp);throw error;}
}
function grantsReadOnly(rows){
  const grants=rows.flatMap(x=>Object.values(x)).filter(x=>typeof x==='string');
  if(!grants.length)throw new Error('Missing SELECT-only grants');
  let own=false,reference=false;
  const ownDb=OWN.slice(0,OWN.lastIndexOf('.'));
  for(const g of grants){
    if(/\bWITH GRANT OPTION\b/i.test(g))throw new Error('Unsafe SELECT-only grants');
    if(/^GRANT USAGE ON \*\.\* TO /i.test(g))continue;
    const match=/^GRANT SELECT ON (\x60[^\x60]+\x60\.(?:\x60[^\x60]+\x60|\*)) TO /i.exec(g);
    if(!match)throw new Error('Unsafe SELECT-only grants');
    if(match[1]===OWN||match[1]===ownDb+'.*')own=true;
    else if(match[1]===REF)reference=true;
    else throw new Error('Unexpected SELECT-only grant scope');
  }
  if(!own||!reference)throw new Error('Missing SELECT-only grants');
}
function config(){
  if(process.env.WEATHER_STAGING_ENABLED!=='YES'||
     process.env.WEATHER_QC_READ_ONLY!=='YES')throw new Error('RH staging read-only mode required');
  const env=name=>{const v=process.env[name];if(!v)throw new Error('Missing RH config');return v;};
  const port=Number(process.env.WEATHER_QC_DB_PORT||3306);
  if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('Invalid RH database port');
  return {host:env('WEATHER_QC_DB_HOST'),port,user:env('WEATHER_QC_DB_USER'),
    password:env('WEATHER_QC_DB_PASSWORD'),
    connectionLimit:1,connectTimeout:3000,acquireTimeout:5000,
    multipleStatements:false};
}
async function inspectDay(connection,day){
  const start=Date.parse(day+'T00:00:00Z')/1000,end=start+86400;
  const own=await connection.query(
    'SELECT dateTime,outHumidity FROM '+OWN+
    ' WHERE dateTime>=? AND dateTime<? ORDER BY dateTime LIMIT 401',
    [start,end]);
  if(own.length>400)throw new Error('Original RH daily query exceeded cap');
  const references={};
  for(const station of ['luhamet_sehradice','wu_ilouka4']){
    const rows=await connection.query(
      'SELECT station_id,observed_at_utc,relative_humidity_pct,quality_status FROM '+REF+
      ' WHERE station_id=? AND observed_at_utc>=? AND observed_at_utc<?'+
      ' ORDER BY observed_at_utc LIMIT 401',
      [station,start-30,end+30]);
    if(rows.length>400)throw new Error('Reference RH daily query exceeded cap');
    references[station]=rows.map(r=>({
      station_id:r.station_id,observed_at_utc:Number(r.observed_at_utc),
      relative_humidity_pct:r.relative_humidity_pct,
      quality_status:r.quality_status}));
  }
  return buildRhDay({day,original:own.map(r=>({
    dateTime:Number(r.dateTime),outHumidity:r.outHumidity})),references});
}
function summarizeFromFiles(dir,range){
  const existing=range.map(day=>existingReport(dir,day)).filter(Boolean);
  return summarizeRhDays(existing,range);
}
async function main(){
  const args=parseArgs(process.argv.slice(2));
  if(args.help){
    process.stdout.write('Usage: qc-humidity-2022.mjs --reports-dir /var/lib/loucka-qc --dry-run|--summary|--run [--from 2022-01-01 --to 2023-01-01] [--max-days 365] [--delay-ms 300]\n');
    return;
  }
  privateDir(args.dir);
  const wholeYear=dateRange();
  const before=summarizeFromFiles(args.dir,wholeYear);
  if(args.action==='--dry-run'||args.action==='--summary'){
    process.stdout.write(JSON.stringify({mode:args.action.slice(2),status:'screening_only',
      analyzedDays:before.analyzedDays,pendingDays:before.pendingDays,
      complete:before.complete,selectedDays:args.range.length,
      selectedPendingDays:args.range.filter(day=>!existingReport(args.dir,day)).length,
      totals:before.totals,
      databaseWrites:0})+'\n');
    return;
  }
  const lock=path.join(args.dir,'.qc-rh-2022.lock');
  if(existsSync(path.join(args.dir,'.qc-batch.lock')))
    throw new Error('Another QC batch holds historical lock');
  const lockFd=openSync(lock,'wx',0o600);
  let pool;
  try{
    writeFileSync(lockFd,String(process.pid)+'\n');
    const pending=args.range.filter(day=>!existingReport(args.dir,day)).slice(0,args.maxDays);
    if(pending.length){
      pool=mariadb.createPool(config());
      const connection=await pool.getConnection();
      try{
        grantsReadOnly(await connection.query('SHOW GRANTS'));
        for(let i=0;i<pending.length;i++){
          const day=pending[i],report=validateRhDay(await inspectDay(connection,day),day);
          writeOnce(path.join(args.dir,fileFor(day)),JSON.stringify(report));
          if((i+1)%10===0)process.stdout.write(JSON.stringify({
            event:'rh_progress',processedThisRun:i+1,limit:pending.length,
            lastDay:day})+'\n');
          if(i+1<pending.length&&args.delayMs>0)await delay(args.delayMs);
        }
      }finally{connection.release();}
    }
    const summary=summarizeFromFiles(args.dir,wholeYear);
    updateDerivedSummary(args.dir,summary);
    writeDerivedHtml(args.dir,summary);
    process.stdout.write(JSON.stringify({status:'screening_only',
      mode:'run',processedThisRun:pending.length,analyzedDays:summary.analyzedDays,
      pendingDays:summary.pendingDays,complete:summary.complete,
      totals:summary.totals,output:path.join(args.dir,REPORT),
      safety:summary.safety},null,2)+'\n');
  }finally{
    if(pool)await pool.end();
    closeSync(lockFd);unlinkSync(lock);
  }
}
main().catch(()=>{
  process.stderr.write('RH evidence failed: inspect private folder, bound, read-only grants or daily data; no database changes.\n');
  process.exitCode=1;
});
