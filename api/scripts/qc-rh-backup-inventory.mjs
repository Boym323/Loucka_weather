#!/usr/bin/env node
/**
 * Inventory local *filenames and filesystem metadata* that may belong to
 * old WeeWX/raw station backups. Does not read backup contents, use SQL,
 * follow symlinks, copy sources or reconstruct humidity.
 */
import {existsSync,lstatSync,realpathSync,readdirSync,openSync,writeFileSync,
  closeSync,renameSync,unlinkSync} from 'node:fs';
import path from 'node:path';

const VERSION='loucka-private-weather-file-inventory-v1';
const OUT='qc-rh-2022-local-backup-inventory.json';
const OMIT=new Set(['.git','node_modules','dist','build','.cache','.npm',
  'vendor','.next','.astro','.venv','__pycache__','Loucka_weather',
  '.Trash','tmp','temp']);
const rxDb=/\.(?:sdb|sqlite|sqlite3|db|sql|dump|bak)(?:$|[._-]\d|\.gz$|\.zst$|\.bz2$|\.xz$)/i;
const rxBundle=/\.(?:tar|tar\.gz|tgz|tar\.zst|tar\.xz|tar\.bz2|zip|7z|rar|zst)(?:$|[._-]\d)/i;
const rxWeather=/(?:weewx|wh1080|gw1000|gw3000|ecowitt|pocasi|loucka|weather|meteo|station|archive|histor|sensor)/i;
const rxOther=/\.(?:csv|jsonl|json|dat|log|txt|gz|xz|bz2)(?:$|[._-]\d)/i;
const iso=n=>new Date(n).toISOString();
function positiveInt(raw,defaultVal,limit,label){
 const n=raw===undefined?defaultVal:Number(raw);
 if(!Number.isSafeInteger(n)||n<1||n>limit)throw Error('Invalid '+label);
 return n;
}
function parseArgs(argv){
 if(argv.length===1&&argv[0]==='--help')return {help:true};
 const options=new Map(),roots=[];
 for(let i=0;i<argv.length;i++){
  const k=argv[i];
  if(k==='--dry-run'||k==='--scan'){
   if(options.has(k))throw Error('Duplicate action');options.set(k,true);
  }else if(k==='--root'){
   if(!argv[i+1]||argv[i+1].startsWith('--'))throw Error('Missing root');
   roots.push(argv[++i]);
  }else if(['--reports-dir','--max-depth','--max-entries'].includes(k)){
   if(options.has(k)||!argv[i+1]||argv[i+1].startsWith('--'))
    throw Error('Invalid option');
   options.set(k,argv[++i]);
  }else throw Error('Unsupported option');
 }
 if(['--dry-run','--scan'].filter(k=>options.has(k)).length!==1||
    roots.length<1||roots.length>8)throw Error('Exactly one action and 1–8 roots required');
 const dir=options.get('--reports-dir');
 if(!dir||!path.isAbsolute(dir))throw Error('Private absolute reports dir required');
 if(roots.some(r=>!path.isAbsolute(r)))throw Error('All roots must be absolute');
 return {action:options.has('--scan')?'scan':'dry-run',
  dir:path.resolve(dir),
  roots:[...new Set(roots.map(r=>path.resolve(r)))],
  maxDepth:positiveInt(options.get('--max-depth'),5,9,'depth'),
  maxEntries:positiveInt(options.get('--max-entries'),30000,100000,'entries')};
}
function privateDir(dir){
 const st=lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||
    (st.mode&0o077)!==0)throw Error('QC directory must be private owned 0700');
 for(const bad of ['/home/loucka/Loucka_weather','/srv/loucka-preview'])
  if(dir===bad||dir.startsWith(bad+'/'))throw Error('Never write into web or Git checkout');
}
function inventoryName(file){
 const database=rxDb.test(file),bundle=rxBundle.test(file),weather=rxWeather.test(file);
 if(!database&&!bundle&&!(weather&&rxOther.test(file)))return null;
 const lower=file.toLowerCase();
 const score=(/2022/.test(lower)?4:0)+(weather?3:0)+
   (/original|raw|dump|backup|zaloh|restore/i.test(lower)?2:0)+
   (database?2:0)+(bundle?1:0);
 return {score,kind:database?'database_or_dump_name':
   bundle?'backup_container_name':'weather_export_name'};
}
function describeRoot(r,dir){
 if(r==='/'||r==='/home'||r==='/var'||r==='/etc'||r==='/mnt')
   throw Error('Use narrow backup roots, not entire system');
 if(!existsSync(r))return {path:r,status:'not_found'};
 const st=lstatSync(r);
 if(!st.isDirectory()||st.isSymbolicLink())
   throw Error('Search root must be a genuine directory, never a symlink');
 const resolved=realpathSync(r);
 if(resolved==='/'||resolved===dir||dir.startsWith(resolved+'/'))
   throw Error('Search root encompasses private QC output or filesystem root');
 if(resolved==='/srv/loucka-preview'||resolved.startsWith('/srv/loucka-preview/')||
    resolved==='/home/loucka/Loucka_weather'||
    resolved.startsWith('/home/loucka/Loucka_weather/'))
   throw Error('Public or checkout root forbidden');
 return {path:r,status:'accessible',dev:st.dev,realPath:resolved};
}
function scan(args,roots){
 const found=[],stats={visitedEntries:0,visitedDirectories:0,
  skippedSymlinks:0,skippedMounts:0,readErrors:0,
  partial:roots.some(r=>r.status!=='accessible')};
 const visited=new Set(),seenFiles=new Set();
 for(const root of roots){
  if(root.status!=='accessible')continue;
  const stack=[{dir:root.realPath,depth:0}];
  while(stack.length){
   if(stats.visitedEntries>=args.maxEntries){stats.partial=true;break;}
   const {dir,depth}=stack.pop();
   let entries;
   try{entries=readdirSync(dir,{withFileTypes:true});}
   catch{stats.readErrors++;stats.partial=true;continue;}
   stats.visitedDirectories++;
   for(const ent of entries){
    if(stats.visitedEntries>=args.maxEntries){stats.partial=true;break;}
    stats.visitedEntries++;
    if(ent.isSymbolicLink()){stats.skippedSymlinks++;continue;}
    const full=path.join(dir,ent.name);
    let st;
    try{st=lstatSync(full);}catch{stats.readErrors++;stats.partial=true;continue;}
    if(st.dev!==root.dev){stats.skippedMounts++;continue;}
    if(st.isDirectory()){
     if(depth<args.maxDepth&&!OMIT.has(ent.name)){
      if(!visited.has(full)){visited.add(full);stack.push({dir:full,depth:depth+1});}
     }else if(depth>=args.maxDepth)stats.partial=true;
     continue;
    }
    if(!st.isFile())continue;
    const match=inventoryName(ent.name);
    if(!match||seenFiles.has(full))continue;
    seenFiles.add(full);
    found.push({path:full,sizeBytes:st.size,modifiedUtc:iso(st.mtimeMs),
      permissionsOctal:(st.mode&0o777).toString(8).padStart(3,'0'),
      confidenceScore:match.score,nameCategory:match.kind,
      contentInspected:false,provenanceVerified:false,
      originalWeatherObservationVerified:false});
   }
  }
  if(stats.visitedEntries>=args.maxEntries)break;
 }
 found.sort((a,b)=>b.confidenceScore-a.confidenceScore||
  a.path.localeCompare(b.path));
 return {schemaVersion:'1',scannerVersion:VERSION,
  status:stats.partial?'partial_metadata_inventory':'complete_metadata_inventory',
  generatedUtc:new Date().toISOString(),
  roots:roots.map(({path,status})=>({path,status})),
  limits:{maxDepth:args.maxDepth,maxEntries:args.maxEntries},
  counts:{...stats,candidateFiles:found.length},candidates:found,
  notes:[
   'Only filenames and stat metadata have been read; no file content has been opened, copied, uploaded or parsed.',
   'A candidate filename does NOT establish provenance, source sensor identity, time coverage, or original observation quality.',
   'Permission errors, omitted Git/build folders, depth limits and mount boundaries can hide additional backups; no candidates does not prove no backups exist.',
   'MariaDB archive copies and pre-existing reconstruction staging are NOT independent original source measurements by default.',
   'All future review must be manual, private and read-only; no replacement RH is proposed or approved.'
  ],safety:{databaseWrites:0,originalFileWrites:0,automaticApprovals:false,
    automaticCorrections:false,reconstructedRhValues:0}};
}
function atomicPrivate(dir,report){
 const target=path.join(dir,OUT),tmp=target+'.tmp-'+process.pid;
 const fd=openSync(tmp,'wx',0o600);
 try{writeFileSync(fd,JSON.stringify(report,null,2),'utf8');}
 finally{closeSync(fd);}
 try{
  if(existsSync(target)){
   const old=lstatSync(target);
   if(!old.isFile()||old.isSymbolicLink()||old.uid!==process.getuid()||
      (old.mode&0o077)!==0)throw Error('Unsafe prior private report');
  }
  renameSync(tmp,target);
 }catch(e){unlinkSync(tmp);throw e;}
}
function main(){
 const args=parseArgs(process.argv.slice(2));
 if(args.help){
  process.stdout.write('Usage: qc-rh-backup-inventory.mjs --reports-dir /var/lib/loucka-qc --dry-run|--scan --root /var/backups [--root /home/loucka] [--max-depth 5] [--max-entries 30000]\n');
  return;
 }
 privateDir(args.dir);
 const roots=args.roots.map(r=>describeRoot(r,args.dir));
 if(args.action==='dry-run'){
  process.stdout.write(JSON.stringify({mode:'dry-run',
   roots:roots.map(({path,status})=>({path,status})),
   maxDepth:args.maxDepth,maxEntries:args.maxEntries,databaseWrites:0})+'\n');
  return;
 }
 const result=scan(args,roots);atomicPrivate(args.dir,result);
 process.stdout.write(JSON.stringify({mode:'scan',
  status:result.status,counts:result.counts,
  candidatesWith2022Filename:result.candidates.filter(x=>/2022/.test(path.basename(x.path))).length,
  output:path.join(args.dir,OUT),safety:result.safety},null,2)+'\n');
}
try{main();}catch(e){
 process.stderr.write('Backup metadata inventory failed. Check --root access, 0700 private destination and safe limits; no DB or source file changes.\n');
 process.exitCode=1;
}
