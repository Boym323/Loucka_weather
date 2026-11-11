#!/usr/bin/env node
/**
 * PRIVATE offline-package export of PREEXISTING historical RH changes.
 * SELECT-only from MariaDB; absolutely no write to any database or API.
 */
import mariadb from 'mariadb';
import {constants,existsSync,lstatSync,openSync,writeFileSync,
  closeSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {buildRhPreviewPackage,previewPackageDigest} from './qc-rh-dev-preview-lib.mjs';
import {readExportDbConfig,validateExportGrants,safeGateMessage} from './qc-rh-preview-export-access.mjs';

function verifyPrivateFolder(dir){
 if(!path.isAbsolute(dir))throw Error('Expected absolute private reports dir');
 const root=path.resolve(dir);
 for(const forbidden of ['/home/loucka/Loucka_weather','/home/loucka/Loucka_weather-api',
   '/srv/loucka-preview','/var/www']){
  if(root===forbidden||root.startsWith(forbidden+'/'))
   throw Error('Never export into source checkout or public web root');
 }
 const st=lstatSync(root);
 if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||
    (st.mode&0o077)!==0)throw Error('Private output directory must be user-owned 0700');
 return root;
}
function parse(argv){
 if(argv.length===1&&argv[0]==='--help')return {help:true};
 const map=new Map();
 for(let i=0;i<argv.length;i++){
  const k=argv[i];
  if(k==='--dry-run'||k==='--check'||k==='--export'){
   if(map.has(k))throw Error('Duplicate action');map.set(k,true);
  }else if(k==='--reports-dir'){
   if(map.has(k)||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('Reports dir missing');
   map.set(k,argv[++i]);
  }else throw Error('Unsupported argument');
 }
 const actions=['--dry-run','--check','--export'].filter(k=>map.has(k));
 if(actions.length!==1||!map.has('--reports-dir'))
  throw Error('Usage requires exactly one action and --reports-dir');
 return {action:actions[0].slice(2),dir:map.get('--reports-dir')};
}
const sql=`SELECT c.id,c.target_time,c.variable,c.old_value,c.new_value,
 c.source_database,c.batch_key,c.state,
 o.dateTime AS original_time,o.outHumidity AS original_rh,
 r.dateTime AS reconstruction_time,r.outHumidity AS reconstruction_rh
 FROM \`loucka_reconstruction\`.\`reconstruction_changes\` c
 LEFT JOIN \`pocasi-loucka.eu\`.\`archive\` o ON o.dateTime=c.target_time
 LEFT JOIN \`loucka_reconstruction\`.\`archive\` r ON r.dateTime=c.target_time
 WHERE c.variable='outHumidity' AND c.state='applied'
 AND c.target_time>=1640995200 AND c.target_time<1672531200
 ORDER BY c.target_time,c.id LIMIT 5154`;
async function fetchChanges(checkOnly=false){
 let stage='config',conn;
 try{
  const config=readExportDbConfig();
  stage='connect';
  conn=await mariadb.createConnection(config.connection);
  stage='grants';
  const permissions=validateExportGrants(await conn.query('SHOW GRANTS'));
  stage='check';
  // Distinguish a SELECT GRANT from real table access, without reading RH.
  for(const table of [
   '`pocasi-loucka.eu`.`archive`',
   '`loucka_reconstruction`.`reconstruction_changes`',
   '`loucka_reconstruction`.`archive`'
  ])await conn.query('SELECT 1 FROM '+table+' LIMIT 1');
  if(checkOnly)return {credentialSet:config.credentialSet,permissions};
  stage='snapshot';
  await conn.query('SET TRANSACTION READ ONLY');
  await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
  try{
   stage='query';
   return {rows:await conn.query(sql),credentialSet:config.credentialSet};
  }finally{await conn.query('ROLLBACK');}
 }catch(error){
  const safe=safeGateMessage(error,stage);
  const wrapped=new Error(safe.code);
  wrapped.safeDetails=safe;
  throw wrapped;
 }finally{if(conn)await conn.end().catch(()=>{});}
}
function persist(dir,pkg){
 const digest=previewPackageDigest(pkg);
 const filename=`qc-rh-2022-dev-preview-${digest.slice(0,16)}.json`;
 const dest=path.join(dir,filename);
 const serialized=JSON.stringify(pkg)+'\n';
 // Content-addressed immutable artifact: NEVER overwrite a prior exported package.
 if(existsSync(dest))throw Error('Immutable preview package already exists; verify existing digest instead of overwriting');
 const fd=openSync(dest,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{writeFileSync(fd,serialized,'utf8');}
 catch(error){closeSync(fd);unlinkSync(dest);throw error;}
 closeSync(fd);
 return {filename,file:dest,sha256:digest};
}
async function main(){
 const opts=parse(process.argv.slice(2));
 if(opts.help){
  process.stdout.write('Usage: node qc-rh-dev-preview-export.mjs --reports-dir /var/lib/loucka-qc --dry-run|--check|--export\n');
  return;
 }
 const dir=verifyPrivateFolder(opts.dir);
 if(opts.action==='dry-run'){
  process.stdout.write(JSON.stringify({status:'screening_only',action:'dry-run',
   planned:'verify 5153 PREEXISTING applied RH changes with original and private reconstruction',
   source:'one explicitly read-only QC account with SELECT on three tables',
   outputDirectory:dir,databaseWrites:0,automaticApprovals:false,
   devPublishing:false})+'\n');return;
 }
 const result=await fetchChanges(opts.action==='check');
 if(opts.action==='check'){
  process.stdout.write(JSON.stringify({status:'ready_for_read_only_export',
   action:'check',credentialSet:result.credentialSet,
   ...result.permissions,rowsRead:0,packageCreated:false,
   databaseWrites:0,devPublishing:false})+'\n');
  return;
 }
 let packageData,saved;
 try{packageData=buildRhPreviewPackage(result.rows);}
 catch(error){
  const wrapped=new Error('SOURCE_DATA_VALIDATION_FAILED');
  wrapped.safeDetails=safeGateMessage(error,'validate');throw wrapped;
 }
 try{saved=persist(dir,packageData);}
 catch(error){
  const wrapped=new Error('PRIVATE_EXPORT_WRITE_FAILED');
  wrapped.safeDetails=safeGateMessage(error,'output');throw wrapped;
 }
 process.stdout.write(JSON.stringify({
  status:'experimental_unapproved',complete:true,
  counts:packageData.counts,packageVersion:packageData.packageVersion,
  recordsSha256:packageData.recordsSha256,
  output:saved.file,packageSha256:saved.sha256,
  safety:packageData.safety},null,2)+'\n');
}
try{await main();}catch(error){
 const safe=error?.safeDetails??safeGateMessage(error,'cli');
 process.stderr.write(JSON.stringify(safe)+'\n');
 process.exitCode=1;
}
