import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import mariadb from 'mariadb';
import {ephemeralQcSchemaStatements} from '../src/qc-dev-schema.js';

// Not permitted on local/production hosts, including a production
// machine merely setting WEATHER_TEST_LOCAL_FIXTURE by mistake.
// This test only runs in GitHub Actions' isolated MariaDB service.
const ephemeralOnly=
 process.env.CI==='true'&&
 process.env.GITHUB_ACTIONS==='true'&&
 process.env.WEATHER_TEST_LOCAL_FIXTURE==='YES'&&
 /^[0-9]{1,20}$/.test(process.env.GITHUB_RUN_ID??'');

test('schema builder refuses any production, reconstruction or arbitrary database name',()=>{
 for(const name of ['pocasi-loucka.eu','loucka_reconstruction','qc_ci_bad',
                    'qc_ci_123;DROP TABLE archive','qc_ci_','qc_ci_12-34'])
  assert.throws(()=>ephemeralQcSchemaStatements(name),/Only isolated/);
 assert.equal(ephemeralQcSchemaStatements('qc_ci_123').length,6);
});

test('REAL isolated MariaDB: per-field QC, hashes, NULL-safe CAS, rollback and concurrent writer', {skip:!ephemeralOnly},async()=>{
 const schema='qc_ci_'+process.env.GITHUB_RUN_ID!;
 const db='`'+schema+'`';
 const connection=await mariadb.createConnection({
  host:'127.0.0.1',port:3306,user:'root',password:'root',
  connectTimeout:3000
 });
 let second:Awaited<ReturnType<typeof mariadb.createConnection>>|undefined;
 let created=false;
 try{
  for(const statement of ephemeralQcSchemaStatements(schema)){
   await connection.query(statement);
   created=true;
  }
  const shaA='a'.repeat(64),shaB='b'.repeat(64);
  await connection.query(`INSERT INTO ${db}.sensor_epoch
   (epoch_id,physical_sensor_ref,start_utc,end_utc,raw_unit,evidence_ref,verified)
   VALUES (?,?,?,?,?,?,?)`,
   ['test_epoch','synthetic_test_station',900,null,'degC','synthetic:fixture',1]);
  await connection.query(`INSERT INTO ${db}.observation_raw_ref
   (source_database,source_table,source_timestamp_utc,source_interval_min,
    variable,raw_value,raw_sha256,sensor_epoch_id)
    VALUES (?,?,?,?,?,?,?,?)`,
   ['synthetic_test','archive_fixture',1000,5,'outTemp',0,shaA,'test_epoch']);
  const raw=(await connection.query(`SELECT raw_ref_id FROM ${db}.observation_raw_ref`) as
   Array<{raw_ref_id:number}>)[0]!.raw_ref_id;
  await connection.query(`INSERT INTO ${db}.measurement_qc
   (target_time_utc,variable,quality_state,measurement_value,display_value,
    raw_ref_id,epoch_id,qc_flags_json,independent_validation,approved,extrema_eligible)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
   [1000,'outTemp','UNVERIFIED',0,0,raw,null,'["ORIGINAL_NOT_INDEPENDENTLY_VALIDATED"]',0,0,0]);
  await connection.query(`INSERT INTO ${db}.measurement_qc
   (target_time_utc,variable,quality_state,measurement_value,display_value,
    qc_flags_json,independent_validation,approved,extrema_eligible)
    VALUES (?,?,?,?,?,?,?,?,?)`,
   [1000,'outHumidity','MISSING',null,null,'["ARCHIVE_FIELD_NULL"]',0,0,0]);
  const fields=await connection.query(`SELECT variable,quality_state,display_value
    FROM ${db}.measurement_qc WHERE target_time_utc=? ORDER BY variable`,[1000]) as
    Array<{variable:string;quality_state:string;display_value:number|null}>;
  assert.deepEqual(fields.map(x=>x.quality_state),['MISSING','UNVERIFIED']);
  assert.equal(fields[0]!.display_value,null);
  assert.equal(fields[1]!.display_value,0);
  // Contradictory, mislabelled data are rejected by actual MariaDB CHECK.
  await assert.rejects(connection.query(`UPDATE ${db}.measurement_qc
    SET approved=1 WHERE target_time_utc=1000 AND variable='outTemp'`));
  await assert.rejects(connection.query(`UPDATE ${db}.measurement_qc
    SET quality_state='SENSOR_ERROR',display_value=0 WHERE target_time_utc=1000 AND variable='outHumidity'`));

  const manifest={time:1000,variable:'rain',old:null,next:0.335279992,source:'synthetic:fixture'};
  const payloadHash=createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  const beforeHash=createHash('sha256').update(JSON.stringify({dateTime:1000,rain:null,outTemp:20})).digest('hex');
  await connection.query(`INSERT INTO ${db}.archive_fixture
    (dateTime,rain,outTemp) VALUES(?,?,?)`,[1000,null,20]);
  await connection.query(`INSERT INTO ${db}.reconstruction_manifest
    (batch_id,target_time_utc,variable,expected_old,proposed_new,
     payload_sha256,before_image_sha256)
    VALUES (?,?,?,?,?,?,?)`,
    ['synthetic-rain-batch',1000,'rain',null,0.335279992,payloadHash,beforeHash]);
  await assert.rejects(connection.query(`UPDATE ${db}.reconstruction_manifest
    SET state='APPROVED' WHERE batch_id='synthetic-rain-batch'`));

  // Dry run candidate: SQL preflight and rollback must leave original NULL.
  await connection.beginTransaction();
  let changed=await connection.query(`UPDATE ${db}.archive_fixture
    SET rain=? WHERE dateTime=? AND rain <=> ?`,[0.335279992,1000,null]) as {affectedRows:number};
  assert.equal(changed.affectedRows,1);
  await connection.rollback();
  let actual=await connection.query(`SELECT rain FROM ${db}.archive_fixture WHERE dateTime=1000`) as Array<{rain:number|null}>;
  assert.equal(actual[0]?.rain,null);

  // Explicit synthetic manifest approval precedes the real isolated commit.
  await connection.query(`UPDATE ${db}.reconstruction_manifest
    SET explicit_approval=1,state='APPROVED'
    WHERE batch_id='synthetic-rain-batch' AND payload_sha256=?`,[payloadHash]);
  await connection.beginTransaction();
  const approval=(await connection.query(`SELECT state,explicit_approval,payload_sha256
    FROM ${db}.reconstruction_manifest WHERE batch_id=? FOR UPDATE`,
    ['synthetic-rain-batch']) as Array<{state:string;explicit_approval:number;payload_sha256:string}>)[0]!;
  assert.equal(approval.state,'APPROVED');
  assert.equal(approval.explicit_approval,1);
  assert.equal(approval.payload_sha256,payloadHash);
  changed=await connection.query(`UPDATE ${db}.archive_fixture SET rain=?
    WHERE dateTime=? AND rain <=> ?`,[0.335279992,1000,null]) as {affectedRows:number};
  assert.equal(changed.affectedRows,1);
  await connection.query(`UPDATE ${db}.reconstruction_manifest SET state='APPLIED'
    WHERE batch_id='synthetic-rain-batch' AND state='APPROVED'`);
  await connection.commit();
  // Replay and stale old-value CAS cannot write a second time.
  changed=await connection.query(`UPDATE ${db}.archive_fixture SET rain=?
    WHERE dateTime=? AND rain <=> ?`,[0.335279992,1000,null]) as {affectedRows:number};
  assert.equal(changed.affectedRows,0);
  actual=await connection.query(`SELECT rain FROM ${db}.archive_fixture WHERE dateTime=1000`) as Array<{rain:number|null}>;
  assert.equal(actual[0]?.rain,0.335279992);
  // NULL-safe rollback matches exact stored postimage, not an assumed zero.
  await connection.beginTransaction();
  changed=await connection.query(`UPDATE ${db}.archive_fixture SET rain=NULL
    WHERE dateTime=? AND rain <=> ?`,[1000,0.335279992]) as {affectedRows:number};
  assert.equal(changed.affectedRows,1);
  await connection.query(`UPDATE ${db}.reconstruction_manifest SET state='REVERTED'
    WHERE batch_id='synthetic-rain-batch' AND state='APPLIED'`);
  await connection.commit();
  actual=await connection.query(`SELECT rain FROM ${db}.archive_fixture WHERE dateTime=1000`) as Array<{rain:number|null}>;
  assert.equal(actual[0]?.rain,null);

  // Writer collision: transaction B cannot commit over A's uncommitted row.
  second=await mariadb.createConnection({host:'127.0.0.1',port:3306,user:'root',password:'root',connectTimeout:3000});
  await second.query('SET SESSION innodb_lock_wait_timeout=1');
  await connection.beginTransaction();
  changed=await connection.query(`UPDATE ${db}.archive_fixture SET outTemp=21
    WHERE dateTime=1000 AND outTemp <=> 20`) as {affectedRows:number};
  assert.equal(changed.affectedRows,1);
  await second.beginTransaction();
  await assert.rejects(second.query(`UPDATE ${db}.archive_fixture SET outTemp=22
    WHERE dateTime=1000 AND outTemp <=> 20`));
  await second.rollback();
  await connection.commit();
  changed=await second.query(`UPDATE ${db}.archive_fixture SET outTemp=22
    WHERE dateTime=1000 AND outTemp <=> 20`) as {affectedRows:number};
  assert.equal(changed.affectedRows,0);
  const last=await connection.query(`SELECT outTemp FROM ${db}.archive_fixture WHERE dateTime=1000`) as Array<{outTemp:number}>;
  assert.equal(last[0]?.outTemp,21);
 }finally{
  try{await second?.rollback();await second?.end();}catch{}
  try{await connection.rollback();}catch{}
  if(created)await connection.query('DROP DATABASE '+db);
  await connection.end();
 }
});
