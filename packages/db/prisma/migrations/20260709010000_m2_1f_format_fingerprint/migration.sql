-- ============================================================================
-- M2-1f — format fingerprint on CaptureQualityEvent (CR-11 / CR-22 / CR-26)
-- ============================================================================
-- A no-decode container + marker signal (JPEG / TIFF / PNG / unknown + FLIR-APP1) that makes the
-- UNKNOWN_FORMAT long tail groupable by manufacturer / model / fingerprint — so decoder work is
-- demand-driven, not speculative (CR-14). Nullable; the column inherits the table's existing
-- tenant-isolation RLS policy (M2-1d), so no RLS change is needed.

ALTER TABLE "CaptureQualityEvent" ADD COLUMN "formatFingerprint" TEXT;
