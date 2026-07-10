/**
 * Capture-quality — pure, dependency-free vocabulary for the radiometric data-quality outcome
 * (M2-1d/M2-1f, CR-11/CR-22/CR-25/CR-26). No Prisma, no Node builtins — safe to import from BOTH the
 * cockpit (server) and the Infield Validator PWA (client), so the operator copy and the edge copy stay
 * identical.
 *
 * Language is EVIDENCE-FRAMED (CR-12): an observation + an actionable re-capture recommendation.
 * Never a verdict — an observation, not a judgment. This records a REJECTED capture; it is a
 * data-quality event, never an anomaly and never dispatchable.
 */

/** Parse outcomes the inference RadiometricPort fails closed on (M2-1b). Reported SEPARATELY (M2-1f):
 *  UNKNOWN_FORMAT is a coverage gap (decoder backlog); NO_RADIOMETRIC_CHANNEL is an operator re-capture. */
export type CaptureQualityStatus = "NO_RADIOMETRIC_CHANNEL" | "UNKNOWN_FORMAT" | "INVALID_INSPECTION_CONDITION" | "INCOMPLETE_CAPTURE_METADATA";

export type RadiometricFormat = "FLIR_RJPEG" | "RADIOMETRIC_TIFF" | "DJI_RJPEG";

export const CAPTURE_QUALITY_STATUSES: readonly CaptureQualityStatus[] = [
  "NO_RADIOMETRIC_CHANNEL",
  "UNKNOWN_FORMAT",
  "INVALID_INSPECTION_CONDITION",
  "INCOMPLETE_CAPTURE_METADATA",
];

/**
 * The single source of truth for the operator- AND edge-facing reason. Evidence-framed + actionable;
 * deterministic (same status → same copy). The server derives this on persist and the cockpit renders
 * it, so the stored reason and the displayed reason are identical; the PWA reuses it at the edge.
 */
export function captureQualityReason(
  status: CaptureQualityStatus,
  _detectedFormat?: string | null,
): string {
  if (status === "INCOMPLETE_CAPTURE_METADATA") {
    return "Incomplete capture metadata — GPS / timestamp missing; the capture can't be spatially bound or sun-positioned. Re-capture with location + time enabled.";
  }
  if (status === "INVALID_INSPECTION_CONDITION") {
    return "Shaded capture — re-inspect the area without shading (IEC TS 62446-3 §5.1 requires a shading-free inspection).";
  }
  if (status === "NO_RADIOMETRIC_CHANNEL") {
    return "Non-radiometric capture (colorized / 8-bit only) — re-capture in radiometric / R-JPEG mode.";
  }
  return "Unrecognized capture format — no radiometric decoder matched. Re-capture in a supported radiometric mode (FLIR R-JPEG, radiometric TIFF, or DJI R-JPEG).";
}

/** Normalized capture-quality outcome (camelCase), reason derived — never fabricated by the caller. */
export interface CaptureQualityInput {
  ingestionSessionId: string;
  organizationId: string;
  status: CaptureQualityStatus;
  reason: string;
  manufacturer: string | null;
  model: string | null;
  detectedFormat: string | null;
  formatFingerprint: string | null;
}

export type ParseResult =
  | { ok: true; value: CaptureQualityInput }
  | { ok: false; error: string };

function nonEmptyString(x: unknown): string | null {
  return typeof x === "string" && x.trim().length > 0 ? x.trim() : null;
}

/**
 * Validate + normalize the inbound data-quality callback (snake_case on the wire, MANIFEST §3).
 * Fails closed on a malformed body or an unknown status. The reason is DERIVED here (single source of
 * truth) — the payload's own reason, if any, is ignored so cockpit copy can't drift from the record.
 */
export function parseCaptureQualityCallback(body: unknown): ParseResult {
  if (!body || typeof body !== "object") return { ok: false, error: "expected a JSON body" };
  const b = body as Record<string, unknown>;

  const ingestionSessionId = nonEmptyString(b.ingestion_session_id);
  if (!ingestionSessionId) return { ok: false, error: "ingestion_session_id is required" };

  const organizationId = nonEmptyString(b.organization_id);
  if (!organizationId) return { ok: false, error: "organization_id is required" };

  const status = nonEmptyString(b.status);
  if (!status || !CAPTURE_QUALITY_STATUSES.includes(status as CaptureQualityStatus)) {
    return { ok: false, error: `status must be one of ${CAPTURE_QUALITY_STATUSES.join(", ")}` };
  }
  const s = status as CaptureQualityStatus;

  const detectedFormat = nonEmptyString(b.detected_format);
  return {
    ok: true,
    value: {
      ingestionSessionId,
      organizationId,
      status: s,
      reason: captureQualityReason(s, detectedFormat),
      manufacturer: nonEmptyString(b.manufacturer),
      model: nonEmptyString(b.model),
      detectedFormat,
      formatFingerprint: nonEmptyString(b.format_fingerprint),
    },
  };
}

/** Cockpit DTO (serializable — `createdAt` is an ISO string). */
export interface CaptureQualityEventDTO {
  id: string;
  ingestionSessionId: string;
  status: CaptureQualityStatus;
  reason: string;
  manufacturer: string | null;
  model: string | null;
  detectedFormat: string | null;
  formatFingerprint: string | null;
  createdAt: string;
}

/** Pure row → DTO mapper (the row shape matches the CaptureQualityEvent Prisma model). */
export function toCaptureQualityEventDTO(row: {
  id: string;
  ingestionSessionId: string;
  status: string;
  reason: string;
  manufacturer: string | null;
  model: string | null;
  detectedFormat: string | null;
  formatFingerprint: string | null;
  createdAt: Date | string;
}): CaptureQualityEventDTO {
  return {
    id: row.id,
    ingestionSessionId: row.ingestionSessionId,
    status: row.status as CaptureQualityStatus,
    reason: row.reason,
    manufacturer: row.manufacturer,
    model: row.model,
    detectedFormat: row.detectedFormat,
    formatFingerprint: row.formatFingerprint,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : row.createdAt.toISOString(),
  };
}

// --- M2-1f: the unsupported-format demand signal (decoder long tail, measured not guessed) ----------

/** One grouped row of the unsupported-format aggregate (UNKNOWN_FORMAT, by device + fingerprint). */
export interface UnsupportedFormatDTO {
  manufacturer: string | null;
  model: string | null;
  formatFingerprint: string | null;
  count: number;
}

/** Pure Prisma-groupBy-row → DTO. The row shape matches groupBy([manufacturer, model,
 *  formatFingerprint]) with _count.id on CaptureQualityEvent. */
export function toUnsupportedFormatDTO(row: {
  manufacturer: string | null;
  model: string | null;
  formatFingerprint: string | null;
  _count: { id: number };
}): UnsupportedFormatDTO {
  return {
    manufacturer: row.manufacturer,
    model: row.model,
    formatFingerprint: row.formatFingerprint,
    count: row._count.id,
  };
}

/** Operator label for one unsupported-format group — evidence-framed, no verdict (CR-12). */
export function unsupportedFormatLabel(g: UnsupportedFormatDTO): string {
  const device = [g.manufacturer ?? "Unknown maker", g.model].filter((s): s is string => !!s).join(" ");
  return `${device} — ${g.formatFingerprint ?? "unrecognized container"}`;
}
