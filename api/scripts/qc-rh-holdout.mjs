#!/usr/bin/env node
/** Private read-only RH calibration experiment. Requires completed 2022 original + triplet QC.
 * No automatic reconstruction and no database writes.
 */
import mariadb from 'mariadb';
import {existsSync,lstatSync,readFileSync,openSync,closeSync,writeFileSync,
  renameSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {dateRange,validateRhDay} from './qc-humidity-lib.mjs';
import {validateCommonDay} from './qc-rh-triplets-lib.mjs';
import {buildHoldoutDay,validateHoldoutDay,evaluateHoldoutYear}
  from './qc-rh-holdout-lib.mjs';

const fixture=process.env.CI==='true'&&process.env.GITHUB_ACTIONS==='true'&&
 process.env.WEATHER_TEST_LOCAL_FIXTURE==='YES'&&process.env.WEATHER_QC_CI_FIXTURE==='YES';
const q=x=>'`'+x+'`';
const OWN=q(fixture?'weewx_qc_original_ci_fixture':'pocasi-loucka.eu')+'.'+q('archive');
const REF=q(fixture?'weewx_qc_reference_ci_fixture':'loucka_reconstruction')+'.'+q('reference_observations');
const days=dateRange();
const ownName=d=>'qc-rh-2022-'+d+'.json';
const tripletName=d=>'qc-rh-triplet-2022-'+d+'.json';
const newName=d=>'qc-rh-holdout-2022-'+d+'.json';
function args(argv){
 if(argv.length===1&&argv[0]==='--help')return {help:true};
 const options=new Map();
 for(let i=0;i<argv.length;i++){
  const k=argv[i];
  if(['--run','--dry-run','--summary'].includes(k)){
    if(options.has(k))throw Error('Duplicate action');options.set(k,true);continue;
  }
  if(!['--reports-dir','--max-days','--delay-ms','--from','--to'].includes(k)||
     options.has(k)||!argv[i+1]||argv[i+1].startsWith('--'))
    throw Error('Unsupported or duplicate option');
  options.set(k,argv[++i]);
 }
 const action=['--run','--dry-run','--summary'].filter(k=>options.has(k));
 if(action.length!==1||!options.has('--reports-dir')||
    !path.isAbsolute(options.get('--reports-dir')))throw Error('Invalid command');
 const range=dateRange(options.get('--from')||'2022-01-01',options.get('--to')||'2023-01-01');
 const maxDays=Number(options.get('--max-days')??7);
 const delayMs=Number(options.get('--delay-ms')??200);
 if(!Number.isSafeInteger(maxDays)||maxDays<1||maxDays>365||
    !Number.isSafeInteger(delayMs)||delayMs<0||delayMs>60000)
   throw Error('Invalid batch cap');
 if(action[0]!=='--run'&&(options.has('--max-days')||options.has('--delay-ms')))
   throw Error('Limits require --run');
 return {action:action[0],dir:path.resolve(options.get('--reports-dir')),
   maxDays,delayMs,range};
}
function privateDir(dir){
 const s=lstatSync(dir);
 if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||
    (s.mode&0o077)!==0)throw Error('Private directory must be 0700');
 for(const bad of ['/home/loucka/Loucka_weather','/srv/loucka-preview'])
  if(dir===bad||dir.startsWith(bad+'/'))throw Error('Public checkout/output forbidden');
}
function readPrivate(dir,file){
 const full=path.join(dir,file),s=lstatSync(full);
 if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid()||
    (s.mode&0o077)!==0||s.size>2*1024*1024)
   throw Error('Unsafe private source file');
 return JSON.parse(readFileSync(full,'utf8'));
}
function source(dir,day){
 const original=validateRhDay(readPrivate(dir,ownName(day)),day);
 const triplet=validateCommonDay(readPrivate(dir,tripletName(day)),day,original);
 return {baseline:original,triplet};
}
function existing(dir,day,src){
 const file=path.join(dir,newName(day));
 if(!existsSync(file))return null;
 return validateHoldoutDay(readPrivate(dir,newName(day)),day,src.baseline,src.triplet);
}
function atomicDerived(dir,name,payload){
 const final=path.join(dir,name),tmp=final+'.tmp-'+process.pid;
 const fd=openSync(tmp,'wx',0o600);
 try{writeFileSync(fd,payload,'utf8');}finally{closeSync(fd);}
 try{
  if(existsSync(final)){
   const st=lstatSync(final);
   if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||
      (st.mode&0o077)!==0)throw Error('Unsafe derived output');
  }
  renameSync(tmp,final);
 }catch(e){unlinkSync(tmp);throw e;}
}
function fileOnce(dir,name,data){
 const fd=openSync(path.join(dir,name),'wx',0o600);
 try{writeFileSync(fd,JSON.stringify(data),'utf8');}finally{closeSync(fd);}
}
function grantsOkay(rows){
 const grants=rows.flatMap(x=>Object.values(x)).filter(x=>typeof x==='string');
 if(!grants.length)throw Error('No SELECT grants');
 let a=false,b=false;
 const schema=OWN.slice(0,OWN.lastIndexOf('.'));
 for(const grant of grants){
  if(/\bWITH GRANT OPTION\b/i.test(grant))throw Error('Unsafe grant');
  if(/^GRANT USAGE ON \*\.\* TO /i.test(grant))continue;
  const m=/^GRANT SELECT ON (\x60[^\x60]+\x60\.(?:\x60[^\x60]+\x60|\*)) TO /i.exec(grant);
  if(!m)throw Error('Unsafe database grant');
  if(m[1]===OWN||m[1]===schema+'.*')a=true;
  else if(m[1]===REF)b=true;
  else throw Error('Unexpected SELECT grant');
 }
 if(!a||!b)throw Error('Missing scoped SELECT grants');
}
function dbConfig(){
 if(process.env.WEATHER_STAGING_ENABLED!=='YES'||process.env.WEATHER_QC_READ_ONLY!=='YES')
  throw Error('Missing explicit read-only staging mode');
 const get=k=>{if(!process.env[k])throw Error('Missing DB config');return process.env[k];};
 const port=Number(process.env.WEATHER_QC_DB_PORT||3306);
 if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('Invalid DB port');
 return {host:get('WEATHER_QC_DB_HOST'),port,user:get('WEATHER_QC_DB_USER'),
  password:get('WEATHER_QC_DB_PASSWORD'),connectionLimit:1,
  connectTimeout:3000,acquireTimeout:5000,multipleStatements:false};
}
async function fetchDay(conn,day){
 const start=Date.parse(day+'T00:00:00Z')/1000,end=start+86400;
 const original=await conn.query(
  'SELECT dateTime,outHumidity FROM '+OWN+' WHERE dateTime>=? AND dateTime<? ORDER BY dateTime LIMIT 401',[start,end]);
 if(original.length>400)throw Error('Original daily cap exceeded');
 const references={};
 for(const station of ['luhamet_sehradice','wu_ilouka4']){
  const rows=await conn.query(
   'SELECT station_id,observed_at_utc,relative_humidity_pct,quality_status FROM '+REF+
   ' WHERE station_id=? AND observed_at_utc>=? AND observed_at_utc<? ORDER BY observed_at_utc LIMIT 401',
   [station,start-30,end+30]);
  if(rows.length>400)throw Error('Reference daily cap exceeded');
  references[station]=rows.map(r=>({station_id:r.station_id,
    observed_at_utc:Number(r.observed_at_utc),relative_humidity_pct:r.relative_humidity_pct,
    quality_status:r.quality_status}));
 }
 return {original:original.map(r=>({dateTime:Number(r.dateTime),outHumidity:r.outHumidity})),references};
}
function csv(report){
 const header=['month','days','validatedDays','validatedTriplets',
  'excludedTestDays','excludedTrainingDays','rawLuhaMae','rawWuMae',
  'correctedLuhaMae','correctedWuMae','wuCalibrationGain','evaluationStatus'];
 return '\uFEFF'+header.join(',')+'\r\n'+report.months.map(r=>
   header.map(key=>r[key]??'').join(',')).join('\r\n')+'\r\n';
}
async function main(){
 const a=args(process.argv.slice(2));
 if(a.help){process.stdout.write('Usage: qc-rh-holdout.mjs --reports-dir /var/lib/loucka-qc --dry-run|--run|--summary [--max-days 365 --delay-ms 200] [--from 2022-02-15 --to 2022-02-16]\n');return;}
 privateDir(a.dir);
 // Validate all original and triplet evidence before any MariaDB operation.
 const sources=new Map(days.map(day=>[day,source(a.dir,day)]));
 const already=new Map();
 for(const day of days){
  const r=existing(a.dir,day,sources.get(day));
  if(r)already.set(day,r);
 }
 const pending=days.filter(day=>!already.has(day));
 const selectedPending=a.range.filter(day=>!already.has(day));
 if(a.action!=='--run'){
  const result={status:'screening_only',action:a.action,
   analyzedDays:already.size,pendingDays:pending.length,complete:pending.length===0,
   selectedPendingDays:selectedPending.length,databaseWrites:0};
  if(!pending.length&&a.action==='--summary')
    result.evaluation=evaluateHoldoutYear([...already.values()]);
  process.stdout.write(JSON.stringify(result)+'\n');return;
 }
 const locks=['.qc-rh-2022.lock','.qc-rh-triplets-2022.lock','.qc-batch.lock'];
 if(locks.some(x=>existsSync(path.join(a.dir,x))))throw Error('Another QC run is active');
 const lock=path.join(a.dir,'.qc-rh-holdout.lock'),lockFd=openSync(lock,'wx',0o600);
 let pool;
 try{
  writeFileSync(lockFd,String(process.pid)+'\n');
  const batch=selectedPending.slice(0,a.maxDays);
  if(batch.length){
   pool=mariadb.createPool(dbConfig());
   const conn=await pool.getConnection();
   try{
    grantsOkay(await conn.query('SHOW GRANTS'));
    for(let i=0;i<batch.length;i++){
     const day=batch[i],src=sources.get(day),rows=await fetchDay(conn,day);
     const report=buildHoldoutDay({...rows,day,...src});
     fileOnce(a.dir,newName(day),report);
     if((i+1)%10===0)process.stdout.write(JSON.stringify({
      event:'holdout_progress',daysProcessedThisRun:i+1,lastDay:day})+'\n');
     if(i<batch.length-1&&a.delayMs)await delay(a.delayMs);
    }
   }finally{conn.release();}
  }
  const evidence=days.map(day=>existing(a.dir,day,sources.get(day))).filter(Boolean);
  const complete=evidence.length===days.length;
  let summary=null;
  if(complete){
   summary=evaluateHoldoutYear(evidence);
   atomicDerived(a.dir,'qc-rh-2022-holdout-summary.json',JSON.stringify(summary));
   atomicDerived(a.dir,'qc-rh-2022-holdout-monthly.csv',csv(summary));
  }
  process.stdout.write(JSON.stringify({status:'screening_only',
   processedThisRun:batch.length,analyzedDays:evidence.length,
   pendingDays:days.length-evidence.length,complete,
   ...(summary?{overall:summary.overall,months:summary.months}:{}),
   safety:{databaseWrites:0,automaticApprovals:false,automaticCorrections:false}},null,2)+'\n');
 }finally{
  if(pool)await pool.end();
  closeSync(lockFd);unlinkSync(lock);
 }
}
main().catch(()=>{
 process.stderr.write('Read-only RH holdout failed; verify unchanged 365 baseline+triplet JSON, permissions and SELECT-only access. No original DB changes.\n');
 process.exitCode=1;
});
