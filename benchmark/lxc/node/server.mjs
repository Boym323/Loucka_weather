import Fastify from 'fastify';
import mariadb from 'mariadb';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}
function intEnv(name) {
  const v = Number(required(name));
  if (!Number.isSafeInteger(v)) throw new Error(`Invalid ${name}`);
  return v;
}
const end = intEnv('BENCH_END_TS');
const yearStart = intEnv('BENCH_YEAR_START');
const yearEnd = intEnv('BENCH_YEAR_END');
const max = Number(process.env.BENCH_DB_POOL_MAX || '1');
if (!Number.isInteger(max) || max < 1 || max > 8) throw new Error('Invalid BENCH_DB_POOL_MAX');
const port = Number(process.env.BENCH_HTTP_PORT || '18121');
const schema = required('BENCH_DB_NAME');
const pool = mariadb.createPool({
  host: required('BENCH_DB_HOST'), port: intEnv('BENCH_DB_PORT'),
  database: schema, user: required('BENCH_DB_USER'), password: required('BENCH_DB_PASSWORD'),
  connectionLimit: max, connectTimeout: 5000, socketTimeout: 10000,
  bigIntAsNumber: true, decimalAsNumber: true, insertIdAsNumber: true,
});
const app = Fastify({ logger: false, disableRequestLogging: true });
app.addHook('onClose', async () => pool.end());

async function query(sql, args = []) {
  // pool.query acquires/releases exactly one connection, including on errors.
  return await pool.query(sql, args);
}
const failure = (error, reply) => {
  console.error('SQL failed:', error.message);
  return reply.code(503).send('database query failed');
};
app.get('/current', async (_request, reply) => {
  try {
    const rows = await query('SELECT dateTime,outTemp,rain FROM archive WHERE dateTime <= ? ORDER BY dateTime DESC LIMIT 1', [end]);
    if (rows.length === 0) return reply.code(404).send('no data');
    const row = rows[0];
    return {dateTime: Number(row.dateTime), outTemp: row.outTemp, rain: row.rain};
  } catch (error) { return failure(error, reply); }
});
async function history(days, reply) {
  try {
    const rows = await query('SELECT dateTime,outTemp,rain FROM archive WHERE dateTime > ? AND dateTime <= ? ORDER BY dateTime', [end - days * 86400, end]);
    const data = rows.map(row => ({dateTime: Number(row.dateTime), outTemp: row.outTemp, rain: row.rain}));
    return {data, count: data.length};
  } catch (error) { return failure(error, reply); }
}
app.get('/history/24h', async (_request, reply) => history(1, reply));
app.get('/history/30d', async (_request, reply) => history(30, reply));
app.get('/statistics/yearly', async (_request, reply) => {
  try {
    const rows = await query('SELECT CAST(COUNT(*) AS SIGNED) AS days, ROUND(SUM(t.wsum)/NULLIF(SUM(t.sumtime),0),3) AS meanTemp, ROUND(SUM(r.sum)*10,3) AS rainSum FROM archive_day_outTemp t JOIN archive_day_rain r USING(dateTime) WHERE t.dateTime>=? AND t.dateTime<?', [yearStart, yearEnd]);
    const row = rows[0];
    return {days: Number(row.days), meanTemp: row.meanTemp === null ? null : Number(row.meanTemp), rainSum: row.rainSum === null ? null : Number(row.rainSum)};
  } catch (error) { return failure(error, reply); }
});

try {
  const rows = await query('SELECT DATABASE() AS schema_name');
  if (rows[0].schema_name !== schema) throw new Error('Unexpected DB schema');
  await app.listen({host: '127.0.0.1', port});
  console.error(`Node.js/Fastify API ready schema=${schema} pool=${max}`);
} catch (error) {
  console.error(error.message);
  await app.close();
  process.exitCode = 1;
}
