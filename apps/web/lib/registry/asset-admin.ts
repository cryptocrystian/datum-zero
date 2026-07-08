import { prisma } from "@dz/db";

/**
 * OPS-3 — Asset registry administration (CR-13, CR-17).
 *
 * The registry is the internalLabel SPINE (CR-13): a canonical `internalLabel` (CR-17 serialization)
 * + latitude/longitude (the spatial-binding match key) + optional external IDs
 * (cadObjectId/erpAssetId/procoreLocationId). Real registries are seeded from the client's
 * as-built/SCADA naming, so bulk CSV import is first-class.
 *
 * Every function is organizationId-scoped (RLS, M1-02); mutations are ADMIN-gated at the server-action
 * DAL boundary (CR-20). Referential safety (mirrors OPS-1/2): deleting an asset an Anomaly references
 * is refused (audit trail, CR-12).
 */

// CR-17 canonical serialization: SITE_ID-ARRAY_ID-ROW_ID-STRING_ID[-NODE_ID] — 4 or 5 uppercase
// segments (each alnum, underscore-joined). NODE_ID optional.
const SEGMENT = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;

export function isCanonicalLabel(label: string): boolean {
  const parts = (label ?? "").split("-");
  return parts.length >= 4 && parts.length <= 5 && parts.every((p) => SEGMENT.test(p));
}

/** A coordinate string is valid when numeric, ≤ 6 decimal places, and within range. */
export function validateCoordString(raw: string, kind: "lat" | "lon"): { ok: true; value: number } | { ok: false; error: string } {
  const s = (raw ?? "").trim();
  if (!/^-?\d{1,3}(\.\d{1,6})?$/.test(s)) return { ok: false, error: `${kind === "lat" ? "latitude" : "longitude"} must be a number with ≤ 6 decimal places` };
  const v = Number(s);
  const limit = kind === "lat" ? 90 : 180;
  if (!Number.isFinite(v) || v < -limit || v > limit) return { ok: false, error: `${kind === "lat" ? "latitude" : "longitude"} out of range (±${limit})` };
  return { ok: true, value: v };
}

export interface AssetDTO {
  id: string;
  internalLabel: string;
  latitude: number | null;
  longitude: number | null;
  cadObjectId: string | null;
  erpAssetId: string | null;
  procoreLocationId: number | null;
}

export interface AssetInput {
  internalLabel: string;
  latitude: string | null;
  longitude: string | null;
  cadObjectId: string | null;
  erpAssetId: string | null;
  procoreLocationId: string | null;
}

export type Validation = { ok: true } | { ok: false; error: string };

/** Pure input validation: CR-17 label, valid 6-dp coords (both or neither), optional external IDs. */
export function validateAssetInput(input: AssetInput): Validation {
  const label = (input.internalLabel ?? "").trim();
  if (!label) return { ok: false, error: "internalLabel is required" };
  if (!isCanonicalLabel(label)) return { ok: false, error: `internalLabel '${label}' is not the CR-17 canonical format (SITE-ARRAY-ROW-STRING[-NODE])` };

  const lat = (input.latitude ?? "").trim();
  const lon = (input.longitude ?? "").trim();
  if ((lat && !lon) || (!lat && lon)) return { ok: false, error: "latitude and longitude must be provided together" };
  if (lat) {
    const la = validateCoordString(lat, "lat");
    if (!la.ok) return la;
    const lo = validateCoordString(lon, "lon");
    if (!lo.ok) return lo;
  }

  const procore = (input.procoreLocationId ?? "").trim();
  if (procore && !/^\d+$/.test(procore)) return { ok: false, error: "procoreLocationId must be an integer" };
  return { ok: true };
}

// ---- CSV import ------------------------------------------------------------------------------------

const HEADER_ALIASES: Record<string, string> = {
  internallabel: "internalLabel", internal_label: "internalLabel", label: "internalLabel",
  latitude: "latitude", lat: "latitude",
  longitude: "longitude", lon: "longitude", lng: "longitude", long: "longitude",
  cadobjectid: "cadObjectId", cad_object_id: "cadObjectId",
  erpassetid: "erpAssetId", erp_asset_id: "erpAssetId",
  procorelocationid: "procoreLocationId", procore_location_id: "procoreLocationId",
};

export interface ParsedCsv {
  ok: boolean;
  error?: string;
  rows: { line: number; values: Record<string, string> }[];
}

/** Minimal, dependency-free CSV parse. Header-mapped; fields are labels/coords/IDs (no embedded commas). */
export function parseAssetCsv(text: string): ParsedCsv {
  const lines = (text ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return { ok: false, error: "empty CSV", rows: [] };

  const splitRow = (l: string) => l.split(",").map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
  const rawHeader = splitRow(lines[0]).map((h) => HEADER_ALIASES[h.toLowerCase()] ?? h);
  for (const req of ["internalLabel", "latitude", "longitude"]) {
    if (!rawHeader.includes(req)) return { ok: false, error: `CSV header missing required column: ${req}`, rows: [] };
  }

  const rows: ParsedCsv["rows"] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    const values: Record<string, string> = {};
    rawHeader.forEach((h, idx) => { values[h] = cells[idx] ?? ""; });
    rows.push({ line: i + 1, values }); // 1-based line number (header is line 1)
  }
  return { ok: true, rows };
}

