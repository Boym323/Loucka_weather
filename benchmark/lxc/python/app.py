import os
from contextlib import asynccontextmanager

import aiomysql
from fastapi import FastAPI, HTTPException
from fastapi.responses import ORJSONResponse

END = int(os.environ['BENCH_END_TS'])
YEAR_START = int(os.environ['BENCH_YEAR_START'])
YEAR_END = int(os.environ['BENCH_YEAR_END'])

@asynccontextmanager
async def lifespan(app):
    pool = await aiomysql.create_pool(
        host=os.environ['BENCH_DB_HOST'], port=int(os.environ['BENCH_DB_PORT']),
        user=os.environ['BENCH_DB_USER'], password=os.environ['BENCH_DB_PASSWORD'],
        db=os.environ['BENCH_DB_NAME'], autocommit=True, minsize=1, maxsize=int(os.environ.get("BENCH_DB_POOL_MAX", "1")),
        connect_timeout=5,
    )
    app.state.pool = pool
    async with pool.acquire() as con:
        async with con.cursor() as cur:
            await cur.execute('SELECT DATABASE()')
            (actual,) = await cur.fetchone()
            if actual != os.environ['BENCH_DB_NAME']:
                raise RuntimeError('Nespravne DB schema')
    try:
        yield
    finally:
        pool.close()
        await pool.wait_closed()

app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

async def query(sql, params=()):
    async with app.state.pool.acquire() as con:
        async with con.cursor() as cur:
            await cur.execute(sql, params)
            return await cur.fetchall()

@app.get('/current')
async def current():
    rows = await query('SELECT dateTime,outTemp,rain FROM archive WHERE dateTime <= %s ORDER BY dateTime DESC LIMIT 1', (END,))
    if not rows:
        raise HTTPException(404)
    ts,temp,rain = rows[0]
    return ORJSONResponse({'dateTime':ts,'outTemp':temp,'rain':rain})

async def history(days):
    rows = await query('SELECT dateTime,outTemp,rain FROM archive WHERE dateTime > %s AND dateTime <= %s ORDER BY dateTime', (END-days*86400,END))
    items = [{'dateTime':ts,'outTemp':temp,'rain':rain} for ts,temp,rain in rows]
    return ORJSONResponse({'data':items,'count':len(items)})

@app.get('/history/24h')
async def history24(): return await history(1)

@app.get('/history/30d')
async def history30(): return await history(30)

@app.get('/statistics/yearly')
async def yearly():
    rows = await query('SELECT CAST(COUNT(*) AS SIGNED), ROUND(SUM(t.wsum)/NULLIF(SUM(t.sumtime),0),3), ROUND(SUM(r.sum)*10,3) FROM archive_day_outTemp t JOIN archive_day_rain r USING(dateTime) WHERE t.dateTime>=%s AND t.dateTime<%s', (YEAR_START,YEAR_END))
    days,temp,rain=rows[0]
    return ORJSONResponse({'days':int(days),'meanTemp':float(temp) if temp is not None else None,'rainSum':float(rain) if rain is not None else None})
