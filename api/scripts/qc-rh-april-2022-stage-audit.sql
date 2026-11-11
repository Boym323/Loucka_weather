-- RH 2022 April: reproducible, read-only evidence queries.
-- Execute statements individually using a SELECT-only account.
-- NOTE: UTC grouping uses FLOOR(target_time / 86400), NEVER DATE(FROM_UNIXTIME),
-- because FROM_UNIXTIME may group on the MariaDB session's local time zone.
-- No stage approval, reconstruction, insert, update or delete.

-- 1. Reconcile the existing stage to the ORIGINAL IMMUTABLE production archive.
SELECT s.defect_type,s.decision,s.method_version,COUNT(*) AS candidateCount,
 COALESCE(SUM(o.dateTime IS NULL),0) AS originalRowAbsent,
 COALESCE(SUM(s.defect_type='missing' AND o.outHumidity IS NOT NULL),0) AS missingButOwnRhMeasured,
 COALESCE(SUM(s.defect_type='frozen' AND o.outHumidity IS NULL),0) AS frozenButOwnRhNull,
 COALESCE(SUM(s.original_humidity_pct IS NOT NULL AND o.outHumidity IS NOT NULL
   AND ABS(s.original_humidity_pct-o.outHumidity)>0.001),0) AS originalRhChanged,
 COALESCE(SUM(s.local_temperature_c IS NOT NULL AND o.outTemp IS NOT NULL
   AND ABS(s.local_temperature_c-o.outTemp)>0.01),0) AS originalTemperatureChanged,
 COALESCE(SUM(o.usUnits<>16),0) AS wrongUnits,
 COALESCE(SUM(s.proposed_humidity_pct IS NULL),0) AS withoutExistingProposal,
 COALESCE(SUM(s.luhamet_humidity_pct IS NULL OR s.ilouka4_humidity_pct IS NULL
   OR s.luhamet_humidity_pct NOT BETWEEN 1 AND 100
   OR s.ilouka4_humidity_pct NOT BETWEEN 1 AND 100),0) AS invalidOrMissingReference,
 COALESCE(SUM(ABS(s.luhamet_humidity_pct-s.ilouka4_humidity_pct)>10),0) AS referenceDifferenceOver10,
 COALESCE(SUM(ABS(s.luhamet_humidity_pct-s.ilouka4_humidity_pct)>20),0) AS referenceDifferenceOver20,
 COALESCE(SUM(s.proposed_humidity_pct<
   LEAST(s.luhamet_humidity_pct,s.ilouka4_humidity_pct)-10
   OR s.proposed_humidity_pct>
   GREATEST(s.luhamet_humidity_pct,s.ilouka4_humidity_pct)+10),0) AS existingProposalBeyondReferenceBandBy10
FROM `loucka_reconstruction`.`reconstruction_humidity_202204` AS s
LEFT JOIN `pocasi-loucka.eu`.`archive` AS o
 ON o.dateTime=s.target_time
GROUP BY s.defect_type,s.decision,s.method_version
ORDER BY candidateCount DESC;

-- 2. Mutually-exclusive screening risk category, never approval.
SELECT CASE
 WHEN s.defect_type='frozen' AND s.decision='invalidate_frozen'
   THEN 'frozen_invalidation_requires_review'
 WHEN s.defect_type='frozen' THEN 'frozen_sensor_requires_review'
 WHEN s.decision='missing_unresolved' THEN 'missing_unresolved'
 WHEN s.luhamet_humidity_pct IS NULL OR s.ilouka4_humidity_pct IS NULL
   OR s.luhamet_humidity_pct NOT BETWEEN 1 AND 100
   OR s.ilouka4_humidity_pct NOT BETWEEN 1 AND 100
   THEN 'missing_reference_insufficient'
 WHEN ABS(s.luhamet_humidity_pct-s.ilouka4_humidity_pct)>20
   THEN 'missing_reference_conflict_over_20pp'
 WHEN ABS(s.luhamet_humidity_pct-s.ilouka4_humidity_pct)>10
   THEN 'missing_reference_conflict_over_10pp'
 WHEN s.proposed_humidity_pct<
   LEAST(s.luhamet_humidity_pct,s.ilouka4_humidity_pct)-10
   OR s.proposed_humidity_pct>
   GREATEST(s.luhamet_humidity_pct,s.ilouka4_humidity_pct)+10
   THEN 'missing_proposal_outside_reference_band'
 ELSE 'missing_references_agree_unvalidated'
END AS riskCategory,COUNT(*) AS candidateCount
FROM `loucka_reconstruction`.`reconstruction_humidity_202204` AS s
GROUP BY riskCategory ORDER BY candidateCount DESC;

-- 3. UTC-day distribution, not server-local calendar days.
SELECT FLOOR(s.target_time/86400) AS utcDayIndex,
 s.defect_type,s.decision,COUNT(*) AS candidateCount,
 COALESCE(SUM(ABS(s.luhamet_humidity_pct-s.ilouka4_humidity_pct)>10),0)
   AS referenceDifferenceOver10,
 COALESCE(SUM(ABS(s.luhamet_humidity_pct-s.ilouka4_humidity_pct)>20),0)
   AS referenceDifferenceOver20
FROM `loucka_reconstruction`.`reconstruction_humidity_202204` AS s
GROUP BY utcDayIndex,s.defect_type,s.decision
ORDER BY utcDayIndex,s.defect_type,s.decision;

-- 4. Distinct full UTC five-minute frozen runs, includes all legacy decisions.
WITH ordered AS (
 SELECT target_time,original_humidity_pct,
 LAG(target_time) OVER (ORDER BY target_time) AS previousTime,
 LAG(original_humidity_pct) OVER (ORDER BY target_time) AS previousRh
 FROM `loucka_reconstruction`.`reconstruction_humidity_202204`
 WHERE defect_type='frozen'
), marked AS (
 SELECT target_time,original_humidity_pct,
 CASE WHEN target_time-previousTime=300
   AND original_humidity_pct=previousRh THEN 0 ELSE 1 END AS beginsRun
 FROM ordered
), grouped AS (
 SELECT target_time,original_humidity_pct,
 SUM(beginsRun) OVER (ORDER BY target_time
   ROWS UNBOUNDED PRECEDING) AS runId
 FROM marked
)
SELECT MIN(target_time) AS fromUtcEpoch,MAX(target_time) AS toUtcEpoch,
 MIN(original_humidity_pct) AS frozenOriginalRh,COUNT(*) AS fiveMinuteSlots,
 ROUND(COUNT(*)*5/60,2) AS observedHours
FROM grouped
GROUP BY runId ORDER BY fiveMinuteSlots DESC LIMIT 18;
