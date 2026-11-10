/** Ephemeral MariaDB test only. Never executes against real meteorological data. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import mariadb from 'mariadb';

const isolated=process.env.CI==='true'&&process.env.GITHUB_ACTIONS==='true'&&
  process.env.WEATHER_TEST_LOCAL_FIXTURE==='YES';
const q=name=>String.fromCharCode(96)+name+String.fromCharCode(96);
const ownDb=q('pocasi-loucka.eu'),refDb=q('loucka_reconstruction');
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
    WEATHER_QC_DB_PORT:'3306',WEATHER_QC_DB_USER:'qc_reader_ci',
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

  const privileged=spawnSync(process.execPath,args,{cwd:process.cwd(),
    env:{...env,WEATHER_QC_DB_USER:'root',WEATHER_QC_DB_PASSWORD:'root'},
    encoding:'utf8',timeout:15000});
  assert.notEqual(privileged.status,0);
  assert.equal(privileged.stdout,'');
  assert.match(privileged.stderr,/SELECT-only/);
  assert.doesNotMatch(privileged.stderr,/root@|qc_ci_select_fixture_only|SHOW GRANTS/i);
});
