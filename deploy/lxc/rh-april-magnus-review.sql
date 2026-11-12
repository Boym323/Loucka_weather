-- READ ONLY. No writes or automatic approval. Run query 1 once.
-- Query 2: bind parameters [from_minus_30s,to_plus_30s,from,to] in each
-- of six nonoverlapping 5-day UTC windows starting 1648771200 (2022-04-01).
-- End exclusive 1651363200. Step 432000 seconds. Use prepared parameters.
-- References are uniquely matched to nearest 5min slot within ±30 s.
-- All numeric predictions are for comparison only, never publication.

-- 1. Stage review categories (existing 3734 candidates; no new data).
WITH x AS (
 SELECT target_time,defect_type,decision,proposed_humidity_pct AS p,
  luhamet_humidity_pct AS l,ilouka4_humidity_pct AS w,
  local_temperature_c AS t,luhamet_temperature_c AS lt,ilouka4_temperature_c AS wt,
  luhamet_humidity_pct*EXP(17.62*luhamet_temperature_c/(243.12+luhamet_temperature_c)-17.62*local_temperature_c/(243.12+local_temperature_c)) AS lp,
  ilouka4_humidity_pct*EXP(17.62*ilouka4_temperature_c/(243.12+ilouka4_temperature_c)-17.62*local_temperature_c/(243.12+local_temperature_c)) AS wp
 FROM loucka_reconstruction.reconstruction_humidity_202204
 WHERE method_version='dual_vapor_pressure_v1'
), classified AS (
 SELECT *,CASE
 WHEN decision<>'estimate_ready' THEN 'no_numeric_estimate'
 WHEN l IS NULL OR w IS NULL OR t IS NULL OR lt IS NULL OR wt IS NULL OR p IS NULL
   OR l NOT BETWEEN 1 AND 100 OR w NOT BETWEEN 1 AND 100 OR p NOT BETWEEN 1 AND 100
   OR t NOT BETWEEN -60 AND 60 OR lt NOT BETWEEN -60 AND 60 OR wt NOT BETWEEN -60 AND 60 THEN 'invalid_inputs'
 WHEN ABS(p-ROUND(LEAST(100,GREATEST(1,(lp+wp)/2)),2))>0.000001 THEN 'historical_formula_mismatch'
 WHEN ABS(l-w)>10 THEN 'raw_reference_conflict'
 WHEN p<LEAST(l,w)-10 OR p>GREATEST(l,w)+10 THEN 'outside_raw_reference_band'
 WHEN ABS(lp-wp)>5 THEN 'transferred_reference_conflict'
 WHEN GREATEST(ABS(t-lt),ABS(t-wt))>3 THEN 'temperature_distance'
 WHEN (lp+wp)/2 NOT BETWEEN 1 AND 100 THEN 'clamped'
 ELSE 'strict_experimental_review' END AS gate
 FROM x
)
SELECT FLOOR(target_time/86400) AS utcDayIndex,defect_type,decision,gate,COUNT(*) AS n
FROM classified GROUP BY FLOOR(target_time/86400),defect_type,decision,gate
ORDER BY utcDayIndex,defect_type,decision,gate;

-- 2. Identical gate on genuinely original RH controls (per day).
WITH refs AS (
 SELECT station_id,ROUND(observed_at_utc/300)*300 AS slot,
  MAX(relative_humidity_pct) AS rh,MAX(temperature_c) AS temp
 FROM loucka_reconstruction.reference_observations
 WHERE station_id IN ('luhamet_sehradice','wu_ilouka4')
  AND observed_at_utc>=? AND observed_at_utc<?
  AND quality_status='reference_only' AND relative_humidity_pct BETWEEN 1 AND 100
  AND temperature_c BETWEEN -60 AND 60
  AND ABS(observed_at_utc-ROUND(observed_at_utc/300)*300)<=30
 GROUP BY station_id,ROUND(observed_at_utc/300)*300 HAVING COUNT(*)=1
), pairs AS (
 SELECT a.dateTime AS t,a.outHumidity AS own,a.outTemp AS local_temp,
  l.rh AS luha,w.rh AS wu,l.temp AS lt,w.temp AS wt,
  l.rh*EXP(17.62*l.temp/(243.12+l.temp)-17.62*a.outTemp/(243.12+a.outTemp)) AS lp,
  w.rh*EXP(17.62*w.temp/(243.12+w.temp)-17.62*a.outTemp/(243.12+a.outTemp)) AS wp
 FROM `pocasi-loucka.eu`.archive a
 JOIN refs w ON w.station_id='wu_ilouka4' AND w.slot=a.dateTime
 JOIN refs l ON l.station_id='luhamet_sehradice' AND l.slot=a.dateTime
 WHERE a.dateTime>=? AND a.dateTime<? AND a.dateTime%300=0
  AND a.usUnits=16 AND a.outHumidity BETWEEN 1 AND 100 AND a.outTemp BETWEEN -60 AND 60
  AND NOT EXISTS (
   SELECT 1 FROM loucka_reconstruction.reconstruction_humidity_202204 f
   WHERE f.target_time=a.dateTime AND f.defect_type='frozen'
  )
), p AS (
 SELECT *,ROUND(LEAST(100,GREATEST(1,(lp+wp)/2)),2) AS prediction FROM pairs
), groups AS (
 SELECT 'all' AS gate,p.* FROM p
 UNION ALL
 SELECT 'strict' AS gate,p.* FROM p
 WHERE ABS(luha-wu)<=10
  AND prediction BETWEEN LEAST(luha,wu)-10 AND GREATEST(luha,wu)+10
  AND ABS(lp-wp)<=5 AND GREATEST(ABS(local_temp-lt),ABS(local_temp-wt))<=3
  AND (lp+wp)/2 BETWEEN 1 AND 100
)
SELECT gate,FLOOR(t/86400) AS utcDayIndex,COUNT(*) AS n,
 SUM(ABS(prediction-own)) AS sumAbsoluteError,
 SUM(POW(prediction-own,2)) AS sumSquaredError,
 SUM(prediction-own) AS sumBias,
 SUM(ABS(wu-own)) AS sumWuAbsoluteError,
 SUM(POW(wu-own,2)) AS sumWuSquaredError,
 SUM(ABS(prediction-own)>5) AS over5,
 SUM(ABS(prediction-own)>10) AS over10,
 SUM(ABS(prediction-own)>15) AS over15,
 MAX(ABS(prediction-own)) AS maxError
FROM groups GROUP BY gate,FLOOR(t/86400)
ORDER BY gate,utcDayIndex;
