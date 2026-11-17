/** Pure, fail-closed evaluation of metadata SELECT/SHOW results.
 * Never expose grantees, host names, schema grant strings or connection secrets.
 */
const forbidden=new Set([
 'ALL PRIVILEGES','INSERT','UPDATE','DELETE','CREATE','DROP','ALTER','INDEX',
 'REFERENCES','CREATE TEMPORARY TABLES','LOCK TABLES','EXECUTE','CREATE VIEW',
 'SHOW VIEW','CREATE ROUTINE','ALTER ROUTINE','EVENT','TRIGGER','GRANT OPTION',
 'FILE','SUPER','RELOAD','PROCESS','SHUTDOWN','REPLICATION SLAVE',
 'REPLICATION CLIENT','CREATE USER','CREATE TABLESPACE'
]);
const needed=['archive','archive_day_outTemp','archive_day_rain',
 'archive_day_wind','archive_day_windGust'];
const privilege=row=>String(row?.PRIVILEGE_TYPE??'').trim().toUpperCase();
const schema=row=>String(row?.TABLE_SCHEMA??'');
const isWrite=row=>forbidden.has(privilege(row));

export function evaluateSecurityAttestation({
 expectedSchema,targetSchema,globalRows=[],schemaRows=[],tableRows=[],
 cipher='',tlsVerifyConfigured=false,activeRole=null,transportPolicy='verify-tls'
}){
 if(transportPolicy!=='verify-tls'&&transportPolicy!=='trusted-lan')
  throw new Error('Unsupported attestation transport policy');
 const tlsRequired=transportPolicy==='verify-tls';
 const validTarget=typeof targetSchema==='string'&&targetSchema===expectedSchema&&
  targetSchema==='pocasi-loucka.eu';
 const globalSelect=globalRows.some(r=>privilege(r)==='SELECT');
 const schemaSelect=schemaRows.some(r=>schema(r)===targetSchema&&privilege(r)==='SELECT');
 const tableAllows=needed.every(name=>globalSelect||schemaSelect||tableRows.some(r=>
  schema(r)===targetSchema&&String(r.TABLE_NAME??'')===name&&privilege(r)==='SELECT'));
 const targetWrite=globalRows.some(isWrite)||
  schemaRows.some(r=>schema(r)===targetSchema&&isWrite(r))||
  tableRows.some(r=>schema(r)===targetSchema&&isWrite(r));
 const otherSchemaWrite=schemaRows.some(r=>schema(r)!==targetSchema&&isWrite(r))||
  tableRows.some(r=>schema(r)!==targetSchema&&isWrite(r));
 const roleActive=activeRole!==null&&String(activeRole).trim()!==''&&
  String(activeRole).toUpperCase()!=='NULL';
 const encrypted=typeof cipher==='string'&&cipher.trim().length>0;
 const verifiedTls=encrypted&&tlsVerifyConfigured===true;
 const targetReadOnly=validTarget&&tableAllows&&!targetWrite;
 const ready=targetReadOnly&&(!tlsRequired||verifiedTls)&&!otherSchemaWrite&&!roleActive;
 const blockers=[];
 if(!validTarget)blockers.push('target_schema_not_expected_archive');
 if(!tableAllows)blockers.push('missing_required_archive_select');
 if(targetWrite)blockers.push('write_grants_affect_target_archive');
 if(otherSchemaWrite)blockers.push('same_api_identity_has_other_schema_write_grants');
 if(roleActive)blockers.push('active_role_requires_manual_privilege_review');
 const warnings=[];
 const transportFindings=[];
 if(!encrypted)transportFindings.push('database_session_not_encrypted');
 if(!tlsVerifyConfigured)transportFindings.push('database_certificate_verification_not_configured');
 if(tlsRequired)blockers.push(...transportFindings);
 else warnings.push(...transportFindings,
  'trusted_lan_assumption_not_network_verified');
 return {ready,transportPolicy,checks:{expectedOriginalSchema:validTarget,requiredSelect:tableAllows,
  targetReadOnly,transportEncrypted:encrypted,certificateVerified:verifiedTls,
  transportEncryptionRequired:tlsRequired,
  noOtherSchemaWriteGrants:!otherSchemaWrite,noActiveRole:!roleActive},
  blockers,warnings};
}
