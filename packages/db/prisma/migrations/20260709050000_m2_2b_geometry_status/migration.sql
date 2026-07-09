-- M2-2b / CR-29 — per-capture geometry validity flag on the anomaly (additive).

CREATE TYPE "GeometryStatus" AS ENUM ('VERIFIED', 'UNVERIFIED', 'EXCLUDED_ABSOLUTE', 'RESOLUTION_INSUFFICIENT');
ALTER TABLE "Anomaly" ADD COLUMN "geometryStatus" "GeometryStatus";
