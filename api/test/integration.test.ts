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
 const columns=metricNames.map(x=>'`'+x+'` DOUBLE NULL').join(', ');
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
 const from=new Date(1793519400*1000).toISOString();
 const to=new Date(1793520000*1000).toISOString();
 const url='/api/v1/history?metric=outTemp&from='+encodeURIComponent(from)+
  '&to='+encodeURIComponent(to)+'&resolution=raw&limit=30';
 const history=await app.inject(url);
 assert.equal(history.statusCode,200,history.body);
 assert.equal(history.json().points.filter((x:any)=>x.source==='weewx_archive').length,2);
 assert.equal(history.json().points.at(-1).value,13);
 const ro=mariadb.createPool({host:'127.0.0.1',port:3306,
  user:'ci_reader',password:'ci_pwd_fixture',database:SCHEMA,connectionLimit:1});
 t.after(()=>ro.end());
 await assert.rejects(ro.query("INSERT INTO `weewx_api_ci_fixture`.`archive` (dateTime, usUnits, `interval`) VALUES (1,1,5)"));
});
