#!/usr/bin/env node
/**
 * Opt-in, bounded, read-only magic-byte inspection of filenames found by
 * qc-rh-backup-inventory.mjs. No decompression, SQL, backup copying or RH values.
 */
import {constants,existsSync,lstatSync,statSync,readFileSync,openSync,closeSync,
  readSync,fstatSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import path from 'node:path';

const INPUT='qc-rh-2022-local-backup-inventory.json';
const OUTPUT='qc-rh-2022-backup-header-probe.json';
const PREFIX=512;
function privateDir(dir){
  const st=lstatSync(dir);
  if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||
     (st.mode&0o077)!==0)throw Error('Private folder must be owned 0700');
  for(const bad of ['/home/loucka/Loucka_weather','/srv/loucka-preview'])
    if(dir===bad||dir.startsWith(bad+'/'))throw Error('Refuse public or repo output path');
}
function readInventory(dir){
  const p=path.join(dir,INPUT),st=lstatSync(p);
  if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||
     (st.mode&0o077)!==0||st.size>4*1024*1024)
    throw Error('Expected private owned 0600 inventory');
  const data=JSON.parse(readFileSync(p,'utf8'));
  if(data.schemaVersion!=='1'||data.scannerVersion!=='loucka-private-weather-file-inventory-v1'||
     !['partial_metadata_inventory','complete_metadata_inventory'].includes(data.status)||
     !Array.isArray(data.roots)||!Array.isArray(data.candidates)||
     data.roots.length>8||data.candidates.length>1000||
     data.safety?.databaseWrites!==0||data.safety?.originalFileWrites!==0)
    throw Error('Unrecognized or unsafe inventory');
  return data;
}
function args(argv){
  if(argv.length===1&&argv[0]==='--help')return {help:true};
  const flags=new Map();
  for(let i=0;i<argv.length;i++){
    const key=argv[i];
    if(['--dry-run','--probe'].includes(key)){
      if(flags.has(key))throw Error('Duplicate probe flag');flags.set(key,true);
    }else if(['--reports-dir','--max-candidates'].includes(key)){
      if(flags.has(key)||!argv[i+1]||argv[i+1].startsWith('--'))
        throw Error('Malformed probe argument');
      flags.set(key,argv[++i]);
    }else throw Error('Unsupported probe argument');
  }
  if((flags.has('--probe')?1:0)+(flags.has('--dry-run')?1:0)!==1)
    throw Error('Exactly one probe action required');
  const dir=flags.get('--reports-dir');
  if(!dir||!path.isAbsolute(dir))throw Error('Absolute reports directory required');
  const max=Number(flags.get('--max-candidates')??100);
  if(!Number.isSafeInteger(max)||max<1||max>1000)throw Error('Invalid bounded probe cap');
  return {dir:path.resolve(dir),max,action:flags.has('--probe')?'probe':'dry-run'};
}
function declaredRoot(file,inventory){
  if(typeof file!=='string'||!path.isAbsolute(file)||path.normalize(file)!==file)
    throw Error('Invalid candidate path');
  const matching=inventory.roots.filter(x=>x.status==='accessible'&&
    typeof x.path==='string'&&path.isAbsolute(x.path)&&
    (file.startsWith(path.resolve(x.path)+path.sep)));
  if(!matching.length)throw Error('Candidate path not inside an accessible inventory root');
  matching.sort((a,b)=>b.path.length-a.path.length);
  return path.resolve(matching[0].path);
}
function symlinkFree(root,file){
  // Validate each traversed component in case a directory changed after inventory.
  const anchor=lstatSync(root);
  if(!anchor.isDirectory()||anchor.isSymbolicLink())
    throw Error('Source root replaced or symlinked');
  let current=root;
  const segments=path.relative(root,file).split(path.sep);
  for(let i=0;i<segments.length;i++){
    current=path.join(current,segments[i]);
    const st=lstatSync(current);
    if(st.isSymbolicLink()||st.dev!==anchor.dev)
      throw Error('Symlink or mountpoint detected');
    if(i<segments.length-1&&!st.isDirectory())
      throw Error('Non-directory component');
    if(i===segments.length-1&&!st.isFile())
      throw Error('Candidate no longer a regular file');
  }
}
function typeFromHeader(buf,n,name){
  if(n>=16&&buf.subarray(0,16).equals(Buffer.from('SQLite format 3\0','ascii')))
    return 'sqlite3_header';
  if(n>=4&&buf.subarray(0,4).equals(Buffer.from([0x28,0xb5,0x2f,0xfd])))
    return 'zstd_header';
  if(n>=6&&buf.subarray(0,6).equals(Buffer.from([0xfd,0x37,0x7a,0x58,0x5a,0])))
    return 'xz_header';
  if(n>=3&&buf[0]===0x1f&&buf[1]===0x8b&&buf[2]===0x08)
    return 'gzip_header';
  if(n>=4&&buf[0]===0x50&&buf[1]===0x4b&&[0x03,0x05,0x07].includes(buf[2]))
    return 'zip_header';
  if(n>=7&&buf.toString('ascii',257,262)==='ustar')
    return 'tar_header';
  if(n>=6&&buf.toString('ascii',0,6)==='7z\xbc\xaf\x27\x1c')
    return '7zip_header';
  const first=buf.toString('utf8',0,Math.min(n,512)).trimStart();
  if(/^(?:--\s*(?:MySQL|MariaDB)|\/\*![0-9]{5}|CREATE\s+TABLE\b|INSERT\s+INTO\b)/i.test(first))
    return 'sql_text_header';
  if(/^[\[{]/.test(first))return 'json_like_header_not_validated';
  if(/\.(?:sql|dump)(?:$|\.)/i.test(name))return 'sql_extension_unverified';
  if(/\.(?:sqlite|sqlite3|sdb|db)(?:$|\.)/i.test(name))
    return 'db_extension_without_sqlite_header';
  return 'unknown_header_no_content_classification';
}
function inspect(item,inventory){
  const row={path:item.path,sizeBytes:item.sizeBytes,
    modifiedUtc:item.modifiedUtc,inventoryConfidenceScore:item.confidenceScore,
    metadataStillMatches:false,signature:'not_inspected',
    headerBytesRead:0,possibleCoverage2022:'not_evaluated',
    originalWeatherSourceVerified:false,provenanceVerified:false,
    archiveContentsOpened:false};
  try{
    const root=declaredRoot(item.path,inventory);
    symlinkFree(root,item.path);
    const before=lstatSync(item.path);
    if(before.size!==item.sizeBytes||
       new Date(before.mtimeMs).toISOString()!==item.modifiedUtc)
      throw Error('changed_since_inventory');
    const fd=openSync(item.path,constants.O_RDONLY|
      (constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
    try{
      const after=fstatSync(fd);
      if(!after.isFile()||after.dev!==before.dev||after.ino!==before.ino||
         after.size!==before.size||after.mtimeMs!==before.mtimeMs)
        throw Error('changed_during_probe');
      const buf=Buffer.alloc(PREFIX),n=readSync(fd,buf,0,PREFIX,0);
      row.metadataStillMatches=true;
      row.signature=typeFromHeader(buf,n,path.basename(item.path));
      row.headerBytesRead=n;
    }finally{closeSync(fd);}
  }catch(e){
    // Do not print contents or exception paths. Unexpected candidates stay unverified.
    row.signature='not_inspected';
    row.reason=e?.code==='EACCES'?'access_denied':
      e?.message==='changed_since_inventory'?'changed_since_inventory':
      e?.code==='ENOENT'?'file_missing':
      e?.message==='changed_during_probe'?'changed_during_probe':
      'unsupported_or_unsafe_file';
  }
  return row;
}
function atomicPrivate(dir,report){
  const output=path.join(dir,OUTPUT),tmp=output+'.tmp-'+process.pid;
  const fd=openSync(tmp,'wx',0o600);
  try{writeFileSync(fd,JSON.stringify(report,null,2),'utf8');}
  finally{closeSync(fd);}
  try{
    if(existsSync(output)){
      const st=lstatSync(output);
      if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||
         (st.mode&0o077)!==0)throw Error('Unsafe prior probe output');
    }
    renameSync(tmp,output);
  }catch(e){unlinkSync(tmp);throw e;}
}
function main(){
  const a=args(process.argv.slice(2));
  if(a.help){
    process.stdout.write('Usage: qc-rh-backup-probe.mjs --reports-dir /var/lib/loucka-qc --dry-run|--probe [--max-candidates 100]\n');
    return;
  }
  privateDir(a.dir);
  const inventory=readInventory(a.dir);
  if(a.action==='dry-run'){
    process.stdout.write(JSON.stringify({action:a.action,
      inventoryStatus:inventory.status,found:inventory.candidates.length,
      toInspect:Math.min(a.max,inventory.candidates.length),
      fileContentsRead:0,databaseWrites:0})+'\n');return;
  }
  const entries=inventory.candidates.slice(0,a.max).map(x=>inspect(x,inventory));
  const partial=inventory.counts?.partial===true||entries.length<inventory.candidates.length||
    entries.some(x=>!x.metadataStillMatches);
  const report={schemaVersion:'1',probeVersion:'weather-header-magic-only-v1',
    status:partial?'partial_header_probe':'complete_header_probe',
    inventoryStatus:inventory.status,
    entries,totals:{candidateFiles:inventory.candidates.length,
      inspectedFiles:entries.filter(x=>x.metadataStillMatches).length,
      uninspectedFiles:entries.filter(x=>!x.metadataStillMatches).length,
      skippedByLimit:inventory.candidates.length-entries.length},
    notes:[
      'Only the first at most 512 bytes of each explicitly inventoried file have been read; no archive or SQLite/SQL data were parsed.',
      'File header signature and extension DO NOT prove historic humidity coverage, source sensor or original provenance.',
      'The inventory was partial if source roots were missing or inaccessible; uninspected candidates and other backup locations may still exist.',
      'No backup was copied, uncompressed, executed, indexed or changed. No estimated RH values were calculated.'
    ],safety:{databaseWrites:0,sourceFileWrites:0,automaticApprovals:false,
      automaticCorrections:false,reconstructedRhValues:0}};
  atomicPrivate(a.dir,report);
  process.stdout.write(JSON.stringify({action:'probe',status:report.status,
    totals:report.totals,
    candidates:entries.map(x=>({path:x.path,sizeBytes:x.sizeBytes,
      signature:x.signature,headerBytesRead:x.headerBytesRead,
      reason:x.reason??null})),output:path.join(a.dir,OUTPUT),
    safety:report.safety},null,2)+'\n');
}
try{main();}catch(e){
  process.stderr.write('Private header probe failed: check 0700 destination, 0600 inventory, or allowlisted candidate paths. No source file changes.\n');
  process.exitCode=1;
}
