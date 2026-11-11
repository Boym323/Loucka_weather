#!/usr/bin/env node
/** Private, offline RH evidence decision report. NO database connection. */
import {existsSync,lstatSync,readFileSync,openSync,writeFileSync,closeSync,renameSync,
  unlinkSync} from 'node:fs';
import path from 'node:path';
import {buildReadiness,readinessCsv} from './qc-rh-readiness-lib.mjs';
const input={
 triage:'qc-rh-2022-triage.json',
 triplets:'qc-rh-2022-triplets-summary.json',
 holdout:'qc-rh-2022-holdout-summary.json'
};
function checkFolder(dir){
 const st=lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||
    (st.mode&0o077)!==0)throw Error('Folder must be private owned 0700');
 for(const root of ['/srv/loucka-preview','/home/loucka/Loucka_weather'])
  if(dir===root||dir.startsWith(root+'/'))throw Error('Public folder forbidden');
}
function readPrivate(dir,name){
 const f=path.join(dir,name),s=lstatSync(f);
 if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid()||
    (s.mode&0o077)!==0||s.size>2*1024*1024)
  throw Error('Expected private 0600 QC JSON');
 return JSON.parse(readFileSync(f,'utf8'));
}
function writeDerived(dir,name,text){
 const dst=path.join(dir,name),tmp=dst+'.tmp-'+process.pid;
 const fd=openSync(tmp,'wx',0o600);
 try{writeFileSync(fd,text,'utf8');}finally{closeSync(fd);}
 try{
  if(existsSync(dst)){
   const s=lstatSync(dst);
   if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid()||
      (s.mode&0o077)!==0)throw Error('Unsafe derived file');
  }
  renameSync(tmp,dst);
 }catch(e){unlinkSync(tmp);throw e;}
}
function main(){
 const args=process.argv.slice(2);
 if(args.length===1&&args[0]==='--help'){
  process.stdout.write('Usage: node scripts/qc-rh-readiness.mjs --reports-dir /var/lib/loucka-qc\n');
  return;
 }
 if(args.length!==2||args[0]!=='--reports-dir'||!path.isAbsolute(args[1]))
  throw Error('Absolute reports directory required');
 const dir=path.resolve(args[1]);checkFolder(dir);
 const evidence=Object.fromEntries(Object.entries(input).map(([k,v])=>[k,readPrivate(dir,v)]));
 const result=buildReadiness(evidence);
 const csv=readinessCsv(result);
 writeDerived(dir,'qc-rh-2022-readiness.json',JSON.stringify(result));
 writeDerived(dir,'qc-rh-2022-readiness.csv',csv);
 process.stdout.write(JSON.stringify({
   status:result.status,complete:result.complete,
   totals:result.totals,
   monthStatuses:Object.fromEntries(result.months.map(m=>[m.month,m.evidenceStatus])),
   priorities:result.reviewPriority,
   output:dir+'/qc-rh-2022-readiness.json',
   csv:dir+'/qc-rh-2022-readiness.csv',
   safety:result.safety
 },null,2)+'\n');
}
try{main();}catch(e){
 process.stderr.write('RH evidence readiness failed: verify complete private triage, triplet and holdout summaries (0600), 0700 folder, or consistency.\n');
 process.exitCode=1;
}
