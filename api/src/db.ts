import mariadb from 'mariadb';
import {metricNames} from './metrics.js';
import type {Metric} from './metrics.js';
import type {ArchiveReader,ArchiveRow} from './store.js';

const required=(key:string):string=>{
 const val=process.env[key];
 if(!val)throw new Error('Missing staging database configuration '+key);
 return val;
};
export function createMariaDbReader():ArchiveReader{
 if(process.env.WEATHER_STAGING_ENABLED!=='YES')throw new Error('Staging is not enabled');
 const schema=required('WEATHER_DB_SCHEMA');
 if(!/^[A-Za-z0-9_.-]{1,64}$/.test(schema))throw new Error('Unsafe database schema');
 const port=Number(process.env.WEATHER_DB_PORT||3306);
 if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('Invalid database port');
 const pool=mariadb.createPool({
  host:required('WEATHER_DB_HOST'),port,database:schema,
  user:required('WEATHER_DB_USER'),password:required('WEATHER_DB_PASSWORD'),
  connectionLimit:2,connectTimeout:3000,acquireTimeout:5000
 });
 const table='`'+schema+'`.`archive`';
 const cols=['dateTime','usUnits','interval',...metricNames].map(x=>'`'+x+'`').join(', ');
 return {
   async latest(asOfEpoch:number):Promise<ArchiveRow|null>{
     const rows=await pool.query(`SELECT ${cols} FROM ${table}
       WHERE dateTime <= ? ORDER BY dateTime DESC LIMIT 1`,[asOfEpoch]) as ArchiveRow[];
     return rows[0]??null;
   },
   async history(metric:Metric,fromExclusive:number,toInclusive:number,limit:number):Promise<ArchiveRow[]>{
     // Caller validates metric against generated allowlist. Never accept SQL identifiers from HTTP.
     const column='`'+metric+'`';
     return await pool.query(`SELECT dateTime, usUnits, \`interval\`, ${column}
       FROM ${table} WHERE dateTime > ? AND dateTime <= ?
       ORDER BY dateTime ASC LIMIT ?`,
       [fromExclusive,toInclusive,limit]) as ArchiveRow[];
   },
   async ping():Promise<void>{await pool.query('SELECT 1');},
   async close():Promise<void>{await pool.end();}
 };
}
