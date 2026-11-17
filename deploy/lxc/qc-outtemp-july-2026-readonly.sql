-- Read-only, index-bounded investigation of the historical July 25/26, 2026
-- daily temperature sumtime anomaly. No UPDATE, INSERT or DDL. Run manually
-- against MariaDB; never replace original archive_day_* rows with estimates.
--
-- WeeWX local calendar boundaries Europe/Prague (UTC+02 in July).
-- 2026-07-25: (1784930400, 1785016800] = 2026-07-24T22Z..25T22Z
-- 2026-07-26: (1785016800, 1785103200] = 2026-07-25T22Z..26T22Z
-- DateTime is interval END; the left boundary is exclusive.

-- A. Inspect the existing daily summary rows only.
SELECT dateTime, `count`, sumtime, min, max, mintime, maxtime
FROM `pocasi-loucka.eu`.`archive_day_outTemp`
WHERE dateTime IN (1784930400,1785016800)
ORDER BY dateTime;

-- B. Raw row counts, off-grid seconds and interval metadata.
WITH days AS (
  SELECT '2026-07-25' AS local_day, 1784930400 AS left_exclusive, 1785016800 AS right_inclusive
  UNION ALL SELECT '2026-07-26',1785016800,1785103200
)
SELECT d.local_day,
       COUNT(*) AS archive_rows,
       SUM(a.outTemp IS NOT NULL) AS temperature_rows,
       SUM(MOD(a.dateTime,300)=60) AS timestamp_plus_60_seconds,
       SUM(MOD(a.dateTime,300)<>0) AS timestamp_offgrid,
       SUM(a.`interval` IS NULL OR a.`interval` NOT BETWEEN 1 AND 120) AS invalid_interval_rows,
       SUM(CASE WHEN a.outTemp IS NOT NULL AND a.`interval` BETWEEN 1 AND 120
                THEN a.`interval`*60 ELSE 0 END) AS naive_sumtime_seconds
FROM `pocasi-loucka.eu`.`archive` a
JOIN days d ON a.dateTime>d.left_exclusive AND a.dateTime<=d.right_inclusive
WHERE a.dateTime>1784930400 AND a.dateTime<=1785103200
GROUP BY d.local_day
ORDER BY d.local_day;

-- C. Effective unique interval coverage after overlap elimination.
-- Treat every valid temperature record as interval [dateTime-interval*60,dateTime].
-- Clip to the corresponding local calendar day before calculating coverage.
-- MAX(prior end) prevents counting overlapping five-minute windows twice.
WITH days AS (
  SELECT '2026-07-25' AS local_day,1784930400 AS left_exclusive,1785016800 AS right_inclusive
  UNION ALL SELECT '2026-07-26',1785016800,1785103200
), clipped AS (
  SELECT d.local_day, a.dateTime,
         GREATEST(d.left_exclusive,a.dateTime-a.`interval`*60) AS clip_start,
         LEAST(d.right_inclusive,a.dateTime) AS clip_end
  FROM `pocasi-loucka.eu`.`archive` a
  JOIN days d ON a.dateTime>d.left_exclusive AND a.dateTime<=d.right_inclusive
  WHERE a.dateTime>1784930400 AND a.dateTime<=1785103200
    AND a.outTemp IS NOT NULL AND a.`interval` BETWEEN 1 AND 120
), ordered AS (
  SELECT local_day,dateTime,clip_start,clip_end,
         MAX(clip_end) OVER(
           PARTITION BY local_day ORDER BY clip_end,dateTime
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
         ) AS preceding_latest_end
  FROM clipped
)
SELECT local_day, COUNT(*) AS valid_temperature_intervals,
       SUM(clip_end-clip_start) AS naive_clipped_seconds,
       SUM(GREATEST(0,clip_end-GREATEST(clip_start,
           COALESCE(preceding_latest_end,clip_start)))) AS distinct_covered_seconds,
       SUM(clip_end-clip_start)-
       SUM(GREATEST(0,clip_end-GREATEST(clip_start,
           COALESCE(preceding_latest_end,clip_start)))) AS duplicated_coverage_seconds
FROM ordered
GROUP BY local_day
ORDER BY local_day;

-- D. If needed, inspect ONLY the affected raw rows (max ~600), no bulk scan.
SELECT dateTime,`interval`,usUnits,outTemp,MOD(dateTime,300) AS grid_offset_seconds
FROM `pocasi-loucka.eu`.`archive`
WHERE dateTime>1784930400 AND dateTime<=1785103200
  AND (MOD(dateTime,300)<>0 OR `interval` IS NULL OR `interval` NOT BETWEEN 1 AND 120)
ORDER BY dateTime LIMIT 1000;
