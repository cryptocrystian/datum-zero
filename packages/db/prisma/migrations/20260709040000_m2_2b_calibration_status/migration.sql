-- M2-2b / CR-29 — session-level environmental inspection-condition flag (additive, flag-not-block).

CREATE TYPE "CalibrationStatus" AS ENUM ('CALIBRATED', 'CALIBRATED_BY_SCADA_LOAD', 'UNRELIABLE_ENVIRONMENT');
ALTER TABLE "IngestionSession" ADD COLUMN "calibrationStatus" "CalibrationStatus";
