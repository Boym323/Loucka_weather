#!/usr/bin/env node
/** Export a PRIVATE immutable preview of historical RH changes. SELECT ONLY.
 * Never reads or modifies production backup files. No transfer to dev here.
 */
import mariadb from 'mariadb';
import {constants,existsSync,lstatSync,openSync,writeFileSync,closeSync,
  readFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {buildPreviewManifest} from './rh-preview-transfer-lib.mjs';
const reject=(message)=>{throw Error(message);};
const required=(k)=>process.env[k]||reject('Missing environment '+k);
const schemaOriginal='`pocasi-loucka.eu`.`archive`';
const schemaReconstruction='`loucka_reconstruction`.`archive`';
const changes='`loucka_reconstruction`.`reconstruction_changes`';
const QUERY=`SELECT c.target_time,c.variable,c.state,c.old_value,c.new_value,
 c.batch_key,c.reason,
 o.outHumidity AS originalRh,o.outTemp AS originalTemp,o.usUnits AS originalUnits,
 r.outHumidity AS reconstructionRh,r.outTemp AS reconstructionTemp,
 r.usUnits AS reconstructionUnits
 FROM ${changes} c
 LEFT JOIN ${schemaOriginal} o ON o.dateTime=c.target_time
 LEFT JOIN ${schemaReconstruction} r ON r.dateTime=c.target_time
 WHERE c.variable='outHumidity' AND c.state='applied'
 AND c.target_time>=1640995200 AND c.target_time<1672531200
 ORDER BY c.target_time LIMIT 5154`;
const safety=(dir)=>{
 if(!path.isAbsolute(dir))reject('Absolute output directory required');
 const st=lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||
    (st.mode&0o077)!==0)reject('Private output directory must be owned 0700');
 const p=path.resolve(dir);
 if(p.startsWith('/srv/')||p.startsWith('/home/loucka/Loucka_weather/'))
  reject('No public or Git repository output paths');
 return p;
};
const args=process.argv.slice(2);
if(args.length!==3||!['--dry-run','--export'].includes(args[0])||
   args[1]!=='--reports-dir')reject('Usage: --dry-run|--export --reports-dir /var/lib/loucka-qc');
const dir=safety(args[2]);
if(args[0]==='--dry-run'){
 process.stdout.write(JSON.stringify({mode:'dry-run',operation:'SELECT-only 2022 applied RH lineage export',
  expected:5153,schemaTargets:['pocasi-loucka.eu','loucka_reconstruction'],
  databaseWrites:0,outputDirectory:dir})+'\n');
}else{
 if(process.env.WEATHER_QC_READ_ONLY!=='YES'||process.env.WEATHER_STAGING_ENABLED!=='YES')
  reject('Two explicit read-only staging flags required');
 const port=Number(process.env.WEATHER_DB_PORT??3306);
 if(!Number.isSafeInteger(port)||port<=0||port>65535)
  reject('Invalid database port');
 const conn=await mariadb.createConnection({
  host:required('WEATHER_DB_HOST'),port,
  user:required('WEATHER_DB_USER'),password:required('WEATHER_DB_PASSWORD'),
  connectTimeout:3000
 });
 try{
  const grants=Object.values((await conn.query('SHOW GRANTS')).at(0)??{});
  const textGrants=grants.filter?grants.map(String).join(' '):String(grants.join?.(' ')??grants);
  if(!/\bSELECT\b/i.test(textGrants)||
     /\b(?:ALL PRIVILEGES|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRIGGER|EVENT|FILE|SUPER|GRANT OPTION|LOCK TABLES|RELOAD|EXECUTE|PROCESS|REFERENCES)\b/i.test(textGrants))
    reject('Source RH credentials must be SELECT-only');
  const records=await conn.query(QUERY);
  const manifest=buildPreviewManifest(records);
  const file=path.join(dir,'qc-rh-preview-'+manifest.versionId+'.json');
  const data=JSON.stringify(manifest);
  if(existsSync(file)){
   const st=lstatSync(file);
   if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||
      (st.mode&0o077)!==0||st.size>4*1024*1024||
      readFileSync(file,'utf8')!==data)
    reject('Existing immutable manifest differs or is unsafe');
  }else{
   let fd;
   try{
    fd=openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600);
    writeFileSync(fd,data,'utf8');
   }catch(error){
    if(fd!==undefined){closeSync(fd);fd=undefined;unlinkSync(file);}
    throw error;
   }finally{if(fd!==undefined)closeSync(fd);}
  }
  process.stdout.write(JSON.stringify({mode:'exported_experimental_manifest',
    versionId:manifest.versionId,sha256:manifest.sha256,totals:manifest.totals,
    output:file,approved:false,databaseWrites:0},null,2)+'\n');
 }finally{await conn.end();}
}
