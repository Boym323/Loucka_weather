/** RH export DB access contract. Never expose raw SHOW GRANTS or secrets. */
export class PreviewExportGateError extends Error{
 constructor(code,detail){
  super(code);this.name='PreviewExportGateError';this.code=code;
  this.detail=detail??null;
 }
}
export const REQUIRED_SCOPES=Object.freeze([
 '`pocasi-loucka.eu`.`archive`',
 '`loucka_reconstruction`.`reconstruction_changes`',
 '`loucka_reconstruction`.`archive`'
]);
export function readExportDbConfig(env=process.env){
 if(env.WEATHER_STAGING_ENABLED!=='YES'||env.WEATHER_QC_READ_ONLY!=='YES')
  throw new PreviewExportGateError('QC_FLAGS_REQUIRED');
 // Use one full credential identity, never mix host/user/password from different roles.
 const dedicatedKeys=['WEATHER_RH_EXPORT_DB_HOST','WEATHER_RH_EXPORT_DB_USER',
   'WEATHER_RH_EXPORT_DB_PASSWORD','WEATHER_RH_EXPORT_DB_PORT'];
 const dedicated=dedicatedKeys.some(k=>Object.hasOwn(env,k));
 const prefix=dedicated?'WEATHER_RH_EXPORT_DB_':'WEATHER_QC_DB_';
 const host=env[prefix+'HOST'],user=env[prefix+'USER'],password=env[prefix+'PASSWORD'];
 if(!host||!user||!password)
  throw new PreviewExportGateError('DB_CONFIG_MISSING',{
   credentialSet:dedicated?'rh_export':'existing_qc',
   expectedNames:[prefix+'HOST',prefix+'USER',prefix+'PASSWORD']
  });
 const port=Number(env[prefix+'PORT']||3306);
 if(!Number.isSafeInteger(port)||port<1||port>65535)
  throw new PreviewExportGateError('DB_PORT_INVALID');
 return {connection:{
  host,port,user,password,connectTimeout:3000,acquireTimeout:5000,
  multipleStatements:false
 },credentialSet:dedicated?'rh_export':'existing_qc'};
}
export function validateExportGrants(rows){
 const grants=rows.flatMap(row=>Object.values(row)).filter(v=>typeof v==='string');
 if(!grants.length)throw new PreviewExportGateError('SELECT_GRANTS_EMPTY');
 const covered=new Set();
 for(const grant of grants){
  if(/\bWITH GRANT OPTION\b/i.test(grant))
   throw new PreviewExportGateError('WRITE_CAPABLE_GRANTS');
  if(/^GRANT USAGE ON \*\.\* TO\s/i.test(grant))continue;
  const match=/^GRANT SELECT ON (`[^`]+`\.(?:`[^`]+`|\*)) TO\s/i.exec(grant);
  if(!match)throw new PreviewExportGateError('WRITE_CAPABLE_OR_UNSUPPORTED_GRANTS');
  // Other narrow read-only grants (e.g. reference observations) remain safe.
  // Global SELECT does NOT match this expression and is deliberately forbidden.
  for(const required of REQUIRED_SCOPES){
   const db=required.slice(0,required.lastIndexOf('.'));
   if(match[1]===required||match[1]===db+'.*')covered.add(required);
  }
 }
 const missing=REQUIRED_SCOPES.filter(s=>!covered.has(s));
 if(missing.length)throw new PreviewExportGateError('SELECT_SCOPE_MISSING',{missingScopes:missing});
 return {readOnly:true,requiredScopes:REQUIRED_SCOPES.length};
}
export function safeGateMessage(error,stage){
 const code=error instanceof PreviewExportGateError?error.code:
   stage==='connect'?'DB_CONNECTION_UNAVAILABLE':
   stage==='grants'?'GRANT_INSPECTION_FAILED':
   stage==='check'?'READ_PERMISSION_OR_QUERY_FAILED':
   stage==='snapshot'?'READ_ONLY_TRANSACTION_FAILED':
   stage==='query'?'ARCHIVE_QUERY_FAILED':
   stage==='validate'?'SOURCE_DATA_VALIDATION_FAILED':
   stage==='output'?'PRIVATE_EXPORT_WRITE_FAILED':'PREVIEW_EXPORT_BLOCKED';
 const out={status:'blocked',stage,code,
  databaseWrites:0,automaticApprovals:false,devPublishing:false};
 if(error instanceof PreviewExportGateError&&error.detail)out.detail=error.detail;
 return out;
}
