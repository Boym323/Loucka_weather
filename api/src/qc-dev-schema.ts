/** ONLY isolated ephemeral MariaDB CI schema, never a live-db migration.
 * This module is deliberately not imported by the running Fastify app. It
 * refuses every schema except qc_ci_<numeric-run-id>. No production DDL.
 */
export function ephemeralQcSchemaStatements(schema:string):string[]{
 if(!/^qc_ci_[0-9]{1,20}$/.test(schema))throw new Error('Only isolated qc_ci_<run id> schema is allowed');
 const db='`'+schema+'`';
 return [
  'CREATE DATABASE '+db+' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  `CREATE TABLE ${db}.sensor_epoch (
    epoch_id VARCHAR(96) NOT NULL PRIMARY KEY,
    physical_sensor_ref VARCHAR(128) NOT NULL,
    start_utc BIGINT NOT NULL,
    end_utc BIGINT NULL,
    raw_unit VARCHAR(32) NOT NULL,
    evidence_ref VARCHAR(256) NOT NULL,
    verified TINYINT NOT NULL DEFAULT 0,
    CHECK (end_utc IS NULL OR end_utc>start_utc),
    CHECK (verified IN (0,1))
   ) ENGINE=InnoDB`,
  `CREATE TABLE ${db}.observation_raw_ref (
    raw_ref_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    source_database VARCHAR(96) NOT NULL,
    source_table VARCHAR(96) NOT NULL,
    source_timestamp_utc BIGINT NOT NULL,
    source_interval_min SMALLINT NOT NULL,
    variable VARCHAR(64) NOT NULL,
    raw_value DOUBLE NULL,
    raw_sha256 CHAR(64) NOT NULL,
    sensor_epoch_id VARCHAR(96) NULL,
    CONSTRAINT fk_qc_raw_sensor FOREIGN KEY (sensor_epoch_id)
      REFERENCES ${db}.sensor_epoch(epoch_id),
    CHECK (source_interval_min BETWEEN 1 AND 1440),
    CHECK (CHAR_LENGTH(raw_sha256)=64)
   ) ENGINE=InnoDB`,
  `CREATE TABLE ${db}.measurement_qc (
    target_time_utc BIGINT NOT NULL,
    variable VARCHAR(64) NOT NULL,
    quality_state ENUM('MEASURED','CORRECTED','ESTIMATED','UNVERIFIED',
      'MISSING','NOT_INSTALLED','SENSOR_ERROR') NOT NULL,
    measurement_value DOUBLE NULL,
    display_value DOUBLE NULL,
    raw_ref_id BIGINT NULL,
    epoch_id VARCHAR(96) NULL,
    change_ref VARCHAR(128) NULL,
    qc_flags_json LONGTEXT NOT NULL,
    independent_validation TINYINT NOT NULL DEFAULT 0,
    approved TINYINT NOT NULL DEFAULT 0,
    extrema_eligible TINYINT NOT NULL DEFAULT 0,
    PRIMARY KEY (target_time_utc,variable),
    CONSTRAINT fk_qc_measure_raw FOREIGN KEY (raw_ref_id)
      REFERENCES ${db}.observation_raw_ref(raw_ref_id),
    CONSTRAINT fk_qc_measure_epoch FOREIGN KEY (epoch_id)
      REFERENCES ${db}.sensor_epoch(epoch_id),
    CHECK (JSON_VALID(qc_flags_json)),
    CHECK (independent_validation IN (0,1)),
    CHECK (approved IN (0,1)),
    CHECK (extrema_eligible IN (0,1)),
    CHECK (quality_state NOT IN ('MISSING','NOT_INSTALLED','SENSOR_ERROR')
      OR display_value IS NULL),
    CHECK (extrema_eligible=0 OR
      (quality_state='MEASURED' AND independent_validation=1)),
    CHECK (quality_state<>'UNVERIFIED' OR
      (approved=0 AND independent_validation=0 AND raw_ref_id IS NOT NULL)),
    CHECK (quality_state NOT IN ('CORRECTED','ESTIMATED') OR
      (approved=1 AND change_ref IS NOT NULL))
   ) ENGINE=InnoDB`,
  `CREATE TABLE ${db}.reconstruction_manifest (
    batch_id VARCHAR(96) NOT NULL PRIMARY KEY,
    target_time_utc BIGINT NOT NULL,
    variable VARCHAR(64) NOT NULL,
    expected_old DOUBLE NULL,
    proposed_new DOUBLE NULL,
    payload_sha256 CHAR(64) NOT NULL,
    before_image_sha256 CHAR(64) NOT NULL,
    explicit_approval TINYINT NOT NULL DEFAULT 0,
    state ENUM('DRY_RUN','APPROVED','APPLIED','REVERTED') NOT NULL DEFAULT 'DRY_RUN',
    CHECK (CHAR_LENGTH(payload_sha256)=64 AND CHAR_LENGTH(before_image_sha256)=64),
    CHECK (explicit_approval IN (0,1)),
    CHECK (state NOT IN ('APPROVED','APPLIED') OR explicit_approval=1)
   ) ENGINE=InnoDB`,
  `CREATE TABLE ${db}.archive_fixture (
    dateTime BIGINT NOT NULL PRIMARY KEY,
    rain DOUBLE NULL,
    outTemp DOUBLE NULL
   ) ENGINE=InnoDB`
 ];
}
