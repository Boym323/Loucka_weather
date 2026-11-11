#!/usr/bin/env node
/** Offline triage from verified private RH evidence. Does NOT connect to a database. */
import {existsSync,lstatSync,readFileSync,openSync,writeFileSync,
  closeSync,renameSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {dateRange} from './qc-humidity-lib.mjs';
import {createRhTriage,triageCsv} from './qc-rh-triage-lib.mjs';
function privateFolder(dir){
  const st=lstatSync(dir);
  if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||
     (st.mode&0o077)!==0)throw new Error('Private RH folder must be owned 0700');
  for(const root of ['/home/loucka/Loucka_weather','/srv/loucka-preview'])
    if(dir===root||dir.startsWith(root+'/'))throw new Error('Never publish QC evidence in repository or webroot');
}
function readPrivate(dir,name){
  const pathToFile=path.join(dir,name),st=lstatSync(pathToFile);
  if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||
     (st.mode&0o077)!==0||st.size>2*1024*1024)
    throw new Error('RH evidence does not satisfy private 0600 constraints');
  return JSON.parse(readFileSync(pathToFile,'utf8'));
}
function safeWrite(dir,name,body){
  const target=path.join(dir,name),temp=target+'.tmp-'+process.pid;
  const fd=openSync(temp,'wx',0o600);
  try{writeFileSync(fd,body,'utf8');}finally{closeSync(fd);}
  try{
    if(existsSync(target)){
      const st=lstatSync(target);
      if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||
         (st.mode&0o077)!==0)
        throw new Error('Refusing unsafe derived report overwrite');
    }
    renameSync(temp,target);
  }catch(e){unlinkSync(temp);throw e;}
}
function main(){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help'){
    process.stdout.write('Usage: node scripts/qc-rh-triage.mjs --reports-dir /var/lib/loucka-qc\n');
    return;
  }
  if(args.length!==2||args[0]!=='--reports-dir'||!path.isAbsolute(args[1]))
    throw new Error('Expected --reports-dir absolute path');
  const dir=path.resolve(args[1]);privateFolder(dir);
  // No DB client, credentials, network APIs, or other remote dependencies.
  const evidence=dateRange().map(day=>readPrivate(dir,'qc-rh-2022-'+day+'.json'));
  const result=createRhTriage(evidence);
  safeWrite(dir,'qc-rh-2022-triage.json',JSON.stringify(result));
  safeWrite(dir,'qc-rh-2022-triage.csv',triageCsv(result));
  process.stdout.write(JSON.stringify({
    status:'screening_only',processedDays:result.processedDays,totals:result.totals,
    categories:Object.fromEntries([...new Set(result.days.map(r=>r.evidenceCategory))]
      .map(k=>[k,result.days.filter(r=>r.evidenceCategory===k).length])),
    json:path.join(dir,'qc-rh-2022-triage.json'),
    csv:path.join(dir,'qc-rh-2022-triage.csv'),
    safety:result.safety
  },null,2)+'\n');
}
try{main();}catch(e){
  // Never reveal untrusted paths or DB secrets; the CLI is entirely offline.
  process.stderr.write('RH triage failed: verify 365 intact private 0600 daily reports and 0700 directory.\n');
  process.exitCode=1;
}
