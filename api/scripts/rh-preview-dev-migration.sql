-- Prepared migration: run ONLY after operator confirms this is a separate dev-only
-- schema, not on the production or loucka_reconstruction schemas.
-- One-time DBA operation, NOT executed automatically by application or PR merge.
-- Run in an isolated dev MariaDB instance or schema with separate least-privilege
-- importer INSERT/SELECT and API SELECT-only credentials.
--
-- CREATE DATABASE `loucka_dev_preview` ... is intentionally NOT in this file.
-- A DBA must create the dev-only schema in advance and inspect current grants.

CREATE TABLE `loucka_dev_preview`.`rh_preview_versions` (
 `version_id` varchar(40) NOT NULL,
 `checksum_sha256` char(64) NOT NULL,
 `model` varchar(64) NOT NULL,
 `status` varchar(40) NOT NULL,
 `point_total` int unsigned NOT NULL,
 `estimated_total` int unsigned NOT NULL,
 `frozen_adjusted_total` int unsigned NOT NULL,
 `invalidated_total` int unsigned NOT NULL,
 `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`version_id`),
 UNIQUE KEY `uq_preview_sha` (`checksum_sha256`)
) ENGINE=InnoDB;

CREATE TABLE `loucka_dev_preview`.`rh_preview_points` (
 `version_id` varchar(40) NOT NULL,
 `dateTime` int NOT NULL,
 `original_rh` double NULL,
 `preview_rh` double NULL,
 `quality` varchar(40) NOT NULL,
 `category` varchar(32) NOT NULL,
 `method` varchar(80) NOT NULL,
 `source_batch` varchar(80) NOT NULL,
 `review_state` varchar(40) NOT NULL,
 PRIMARY KEY (`version_id`,`dateTime`),
 CONSTRAINT `fk_rh_preview_version` FOREIGN KEY (`version_id`)
 REFERENCES `loucka_dev_preview`.`rh_preview_versions` (`version_id`),
 CONSTRAINT `chk_preview_original` CHECK (`original_rh` IS NULL OR
 (`original_rh` BETWEEN 1 AND 100)),
 CONSTRAINT `chk_preview_value` CHECK (`preview_rh` IS NULL OR
 (`preview_rh` BETWEEN 1 AND 100)),
 CONSTRAINT `chk_preview_unapproved` CHECK (`review_state`='experimental_unapproved')
) ENGINE=InnoDB;

-- No UPDATE, DELETE, DROP, triggers, views, event schedulers, or alteration
-- of original WeeWX archive/day summaries. No promotion flag in these tables.
-- Never grant INSERT to the API's read-only SQL identity.
