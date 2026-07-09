-- M2-2a / CR-28 — grounded objective IEC Category, additive (CR-27 pattern). Nullable; inherits the Anomaly RLS policy.

ALTER TABLE "Anomaly" ADD COLUMN "iecCategory" INTEGER;
ALTER TABLE "Anomaly" ADD COLUMN "requiresSafetyReview" BOOLEAN;
