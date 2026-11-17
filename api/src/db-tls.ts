import {readFileSync} from 'node:fs';

/** Verified TLS is opt-in until the staging server has a trusted certificate.
 * Never set rejectUnauthorized:false, even for self-signed certificates.
 */
export function resolveDatabaseTlsOptions(
 env:NodeJS.ProcessEnv=process.env
):{rejectUnauthorized:true;ca?:string}|undefined{
 const mode=(env.WEATHER_DB_TLS_MODE??'off').trim().toLowerCase();
 const caFile=env.WEATHER_DB_TLS_CA_FILE?.trim();
 if(mode==='off'){
  if(caFile)throw new Error('Database TLS CA requires WEATHER_DB_TLS_MODE=verify');
  return undefined;
 }
 if(mode!=='verify')throw new Error('WEATHER_DB_TLS_MODE must be off or verify');
 if(!caFile)return {rejectUnauthorized:true};
 if(!caFile.startsWith('/')||caFile.includes('\0'))
  throw new Error('Database TLS CA path must be absolute');
 try{
  const ca=readFileSync(caFile,'utf8');
  if(!ca.includes('-----BEGIN CERTIFICATE-----'))
   throw new Error('No PEM certificate');
  return {rejectUnauthorized:true,ca};
 }catch{
  // Never leak a credential or deployment path via an API startup error.
  throw new Error('Cannot load trusted database TLS CA certificate');
 }
}
