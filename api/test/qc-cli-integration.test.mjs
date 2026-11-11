/** Ephemeral MariaDB test only. Never executes against real meteorological data. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import mariadb from 'mariadb';
import {mkdtempSync,chmodSync,readdirSync,statSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildRhDay,dateRange} from '../scripts/qc-humidity-lib.mjs';
import {buildCommonDay} from '../scripts/qc-rh-triplets-lib.mjs';

const isolated=process.env.CI==='true'&&process.env.GITHUB_ACTIONS==='true'&&
  process.env.WEATHER_TEST_LOCAL_FIXTURE==='YES';
const q=name=>String.fromCharCode(96)+name+String.fromCharCode(96);
const ownDb=q('weewx_qc_original_ci_fixture'),refDb=q('weewx_qc_reference_ci_fixture');
const ownTable=ownDb+'.'+q('archive');
const refTable=refDb+'.'+q('reference_observations');
const base=Date.parse('2026-10-10T00:00:00Z')/1000;

test('QC CLI uses real SELECT-only cross-schema MariaDB and rejects admin credentials',
 {skip:!isolated},async t=>{
  const admin=await mariadb.createConnection({
    host:'127.0.0.1',port:3306,user:'root',password:'root'
  });
  t.after(async()=>{
    // The only writes are fixture cleanup in the short-lived CI-only database.
    await admin.query("DROP USER IF EXISTS 'qc_reader_ci'@'%'");
    await admin.query('DROP DATABASE IF EXISTS '+ownDb);
    await admin.query('DROP DATABASE IF EXISTS '+refDb);
    await admin.end();
  });
  await admin.query('CREATE DATABASE '+ownDb);
  await admin.query('CREATE DATABASE '+refDb);
  await admin.query('CREATE TABLE '+ownTable+' (dateTime INT PRIMARY KEY,'+
    'usUnits INT NOT NULL,'+q('interval')+' INT NOT NULL,'+
    'outTemp DOUBLE NULL,outHumidity DOUBLE NULL)');
  await admin.query('CREATE TABLE '+refTable+' (station_id VARCHAR(40) NOT NULL,'+
    'observed_at_utc BIGINT NOT NULL,temperature_c DOUBLE NULL,'+
    'relative_humidity_pct DOUBLE NULL,quality_status VARCHAR(40) NOT NULL,'+
    'PRIMARY KEY(station_id,observed_at_utc))');
  await admin.query('INSERT INTO '+ownTable+
    ' (dateTime,usUnits,'+q('interval')+',outTemp,outHumidity) VALUES (?,?,?,?,?)',
    [base,16,5,11,75]);
  await admin.query('INSERT INTO '+ownTable+
    ' (dateTime,usUnits,'+q('interval')+',outTemp,outHumidity) VALUES (?,?,?,?,?)',
    [base+300,16,5,12,75]);
  await admin.query('INSERT INTO '+refTable+
    ' (station_id,observed_at_utc,temperature_c,relative_humidity_pct,quality_status) VALUES (?,?,?,?,?)',
    ['luhamet_sehradice',base-8,10,80,'reference_only']);
  await admin.query('INSERT INTO '+refTable+
    ' (station_id,observed_at_utc,temperature_c,relative_humidity_pct,quality_status) VALUES (?,?,?,?,?)',
    ['luhamet_sehradice',base+292,11,80,'reference_only']);
  // Isolated 2022 RH fixture: original null, original measured and offset reference.
  const rhDay=Date.parse('2022-02-15T00:00:00Z')/1000;
  for(const [offset,rh] of [[0,null],[300,60]]){
    await admin.query('INSERT INTO '+ownTable+
      ' (dateTime,usUnits,'+q('interval')+',outTemp,outHumidity) VALUES (?,?,?,?,?)',
      [rhDay+offset,16,5,12,rh]);
  }
  for(const [station,offset,values] of [
    ['luhamet_sehradice',0,[51,62]],
    ['wu_ilouka4',-8,[53,59]]]){
    for(let i=0;i<2;i++)await admin.query('INSERT INTO '+refTable+
      ' (station_id,observed_at_utc,temperature_c,relative_humidity_pct,quality_status) VALUES (?,?,?,?,?)',
      [station,rhDay+i*300+offset,10,values[i],'reference_only']);
  }
  await admin.query("CREATE USER 'qc_reader_ci'@'%' IDENTIFIED BY 'qc_ci_select_fixture_only'");
  await admin.query('GRANT SELECT ON '+ownTable+" TO 'qc_reader_ci'@'%'");
  await admin.query('GRANT SELECT ON '+refTable+" TO 'qc_reader_ci'@'%'");

  const env={...process.env,WEATHER_STAGING_ENABLED:'YES',
    WEATHER_QC_READ_ONLY:'YES',WEATHER_QC_DB_HOST:'127.0.0.1',
    WEATHER_QC_DB_PORT:'3306',WEATHER_QC_CI_FIXTURE:'YES',WEATHER_QC_DB_USER:'qc_reader_ci',
    WEATHER_QC_DB_PASSWORD:'qc_ci_select_fixture_only'};
  const args=['scripts/qc-report.mjs','--from','2026-10-10T00:00:00Z',
    '--to','2026-10-10T01:00:00Z','--station','luhamet_sehradice'];
  const run=spawnSync(process.execPath,args,{cwd:process.cwd(),env,encoding:'utf8',timeout:15000});
  assert.equal(run.status,0,run.stderr);
  const body=JSON.parse(run.stdout);
  assert.equal(body.comparisons.luhamet_sehradice.matchedPairs,2);
  assert.equal(body.comparisons.luhamet_sehradice.meanBiasC,1);
  assert.equal(body.safety.databaseWrites,0);
  assert.equal(body.candidates.items.every(e=>e.automaticWriteAllowed===false),true);
  const fullRead=spawnSync(process.execPath,[...args,'--full-candidates'],
    {cwd:process.cwd(),env,encoding:'utf8',timeout:15000});
  assert.equal(fullRead.status,0,fullRead.stderr);
  const expanded=JSON.parse(fullRead.stdout);
  assert.equal(expanded.candidates.total,body.candidates.total);
  assert.deepEqual(expanded.candidates.items,body.candidates.items);
  assert.equal(expanded.candidates.truncated,false);
  assert.equal(expanded.safety.databaseWrites,0);
  const invalidFlag=spawnSync(process.execPath,[...args,'--full-candidates','--full-candidates'],
    {cwd:process.cwd(),env,encoding:'utf8',timeout:15000});
  assert.notEqual(invalidFlag.status,0);
  assert.equal(invalidFlag.stdout,'');
  // Full end-to-end batch: SELECT-only fixture -> owned 0600 report -> restart-safe summary.
  const folder=mkdtempSync(join(tmpdir(),'loucka-qc-fixture-'));
  chmodSync(folder,0o700);
  t.after(()=>rmSync(folder,{recursive:true,force:true}));
  const batchArgs=['scripts/qc-batch.mjs','--from','2026-10-10T00:00:00Z',
    '--to','2026-10-10T01:00:00Z','--output-dir',folder,
    '--station','luhamet_sehradice'];
  const first=spawnSync(process.execPath,batchArgs,
    {cwd:process.cwd(),env,encoding:'utf8',timeout:15000});
  assert.equal(first.status,0,first.stderr);
  assert.equal(JSON.parse(first.stdout).processedThisRun,1);
  const filenames=readdirSync(folder).filter(name=>name.endsWith('.json'));
  assert.equal(filenames.length,1);
  assert.equal(statSync(join(folder,filenames[0])).mode&0o777,0o600);
  const repeat=spawnSync(process.execPath,batchArgs,
    {cwd:process.cwd(),env,encoding:'utf8',timeout:15000});
  assert.equal(repeat.status,0,repeat.stderr);
  assert.equal(JSON.parse(repeat.stdout).processedThisRun,0);
  const summary=spawnSync(process.execPath,[...batchArgs,'--summary'],
    {cwd:process.cwd(),env:{},encoding:'utf8',timeout:15000});
  assert.equal(summary.status,0,summary.stderr);
  assert.equal(JSON.parse(summary.stdout).processedWindows,1);
  assert.equal(JSON.parse(summary.stdout).reliabilityByStation.luhamet_sehradice.matchedPairs,2);

  // Reproduce the already existing dev account: schema-wide SELECT on
  // original weather data, and table-only SELECT on the reference observations.
  await admin.query('REVOKE SELECT ON '+ownTable+" FROM 'qc_reader_ci'@'%'");
  await admin.query('GRANT SELECT ON '+ownDb+".* TO 'qc_reader_ci'@'%'");
  const existingReader=spawnSync(process.execPath,args,
    {cwd:process.cwd(),env,encoding:'utf8',timeout:15000});
  assert.equal(existingReader.status,0,existingReader.stderr);
  assert.equal(JSON.parse(existingReader.stdout).comparisons.luhamet_sehradice.matchedPairs,2);

  // Daily RH CLI uses exactly three bounded SELECT queries on the ephemeral fixture.
  const rhFolder=mkdtempSync(join(tmpdir(),'loucka-rh-ci-'));
  chmodSync(rhFolder,0o700);
  t.after(()=>rmSync(rhFolder,{recursive:true,force:true}));
  const rhArgs=['scripts/qc-humidity-2022.mjs','--reports-dir',rhFolder,
    '--from','2022-02-15','--to','2022-02-16','--run','--max-days','1','--delay-ms','0'];
  const rhRun=spawnSync(process.execPath,rhArgs,{
    cwd:process.cwd(),env,encoding:'utf8',timeout:15000});
  assert.equal(rhRun.status,0,rhRun.stderr);
  const rhResult=JSON.parse(rhRun.stdout);
  assert.equal(rhResult.complete,false);
  assert.equal(rhResult.pendingDays,364);
  assert.equal(rhResult.analyzedDays,1);
  assert.equal(rhResult.totals.originalRhNullSlots,1);
  assert.equal(rhResult.totals.originalRhMeasuredSlots,1);
  assert.equal(rhResult.totals.missingRhTwoRefsAgreeSlots,1);
  assert.equal(rhResult.safety.databaseWrites,0);
  const rhReport=JSON.parse(readFileSync(join(rhFolder,'qc-rh-2022-2022-02-15.json'),'utf8'));
  assert.equal(rhReport.referenceEvidence.length,1);
  assert.equal(rhReport.referenceEvidence[0].proposedOriginalRhPct,null);
  for(const name of readdirSync(rhFolder).filter(n=>n.endsWith('.json')))
    assert.equal(statSync(join(rhFolder,name)).mode&0o777,0o600);
  const rhRepeat=spawnSync(process.execPath,rhArgs,{
    cwd:process.cwd(),env,encoding:'utf8',timeout:15000});
  assert.equal(rhRepeat.status,0,rhRepeat.stderr);
  assert.equal(JSON.parse(rhRepeat.stdout).processedThisRun,0);
  // Fair-comparison regression: identical source/LuhaMet/WU slots on the
  // ephemeral MariaDB. Older 365 daily QC reports are immutable inputs.
  for(const day of dateRange()){
    if(day==='2022-02-15')continue;
    writeFileSync(join(rhFolder,'qc-rh-2022-'+day+'.json'),JSON.stringify(
      buildRhDay({day,original:[],references:{
        luhamet_sehradice:[],wu_ilouka4:[]}})),{flag:'wx',mode:0o600});
  }
  const tripletArgs=['scripts/qc-rh-triplets.mjs','--reports-dir',rhFolder,
    '--from','2022-02-15','--to','2022-02-16','--run','--max-days','1',
    '--delay-ms','0'];
  const triplet=spawnSync(process.execPath,tripletArgs,{
    cwd:process.cwd(),env,encoding:'utf8',timeout:20000});
  assert.equal(triplet.status,0,triplet.stderr);
  const scored=JSON.parse(triplet.stdout);
  assert.equal(scored.analyzedDays,1);
  assert.equal(scored.pendingDays,364);
  assert.equal(scored.overall.pairs,1);
  assert.equal(scored.overall.maeLuhaPctPoints,2);
  assert.equal(scored.overall.maeWuPctPoints,1);
  assert.equal(scored.overall.advantageWuMaePctPoints,1);
  assert.equal(scored.safety.databaseWrites,0);
  assert.equal(scored.complete,false);
  const rerun=spawnSync(process.execPath,tripletArgs,{
    cwd:process.cwd(),env,encoding:'utf8',timeout:20000});
  assert.equal(rerun.status,0,rerun.stderr);
  assert.equal(JSON.parse(rerun.stdout).processedThisRun,0);
  for(const name of readdirSync(rhFolder).filter(n=>n.includes('triplet')))
    assert.equal(statSync(join(rhFolder,name)).mode&0o777,0o600);

  // Purged RH validation consumes the same 365 immutable daily baselines
  // and triplets. The production RH and references are never edited.
  for(const day of dateRange()){
    if(day==='2022-02-15')continue;
    const rh=JSON.parse(readFileSync(join(rhFolder,'qc-rh-2022-'+day+'.json'),'utf8'));
    const t=buildCommonDay({day,original:[],references:{
      luhamet_sehradice:[],wu_ilouka4:[]},baseline:rh});
    writeFileSync(join(rhFolder,'qc-rh-triplet-2022-'+day+'.json'),
      JSON.stringify(t),{flag:'wx',mode:0o600});
  }
  const holdoutArgs=['scripts/qc-rh-holdout.mjs','--reports-dir',rhFolder,
    '--run','--max-days','1','--delay-ms','0'];
  const holdout=spawnSync(process.execPath,holdoutArgs,
    {cwd:process.cwd(),env,encoding:'utf8',timeout:20000});
  assert.equal(holdout.status,0,holdout.stderr);
  const evaluated=JSON.parse(holdout.stdout);
  assert.equal(evaluated.analyzedDays,1);
  assert.equal(evaluated.pendingDays,364);
  assert.equal(evaluated.complete,false);
  assert.equal(evaluated.safety.databaseWrites,0);
  const holdoutFile=JSON.parse(readFileSync(
    join(rhFolder,'qc-rh-holdout-2022-2022-02-15.json'),'utf8'));
  assert.equal(holdoutFile.samples.length,1);
  assert.equal(holdoutFile.samples[0].o,60);
  assert.equal(holdoutFile.samples[0].l,62);
  assert.equal(holdoutFile.samples[0].w,59);
  assert.equal(holdoutFile.safety.replacementRhPct,null);
  const holdoutAgain=spawnSync(process.execPath,holdoutArgs,
    {cwd:process.cwd(),env,encoding:'utf8',timeout:20000});
  assert.equal(holdoutAgain.status,0,holdoutAgain.stderr);
  assert.equal(JSON.parse(holdoutAgain.stdout).processedThisRun,0);
  assert.equal(statSync(join(rhFolder,'qc-rh-holdout-2022-2022-02-15.json'))
    .mode&0o777,0o600);

  // Reference database-wide access is still forbidden.
  await admin.query('GRANT SELECT ON '+refDb+".* TO 'qc_reader_ci'@'%'");
  const widenedReference=spawnSync(process.execPath,args,
    {cwd:process.cwd(),env,encoding:'utf8',timeout:15000});
  assert.notEqual(widenedReference.status,0);
  assert.match(widenedReference.stderr,/SELECT-only/);
  await admin.query('REVOKE SELECT ON '+refDb+".* FROM 'qc_reader_ci'@'%'");

  // Write-capable grants remain rejected before a weather query.
  await admin.query('GRANT UPDATE ON '+ownTable+" TO 'qc_reader_ci'@'%'");
  const writer=spawnSync(process.execPath,args,
    {cwd:process.cwd(),env,encoding:'utf8',timeout:15000});
  assert.notEqual(writer.status,0);
  assert.equal(writer.stdout,'');
  assert.match(writer.stderr,/SELECT-only/);
  await admin.query('REVOKE UPDATE ON '+ownTable+" FROM 'qc_reader_ci'@'%'");

  // Accelerated catch-up still runs the exact SELECT-only qc-report for each
  // 7-day slice; test resumability and cap on an ephemeral CI-only database.
  const fastFolder=mkdtempSync(join(tmpdir(),'loucka-qc-catchup-'));
  chmodSync(fastFolder,0o700);
  t.after(()=>rmSync(fastFolder,{recursive:true,force:true}));
  const fastArgs=['scripts/qc-batch.mjs','--from','2026-10-10T00:00:00Z',
    '--to','2026-10-25T00:00:00Z','--output-dir',fastFolder,
    '--station','luhamet_sehradice','--catch-up','--delay-ms','1000'];
  const firstFast=spawnSync(process.execPath,[...fastArgs,'--max-windows','2'],
    {cwd:process.cwd(),env,encoding:'utf8',timeout:15000});
  assert.equal(firstFast.status,0,firstFast.stderr);
  const firstLines=firstFast.stdout.trim().split('\n').map(line=>JSON.parse(line));
  const firstResult=firstLines.at(-1);
  assert.equal(firstResult.mode,'catch-up');
  assert.equal(firstResult.processedThisRun,2);
  assert.equal(firstResult.pendingWindows,1);
  assert.equal(firstResult.safety.databaseWrites,0);
  assert.equal(readdirSync(fastFolder).filter(n=>n.endsWith('.json')).length,2);
  const secondFast=spawnSync(process.execPath,[...fastArgs,'--max-windows','2'],
    {cwd:process.cwd(),env,encoding:'utf8',timeout:15000});
  assert.equal(secondFast.status,0,secondFast.stderr);
  const secondResult=JSON.parse(secondFast.stdout.trim().split('\n').at(-1));
  assert.equal(secondResult.processedThisRun,1);
  assert.equal(secondResult.pendingWindows,0);
  assert.equal(readdirSync(fastFolder).filter(n=>n.endsWith('.json')).length,3);
  const repeatFast=spawnSync(process.execPath,[...fastArgs,'--max-windows','2'],
    {cwd:process.cwd(),env,encoding:'utf8',timeout:15000});
  assert.equal(repeatFast.status,0,repeatFast.stderr);
  assert.equal(JSON.parse(repeatFast.stdout).processedThisRun,0);
  const offline=spawnSync(process.execPath,['scripts/qc-batch.mjs',
    '--from','2026-10-10T00:00:00Z','--to','2026-10-25T00:00:00Z',
    '--output-dir',fastFolder,'--station','luhamet_sehradice','--summary'],
    {cwd:process.cwd(),env:{},encoding:'utf8',timeout:15000});
  assert.equal(offline.status,0,offline.stderr);
  assert.equal(JSON.parse(offline.stdout).processedWindows,3);
  assert.equal(JSON.parse(offline.stdout).pendingWindows,0);
  for(const name of readdirSync(fastFolder).filter(n=>n.endsWith('.json')))
    assert.equal(statSync(join(fastFolder,name)).mode&0o777,0o600);

  const privileged=spawnSync(process.execPath,args,{cwd:process.cwd(),
    env:{...env,WEATHER_QC_DB_USER:'root',WEATHER_QC_DB_PASSWORD:'root'},
    encoding:'utf8',timeout:15000});
  assert.notEqual(privileged.status,0);
  assert.equal(privileged.stdout,'');
  assert.match(privileged.stderr,/SELECT-only/);
  assert.doesNotMatch(privileged.stderr,/root@|qc_ci_select_fixture_only|SHOW GRANTS/i);
});
