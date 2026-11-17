import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {resolveDatabaseTlsOptions} from '../src/db-tls.js';

test('database TLS is opt-in for existing staging deployments',()=>{
 assert.equal(resolveDatabaseTlsOptions({}),undefined);
 assert.equal(resolveDatabaseTlsOptions({WEATHER_DB_TLS_MODE:'off'}),undefined);
 assert.throws(()=>resolveDatabaseTlsOptions({
  WEATHER_DB_TLS_MODE:'off',WEATHER_DB_TLS_CA_FILE:'/etc/example-ca.pem'
 }),/requires WEATHER_DB_TLS_MODE=verify/);
});

test('verified mode uses Node certificate validation and rejects unknown modes',()=>{
 assert.deepEqual(resolveDatabaseTlsOptions({WEATHER_DB_TLS_MODE:'verify'}),
  {rejectUnauthorized:true});
 assert.deepEqual(resolveDatabaseTlsOptions({WEATHER_DB_TLS_MODE:' VERIFY '}),
  {rejectUnauthorized:true});
 for(const mode of ['yes','required','insecure','']){
  assert.throws(()=>resolveDatabaseTlsOptions({WEATHER_DB_TLS_MODE:mode}),
   /must be off or verify/);
 }
});

test('verified mode loads an explicit PEM trust anchor without disabling verification',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'loucka-db-tls-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const caFile=join(dir,'ca.pem');
 const pem='-----BEGIN CERTIFICATE-----\nTEST_ONLY\n-----END CERTIFICATE-----\n';
 await writeFile(caFile,pem);
 assert.deepEqual(resolveDatabaseTlsOptions({
  WEATHER_DB_TLS_MODE:'verify',WEATHER_DB_TLS_CA_FILE:caFile
 }),{rejectUnauthorized:true,ca:pem});
 await writeFile(caFile,'not-a-certificate');
 assert.throws(()=>resolveDatabaseTlsOptions({
  WEATHER_DB_TLS_MODE:'verify',WEATHER_DB_TLS_CA_FILE:caFile
 }),/Cannot load trusted database TLS CA certificate/);
});

test('database TLS CA input fails closed when unreadable or relative',()=>{
 assert.throws(()=>resolveDatabaseTlsOptions({
  WEATHER_DB_TLS_MODE:'verify',WEATHER_DB_TLS_CA_FILE:'relative.pem'
 }),/must be absolute/);
 assert.throws(()=>resolveDatabaseTlsOptions({
  WEATHER_DB_TLS_MODE:'verify',WEATHER_DB_TLS_CA_FILE:'/no/such/loucka-ca.pem'
 }),/Cannot load trusted database TLS CA certificate/);
});
