/** Sanitized, offline-testable output helpers for the staging climate DB probe.
 * Deliberately never return SQL, hostname, database name, user or stack traces.
 */
export function safeDriverError(error){
 const raw=typeof error?.code==='string'?error.code:'';
 const code=/^[A-Z][A-Z0-9_]{1,59}$/.test(raw)?raw:'UNKNOWN';
 const errno=Number.isSafeInteger(error?.errno)&&error.errno>=0?error.errno:null;
 const state=typeof error?.sqlState==='string'&&/^[0-9A-Z]{5}$/.test(error.sqlState)
  ?error.sqlState:null;
 return {code,errno,sqlState:state};
}

export function countValidDailyRows(rows,start,end,maxRows){
 if(!Array.isArray(rows)||rows.length>maxRows)throw new Error('INVALID_RESULT');
 let previous=-1;
 for(const row of rows){
  const at=Number(row?.dateTime);
  if(!Number.isSafeInteger(at)||at<start||at>=end||at<=previous)
   throw new Error('INVALID_RESULT');
  previous=at;
 }
 return rows.length;
}
