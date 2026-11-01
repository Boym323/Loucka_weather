import mariadb from 'mariadb';
import type { ArchiveReader,ArchiveRow } from './store.js';

const envRequired=(key:string):string=>{
  const val=process.env[key];
  if(!val)throw new Error('Missing required staging DB configuration '+key);
  return val;
};
export function createMariaDbReader(): ArchiveReader {
  // Fail closed until operator explicitly opts into a configured read-only DB.
  if(process.env.WEATHER_STAGING_ENABLED!=='YES')throw new Error('Staging access not explicitly enabled');
  const schema=envRequired('WEATHER_DB_SCHEMA');
  if(!/^[A-Za-z0-9_.-]{1,64}$/.test(schema))throw new Error('Invalid DB schema');
  const pool=mariadb.createPool({
    host:envRequired('WEATHER_DB_HOST'),port:Number(process.env.WEATHER_DB_PORT||3306),
    database:schema,user:envRequired('WEATHER_DB_USER'),password:envRequired('WEATHER_DB_PASSWORD'),
    connectionLimit:2,connectTimeout:3000,acquireTimeout:5000
  });
  const table='`'+schema+'`.`archive`';
  return {
    async latest(asOfEpoch:number):Promise<ArchiveRow|null>{
      const rows=await pool.query(
        `SELECT dateTime, usUnits, \`interval\`, outTemp, rain, windSpeed, barometer FROM ${table}
         WHERE dateTime <= ? ORDER BY dateTime DESC LIMIT 1`, [asOfEpoch]) as ArchiveRow[];
      return rows[0]??null;
    },
    async ping():Promise<void>{await pool.query('SELECT 1');},
    async close():Promise<void>{await pool.end();}
  };
}
