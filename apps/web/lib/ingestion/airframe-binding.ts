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
