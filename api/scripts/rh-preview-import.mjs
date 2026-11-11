#!/usr/bin/env node
/** Manually gated copy of an immutable private RH manifest to a separate
 * dev-only preview schema. NEVER touches original or reconstruction DB.
 * NO DDL and no public activation. APPEND-ONLY INSERT in one transaction.
 */
import mariadb from 'mariadb';
import {lstatSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {validatePreviewManifest} from './rh-preview-transfer-lib.mjs';

const usage='--dry-run|--verify-target|--import --manifest /var/lib/loucka-qc/qc-rh-preview-rh2022-....json [--ack-unapproved-dev-only]';
const fail=(message)=>{throw Error(message)};
function readArgs(argv){
 const action=argv[0];
 if(!['--dry-run','--verify-target','--import'].includes(action)||
    argv[1]!=='--manifest'||!argv[2]||!path.isAbsolute(argv[2])||
    (action==='--import'?
      argv.length!==4||argv[3]!=='--ack-unapproved-dev-only':
      argv.length!==3))
  fail('Usage: '+usage);
 return {action,filename:path.resolve(argv[2])};
}
const input=readArgs(process.argv.slice(2));
const dirname=path.dirname(input.filename);
const folder=lstatSync(dirname),stat=lstatSync(input.filename);
if(!folder.isDirectory()||folder.isSymbolicLink()||folder.uid!==process.getuid()||
   (folder.mode&0o077)!==0||
   !stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid()||
   (stat.mode&0o077)!==0||stat.size>4*1024*1024||
   !path.basename(input.filename).startsWith('qc-rh-preview-rh2022-'))
 fail('Input must be immutable 0600 JSON inside a private owned 0700 QC directory');
const manifest=JSON.parse(readFileSync(input.filename,'utf8'));
const checked=validatePreviewManifest(manifest);
if(path.basename(input.filename)!=='qc-rh-preview-'+checked.versionId+'.json')
 fail('Filename does not match version checksum');
if(input.action==='--dry-run'){
 process.stdout.write(JSON.stringify({mode:'dry-run',versionId:checked.versionId,
  totals:checked.totals,verifiedChecksum:checked.sha256,
  imported:false,databaseWrites:0,approved:false},null,2)+'\n');
}else{
 const schema=process.env.WEATHER_PREVIEW_TARGET_SCHEMA;
 if(!schema||!/^loucka_dev_[a-z0-9_]{1,40}$/.test(schema))
  fail('Target schema must be explicitly named loucka_dev_*');
 if(process.env.WEATHER_PREVIEW_IMPORT_ENABLED!=='YES')
  fail('Explicit WEATH​ER_PREVIEW_IMPORT_ENABLED=YES required'.replace('\u200b',''));
 const host=process.env.WEATHER_PREVIEW_DB_HOST;
 const user=process.env.WEATHER_PREVIEW_WRITER_USER;
 const password=process.env.WEATHER_PREVIEW_WRITER_PASSWORD;
 const port=Number(process.env.WEATHER_PREVIEW_DB_PORT??3306);
 if(!host||!user||!password||!Number.isSafeInteger(port)||port<1||port>65535)
  fail('Separate dev-only importer credentials and host required');
 const db=await mariadb.createConnection({host,port,user,password,database:schema,connectTimeout:3000});
 try{
  const grants=(await db.query('SHOW GRANTS')).flatMap(r=>Object.values(r)).map(String);
  const dangerous=/\b(?:ALL PRIVILEGES|UPDATE|DELETE|ALTER|DROP|CREATE|TRIGGER|EVENT|FILE|SUPER|GRANT OPTION|RELOAD|EXECUTE|PROCESS|REFERENCES)\b/i;
  if(grants.some(g=>dangerous.test(g))||grants.some(g=>/\b(?:SELECT|INSERT)\b/i.test(g)&&/\bON\s+\*\.\*/i.test(g))||
     !grants.some(g=>/\bSELECT\b/i.test(g))||
     !grants.some(g=>/\bINSERT\b/i.test(g)&&g.includes(schema)))
   fail('Importer must have only scoped SELECT+INSERT on dev preview schema');
  const versions='`'+schema+'`.`rh_preview_versions`';
  const points='`'+schema+'`.`rh_preview_points`';
  // Verify the table exists and is correctly scoped before beginning a transaction.
  const cols=await db.query(`SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=? AND TABLE_NAME IN ('rh_preview_versions','rh_preview_points')`,[schema]);
  const forTable=t=>new Set(cols.filter(c=>c.TABLE_NAME===t).map(c=>c.COLUMN_NAME));
  for(const [table,names] of [
    ['rh_preview_versions',['version_id','checksum_sha256','model','status',
      'point_total','estimated_total','frozen_adjusted_total','invalidated_total']],
    ['rh_preview_points',['version_id','dateTime','original_rh','preview_rh',
      'quality','category','method','source_batch','review_state']]
  ]){
   const known=forTable(table);
   if(names.some(k=>!known.has(k)))fail('Dev-only preview schema migration is missing/incomplete');
  }
  const present=await db.query(`SELECT version_id,checksum_sha256,point_total
   FROM ${versions} WHERE version_id=? LIMIT 1`,[checked.versionId]);
  if(present.length){
   if(present[0].checksum_sha256!==checked.sha256||
      Number(present[0].point_total)!==checked.totals.total)
    fail('Same preview version exists but its checksum/count differs');
   const actual=await db.query(`SELECT COUNT(*) AS n FROM ${points} WHERE version_id=?`,
     [checked.versionId]);
   if(Number(actual[0].n)!==checked.totals.total)fail('Existing version is incomplete');
   process.stdout.write(JSON.stringify({mode:'already_imported',versionId:checked.versionId,
     imported:false,pointCount:checked.totals.total,approved:false,databaseWrites:0})+'\n');
  }else if(input.action==='--verify-target'){
   process.stdout.write(JSON.stringify({mode:'target_verified_no_writes',
     targetSchema:schema,versionId:checked.versionId,existing:false,
     pointCount:checked.totals.total,approved:false,databaseWrites:0})+'\n');
  }else{
   let started=false;
   try{
    await db.beginTransaction();started=true;
    // Immutable version published only after all rows pass DB constraints in a single commit.
    await db.query(`INSERT INTO ${versions}
     (version_id,checksum_sha256,model,status,point_total,estimated_total,
      frozen_adjusted_total,invalidated_total) VALUES (?,?,?,?,?,?,?,?)`,
     [checked.versionId,checked.sha256,manifest.model,'experimental_unapproved',
      checked.totals.total,checked.totals.estimated,
      checked.totals.frozen_adjusted,checked.totals.invalidated]);
    for(let i=0;i<manifest.rows.length;i+=100){
     const slice=manifest.rows.slice(i,i+100);
     const placeholders=slice.map(()=>'(?,?,?,?,?,?,?,?,?)').join(',');
     const values=slice.flatMap(x=>[checked.versionId,x.epoch,x.originalRh,x.previewRh,
       x.quality,x.category,x.method,x.sourceBatch,x.reviewState]);
     await db.query(`INSERT INTO ${points}
       (version_id,dateTime,original_rh,preview_rh,quality,category,method,
        source_batch,review_state) VALUES ${placeholders}`,values);
    }
    const totals=await db.query(`SELECT category,COUNT(*) AS n FROM ${points}
      WHERE version_id=? GROUP BY category`,[checked.versionId]);
    const found=Object.fromEntries(totals.map(r=>[r.category,Number(r.n)]));
    for(const k of ['estimated','frozen_adjusted','invalidated'])
     if(found[k]!==checked.totals[k])fail('Transactional reconciliation failed');
    await db.commit();started=false;
    process.stdout.write(JSON.stringify({mode:'imported_experimental_unapproved',
      targetSchema:schema,versionId:checked.versionId,rows:checked.totals.total,
      onlyDevSchema:true,activeVersionChanged:false,approved:false,
      productionWrites:0,sourceReconstructionWrites:0},null,2)+'\n');
   }catch(e){if(started)await db.rollback();throw e;}
  }
 }finally{await db.end();}
}
