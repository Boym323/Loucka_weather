import mariadb from 'mariadb';
import {metricNames} from './metrics.js';
import type {Metric} from './metrics.js';
import type {ArchiveReader,ArchiveRow,DailySummaryRow} from './store.js';

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
 const summaryTable=(metric:Metric):string=>{
  // Wind vector aggregates live in archive_day_wind; scalar direction counts have their own tables.
  const name=metric==='windSpeed'?'wind':metric;
  return '`'+schema+'`.`archive_day_'+name+'`';
 };
 let summaryUnitsPromise:Promise<number>|undefined;
 const summaryUnits=():Promise<number>=>{
  summaryUnitsPromise??=(async()=>{
   const rows=await pool.query(`SELECT usUnits FROM ${table} ORDER BY dateTime ASC LIMIT 1`) as {usUnits:number}[];
   const value=Number(rows[0]?.usUnits);
   if(value!==1&&value!==16&&value!==17)throw new Error('Cannot establish WeeWX daily summary units');
   return value;
  })().catch(error=>{summaryUnitsPromise=undefined;throw error;});
  return summaryUnitsPromise;
 };
 const forbidden=/\b(?:ALL PRIVILEGES|INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRIGGER|EVENT|FILE|SUPER|RELOAD|GRANT OPTION|REFERENCES|LOCK TABLES|PROCESS|EXECUTE)\b/i;
 let grantCheck:Promise<void>|undefined;
 function ensureReadOnly():Promise<void>{
  if(grantCheck!==undefined)return grantCheck;
  grantCheck=(async()=>{
   const rows=await pool.query('SHOW GRANTS') as Record<string,unknown>[];
   const grants=rows.flatMap(row=>Object.values(row)).filter((v):v is string=>typeof v==='string');
   if(!grants.length||grants.some(grant=>forbidden.test(grant))
       ||!grants.some(grant=>/\bSELECT\b/i.test(grant)))
    throw new Error('Staging database credentials must be SELECT-only');
  })().catch(error=>{grantCheck=undefined;throw error;});
  return grantCheck;
 }

 const cols=['dateTime','usUnits','interval',...metricNames].map(x=>'`'+x+'`').join(', ');
 return {
   async latest(asOfEpoch:number):Promise<ArchiveRow|null>{
     await ensureReadOnly();
     const rows=await pool.query(`SELECT ${cols} FROM ${table}
       WHERE dateTime <= ? ORDER BY dateTime DESC LIMIT 1`,[asOfEpoch]) as ArchiveRow[];
     return rows[0]??null;
   },
   async history(metric:Metric,fromExclusive:number,toInclusive:number,limit:number):Promise<ArchiveRow[]>{
     // Caller validates metric against generated allowlist. Never accept SQL identifiers from HTTP.
     const column='`'+metric+'`';
     await ensureReadOnly();
     return await pool.query(`SELECT dateTime, usUnits, \`interval\`, ${column}
       FROM ${table} WHERE dateTime > ? AND dateTime <= ?
       ORDER BY dateTime ASC LIMIT ?`,
       [fromExclusive,toInclusive,limit]) as ArchiveRow[];
   },
   async historyPage(selectedMetrics:Metric[],fromExclusive:number,toInclusive:number,afterExclusive:number,limit:number):Promise<ArchiveRow[]>{
     if(afterExclusive<fromExclusive||afterExclusive>toInclusive||selectedMetrics.length===0||
       selectedMetrics.some(metric=>!metricNames.includes(metric)))throw new Error('Invalid archive page request');
     await ensureReadOnly();
     const selected=[...new Set(selectedMetrics)];
     const selectedColumns=selected.map(metric=>'`'+metric+'`').join(', ');
     return await pool.query(`SELECT dateTime, usUnits, \`interval\`, ${selectedColumns} FROM ${table}
       WHERE dateTime > ? AND dateTime <= ? ORDER BY dateTime ASC LIMIT ?`,
       [afterExclusive,toInclusive,limit]) as ArchiveRow[];
   },
   async dailySummaries(metric:Metric,fromInclusive:number,toExclusive:number,limit:number):Promise<DailySummaryRow[]>{
     await ensureReadOnly();
     const usUnits=await summaryUnits();
     const columns=metric==='windDir'?'dateTime, xsum, ysum, count, dirsumtime':
       'dateTime, min, mintime, max, maxtime, sum, count, wsum, sumtime';
     const query=metric==='windDir'
       ?`SELECT w.dateTime, w.xsum, w.ysum, COALESCE(d.count, 0) AS count, w.dirsumtime
          FROM ${summaryTable('windSpeed')} w
          LEFT JOIN ${summaryTable('windDir')} d ON d.dateTime=w.dateTime
          WHERE w.dateTime >= ? AND w.dateTime < ? ORDER BY w.dateTime ASC LIMIT ?`
       :metric==='windGustDir'
       ?`SELECT g.dateTime, g.max, g.maxtime, COALESCE(d.count, 0) AS count,
           a.windGustDir AS max_dir FROM ${summaryTable('windGust')} g
          LEFT JOIN ${summaryTable('windGustDir')} d ON d.dateTime=g.dateTime
          LEFT JOIN ${table} a ON a.dateTime=g.maxtime AND a.windGust=g.max
          WHERE g.dateTime >= ? AND g.dateTime < ? ORDER BY g.dateTime ASC LIMIT ?`
       :`SELECT ${columns} FROM ${summaryTable(metric)}
          WHERE dateTime >= ? AND dateTime < ? ORDER BY dateTime ASC LIMIT ?`;
     return (await pool.query(query,[fromInclusive,toExclusive,limit]) as Record<string,number|null>[]).map(row=>({
         dateTime:Number(row.dateTime),usUnits,
         min:row.min===undefined?null:row.min,mintime:row.mintime===undefined?null:row.mintime,
         max:row.max===undefined?null:row.max,maxtime:row.maxtime===undefined?null:row.maxtime,
         sum:row.sum===undefined?null:row.sum,count:row.count===undefined?null:row.count,
         wsum:row.wsum===undefined?null:row.wsum,sumtime:row.sumtime===undefined?null:row.sumtime,
         xsum:row.xsum===undefined?null:row.xsum,ysum:row.ysum===undefined?null:row.ysum,
         dirsumtime:row.dirsumtime===undefined?null:row.dirsumtime,
         max_dir:row.max_dir===undefined?null:row.max_dir
       })) as DailySummaryRow[];
   },
   async archiveWindow(fromInclusive:number,toInclusive:number,limit:number):Promise<ArchiveRow[]>{
     await ensureReadOnly();
     return await pool.query(`SELECT ${cols} FROM ${table}
       WHERE dateTime >= ? AND dateTime <= ? ORDER BY dateTime ASC LIMIT ?`,
       [fromInclusive,toInclusive,limit]) as ArchiveRow[];
   },
   async archiveAfter(afterExclusive:number,toInclusive:number,limit:number):Promise<ArchiveRow[]>{
     await ensureReadOnly();
     return await pool.query(`SELECT ${cols} FROM ${table}
       WHERE dateTime > ? AND dateTime <= ? ORDER BY dateTime ASC LIMIT ?`,
       [afterExclusive,toInclusive,limit]) as ArchiveRow[];
   },
   async ping():Promise<void>{
     await ensureReadOnly();
     await pool.query(`SELECT dateTime FROM ${table} ORDER BY dateTime DESC LIMIT 1`);
   },
   async close():Promise<void>{await pool.end();}
 };
}
