#!/usr/bin/env node
/** SELECT-only recovery of candidate overflow. Never alters original QC JSON files. */
import {spawnSync} from 'node:child_process';
import {lstatSync,readFileSync,openSync,closeSync,writeFileSync,linkSync,unlinkSync,existsSync} from 'node:fs';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {WINDOWS} from './qc-quality-lib.mjs';
import {reportFilename,validateQcReport} from './qc-batch-lib.mjs';
import {QC_VERSION} from './qc-engine.mjs';
import {SIDECAR_FILE,verifyExpandedWindow,validateOverflowSidecar} from './qc-overflow-lib.mjs';

function privateDirectory(dir){
  const st=lstatSync(dir);
  if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||
     (st.mode&0o077)!==0)throw new Error('QC folder is not private');
  for(const publicRoot of ['/srv/loucka-preview','/home/loucka/Loucka_weather'])
    if(dir===publicRoot||dir.startsWith(publicRoot+'/'))
      throw new Error('Refusing to write into Git checkout or web directory');
}
function readPrivate(file){
  const st=lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||
     (st.mode&0o077)!==0||st.size>5*1024*1024)
    throw new Error('QC report is not a private regular file');
  return JSON.parse(readFileSync(file,'utf8'));
}
function parseArgs(argv){
  if(argv.includes('--help'))return {help:true};
  if(argv.length!==3||argv[0]!=='--reports-dir'||!path.isAbsolute(argv[1])||
     !['--dry-run','--recover'].includes(argv[2]))
    throw new Error('Expected --reports-dir ABSOLUTE --dry-run|--recover');
  return {dir:path.resolve(argv[1]),recover:argv[2]==='--recover'};
}
function readOriginalReports(dir){
  const selected=[],seen=new Map();
  for(const window of WINDOWS){
    const report=validateQcReport(readPrivate(path.join(dir,reportFilename(window))),window);
    seen.set(window.from+'|'+window.to,report);
    if(report.candidates.truncated)selected.push({window,report});
  }
  return {selected,seen};
}
function expand(window){
  const args=['scripts/qc-report.mjs','--from',window.from,'--to',window.to,
    '--full-candidates'];
  const child=spawnSync(process.execPath,args,{
    cwd:new URL('..',import.meta.url).pathname,
    env:process.env,encoding:'utf8',timeout:90000,maxBuffer:16*1024*1024
  });
  if(child.error||child.status!==0)
    throw new Error('SELECT-only QC recovery query failed; no old report changed');
  return JSON.parse(child.stdout);
}
function atomicCreate(destination,serialized){
  const temp=destination+'.tmp-'+process.pid;
  const fd=openSync(temp,'wx',0o600);
  try{writeFileSync(fd,serialized,'utf8');}finally{closeSync(fd);}
  try{
    // Link only if absent; unlike rename this will NEVER overwrite prior evidence.
    linkSync(temp,destination);
  }finally{unlinkSync(temp);}
}
async function main(){
  const args=parseArgs(process.argv.slice(2));
  if(args.help){process.stdout.write(
    'Usage: node scripts/qc-recover-candidates.mjs --reports-dir /var/lib/loucka-qc --dry-run|--recover\n');
    return;}
  privateDirectory(args.dir);
  const {selected,seen}=readOriginalReports(args.dir);
  const hidden=selected.reduce((n,x)=>n+x.report.candidates.total-x.report.candidates.shown,0);
  if(!args.recover){
    process.stdout.write(JSON.stringify({mode:'dry-run',truncatedWindows:selected.length,
      expectedRecoveredCandidates:hidden,originalReportsPreserved:true,databaseWrites:0})+'\n');
    return;
  }
  if(process.env.WEATHER_STAGING_ENABLED!=='YES'||process.env.WEATHER_QC_READ_ONLY!=='YES')
    throw new Error('Explicit staging SELECT-only environment required');
  if(existsSync(path.join(args.dir,'.qc-batch.lock')))
    throw new Error('Concurrent historical QC scan detected');
  const destination=path.join(args.dir,SIDECAR_FILE);
  if(existsSync(destination))throw new Error('Recovery sidecar already exists; refusing overwrite');
  const entries=[];
  for(const {window,report} of selected){
    if(existsSync(path.join(args.dir,'.qc-batch.lock')))
      throw new Error('Concurrent QC scan started');
    const full=expand(window);
    entries.push(verifyExpandedWindow(report,full,window));
    if(entries.length%10===0)
      process.stdout.write(JSON.stringify({event:'recovery_progress',
        validatedWindows:entries.length,totalWindows:selected.length})+'\n');
    if(entries.length<selected.length)await sleep(1000);
  }
  const sidecar={schemaVersion:'1',qcVersion:QC_VERSION,status:'screening_only',
    period:{fromUtc:WINDOWS[0].from,toExclusiveUtc:WINDOWS.at(-1).to},
    truncatedWindows:entries.length,
    recoveredCandidates:entries.reduce((n,e)=>n+e.items.length,0),
    entries,safety:{databaseWrites:0,automaticCorrections:false,automaticApprovals:false}};
  validateOverflowSidecar(sidecar,(from,to)=>seen.get(from+'|'+to));
  if(sidecar.recoveredCandidates!==hidden)
    throw new Error('Recovered candidate count mismatch');
  atomicCreate(destination,JSON.stringify(sidecar));
  process.stdout.write(JSON.stringify({status:'screening_only',mode:'recovered',
    output:destination,truncatedWindows:sidecar.truncatedWindows,
    recoveredCandidates:sidecar.recoveredCandidates,
    originalReportsPreserved:true,safety:sidecar.safety})+'\n');
}
main().catch(error=>{
  // Do not expose database errors or credentials.
  process.stderr.write('QC overflow recovery failed: '+(
    /^(Expected|QC folder|QC report|Refusing|Explicit staging|Concurrent|Recovery sidecar|SELECT-only QC recovery|Recovered candidate|Invalid overflow|QC overflow|Input is not|Expanded QC|Original observations|First 100|Invalid expanded|Unknown)/.test(error.message)?
      error.message:'read-only QC validation or query failed')+'\n');
  process.exitCode=1;
});
