-- M2-1e / CR-27 — persist the sniffed radiometric format on the anomaly for audit provenance.
-- Nullable; additive to the pinned inference callback contract. Inherits the Anomaly RLS policy.

ALTER TABLE "Anomaly" ADD COLUMN "detectedFormat" TEXT;
