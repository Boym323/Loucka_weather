-- QC #80: strictly SELECT-only, index-bounded triage of two absent WeeWX DAILY
-- SUMMARY days in 2025. The original archive is not modified.
-- Time zone Europe/Prague: November UTC+01. Intervals end at archive.dateTime.
-- Each day uses (local 00:00, next local 00:00]; left boundary exclusive.
-- Confirmed missing summary days: 2025-11-06 and 2025-11-28.
-- Includes exactly one adjacent local day on either side for evidence.
-- Never infer missing raw measurements merely from missing archive_day_* rows.
--
-- A. Summary-presence cross-check: six local day starts, four summary tables.
WITH days AS (
  SELECT '2025-11-05' AS local_day, 1762297200 AS left_exclusive, 1762383600 AS right_inclusive, 0 AS target_gap
  UNION ALL SELECT '2025-11-06' AS local_day, 1762383600 AS left_exclusive, 1762470000 AS right_inclusive, 1 AS target_gap
  UNION ALL SELECT '2025-11-07' AS local_day, 1762470000 AS left_exclusive, 1762556400 AS right_inclusive, 0 AS target_gap
  UNION ALL SELECT '2025-11-27' AS local_day, 1764198000 AS left_exclusive, 1764284400 AS right_inclusive, 0 AS target_gap
  UNION ALL SELECT '2025-11-28' AS local_day, 1764284400 AS left_exclusive, 1764370800 AS right_inclusive, 1 AS target_gap
  UNION ALL SELECT '2025-11-29' AS local_day, 1764370800 AS left_exclusive, 1764457200 AS right_inclusive, 0 AS target_gap
)
SELECT d.local_day, d.target_gap,
       IF(t.dateTime IS NULL,0,1) AS has_temp_summary,
       IF(r.dateTime IS NULL,0,1) AS has_rain_summary,
       IF(w.dateTime IS NULL,0,1) AS has_wind_summary,
       IF(g.dateTime IS NULL,0,1) AS has_gust_summary
FROM days d
LEFT JOIN `pocasi-loucka.eu`.`archive_day_outTemp` t ON t.dateTime=d.left_exclusive
LEFT JOIN `pocasi-loucka.eu`.`archive_day_rain` r ON r.dateTime=d.left_exclusive
LEFT JOIN `pocasi-loucka.eu`.`archive_day_wind` w ON w.dateTime=d.left_exclusive
LEFT JOIN `pocasi-loucka.eu`.`archive_day_windGust` g ON g.dateTime=d.left_exclusive
ORDER BY d.local_day;

-- B. Raw archive presence/quality (six one-day index ranges, <= ~1800 rows
-- at a normal 5min rate). No individual weather value is selected.
WITH days AS (
  SELECT '2025-11-05' AS local_day, 1762297200 AS left_exclusive, 1762383600 AS right_inclusive, 0 AS target_gap
  UNION ALL SELECT '2025-11-06' AS local_day, 1762383600 AS left_exclusive, 1762470000 AS right_inclusive, 1 AS target_gap
  UNION ALL SELECT '2025-11-07' AS local_day, 1762470000 AS left_exclusive, 1762556400 AS right_inclusive, 0 AS target_gap
  UNION ALL SELECT '2025-11-27' AS local_day, 1764198000 AS left_exclusive, 1764284400 AS right_inclusive, 0 AS target_gap
  UNION ALL SELECT '2025-11-28' AS local_day, 1764284400 AS left_exclusive, 1764370800 AS right_inclusive, 1 AS target_gap
  UNION ALL SELECT '2025-11-29' AS local_day, 1764370800 AS left_exclusive, 1764457200 AS right_inclusive, 0 AS target_gap
)
SELECT d.local_day,d.target_gap, COUNT(a.dateTime) AS raw_rows,
       SUM(IF(a.outTemp IS NOT NULL,1,0)) AS valid_temp_rows,
       SUM(IF(a.rain IS NOT NULL,1,0)) AS valid_rain_rows,
       SUM(IF(a.windSpeed IS NOT NULL,1,0)) AS valid_wind_rows,
       SUM(IF(a.windGust IS NOT NULL,1,0)) AS valid_gust_rows,
       SUM(IF(a.dateTime IS NOT NULL AND MOD(a.dateTime,300)<>0,1,0)) AS offgrid_rows,
       SUM(IF(a.dateTime IS NOT NULL AND
              (a.`interval` IS NULL OR a.`interval` NOT BETWEEN 1 AND 120),
              1,0)) AS invalid_interval_rows,
       SUM(IF(a.outTemp IS NOT NULL AND a.`interval` BETWEEN 1 AND 120,
              a.`interval`*60,0)) AS naive_valid_temperature_seconds,
       MIN(a.dateTime) AS first_epoch,MAX(a.dateTime) AS last_epoch
FROM days d
LEFT JOIN `pocasi-loucka.eu`.`archive` a
  ON a.dateTime>d.left_exclusive AND a.dateTime<=d.right_inclusive
GROUP BY d.local_day,d.target_gap
ORDER BY d.local_day;

-- C. Two target days ONLY: unique covered seconds after clipping intervals
-- and removing overlaps. Important: raw rows can exist but be duplicate,
-- offgrid or cover less than the local day.
WITH target_days AS (
  SELECT '2025-11-06' AS local_day, 1762383600 AS left_exclusive, 1762470000 AS right_inclusive, 1 AS target_gap
  UNION ALL SELECT '2025-11-28' AS local_day, 1764284400 AS left_exclusive, 1764370800 AS right_inclusive, 1 AS target_gap
), clipped AS (
 SELECT d.local_day,a.dateTime,
        GREATEST(d.left_exclusive,a.dateTime-a.`interval`*60) AS clip_start,
        LEAST(d.right_inclusive,a.dateTime) AS clip_end
 FROM target_days d
 JOIN `pocasi-loucka.eu`.`archive` a
   ON a.dateTime>d.left_exclusive AND a.dateTime<=d.right_inclusive
 WHERE a.outTemp IS NOT NULL AND a.`interval` BETWEEN 1 AND 120
   AND ((a.dateTime>1762383600 AND a.dateTime<=1762470000)
     OR (a.dateTime>1764284400 AND a.dateTime<=1764370800))
), ordered AS (
 SELECT local_day,dateTime,clip_start,clip_end,
        MAX(clip_end) OVER(
          PARTITION BY local_day ORDER BY clip_end,dateTime
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS prior_max_end
 FROM clipped
)
SELECT local_day, COUNT(*) AS valid_temp_intervals,
       SUM(clip_end-clip_start) AS naive_clipped_seconds,
       SUM(GREATEST(0,clip_end-GREATEST(clip_start,
           COALESCE(prior_max_end,clip_start)))) AS unique_covered_seconds,
       SUM(clip_end-clip_start)-
       SUM(GREATEST(0,clip_end-GREATEST(clip_start,
           COALESCE(prior_max_end,clip_start)))) AS duplicate_seconds
FROM ordered GROUP BY local_day ORDER BY local_day;

-- Interpretation: if B has raw data yet A lacks summary rows, investigate
-- WeeWX aggregation only AFTER preserving evidence. If B has zero raw rows,
-- do not generate fake daily weather, or import reference station values as
-- original. C may return no row for a fully absent raw day.
