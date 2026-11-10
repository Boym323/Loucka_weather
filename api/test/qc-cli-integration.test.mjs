/** Ephemeral MariaDB test only. Never executes against real meteorological data. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import mariadb from 'mariadb';
import {mkdtempSync,chmodSync,readdirSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

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

  const privileged=spawnSync(process.execPath,args,{cwd:process.cwd(),
    env:{...env,WEATHER_QC_DB_USER:'root',WEATHER_QC_DB_PASSWORD:'root'},
    encoding:'utf8',timeout:15000});
  assert.notEqual(privileged.status,0);
  assert.equal(privileged.stdout,'');
  assert.match(privileged.stderr,/SELECT-only/);
  assert.doesNotMatch(privileged.stderr,/root@|qc_ci_select_fixture_only|SHOW GRANTS/i);
});
