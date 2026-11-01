import os
import aiomysql
from fastapi import FastAPI, HTTPException

BASE = 1767225600
END = BASE + 200 * 86400
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

@app.on_event("startup")
async def startup():
    app.state.pool = await aiomysql.create_pool(
        host=os.environ.get("BENCH_HOST", "127.0.0.1"),
        port=int(os.environ.get("BENCH_DB_PORT", "3306")),
        user="bench", password="bench", db="weewx",
        autocommit=True, minsize=1, maxsize=3
    )

@app.on_event("shutdown")
async def shutdown():
    app.state.pool.close()
    await app.state.pool.wait_closed()

async def query(sql, args=()):
    async with app.state.pool.acquire() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(sql, args)
            return await cursor.fetchall()

@app.get("/current")
async def current():
    rows = await query("SELECT dateTime,outTemp,rain FROM archive ORDER BY dateTime DESC LIMIT 1")
    if not rows: raise HTTPException(status_code=404)
    t, temp, rain = rows[0]
    return {"dateTime": t, "outTemp": temp, "rain": rain}

async def history(days):
    rows = await query("SELECT dateTime,outTemp,rain FROM archive WHERE dateTime > %s AND dateTime <= %s ORDER BY dateTime", (END-days*86400,END))
    points = [{"dateTime": t, "outTemp": temp, "rain": rain} for t,temp,rain in rows]
    return {"data":points,"count":len(points)}

@app.get("/history/24h")
async def history24(): return await history(1)

@app.get("/history/30d")
async def history30(): return await history(30)

@app.get("/statistics/yearly")
async def yearly():
    rows = await query("SELECT t.wsum,t.sumtime,r.sum FROM archive_day_outTemp t JOIN archive_day_rain r USING(dateTime) WHERE t.dateTime >= %s AND t.dateTime < %s ORDER BY t.dateTime", (BASE, END))
    wsum = sum(v[0] for v in rows)
    sumtime = sum(v[1] for v in rows)
    rains = sum(v[2] for v in rows)
    return {"days":len(rows),"meanTemp":round(wsum/sumtime,3),"rainSum":round(rains*10,3)}
