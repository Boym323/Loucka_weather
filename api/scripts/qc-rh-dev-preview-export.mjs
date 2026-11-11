#!/usr/bin/env node
/**
 * PRIVATE offline-package export of PREEXISTING historical RH changes.
 * SELECT-only from MariaDB; absolutely no write to any database or API.
 */
import mariadb from 'mariadb';
import {constants,existsSync,lstatSync,mkdirSync,openSync,writeFileSync,
  closeSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {buildRhPreviewPackage,previewPackageDigest} from './qc-rh-dev-preview-lib.mjs';

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
  if(k==='--dry-run'||k==='--export'){
   if(map.has(k))throw Error('Duplicate action');map.set(k,true);
  }else if(k==='--reports-dir'){
   if(map.has(k)||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('Reports dir missing');
   map.set(k,argv[++i]);
  }else throw Error('Unsupported argument');
 }
 if(map.has('--export')===map.has('--dry-run')||!map.has('--reports-dir'))
  throw Error('Usage requires one action and --reports-dir');
 return {action:map.has('--export')?'export':'dry-run',dir:map.get('--reports-dir')};
}
function required(name){
 const value=process.env[name];
 if(!value)throw Error('Missing private QC environment '+name);
 return value;
}
function guardGrants(rows){
 const grants=rows.flatMap(row=>Object.values(row)).filter(v=>typeof v==='string');
 const forbidden=/\b(?:ALL PRIVILEGES|INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRIGGER|EVENT|FILE|SUPER|RELOAD|GRANT OPTION|REFERENCES|LOCK TABLES|PROCESS|EXECUTE)\b/i;
 if(!grants.length||grants.some(s=>forbidden.test(s))||
   !grants.some(s=>/\bSELECT\b/i.test(s)))throw Error('QC database account must be SELECT-only');
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
async function fetchChanges(){
 if(process.env.WEATHER_QC_READ_ONLY!=='YES'||
    process.env.WEATHER_STAGING_ENABLED!=='YES')
  throw Error('Explicit QC read-only flags required');
 const port=Number(process.env.WEATHER_DB_PORT||3306);
 if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('Invalid port');
 const conn=await mariadb.createConnection({
  host:required('WEATHER_DB_HOST'),port,
  user:required('WEATHER_DB_USER'),password:required('WEATHER_DB_PASSWORD'),
  database:'loucka_reconstruction',connectTimeout:3000,
  multipleStatements:false
 });
 try{
  guardGrants(await conn.query('SHOW GRANTS'));
  // Freeze one repeatable-read snapshot: no locks, no mutations, no user data changes.
  await conn.query('SET TRANSACTION READ ONLY');
  await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
  try{
   const result=await conn.query(sql);
   return result;
  }finally{await conn.query('ROLLBACK');}
 }finally{await conn.end();}
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
  process.stdout.write('Usage: node qc-rh-dev-preview-export.mjs --reports-dir /var/lib/loucka-qc --dry-run|--export\n');
  return;
 }
 const dir=verifyPrivateFolder(opts.dir);
 if(opts.action==='dry-run'){
  process.stdout.write(JSON.stringify({status:'screening_only',action:'dry-run',
   planned:'verify 5153 PREEXISTING applied RH changes with original and private reconstruction',
   source:'SELECT-only two read accounts/tables on the same MariaDB instance',
   outputDirectory:dir,databaseWrites:0,automaticApprovals:false,
   devPublishing:false})+'\n');return;
 }
 const rows=await fetchChanges();
 const packageData=buildRhPreviewPackage(rows);
 const saved=persist(dir,packageData);
 process.stdout.write(JSON.stringify({
  status:'experimental_unapproved',complete:true,
  counts:packageData.counts,packageVersion:packageData.packageVersion,
  recordsSha256:packageData.recordsSha256,
  output:saved.file,packageSha256:saved.sha256,
  safety:packageData.safety},null,2)+'\n');
}
try{await main();}catch(error){
 process.stderr.write('RH dev preview export blocked. Confirm SELECT-only QC credentials, access to both original and reconstruction schemas, 0700 destination, and unchanged historical audit counts. NO DB changes were made.\n');
 process.exitCode=1;
}
