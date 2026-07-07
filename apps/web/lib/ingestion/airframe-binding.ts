import { prisma } from "@dz/db";

/**
 * CR-11 — capture-time serial match against the VERIFIED airframe registry.
 *
 * NDAA compliance is enforced by the platform registry, NEVER by in-browser attestation, and
 * the serial arrives from uploaded telemetry / flight logs — not a live Remote-ID beacon
 * (browsers can't receive them; EXIF is spoofable). Binding is tenant-scoped: the airframe
 * must belong to a pilot in this org or the shared marketplace pool.
 *
 * FAIL CLOSED (MANIFEST cmd 5): an unknown serial, or a registered-but-not-verified airframe,
 * returns `ok:false`. The caller MUST NOT create an IngestionSession in that case.
 */
export type AirframeBindingResult =
  | {
      ok: true;
      hardwareId: string;
      pilotId: string;
      /** Always true on the ok path — only verified airframes bind (CR-11). */
      isNdaaVerified: boolean;
      approvedListRef: string | null;
    }
  | {
      ok: false;
      reason: "NO_MATCH" | "NOT_VERIFIED";
      message: string;
    };

export async function bindAirframe(params: {
  organizationId: string;
  airframeSerial: string;
}): Promise<AirframeBindingResult> {
  const serial = params.airframeSerial?.trim();
  if (!serial) {
    return { ok: false, reason: "NO_MATCH", message: "No airframe serial supplied with the capture." };
  }

  const hardware = await prisma.pilotHardware.findFirst({
    where: {
      serialNumber: serial,
      // Tenant-scoped: an org-owned pilot, or the shared Datum Zero marketplace pool.
      pilot: {
        OR: [{ organizationId: params.organizationId }, { organizationId: null }],
      },
    },
    include: { pilot: { select: { id: true } } },
  });

  if (!hardware) {
    return {
      ok: false,
      reason: "NO_MATCH",
      message: `Serial ${serial} is not in the verified airframe registry for this tenant.`,
    };
  }

  // Fail closed: registered but not NDAA-verified is NOT sufficient (CR-11).
  if (!hardware.ndaaVerified || !hardware.verifiedAt) {
    return {
      ok: false,
      reason: "NOT_VERIFIED",
      message: `Airframe ${serial} is registered but not NDAA-verified; capture halted.`,
    };
  }

  return {
    ok: true,
    hardwareId: hardware.id,
    pilotId: hardware.pilot.id,
    isNdaaVerified: true,
    approvedListRef: hardware.approvedListRef ?? null,
  };
}

export type AirframeScreenResult = {
  serial: string;
  status: "VERIFIED" | "UNVERIFIED" | "UNKNOWN";
  matchedField: "serialNumber" | "remoteIdSerial" | null;
  message: string;
};

/**
 * Read-only registry SCREEN for the Infield Validator pre-check (M1-06). Matches a serial against
 * the tenant's PilotHardware by EITHER serialNumber (from EXIF) OR remoteIdSerial (from an uploaded
 * flight log), tenant-scoped (org or marketplace pool). Non-mutating; the authoritative gate remains
 * the server-side bindAirframe at ingestion. Evidence-framed, never an attestation (CR-11).
 */
export async function screenAirframe(organizationId: string, serialRaw: string): Promise<AirframeScreenResult> {
  const serial = serialRaw?.trim() ?? "";
  if (!serial) return { serial, status: "UNKNOWN", matchedField: null, message: "No serial supplied." };

  const hw = await prisma.pilotHardware.findFirst({
    where: {
      OR: [{ serialNumber: serial }, { remoteIdSerial: serial }],
      pilot: { OR: [{ organizationId }, { organizationId: null }] },
    },
    select: { serialNumber: true, remoteIdSerial: true, aircraftModel: true, ndaaVerified: true, verifiedAt: true, approvedListRef: true },
  });

  if (!hw) {
    return { serial, status: "UNKNOWN", matchedField: null, message: `Serial ${serial} is not in this tenant's airframe registry.` };
  }
  const matchedField = hw.serialNumber === serial ? "serialNumber" : "remoteIdSerial";
  if (!hw.ndaaVerified || !hw.verifiedAt) {
    return { serial, status: "UNVERIFIED", matchedField, message: `Airframe ${serial} (${hw.aircraftModel}) is registered but not verified.` };
  }
  const ref = hw.approvedListRef ? ` · ${hw.approvedListRef}` : "";
  return { serial, status: "VERIFIED", matchedField, message: `Airframe ${serial} (${hw.aircraftModel}) registered + verified${ref}.` };
}
