-- M2-7 / CR-36 — ingestion→inference orchestration: per-session processing status (additive, nullable).
-- Upload enqueues a  job and sets PENDING; the worker sets PROCESSING → COMPLETE,
-- or FAILED after exhausted retries (fail closed + surfaced). null = pre-orchestration session.

CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETE', 'FAILED');
ALTER TABLE "IngestionSession" ADD COLUMN "processingStatus" "ProcessingStatus";
