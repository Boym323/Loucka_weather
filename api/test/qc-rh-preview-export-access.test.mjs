import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
 readExportDbConfig,validateExportGrants,PreviewExportGateError,
 safeGateMessage,REQUIRED_SCOPES
} from '../scripts/qc-rh-preview-export-access.mjs';

const fullQc={
 WEATHER_STAGING_ENABLED:'YES',WEATHER_QC_READ_ONLY:'YES',
 WEATHER_QC_DB_HOST:'127.0.0.1',WEATHER_QC_DB_USER:'reader',
 WEATHER_QC_DB_PASSWORD:'TOP_SECRET_DO_NOT_LOG',WEATHER_QC_DB_PORT:'3306'
};
const required=[
 'GRANT USAGE ON *.* TO `reader`@`%`',
 'GRANT SELECT ON `pocasi-loucka.eu`.`archive` TO `reader`@`%`',
 'GRANT SELECT ON `loucka_reconstruction`.`reconstruction_changes` TO `reader`@`%`',
 'GRANT SELECT ON `loucka_reconstruction`.`archive` TO `reader`@`%`'
].map(x=>x.replaceAll('`',String.fromCharCode(96)));
const rows=(grants)=>grants.map(x=>({'Grants for reader@%':x}));

test('existing QC database env variable names are accepted; no api-env fallback',()=>{
 const cfg=readExportDbConfig(fullQc);
 assert.equal(cfg.credentialSet,'existing_qc');
 assert.equal(cfg.connection.host,'127.0.0.1');
 assert.equal(cfg.connection.user,'reader');
 assert.equal(cfg.connection.password,'TOP_SECRET_DO_NOT_LOG');
 assert.equal(cfg.connection.database,undefined);
 assert.equal(cfg.connection.multipleStatements,false);
 assert.throws(()=>readExportDbConfig({
  WEATHER_STAGING_ENABLED:'YES',WEATHER_QC_READ_ONLY:'YES',
  WEATHER_DB_HOST:'prod-db',WEATHER_DB_USER:'prod-user',
  WEATHER_DB_PASSWORD:'WRONG'
 }),e=>e.code==='DB_CONFIG_MISSING'&&e.detail.credentialSet==='existing_qc');
});

test('dedicated export identity wins and cannot blend with existing QC fields',()=>{
 const env={...fullQc,WEATHER_RH_EXPORT_DB_HOST:'private',
  WEATHER_RH_EXPORT_DB_USER:'export',WEATHER_RH_EXPORT_DB_PASSWORD:'exportsecret'};
 assert.equal(readExportDbConfig(env).credentialSet,'rh_export');
 assert.equal(readExportDbConfig(env).connection.user,'export');
 delete env.WEATHER_RH_EXPORT_DB_USER;
 assert.throws(()=>readExportDbConfig(env),e=>e.code==='DB_CONFIG_MISSING'&&e.detail.credentialSet==='rh_export');
 assert.throws(()=>readExportDbConfig({...fullQc,WEATHER_QC_READ_ONLY:'NO'}),
  e=>e.code==='QC_FLAGS_REQUIRED');
});

test('three exact SELECT permissions are required, existing QC reference grant is permitted',()=>{
 assert.deepEqual(validateExportGrants(rows(required)),
  {readOnly:true,requiredScopes:3});
 const extra='GRANT SELECT ON `loucka_reconstruction`.`reference_observations` TO `reader`@`%`'
  .replaceAll('`',String.fromCharCode(96));
 assert.equal(validateExportGrants(rows([...required,extra])).readOnly,true);
 const originalOnly=rows([
  required[0],required[1],extra
 ]);
 assert.throws(()=>validateExportGrants(originalOnly),e=>
  e.code==='SELECT_SCOPE_MISSING'&&e.detail.missingScopes.length===2);
});

test('reject global grants, mutations and grant option; allow narrow database SELECT',()=>{
 const global= 'GRANT SELECT ON *.* TO `reader`@`%`'.replaceAll('`',String.fromCharCode(96));
 const writable='GRANT UPDATE ON `loucka_reconstruction`.`archive` TO `reader`@`%`'
  .replaceAll('`',String.fromCharCode(96));
 for(const g of [global,writable]){
  assert.throws(()=>validateExportGrants(rows([...required,g])),
   e=>e.code==='WRITE_CAPABLE_OR_UNSUPPORTED_GRANTS');
 }
 const grantOption=required[1]+' WITH GRANT OPTION';
 assert.throws(()=>validateExportGrants(rows([...required,grantOption])),
  e=>e.code==='WRITE_CAPABLE_GRANTS');
 const wideReconstruction='GRANT SELECT ON `loucka_reconstruction`.* TO `reader`@`%`'
  .replaceAll('`',String.fromCharCode(96));
 assert.equal(validateExportGrants(rows([required[0],wideReconstruction])).readOnly,true);
});

test('failures only show allowlisted stages and table scopes, never raw secrets',()=>{
 const driver=new Error('Access denied for reader@localhost using password TOP_SECRET_DO_NOT_LOG');
 const item=safeGateMessage(driver,'connect');
 assert.equal(item.code,'DB_CONNECTION_UNAVAILABLE');
 assert.equal(JSON.stringify(item).includes('TOP_SECRET'),false);
 assert.equal(item.databaseWrites,0);
 assert.equal(item.devPublishing,false);
 const missing=new PreviewExportGateError('SELECT_SCOPE_MISSING',
  {missingScopes:REQUIRED_SCOPES.slice(1)});
 assert.equal(safeGateMessage(missing,'grants').detail.missingScopes.length,2);
});

test('CLI --check refuses absent QC config without DB connection and prints safe JSON',t=>{
 const dir=mkdtempSync(join(tmpdir(),'qc-rh-export-access-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const privateDir=join(dir,'private');mkdirSync(privateDir);chmodSync(privateDir,0o700);
 const r=spawnSync(process.execPath,[
  'scripts/qc-rh-dev-preview-export.mjs','--reports-dir',privateDir,'--check'
 ],{cwd:process.cwd(),env:{...process.env,
  WEATHER_STAGING_ENABLED:'YES',WEATHER_QC_READ_ONLY:'YES',
  WEATHER_QC_DB_HOST:'',WEATHER_QC_DB_USER:'',WEATHER_QC_DB_PASSWORD:''
 },encoding:'utf8',timeout:10000});
 assert.notEqual(r.status,0);
 const body=JSON.parse(r.stderr);
 assert.equal(body.code,'DB_CONFIG_MISSING');
 assert.equal(body.databaseWrites,0);
 assert.equal(r.stdout,'');
 assert.equal(r.stderr.includes('TOP_SECRET_DO_NOT_LOG'),false);
});
