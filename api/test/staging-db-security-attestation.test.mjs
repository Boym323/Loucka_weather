import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateSecurityAttestation} from '../scripts/db-security-attestation-lib.mjs';

const target='pocasi-loucka.eu';
const grant=(tableSchema,privilegeType,tableName)=>({
 TABLE_SCHEMA:tableSchema,PRIVILEGE_TYPE:privilegeType,...(tableName?{TABLE_NAME:tableName}:{})
});
const safe={
 expectedSchema:target,targetSchema:target,globalRows:[],
 schemaRows:[grant(target,'SELECT')],tableRows:[],
 cipher:'TLS_AES_256_GCM_SHA384',tlsVerifyConfigured:true,activeRole:null
};
test('fully scoped SELECT and verified TLS pass without exposing grant text',()=>{
 const result=evaluateSecurityAttestation(safe);
 assert.equal(result.ready,true);
 assert.equal(result.checks.requiredSelect,true);
 assert.equal(result.checks.targetReadOnly,true);
 assert.deepEqual(result.blockers,[]);
 assert.equal(JSON.stringify(result).includes(target),false);
});
test('plaintext and TLS without certificate verification are never accepted',()=>{
 const plaintext=evaluateSecurityAttestation({...safe,cipher:''});
 assert.equal(plaintext.ready,false);
 assert.ok(plaintext.blockers.includes('database_session_not_encrypted'));
 const unverified=evaluateSecurityAttestation({...safe,tlsVerifyConfigured:false});
 assert.equal(unverified.ready,false);
 assert.ok(unverified.blockers.includes('database_certificate_verification_not_configured'));
});
test('any privilege to write the target archive or globally blocks certification',()=>{
 const schemaWrite=evaluateSecurityAttestation({...safe,
  schemaRows:[grant(target,'SELECT'),grant(target,'UPDATE')]});
 assert.equal(schemaWrite.checks.targetReadOnly,false);
 assert.equal(schemaWrite.ready,false);
 const globalWrite=evaluateSecurityAttestation({...safe,globalRows:[{PRIVILEGE_TYPE:'DROP'}]});
 assert.equal(globalWrite.ready,false);
 assert.ok(globalWrite.blockers.includes('write_grants_affect_target_archive'));
});
test('unrelated write grants do not invalidate target SELECT but block least-privilege production approval',()=>{
 const result=evaluateSecurityAttestation({...safe,
  schemaRows:[grant(target,'SELECT'),grant('loucka_reconstruction','INSERT')]});
 assert.equal(result.checks.targetReadOnly,true);
 assert.equal(result.ready,false);
 assert.ok(result.blockers.includes('same_api_identity_has_other_schema_write_grants'));
});
test('all five day-summary tables need SELECT when schema-wide SELECT is missing',()=>{
 const rows=['archive','archive_day_outTemp','archive_day_rain',
  'archive_day_wind','archive_day_windGust'].map(name=>grant(target,'SELECT',name));
 assert.equal(evaluateSecurityAttestation({...safe,schemaRows:[],tableRows:rows}).ready,true);
 assert.equal(evaluateSecurityAttestation({...safe,schemaRows:[],tableRows:rows.slice(1)}).ready,false);
});
test('wrong schema and active roles fail closed',()=>{
 assert.equal(evaluateSecurityAttestation({...safe,targetSchema:'loucka_reconstruction'}).ready,false);
 assert.equal(evaluateSecurityAttestation({...safe,activeRole:'reader_role'}).ready,false);
});
