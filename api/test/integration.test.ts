/** Synthetic MariaDB 11.8 integration test, ONLY in ephemeral GitHub Actions. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import mariadb from 'mariadb';
import {metricNames} from '../src/metrics.js';
import {createMariaDbReader} from '../src/db.js';
import {buildApp} from '../src/app.js';

const allowed=process.env.CI==='true'&&process.env.GITHUB_ACTIONS==='true'
 &&process.env.WEATHER_TEST_LOCAL_FIXTURE==='YES';
const SCHEMA='weewx_api_ci_fixture';

test('synthetic WeeWX archive on ephemeral MariaDB, SELECT-only adapter and time bounds',
 {skip:!allowed},async t=>{
 const admin=mariadb.createPool({host:'127.0.0.1',port:3306,
   user:'root',password:'root',connectionLimit:1});
 t.after(async()=>{await admin.end();});
 await admin.query('CREATE DATABASE IF NOT EXISTS `weewx_api_ci_fixture`');
 const columns=[...metricNames,'soilMoist1'].map(x=>'`'+x+'` DOUBLE NULL').join(', ');
 await admin.query(`CREATE TABLE IF NOT EXISTS \`weewx_api_ci_fixture\`.\`archive\` (
  dateTime INT PRIMARY KEY, usUnits INT NOT NULL, \`interval\` INT NOT NULL, ${columns}
 )`);
 await admin.query('DELETE FROM `weewx_api_ci_fixture`.`archive`');
 for(const [time,units,temp,rain,wind] of [
  [1793519400,1,50,0.1,2.2369362921],
  [1793519700,16,12.5,0.1,36],
  [1793520000,17,13,1,10]
 ]){
  await admin.query(`INSERT INTO \`weewx_api_ci_fixture\`.\`archive\`
   (dateTime,usUnits,\`interval\`,outTemp,rain,windSpeed,barometer)
   VALUES (?,?,5,?,?,?,?)`,[time,units,temp,rain,wind,1013.25]);
 }
 await admin.query("CREATE USER IF NOT EXISTS 'ci_reader'@'%' IDENTIFIED BY 'ci_pwd_fixture'");
 await admin.query("GRANT SELECT ON `weewx_api_ci_fixture`.* TO 'ci_reader'@'%'");
 process.env.WEATHER_STAGING_ENABLED='YES';
 process.env.WEATHER_DB_HOST='127.0.0.1';
 process.env.WEATHER_DB_PORT='3306';
 process.env.WEATHER_DB_SCHEMA=SCHEMA;
 process.env.WEATHER_DB_USER='ci_reader';
 process.env.WEATHER_DB_PASSWORD='ci_pwd_fixture';
 const reader=createMariaDbReader();
 const app=buildApp(reader,()=>new Date('2026-11-01T08:10:00Z'));
 t.after(async()=>{await app.close();await reader.close?.();});
 const asOf=new Date(1793519700*1000).toISOString();
 const current=await app.inject('/api/v1/current?units=metricwx&asOf='+encodeURIComponent(asOf));
 assert.equal(current.statusCode,200,current.body);
 assert.equal(current.json().readings.outTemp.value,12.5);
 assert.equal(current.json().readings.windSpeed.value,10);
 assert.equal(current.json().readings.rain.value,1);
 assert.equal(Object.keys(current.json().readings).length,45);
 const sensorEvidence=await app.inject('/api/v1/sensors/channels');
 assert.equal(sensorEvidence.statusCode,200,sensorEvidence.body);
 assert.equal(sensorEvidence.json().status,'archive_recent');
 assert.equal(sensorEvidence.json().channels.length,11);
 assert.equal(sensorEvidence.json().channels.find((x:any)=>x.metric==='soilMoist1').nonNullSamples,0);
 const from=new Date(1793519400*1000).toISOString();
 const to=new Date(1793520000*1000).toISOString();
 const url='/api/v1/history?metric=outTemp&from='+encodeURIComponent(from)+
  '&to='+encodeURIComponent(to)+'&resolution=raw&limit=30';
 const history=await app.inject(url);
 assert.equal(history.statusCode,200,history.body);
 assert.equal(history.json().points.filter((x:any)=>x.source==='weewx_archive').length,2);
 assert.equal(history.json().points.at(-1).value,13);
 // A writer/root account must be refused even though runtime SQL contains SELECTs only.
 process.env.WEATHER_DB_USER='root';
 process.env.WEATHER_DB_PASSWORD='root';
 const wrongReader=createMariaDbReader();
 t.after(()=>wrongReader.close?.());
 await assert.rejects(wrongReader.latest(1793520000));
 process.env.WEATHER_DB_USER='ci_reader';
 process.env.WEATHER_DB_PASSWORD='ci_pwd_fixture';
 const ro=mariadb.createPool({host:'127.0.0.1',port:3306,
  user:'ci_reader',password:'ci_pwd_fixture',database:SCHEMA,connectionLimit:1});
 t.after(()=>ro.end());
 await assert.rejects(ro.query("INSERT INTO `weewx_api_ci_fixture`.`archive` (dateTime, usUnits, `interval`) VALUES (1,1,5)"));
});

test('CI-only MariaDB sidecar is read-only, separately versioned and never edits original RH',
 {skip:!allowed},async t=>{
 const admin=await mariadb.createConnection({host:'127.0.0.1',port:3306,
  user:'root',password:'root'});
 t.after(()=>admin.end());
 const scope='loucka_dev_preview_ci',versionId='rh2022-'+'a'.repeat(24);
 await admin.query('CREATE DATABASE IF NOT EXISTS `loucka_dev_preview_ci`');
 await admin.query(`CREATE TABLE IF NOT EXISTS \`loucka_dev_preview_ci\`.\`rh_preview_versions\` (
  version_id VARCHAR(40) PRIMARY KEY,checksum_sha256 CHAR(64) NOT NULL,
  status VARCHAR(40) NOT NULL,point_total INT NOT NULL)`);
 await admin.query(`CREATE TABLE IF NOT EXISTS \`loucka_dev_preview_ci\`.\`rh_preview_points\` (
  version_id VARCHAR(40) NOT NULL,dateTime INT NOT NULL,
  original_rh DOUBLE NULL,preview_rh DOUBLE NULL,category VARCHAR(32) NOT NULL,
  method VARCHAR(80) NOT NULL,source_batch VARCHAR(80) NOT NULL,
  review_state VARCHAR(40) NOT NULL,PRIMARY KEY (version_id,dateTime))`);
 const time=Date.parse('2022-04-26T00:05:00Z')/1000;
 await admin.query(`INSERT INTO \`weewx_api_ci_fixture\`.\`archive\`
  (dateTime,usUnits,\`interval\`,outHumidity)
  VALUES (?,16,5,NULL) ON DUPLICATE KEY UPDATE outHumidity=NULL`,[time]);
 await admin.query('DELETE FROM `loucka_dev_preview_ci`.`rh_preview_points`');
 await admin.query('DELETE FROM `loucka_dev_preview_ci`.`rh_preview_versions`');
 await admin.query(`INSERT INTO \`loucka_dev_preview_ci\`.\`rh_preview_versions\`
  (version_id,checksum_sha256,status,point_total) VALUES (?,?,?,?)`,
  [versionId,'f'.repeat(64),'experimental_unapproved',5153]);
 await admin.query(`INSERT INTO \`loucka_dev_preview_ci\`.\`rh_preview_points\`
  (version_id,dateTime,original_rh,preview_rh,category,method,source_batch,review_state)
  VALUES (?,?,?,?,?,?,?,?)`,
  [versionId,time,null,76,'estimated','dual_vapor_pressure_v1','ci-synthetic','experimental_unapproved']);
 await admin.query("GRANT SELECT ON `loucka_dev_preview_ci`.* TO 'ci_reader'@'%'");
 process.env.WEATHER_STAGING_ENABLED='YES';
 process.env.WEATHER_DB_HOST='127.0.0.1';
 process.env.WEATHER_DB_PORT='3306';
 process.env.WEATHER_DB_SCHEMA=SCHEMA;
 process.env.WEATHER_DB_USER='ci_reader';
 process.env.WEATHER_DB_PASSWORD='ci_pwd_fixture';
 process.env.WEATHER_RH_PREVIEW_ENABLED='YES';
 process.env.WEATHER_RH_PREVIEW_INSTANCE='DEV_ONLY';
 process.env.WEATHER_RH_PREVIEW_SCHEMA=scope;
 process.env.WEATHER_RH_PREVIEW_VERSION=versionId;
 t.after(()=>{
  delete process.env.WEATHER_RH_PREVIEW_ENABLED;
  delete process.env.WEATHER_RH_PREVIEW_INSTANCE;
  delete process.env.WEATHER_RH_PREVIEW_SCHEMA;
  delete process.env.WEATHER_RH_PREVIEW_VERSION;
 });
 const reader=createMariaDbReader(),app=buildApp(reader,()=>new Date('2026-11-01T08:10:00Z'));
 t.after(async()=>{await app.close();await reader.close?.();});
 assert.ok(reader.previewHumidity);
 const from='2022-04-26T00:00:00Z',to='2022-04-26T00:10:00Z';
 const endpoint='/api/v1/dev/rh-preview?from='+from+'&to='+to;
 const result=await app.inject(endpoint);
 assert.equal(result.statusCode,200,result.body);
 assert.equal(result.json().dataset,'experimental_preview');
 assert.equal(result.json().points[0].originalRh,null);
 assert.equal(result.json().points[0].previewRh,76);
 assert.equal(result.json().points[0].sourceBatch,'ci-synthetic');
 const original=await admin.query(`SELECT outHumidity FROM \`weewx_api_ci_fixture\`.\`archive\` WHERE dateTime=?`,[time]);
 assert.equal(original[0].outHumidity,null);
 await admin.query(`UPDATE \`weewx_api_ci_fixture\`.\`archive\`
  SET outHumidity=50 WHERE dateTime=?`,[time]);
 const guarded=await app.inject(endpoint);
 assert.equal(guarded.statusCode,503,'An original archive modification must invalidate the preview');
 await admin.query(`UPDATE \`weewx_api_ci_fixture\`.\`archive\`
  SET outHumidity=NULL WHERE dateTime=?`,[time]);
 const after=await app.inject(endpoint);
 assert.equal(after.statusCode,200,after.body);
});
