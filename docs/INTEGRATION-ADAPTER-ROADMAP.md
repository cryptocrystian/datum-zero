# INTEGRATION TARGETS & EAM/CMMS ADAPTER ROADMAP

**Document Version:** 1.2.0
**Focus:** CMMS/EAM Integration Tiers, Unified Schema Mapping, & Generic Adapter Standards
**Strategic Alignment:** Post-M1 Market Realignment & Phase 2 Scaling
**Compliance Standard:** CR-12 Evidence-Only Register (Non-Adjudicative Language)

## 1. The Core Realignment

General corporate ITSM platforms (such as Jira or standard ServiceNow Incident tables) are highly useful internal sandboxes but do not represent the actual production environments of industrial solar O&M. Field work orders live in specialized Enterprise Asset Management (EAM) and Computerized Maintenance Management Systems (CMMS).

To maximize market compatibility while minimizing engineering waste, Datum Zero Systems prioritizes native adapter construction based on clear, demand-driven market tiers, running strictly observational, non-adjudicative data payloads.

                    [ DATUM ZERO UNIFIED ANOMALY ]
                                  │
         ┌────────────────────────┼────────────────────────┐
         ▼ (Format: JSON)         ▼ (Format: OData)        ▼ (Format: REST)
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│  MaintainX API   │         │  SAP S/4HANA PM  │         │  IBM Maximo API  │
├──────────────────┤         ├──────────────────┤         ├──────────────────┤
│ POST /v1/        │         │ POST /sap/opu/   │         │ POST /maximo/    │
│ work-orders      │         │ odata/PM_NOTIF   │         │ os/mxwo          │
└──────────────────┘         └──────────────────┘         └──────────────────┘

## 2. Integration Tiers & Prioritized Shortlist

### 2.1 Tier 1: Core Commercial Targets (High Priority)

*These systems represent the default native connectors. We build these immediately upon landing customers within our primary target segments.*

- **MaintainX / UpKeep (Mid-Market Beachhead):** Mobile-first, cloud-native, and widely adopted by agile mid-market solar developers and asset managers. High API accessibility (standard REST/JSON) allows rapid implementation.
- **IBM Maximo (Enterprise Utility Standard):** The undisputed heavyweight for global utilities, large solar portfolios, and oil & gas. Enhanced by IBM's acquisition of **Prescinto** for renewable energy Asset Performance Management (APM). Standard integration runs via the Maximo Integration Framework (MIF) OSLC JSON REST APIs.

### 2.2 Tier 2: Secondary Market Segments (Demand-Driven)

*These adapters are built natively only when an active contract signature is gated directly on integration support.*

- **Hexagon EAM:** Dominant in public works, transport, linear pipeline grids, and utility networks. Critical for spatial tracking along long infrastructure corridors.
- **SAP Plant Maintenance (PM):** Required when the solar operator is fully integrated into an SAP-standardized parent corporation. Highly rigid data models running through SAP Gateway (OData V2/V4).
- **Fiix (Rockwell Automation) / Limble CMMS:** Rapidly growing mid-market industrial maintenance systems with strong API support.

### 2.3 Tier 3: Fragmented Tail (The Generic Adapter Domain)

*These specialized vertical solar systems or legacy corporate databases are not candidates for native adapter engineering. They are handled exclusively via the Generic Delivery Adapter (Webhooks, CSV Drops, secure SFTP, or high-polish PDF dispatches).*

- *Vertical Solar CMMS:* Scoop Solar, Scoop O&M, Scoop PM, WIZSP, 60Hertz, OxMaint.
- *General Industrial/Construction Phase:* Procore (Observations/Punchlists), Autodesk Construction Cloud.

## 3. The Unified Outbound Payload Schema

To prevent our Next.js backend from needing separate database schemas for every target CMMS, our outbound queue maps all physical anomalies to a single, normalized, partner-agnostic data envelope: `UnifiedAnomalyPayload`.

This envelope is the **single internal representation** every adapter translates *from*. It is a lossless superset of the canonical output contract `packages/adapters/contracts/work-order.schema.json`: the Generic Delivery Adapter (`GENERIC_WEBHOOK`) renders the envelope into that JSON Schema unchanged; native adapters render the same envelope into their target schema. There is exactly one authoritative internal object.

```ts
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
```

### 3.1 Envelope → `work-order.schema.json` field mapping

The Generic Delivery Adapter renders `UnifiedAnomalyPayload` into the canonical output contract with this exact mapping. Every required field of the output schema has a source; nothing is invented at dispatch time.

