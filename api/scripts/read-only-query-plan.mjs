#!/usr/bin/env node
/**
 * Staging-only metadata and EXPLAIN audit for climate record SQL.
 *
 * Requires WEATHER_STAGING_ENABLED=YES and the normal read-only API
 * environment. Does not print credentials, rows or station observations.
 * Runs SHOW GRANTS, SHOW INDEX and EXPLAIN SELECT only; never executes the
 * SELECT or mutates any database, systemd unit, GW3000 or WeeWX state.
 */
import mariadb from 'mariadb';

const metrics=['outTemp','rain','windGust'];
const required=(key)=>{
 const value=process.env[key];
 if(!value)throw new Error('Missing mandatory environment');
 return value;
};
async function main(){
 if(process.env.WEATHER_STAGING_ENABLED!=='YES')throw new Error('Staging not enabled');
 const schema=required('WEATHER_DB_SCHEMA');
 if(!/^[A-Za-z0-9_.-]{1,64}$/.test(schema))throw new Error('Invalid schema name');
 const port=Number(process.env.WEATHER_DB_PORT||3306);
 if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('Invalid port');
 const pool=mariadb.createPool({
  host:required('WEATHER_DB_HOST'),port,database:schema,
  user:required('WEATHER_DB_USER'),password:required('WEATHER_DB_PASSWORD'),
  connectionLimit:1,connectTimeout:3000,acquireTimeout:5000
 });
 try{
  const grants=await pool.query('SHOW GRANTS');
  const lines=grants.flatMap(row=>Object.values(row)).filter(x=>typeof x==='string');
  const forbidden=/\b(?:ALL PRIVILEGES|INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRIGGER|EVENT|FILE|SUPER|RELOAD|GRANT OPTION|REFERENCES|LOCK TABLES|PROCESS|EXECUTE)\b/i;
  if(!lines.length||!lines.some(s=>/\bSELECT\b/i.test(s))||lines.some(s=>forbidden.test(s)))
   throw new Error('Not a SELECT-only account');
  const now=Math.floor(Date.now()/1000);
  const from=Math.floor(Date.UTC(2009,0,1)/1000);
  const to=now+86400;
  const tables=[];
  for(const metric of metrics){
   const name='archive_day_'+metric;
   const table='`'+schema+'`.`'+name+'`';
   const indexes=await pool.query('SHOW INDEX FROM '+table);
   const columns='dateTime, min, mintime, max, maxtime, sum, count, wsum, sumtime';
   // Identical WHERE/ORDER BY/LIMIT shape to ArchiveReader.dailySummaries().
   const plan=await pool.query('EXPLAIN SELECT '+columns+' FROM '+table+
    ' WHERE dateTime >= ? AND dateTime < ? ORDER BY dateTime ASC LIMIT ?',
    [from,to,20000]);
   tables.push({
    table:name,
    dateTime_indexes:indexes.filter(i=>String(i.Column_name)==='dateTime').map(i=>({
     key:String(i.Key_name),sequence:Number(i.Seq_in_index),non_unique:Number(i.Non_unique)
    })),
    plan:plan.map(p=>({
     type:p.type??null,possible_keys:p.possible_keys??null,key:p.key??null,
     rows:p.rows===undefined?null:Number(p.rows),
     extra:p.Extra??null
    }))
   });
  }
  console.log(JSON.stringify({
   checked_at_utc:new Date().toISOString(),read_only:true,
   query_kind:'SHOW GRANTS + SHOW INDEX + EXPLAIN SELECT',
   note:'EXPLAIN estimates only; SELECT was not executed; plans depend on DB stats and range.',
   tables
  },null,2));
 }finally{await pool.end();}
}
try{await main();}
catch{
 console.error('SQL audit did not finish. Verify SELECT-only privileges, daily tables and connectivity. No credentials printed.');
 process.exitCode=1;
}
