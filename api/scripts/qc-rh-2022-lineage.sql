-- Historical RH lineage, read-only and UTC. Execute SELECT statements separately.
-- Source of truth: `pocasi-loucka.eu`.`archive` is the original and must never be changed.

-- 1. Original and existing reconstruction snapshot for calendar year 2022.
SELECT 'original' AS sourceName,COUNT(*) AS originalRows,
 COALESCE(SUM(outHumidity IS NULL),0) AS nullRh,
 COALESCE(SUM(outHumidity BETWEEN 1 AND 100),0) AS validRh
FROM `pocasi-loucka.eu`.`archive`
WHERE dateTime>=1640995200 AND dateTime<1672531200
UNION ALL
SELECT 'reconstruction' AS sourceName,COUNT(*) AS originalRows,
 COALESCE(SUM(outHumidity IS NULL),0) AS nullRh,
 COALESCE(SUM(outHumidity BETWEEN 1 AND 100),0) AS validRh
FROM `loucka_reconstruction`.`archive`
WHERE dateTime>=1640995200 AND dateTime<1672531200;

-- 2. Provenance of changes ALREADY applied to reconstruction, never a write.
SELECT CASE
 WHEN c.target_time>=1646092800 AND c.target_time<1648771200 THEN '2022-03'
 WHEN c.target_time>=1648771200 AND c.target_time<1651363200 THEN '2022-04'
 WHEN c.target_time>=1656633600 AND c.target_time<1659312000 THEN '2022-07'
 ELSE 'other' END AS utcMonth,
 c.source_database,c.state,COUNT(*) AS changeCount,
 COALESCE(SUM(c.old_value IS NULL AND c.new_value BETWEEN 1 AND 100),0)
   AS oldNullToEstimated,
 COALESCE(SUM(c.old_value IS NOT NULL AND c.new_value BETWEEN 1 AND 100),0)
   AS existingRhChanged,
 COALESCE(SUM(c.old_value IS NOT NULL AND c.new_value IS NULL),0)
   AS existingRhInvalidated
FROM `loucka_reconstruction`.`reconstruction_changes` AS c
WHERE c.variable='outHumidity' AND c.state='applied'
 AND c.target_time>=1640995200 AND c.target_time<1672531200
GROUP BY utcMonth,c.source_database,c.state
ORDER BY utcMonth,c.source_database;

-- 3. Source and state integrity checks for March and July (1,575 historical changes).
SELECT CASE WHEN c.target_time>=1646092800 AND c.target_time<1648771200
 THEN '2022-03' ELSE '2022-07' END AS utcMonth,
 COUNT(*) AS changeCount,
 COALESCE(SUM(o.dateTime IS NULL),0) AS originalRowAbsent,
 COALESCE(SUM(o.outHumidity IS NOT NULL),0) AS unexpectedlyMeasuredOriginalRh,
 COALESCE(SUM(r.dateTime IS NULL),0) AS reconstructionRowAbsent,
 COALESCE(SUM(c.new_value IS NOT NULL AND r.outHumidity IS NOT NULL
   AND ABS(c.new_value-r.outHumidity)>0.0001),0) AS changedSinceAudit,
 COUNT(DISTINCT c.batch_key) AS distinctAuditBatches
FROM `loucka_reconstruction`.`reconstruction_changes` AS c
LEFT JOIN `pocasi-loucka.eu`.`archive` AS o
 ON o.dateTime=c.target_time
LEFT JOIN `loucka_reconstruction`.`archive` AS r
 ON r.dateTime=c.target_time
WHERE c.variable='outHumidity' AND c.state='applied' AND
 ((c.target_time>=1646092800 AND c.target_time<1648771200)
 OR (c.target_time>=1656633600 AND c.target_time<1659312000))
GROUP BY utcMonth ORDER BY utcMonth;

-- 4. Descriptions of existing methods only, not proof of their correctness.
SELECT CASE WHEN target_time>=1646092800 AND target_time<1648771200
 THEN '2022-03' ELSE '2022-07' END AS utcMonth,
 CASE WHEN reason LIKE '%Magnus transfer%' THEN 'magnus_minus_2pp'
      WHEN reason LIKE '%moderate v1%' THEN 'weighted_moderate_v1'
      WHEN reason LIKE '%ESTIMATED_EXTERNAL v1%' THEN 'weighted_v1'
      ELSE 'other_audit_text' END AS declaredMethod,
 COUNT(*) AS changeCount,COUNT(DISTINCT batch_key) AS auditBatches
FROM `loucka_reconstruction`.`reconstruction_changes`
WHERE variable='outHumidity' AND state='applied' AND
 ((target_time>=1646092800 AND target_time<1648771200)
 OR (target_time>=1656633600 AND target_time<1659312000))
GROUP BY utcMonth,declaredMethod ORDER BY utcMonth,changeCount DESC;