| Envelope field | → `work-order.schema.json` | Transform |
|---|---|---|
| `systemHeaders.datumZeroId` | `work_order_id` | direct |
| `systemHeaders.organizationId` | `organization_id` | direct |
| `systemHeaders.idempotencyKey` | `idempotency_key` | direct |
| `systemHeaders.timestamp` | `emitted_at` | direct (ISO-8601) |
| *(none)* | `schema_version` | adapter-generated const `"1.0"` |
| `assetContext.internalLabel` | `asset.internal_label` | direct |
| `assetContext.procoreLocationId` | `asset.external_ids.procore_location_id` | nest into `external_ids` |
| `assetContext.externalSystemMappings[]` | `asset.external_ids{}` | flatten array `{targetPlatform, externalId}` → object keyed by platform |
| `spatialReference.latitude` | `asset.latitude` | direct (6-dp) |
| `spatialReference.longitude` | `asset.longitude` | direct (6-dp) |
| `spatialReference.elevationOffset` | *(no generic target)* | route to `targetHints` for native adapters; omitted from generic payload |
| `spatialReference.projectionPolygon` | *(no generic target)* | route to `targetHints`; omitted from generic payload |
| `findingData.modality` | `finding.modality` | direct (enum is a shared superset) |
| `findingData.standardRef` | `finding.standard_ref` | direct |
| `findingData.classification` | `finding.classification` | direct |
| `findingData.confidenceScore` | `finding.confidence_score` | direct (0–100) |
| `findingData.metricDeltaValue` | `finding.metric_delta` | direct |
| `findingData.metricUnit` | `finding.metric_unit` | direct |
| `findingData.boundingBox` | `finding.bounding_box` | direct `[x1,y1,x2,y2]` |
| `findingData.visualCropUrl` | `finding.visual_crop_url` | direct |
| `findingData.analyticsCropUrl` | `finding.analytics_crop_url` | direct |
| `findingData.evidenceSummary` | `recommendation.text` | direct — MUST satisfy the schema's verdict-language regex |
| `findingData.recommendedAction` | `recommendation.recommended_action` | direct (`REVIEW`/`INSPECT`/`WARRANTY_REVIEW`/`NONE`) |
| `findingData.priority` | `recommendation.priority_hint` | map: `MONITOR`→`LOW`, `SCHEDULED`→`MEDIUM`, `PROMPT`→`HIGH` |
| `auditProvenance.capturedAt` | `audit.captured_at` | direct |
| `auditProvenance.modelVersion` | `audit.model_version` | direct |
| `auditProvenance.reviewedById` | `audit.reviewed_by` | direct |
| `auditProvenance.reviewedAt` | `audit.reviewed_at` | direct |
| `auditProvenance.ingestionSessionId` | `audit.ingestion_session_id` | direct |
| `auditProvenance.ndaaVerified` | `audit.ndaa_verified` | direct |
| `targetHints` | *(none in generic)* | native adapters only; generic adapter ignores |

**Native-target priority mapping** (reference): `MONITOR`/`SCHEDULED`/`PROMPT` → MaintainX `LOW`/`MEDIUM`/`HIGH`; Maximo work-order priority per site config. Native adapters map from the same envelope enum, never from the generic `priority_hint`.

## 4. Adapter Mapping Specifications (V1 Blueprint)

The adapter translation layer converts this standard `UnifiedAnomalyPayload` into the target system schema at runtime. All mapping outputs pass through our **verdict-language regex filter** prior to transit.

### 4.1 Target: MaintainX REST API v1

- **Endpoint:** POST /v1/work-orders
- **Translation Logic:** Maps spatial coordinates directly to the description field, translates priority enum structure cleanly, and nests our crop images as permanent file attachments.

```json
{
  "title": "[DATUM ZERO] Observed Thermal Variance - APEX-SOLAR-ROW_12-STR_08",
  "description": "Measured thermal profile variance. Calculated Temperature Delta: 18.4C over median. Ground coordinates: 40.712784, -74.005942. Recommended action level: PROMPT.",
  "priority": "HIGH",
  "status": "OPEN",
  "category": "Corrective Maintenance",
  "assetId": "mtx_asset_984210",
  "imageUrls": [
    "https://s3.amazonaws.com/datumzero/crops/vis_8f3b_thumb.jpg",
    "https://s3.amazonaws.com/datumzero/crops/therm_8f3b_thumb.jpg"
  ]
}
```

### 4.2 Target: IBM Maximo OSLC REST API

- **Endpoint:** POST /maximo/oslc/os/mxwo
- **Translation Logic:** Generates a formal enterprise Work Order linked to the specific mapped structural Asset Number, passing purely observational metrics.

```json
{
  "wonum": "WO_DZ_98124",
  "description": "[DATUM ZERO] Observed Thermal Variance - Inverter 04 Row 12",
  "siteid": "APEX_SOLAR_01",
  "assetnum": "MX_ASSET_441092",
  "worktype": "EM",
  "longdescription": "Automated thermal inspection registered thermal delta of 18.4C. High statistical probability of bypass diode thermal profile. Coordinate location: 40.712784, -74.005942. Action level: PROMPT.",
  "mxwodetail": {
    "latitude": 40.712784,
    "longitude": -74.005942,
    "visual_crop_url": "https://s3.amazonaws.com/datumzero/crops/vis_8f3b_thumb.jpg"
  }
}
```

## 5. Drift Detection & Maintenance Flywheel

Because solar sites are scanned on a repeating operational cadence (bi-weekly, monthly, quarterly), the spatial auto-binding engine functions as our primary drift prevention system.

       [Raw Field Image Uploaded via Infield Validator PWA]
                               │
                               ▼
        [FastAPI Extracts Coordinate & Runs Spatial Query]
                               │
          ┌────────────────────┴────────────────────┐
          ▼ (Asset Matches Geometry)                ▼ (No Asset at Coordinates)
[Check Ruleset & Dispatch Ticket]          [Flag as "Layout Drift Anomaly"]
                                            • Creates QA alert: "New Unregistered Asset"
                                            • Prompts Admin to update Registry

Every incoming flight validates the underlying system of record. If an asset coordinate mismatch occurs, the platform automatically flags it as a "Layout Drift" event in our manual QA cockpit, keeping the client's asset directory clean and turning structural database maintenance into a seamless byproduct of recurring compliance scans.
