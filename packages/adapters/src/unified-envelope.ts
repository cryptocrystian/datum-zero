/**
 * The single INTERNAL canonical representation of a dispatchable anomaly (M2-PREP, CR-21).
 *
 * Every delivery adapter translates FROM this envelope: the Generic Delivery Adapter renders it into
 * `packages/adapters/contracts/work-order.schema.json` (the authoritative OUTPUT contract) via the
 * §3.1 mapping in docs/INTEGRATION-ADAPTER-ROADMAP.md; native adapters render the same envelope into
 * their target schema. There is exactly one authoritative internal object — this is NOT a second
 * persisted schema (transport/contract type only; no Prisma model).
 *
 * Evidence, not verdict (CR-12): `evidenceSummary` is purely observational. Enterprise-only fields ride
 * in the additive `targetHints` bag, never by altering the core shape.
 */

// TS TYPE SCHEMA: UNIFIED OUTBOUND ANOMALY ENVELOPE (CR-12 COMPLIANT)
export type ActionPriority = "MONITOR" | "SCHEDULED" | "PROMPT";
export type RecommendedAction = "REVIEW" | "INSPECT" | "WARRANTY_REVIEW" | "NONE";
export type CaptureModality =
  | "DRONE_THERMAL"
  | "DRONE_ORTHOMOSAIC"
  | "HANDHELD_360_VIDEO"
  | "CRANE_LASER_SCAN"
  | "STATIONARY_IOT_SENSOR";

export interface UnifiedAnomalyPayload {
  systemHeaders: {
    datumZeroId: string;
    organizationId: string;
    idempotencyKey: string;
    timestamp: string;                    // ISO-8601
  };
  assetContext: {
    internalLabel: string;                // Spine ID, e.g. "APEX_SOLAR-GRID_04-ROW_12-STR_08"
    procoreLocationId?: number;           // Optional spatial reference
    externalSystemMappings?: {
      targetPlatform: string;             // e.g. "MAINTAINX", "MAXIMO"
      externalId: string;                 // Exact system key in their DB
    }[];
  };
  spatialReference: {
    latitude: number | null;                     // 6-decimal precision
    longitude: number | null;                    // 6-decimal precision
    elevationOffset?: number;             // Z-axis in meters (enterprise; via targetHints downstream)
    projectionPolygon?: string;           // GeoJSON geometry string (enterprise)
  };
  findingData: {
    modality: CaptureModality;
    standardRef?: string | null;          // e.g. "IEC TS 62446-3"
    classification?: string | null;       // e.g. "Thermal abnormality — Category 2"
    confidenceScore: number;              // 0–100, e.g. 96.8
    metricDeltaValue: number;             // e.g. 18.4
    metricUnit: "CELSIUS_DELTA" | "INCH_SHIFT" | "CORROSION_PERCENT";
    boundingBox?: [number, number, number, number] | null;  // [x1,y1,x2,y2] in visual crop
    priority: ActionPriority;             // Aligned with core contract definitions
    recommendedAction: RecommendedAction; // Separate axis from measurement (CR-15)
    evidenceSummary: string;              // Purely observational. No adjudication (CR-12).
    visualCropUrl: string;                // S3 secure signed URL
    analyticsCropUrl: string;             // S3 secure signed URL (thermal hotspot highlight)
  };
  auditProvenance: {                      // CR-12 immutable provenance — REQUIRED
    capturedAt: string;                   // ISO-8601
    modelVersion: string;                 // e.g. "thermal-detect@0.3.1"
    reviewedById: string;                 // Datum Zero QA reviewer — 100% human gate
    reviewedAt: string;                   // ISO-8601
    ingestionSessionId?: string | null;
    ndaaVerified?: boolean;               // Capture bound to a verified airframe (CR-11)
  };
  targetHints?: Record<string, unknown>;  // Per-target extras (elevationOffset, SAP/Maximo fields).
                                          // NEVER core; native adapters read, generic adapter ignores.
}
