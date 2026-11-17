-- Issue #80: pinpoint the *location*, not just total, of overlapped or
-- uncovered original temperature intervals on 25–26 July 2026.
-- SQL is read-only; no meteorological values are selected or modified.
-- Europe/Prague local days are UTC+02 in July:
-- 2026-07-25 (1784930400,1785016800], 2026-07-26 (1785016800,1785103200].
-- WeeWX archive.dateTime is the END of its interval.
-- For each row, clip [dateTime-interval*60,dateTime] to the local day.
-- Compute maximal prior end, not just LAG(end), to handle nested overlaps.
-- IMPORTANT: epoch columns are UTC-second counters, independent of SQL server TZ.
--
-- 1. Exact individual intervals that create a gap or overlap.
WITH days AS (
 SELECT '2026-07-25' AS local_day,1784930400 AS day_start,1785016800 AS day_end
 UNION ALL SELECT '2026-07-26',1785016800,1785103200
), clipped AS (
 SELECT d.local_day,d.day_start,d.day_end,a.dateTime,
        MOD(a.dateTime,300) AS grid_offset_seconds,
        GREATEST(d.day_start,a.dateTime-a.`interval`*60) AS clip_start,
        LEAST(d.day_end,a.dateTime) AS clip_end
 FROM days d
 JOIN `pocasi-loucka.eu`.`archive` a
   ON a.dateTime>d.day_start AND a.dateTime<=d.day_end
 WHERE a.outTemp IS NOT NULL AND a.`interval` BETWEEN 1 AND 120
   AND a.dateTime>1784930400 AND a.dateTime<=1785103200
), sequenced AS (
 SELECT c.*,
        MAX(clip_end) OVER (
          PARTITION BY local_day
          ORDER BY clip_start,clip_end,dateTime
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS preceding_latest_end
 FROM clipped c
), classified AS (
 SELECT *,
        GREATEST(0,clip_start-COALESCE(preceding_latest_end,day_start)) AS gap_before_seconds,
        (clip_end-clip_start)-
        GREATEST(0,clip_end-GREATEST(clip_start,
          COALESCE(preceding_latest_end,clip_start))) AS overlap_seconds
 FROM sequenced
)
SELECT local_day,dateTime AS interval_end_epoch,
       clip_start AS covered_from_epoch,clip_end AS covered_to_epoch,
       grid_offset_seconds,gap_before_seconds,overlap_seconds
FROM classified
WHERE gap_before_seconds>0 OR overlap_seconds>0
ORDER BY local_day,covered_from_epoch,interval_end_epoch;

-- 2. Day totals with start/internal/end gaps, validating prior summary math.
-- Expected (from independent existing 2026-07 QC, not hardcoded into SQL):
-- 25 July: 3120 overlap, 720 total uncovered, 85680 unique covered seconds.
-- 26 July: 1800 overlap, 0 uncovered, 86400 unique covered seconds.
WITH days AS (
 SELECT '2026-07-25' AS local_day,1784930400 AS day_start,1785016800 AS day_end
 UNION ALL SELECT '2026-07-26',1785016800,1785103200
), clipped AS (
 SELECT d.local_day,d.day_start,d.day_end,a.dateTime,
        MOD(a.dateTime,300) AS grid_offset_seconds,
        GREATEST(d.day_start,a.dateTime-a.`interval`*60) AS clip_start,
        LEAST(d.day_end,a.dateTime) AS clip_end
 FROM days d
 JOIN `pocasi-loucka.eu`.`archive` a
   ON a.dateTime>d.day_start AND a.dateTime<=d.day_end
 WHERE a.outTemp IS NOT NULL AND a.`interval` BETWEEN 1 AND 120
   AND a.dateTime>1784930400 AND a.dateTime<=1785103200
), sequenced AS (
 SELECT c.*,
        MAX(clip_end) OVER (
          PARTITION BY local_day
          ORDER BY clip_start,clip_end,dateTime
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS preceding_latest_end
 FROM clipped c
), classified AS (
 SELECT *,
        GREATEST(0,clip_start-COALESCE(preceding_latest_end,day_start)) AS gap_before_seconds,
        (clip_end-clip_start)-
        GREATEST(0,clip_end-GREATEST(clip_start,
          COALESCE(preceding_latest_end,clip_start))) AS overlap_seconds
 FROM sequenced
), totals AS (
 SELECT local_day,
        COUNT(*) AS valid_temp_intervals,
        SUM(clip_end-clip_start) AS raw_clipped_seconds,
        SUM(gap_before_seconds) AS leading_or_internal_gap_seconds,
        SUM(overlap_seconds) AS overlap_seconds,
        MAX(clip_end) AS last_interval_end
 FROM classified
 GROUP BY local_day
)
SELECT d.local_day,
       COALESCE(t.valid_temp_intervals,0) AS valid_temp_intervals,
       COALESCE(t.raw_clipped_seconds,0) AS raw_clipped_seconds,
       COALESCE(t.overlap_seconds,0) AS overlap_seconds,
       COALESCE(t.leading_or_internal_gap_seconds,0) AS leading_or_internal_gap_seconds,
       GREATEST(0,d.day_end-COALESCE(t.last_interval_end,d.day_start)) AS end_gap_seconds,
       COALESCE(t.leading_or_internal_gap_seconds,0)+
        GREATEST(0,d.day_end-COALESCE(t.last_interval_end,d.day_start)) AS total_missing_seconds,
       COALESCE(t.raw_clipped_seconds,0)-COALESCE(t.overlap_seconds,0) AS unique_covered_seconds
FROM days d LEFT JOIN totals t ON t.local_day=d.local_day
ORDER BY d.local_day;
