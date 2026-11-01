"""Deterministic synthetic MariaDB fixture with WeeWX-compatible aggregate fields.
Does not use or change user's real database.
"""
import pymysql

BASE = 1767225600  # 2026-01-01 00:00:00 UTC
DAYS = 200
with pymysql.connect(host="127.0.0.1", user="bench", password="bench", database="weewx", autocommit=True) as db:
    with db.cursor() as cur:
        cur.execute("CREATE TABLE IF NOT EXISTS archive (dateTime INT NOT NULL PRIMARY KEY, outTemp DOUBLE NOT NULL, rain DOUBLE NOT NULL) ENGINE=InnoDB")
        cur.execute("CREATE TABLE IF NOT EXISTS archive_day_outTemp (dateTime INT NOT NULL PRIMARY KEY, wsum DOUBLE NOT NULL, sumtime INT NOT NULL) ENGINE=InnoDB")
        cur.execute("CREATE TABLE IF NOT EXISTS archive_day_rain (dateTime INT NOT NULL PRIMARY KEY, `sum` DOUBLE NOT NULL) ENGINE=InnoDB")
        for day in range(DAYS):
            points=[]
            weighted=0
            total_rain=0
            for i in range(288):
                ts = BASE+day*86400+(i+1)*300
                temp = float(4+(day%37)/10+(i%51)/20)
                rain = float(0.02 if (i%191==0 and day%4==0) else 0.0)
                weighted += temp*300
                total_rain += rain
                points.append((ts,temp,rain))
            cur.executemany("INSERT INTO archive VALUES (%s,%s,%s)",points)
            cur.execute("INSERT INTO archive_day_outTemp VALUES (%s,%s,%s)",(BASE+day*86400,weighted,86400))
            cur.execute("INSERT INTO archive_day_rain VALUES (%s,%s)",(BASE+day*86400,total_rain))
        cur.execute("SELECT COUNT(*) FROM archive")
        print("fixture archive rows",cur.fetchone()[0])
        cur.execute("SELECT COUNT(*) FROM archive_day_outTemp")
        print("fixture daily rows",cur.fetchone()[0])