const rowToInput = (v: Record<string, string>): AssetInput => ({
  internalLabel: v.internalLabel ?? "",
  latitude: v.latitude || null,
  longitude: v.longitude || null,
  cadObjectId: v.cadObjectId || null,
  erpAssetId: v.erpAssetId || null,
  procoreLocationId: v.procoreLocationId || null,
});

// ---- persistence data shaping ----------------------------------------------------------------------

const SELECT = { id: true, internalLabel: true, latitude: true, longitude: true, cadObjectId: true, erpAssetId: true, procoreLocationId: true } as const;
const num = (x: unknown): number | null => (x == null ? null : Number(x));
const toDTO = (r: { id: string; internalLabel: string; latitude: unknown; longitude: unknown; cadObjectId: string | null; erpAssetId: string | null; procoreLocationId: number | null }): AssetDTO => ({
  id: r.id, internalLabel: r.internalLabel, latitude: num(r.latitude), longitude: num(r.longitude),
  cadObjectId: r.cadObjectId, erpAssetId: r.erpAssetId, procoreLocationId: r.procoreLocationId,
});

// Store coords at exactly 6 dp (CR-17); empty external IDs → null.
function assetData(input: AssetInput) {
  const lat = (input.latitude ?? "").trim();
  const lon = (input.longitude ?? "").trim();
  const procore = (input.procoreLocationId ?? "").trim();
  return {
    internalLabel: input.internalLabel.trim(),
    latitude: lat ? Number(lat).toFixed(6) : null,
    longitude: lon ? Number(lon).toFixed(6) : null,
    cadObjectId: input.cadObjectId?.trim() || null,
    erpAssetId: input.erpAssetId?.trim() || null,
    procoreLocationId: procore ? Number(procore) : null,
  };
}

// ---- org-scoped CRUD + import ----------------------------------------------------------------------

/** Read: assets for the org, optionally filtered by label substring (registries are large). */
export async function listAssets(organizationId: string, opts: { search?: string; take?: number } = {}): Promise<{ assets: AssetDTO[]; total: number }> {
  const where = {
    organizationId,
    ...(opts.search ? { internalLabel: { contains: opts.search, mode: "insensitive" as const } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.asset.findMany({ where, orderBy: { internalLabel: "asc" }, take: opts.take ?? 200, select: SELECT }),
    prisma.asset.count({ where }),
  ]);
  return { assets: rows.map(toDTO), total };
}

export async function createAsset(organizationId: string, input: AssetInput): Promise<AssetDTO> {
  const v = validateAssetInput(input);
  if (!v.ok) throw new Error(v.error);
  const created = await prisma.asset.create({ data: { organizationId, ...assetData(input) }, select: SELECT });
  return toDTO(created);
}

export async function updateAsset(organizationId: string, id: string, input: AssetInput): Promise<AssetDTO> {
  const existing = await prisma.asset.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!existing) throw new Error("asset not found in org");
  const v = validateAssetInput(input);
  if (!v.ok) throw new Error(v.error);
  const updated = await prisma.asset.update({ where: { id }, data: assetData(input), select: SELECT });
  return toDTO(updated);
}

export async function deleteAsset(organizationId: string, id: string): Promise<void> {
  const existing = await prisma.asset.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!existing) throw new Error("asset not found in org");
  const refs = await prisma.anomaly.count({ where: { organizationId, assetId: id } });
  if (refs > 0) throw new Error(`asset is referenced by ${refs} finding(s) — cannot delete (audit trail, CR-12)`);
  await prisma.asset.delete({ where: { id } });
}

export interface ImportResult {
  imported: number;
  errors: { row: number; error: string }[];
}

/**
 * Bulk CSV import. Validates EVERY row up front; on any error, imports nothing and reports per-row
 * errors (all-or-nothing — the client fixes the export and re-imports cleanly). Valid imports run in
 * a single transaction, org-scoped, upsert-by-label (idempotent re-import).
 */
export async function importAssetsCsv(organizationId: string, csvText: string): Promise<ImportResult> {
  const parsed = parseAssetCsv(csvText);
  if (!parsed.ok) return { imported: 0, errors: [{ row: 1, error: parsed.error ?? "invalid CSV" }] };

  const errors: ImportResult["errors"] = [];
  const valid: AssetInput[] = [];
  const seen = new Set<string>();
  for (const r of parsed.rows) {
    const input = rowToInput(r.values);
    const v = validateAssetInput(input);
    if (!v.ok) { errors.push({ row: r.line, error: v.error }); continue; }
    const label = input.internalLabel.trim();
    if (seen.has(label)) { errors.push({ row: r.line, error: `duplicate internalLabel in file: ${label}` }); continue; }
    seen.add(label);
    valid.push(input);
  }
  if (errors.length > 0) return { imported: 0, errors };

  await prisma.$transaction(async (tx) => {
    for (const input of valid) {
      const data = assetData(input);
      const existing = await tx.asset.findFirst({ where: { organizationId, internalLabel: data.internalLabel }, select: { id: true } });
      if (existing) await tx.asset.update({ where: { id: existing.id }, data });
      else await tx.asset.create({ data: { organizationId, ...data } });
    }
  });
  return { imported: valid.length, errors: [] };
}
