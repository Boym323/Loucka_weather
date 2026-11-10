#!/usr/bin/env node
/** Incremental QC scanning, opt-in only. Writes private JSON reports, never SQL. */
import {spawnSync} from 'node:child_process';
import {openSync,closeSync,readFileSync,writeFileSync,renameSync,unlinkSync,
  readdirSync,lstatSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {planQcWindows,reportFilename,validateQcReport,summarizeQcReports}
  from './qc-batch-lib.mjs';

function cli(args){
  if(args.includes('--help')){
    return {help:true};
  }
  const options=new Map();
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(!['--from','--to','--output-dir','--max-windows','--station','--summary','--dry-run'].includes(key)||
       options.has(key))throw new Error('Unknown or duplicated argument');
    if(key==='--summary'||key==='--dry-run')options.set(key,true);
    else if(!args[i+1]||args[i+1].startsWith('--'))throw new Error('Missing argument value');
    else options.set(key,args[++i]);
  }
  const max=Number(options.get('--max-windows')??1);
  if(!Number.isSafeInteger(max)||max<1||max>4)
    throw new Error('max-windows must be an integer from 1 to 4');
  const dir=options.get('--output-dir');
  if(typeof dir!=='string'||!path.isAbsolute(dir))
    throw new Error('An absolute --output-dir is required');
  const stations=options.has('--station')?options.get('--station').split(','):undefined;
  const windows=planQcWindows(options.get('--from'),options.get('--to'),stations);
  return {dir:path.resolve(dir),windows,max,summary:!!options.get('--summary'),
    dryRun:!!options.get('--dry-run')};
}
function privateDirectory(dir){
  const info=lstatSync(dir);
  if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==process.getuid()||
     (info.mode&0o077)!==0)
    throw new Error('Output directory must be an owned real directory with mode 0700');
  // Never place meteorological evidence under public release or Git checkout.
  const forbidden=['/srv/loucka-preview','/home/loucka/Loucka_weather'];
  if(forbidden.some(root=>dir===root||dir.startsWith(root+'/')))
    throw new Error('QC reports must not be placed in the web root or Git worktree');
}
function checkedFile(dir,window){
  const filename=reportFilename(window);
  const file=path.join(dir,filename);
  if(!existsSync(file))return {file,report:null};
  const meta=lstatSync(file);
  if(!meta.isFile()||meta.isSymbolicLink()||
     meta.uid!==process.getuid()||(meta.mode&0o077)!==0||meta.size>5*1024*1024)
    throw new Error('Existing report has unsafe permissions, owner or size');
  const report=validateQcReport(JSON.parse(readFileSync(file,'utf8')),window);
  return {file,report};
}
function atomicReport(file,body){
  const temporary=file+'.tmp-'+process.pid;
  const fd=openSync(temporary,'wx',0o600);
  try{writeFileSync(fd,JSON.stringify(body,null,2)+'\n','utf8');}
  finally{closeSync(fd);}
  renameSync(temporary,file);
}
function scan(window){
  const dir=path.dirname(fileURLToPath(import.meta.url));
  const args=[path.join(dir,'qc-report.mjs'),'--from',window.from,'--to',window.to,
    '--station',window.stations.join(',')];
  const result=spawnSync(process.execPath,args,{
    cwd:path.resolve(dir,'..'),env:process.env,encoding:'utf8',
    timeout:90000,maxBuffer:5*1024*1024
  });
  if(result.error||result.status!==0||!result.stdout)
    throw new Error('Read-only QC child process failed; see secure service journal');
  return validateQcReport(JSON.parse(result.stdout),window);
}
function withLock(dir,callback){
  const file=path.join(dir,'.qc-batch.lock');
  const fd=openSync(file,'wx',0o600);
  try{
    writeFileSync(fd,'PID='+process.pid+'; QC read-only batch\n');
    return callback();
  }finally{
    closeSync(fd);
    unlinkSync(file);
  }
}
function main(){
  const options=cli(process.argv.slice(2));
  if(options.help){
    process.stdout.write([
      'Incremental advisory QC of original Loucka and reference stations (no DB writes).',
      'Usage: node scripts/qc-batch.mjs --from 2009-01-01T00:00:00Z',
      '  --to 2026-11-10T00:00:00Z --output-dir /var/lib/loucka-qc',
      '  [--max-windows 1..4] [--station luhamet_sehradice,wu_ilouka4]',
      '  [--dry-run] [--summary]',
      'Existing validated reports are skipped. Each new run processes at most 4 x 7 UTC days.',
      'Folder must already exist, be owned by the caller, mode 0700 and outside public web/Git.',
      'The underlying qc-report CLI requires staging flags and a SELECT-only DB account.'
    ].join('\n')+'\n');
    return;
  }
  privateDirectory(options.dir);
  const seen=options.windows.map(window=>({window,...checkedFile(options.dir,window)}));
  if(options.summary){
    const summary=summarizeQcReports(seen.filter(x=>x.report).map(x=>x.report));
    process.stdout.write(JSON.stringify({...summary,plannedWindows:seen.length,
      pendingWindows:seen.filter(x=>!x.report).length},null,2)+'\n');
    return;
  }
  const missing=seen.filter(x=>!x.report);
  if(options.dryRun){
    process.stdout.write(JSON.stringify({mode:'dry-run',plannedWindows:seen.length,
      completedWindows:seen.length-missing.length,pendingWindows:missing.length,
      nextWindows:missing.slice(0,options.max).map(x=>x.window)},null,2)+'\n');
    return;
  }
  const selected=missing.slice(0,options.max);
  if(!selected.length){
    process.stdout.write(JSON.stringify({status:'already_complete',
      plannedWindows:seen.length,processedThisRun:0,pendingWindows:0})+'\n');
    return;
  }
  const completed=withLock(options.dir,()=>{
    const done=[];
    for(const item of selected){
      const existing=checkedFile(options.dir,item.window);
      if(existing.report)continue;
      const report=scan(item.window);
      atomicReport(item.file,report);
      done.push({from:item.window.from,to:item.window.to,
        acceptedOriginal:report.sourceQuality.loucka.acceptedSlots,
        candidateCount:report.candidates.total,
        truncated:report.candidates.truncated});
    }
    return done;
  });
  process.stdout.write(JSON.stringify({status:'screening_only',plannedWindows:seen.length,
    processedThisRun:completed.length,
    pendingWindows:missing.length-completed.length,
    reports:completed,safety:{automaticCorrections:false,databaseWrites:0}},null,2)+'\n');
}
try{main();}
catch(error){
  // No database driver stack traces, credentials or raw SQL ever reach stdout.
  const safe=error instanceof Error&&/^(Unknown|Missing argument|max-windows|An absolute|Expected|Timestamp|QC history|Only allowlisted|Window must|Output directory|QC reports|Existing report|Invalid or potentially unsafe|QC report|EEXIST)/.test(error.message);
  process.stderr.write('QC batch failed: '+(safe?error.message:
    'check protected output directory, report validity and private service journal')+'\n');
  process.exitCode=1;
}
