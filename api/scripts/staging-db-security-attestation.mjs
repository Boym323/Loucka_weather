#!/usr/bin/env node
/**
 * A single read-only staging MariaDB attestation using the API's existing env.
 * SELECT metadata + SHOW SESSION STATUS only. No credential, grant text,
 * hostname, station data, rows or other secrets are ever printed.
 *
 * No TLS bypass is allowed: use resolveDatabaseTlsOptions from the real API.
 * Explicit --trusted-lan changes only attestation policy, not the actual
 * MariaDB connection or any Fastify TLS setting. The unencrypted state
 * remains visible as a warning.
 */
import mariadb from 'mariadb';
import {resolveDatabaseTlsOptions} from '../dist/src/db-tls.js';
import {evaluateSecurityAttestation} from './db-security-attestation-lib.mjs';

const required=key=>{
 const value=process.env[key];
 if(!value)throw new Error('Missing staging environment');
 return value;
};
async function main(){
 const args=process.argv.slice(2);
 if(args.length>1||(args.length===1&&args[0]!=='--trusted-lan'))
  throw new Error('Unknown attestation argument');
 const transportPolicy=args[0]==='--trusted-lan'?'trusted-lan':'verify-tls';
 if(process.env.WEATHER_STAGING_ENABLED!=='YES')throw new Error('Staging mode required');
 const targetSchema=required('WEATHER_DB_SCHEMA');
 if(!/^[A-Za-z0-9_.-]{1,64}$/.test(targetSchema))throw new Error('Invalid schema');
 const port=Number(process.env.WEATHER_DB_PORT||3306);
 if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('Invalid port');
 const ssl=resolveDatabaseTlsOptions();
 const conn=await mariadb.createConnection({
  host:required('WEATHER_DB_HOST'),port,database:targetSchema,
  user:required('WEATHER_DB_USER'),password:required('WEATHER_DB_PASSWORD'),
  connectTimeout:3000,...(ssl?{ssl}:{})
 });
 try{
  const identity=await conn.query(`SELECT CONCAT(QUOTE(SUBSTRING_INDEX(CURRENT_USER(),'@',1)),
   '@',QUOTE(SUBSTRING_INDEX(CURRENT_USER(),'@',-1))) AS grantee,
   CURRENT_ROLE() AS activeRole`);
  const grantee=identity[0]?.grantee;
  if(!grantee)throw new Error('Database identity unavailable');
  // No SELECT of source/weather data or credential storage. Each statement
  // only accesses information_schema metadata scoped to the active account.
  const globalRows=await conn.query(`SELECT PRIVILEGE_TYPE FROM information_schema.USER_PRIVILEGES
   WHERE GRANTEE=?`,[grantee]);
  const schemaRows=await conn.query(`SELECT TABLE_SCHEMA, PRIVILEGE_TYPE
   FROM information_schema.SCHEMA_PRIVILEGES WHERE GRANTEE=?`,[grantee]);
  const tableRows=await conn.query(`SELECT TABLE_SCHEMA, TABLE_NAME, PRIVILEGE_TYPE
   FROM information_schema.TABLE_PRIVILEGES WHERE GRANTEE=?`,[grantee]);
  const tlsStatus=await conn.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
  const cipher=String(tlsStatus[0]?.Value??'');
  const result=evaluateSecurityAttestation({
   expectedSchema:'pocasi-loucka.eu',targetSchema,
   globalRows,schemaRows,tableRows,cipher,
   tlsVerifyConfigured:ssl?.rejectUnauthorized===true,
   activeRole:identity[0]?.activeRole,transportPolicy
  });
  console.log(JSON.stringify({
   schemaVersion:'1',checkedAtUtc:new Date().toISOString(),stagingOnly:true,
   readOnlyQueries:true,source:'active_api_database_credentials',
   ...result,
   caution:'Trusted-LAN mode is an explicit operator risk acceptance, not proof of segmentation. A one-time session/grant check cannot certify backups, firewall, restore, or long-term memory.'
  },null,2));
  if(!result.ready)process.exitCode=1;
 }finally{await conn.end();}
}
try{await main();}
catch{
 console.error('Staging database security attestation unavailable or failed closed. No credentials printed.');
 process.exitCode=1;
}
