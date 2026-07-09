import exifr from "exifr";
import { frameFromExif } from "../../lib/field/exif";
import { sniffRadiometricFormat } from "../../lib/field/radiometric";
import type { RadiometricFormat } from "../../lib/quality/reason";
import {
  validateCaptureSet,
  DEFAULT_VALIDATION_CONFIG,
  type FrameMeta,
  type AirframeScreen,
  type AirframeScreenStatus,
  type RegistryScreen,
  type TelemetryScreen,
} from "../../lib/field/validation";
import type { ValidationInMessage, ValidationOutMessage } from "./validation-protocol";

/**
 * Validation Web Worker (M1-05/M1-06) — runs the zero-trash firewall OFF THE MAIN THREAD.
 * It does only the impure work: parse EXIF, and resolve the hardware registry screen via the
 * authenticated, org-scoped API (same-origin fetch carries the pilot's session cookie). All decision
 * logic stays in the pure, tested lib/field/validation.ts, called with the pre-resolved registry.
 */
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<ValidationInMessage>) => void) | null;
  postMessage: (msg: ValidationOutMessage) => void;
};

const EXIF_OPTS = { gps: true, tiff: true, exif: true, xmp: true } as const;

type AirframeApi = { serial: string; status: AirframeScreenStatus; message: string };

/** Authenticated, org-scoped registry screen for one serial (see app/api/v1/field/airframe). */
async function screenSerial(serial: string): Promise<AirframeScreen> {
  try {
    const res = await fetch(`/api/v1/field/airframe?serial=${encodeURIComponent(serial)}`, {
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      return { serial, status: "UNKNOWN", message: `Registry screen unavailable (HTTP ${res.status}).` };
    }
    const data = (await res.json()) as AirframeApi;
    return { serial, status: data.status, message: data.message };
  } catch {
    return { serial, status: "UNKNOWN", message: "Registry screen unreachable." };
  }
}

/** Optional telemetry cross-check: pull serial candidates from an UPLOADED flight log (never live). */
async function screenTelemetry(logFile: File): Promise<TelemetryScreen> {
  let text: string;
  try {
    text = await logFile.text();
  } catch {
    return { logName: logFile.name, serial: null, status: "UNREADABLE", message: `Flight log ${logFile.name} unreadable.` };
  }
  // Heuristic: candidate serials are dash/alnum tokens (e.g. DZI-1234-ABCD, remote-ID strings).
  const candidates = Array.from(new Set((text.match(/\b[A-Z0-9]{4,}(?:-[A-Z0-9]+){1,}\b/gi) ?? []).slice(0, 40)));
  let best: AirframeScreen | null = null;
  for (const c of candidates) {
    const s = await screenSerial(c);
    if (s.status === "VERIFIED") { best = s; break; }
    if (!best || (s.status === "UNVERIFIED" && best.status === "UNKNOWN")) best = s;
  }
  if (!best) {
    return { logName: logFile.name, serial: null, status: "UNKNOWN", message: `No airframe serial recognized in ${logFile.name}.` };
  }
  const verb = best.status === "VERIFIED" ? "matches a verified airframe" : best.status === "UNVERIFIED" ? "matches a registered but unverified airframe" : "did not match the registry";
  return { logName: logFile.name, serial: best.serial, status: best.status, message: `Telemetry serial ${best.serial} ${verb} (from uploaded log).` };
}

ctx.onmessage = async (e) => {
  const { files, logFile } = e.data;

  // 1) Parse EXIF per file (the expensive, off-thread work).
  const frames: FrameMeta[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    let exif = null;
    try {
      exif = await exifr.parse(file, EXIF_OPTS);
    } catch {
      exif = null; // unreadable EXIF is data itself — the frame/gps/airframe checks flag it
    }
    // Radiometric-presence pre-check (M2-1d): sniff head-byte format markers (mirrors
    // RadiometricPort.sniff — NOT a full decode). The server decode stays authoritative.
    let radiometricFormat: RadiometricFormat | null = null;
    try {
      const head = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
      radiometricFormat = sniffRadiometricFormat(head, (exif?.Make as string | undefined) ?? null);
    } catch {
      radiometricFormat = null; // can't sniff → the server decode fail-closes authoritatively
    }
    frames.push(frameFromExif(file.name, file.size, i, exif, radiometricFormat));
    ctx.postMessage({ type: "progress", done: i + 1, total: files.length });
  }

  // 2) Resolve the hardware registry screen (authenticated) for each unique serial.
  const airframeBySerial: Record<string, AirframeScreen> = {};
  const serials = Array.from(new Set(frames.map((f) => f.serialNumber).filter((s): s is string => !!s)));
  for (const serial of serials) airframeBySerial[serial] = await screenSerial(serial);

  const telemetry = logFile ? await screenTelemetry(logFile) : null;
  const registry: RegistryScreen = { airframeBySerial, telemetry };

  // 3) Pure screening with the pre-resolved registry.
  ctx.postMessage({ type: "done", report: validateCaptureSet(frames, DEFAULT_VALIDATION_CONFIG, registry) });
};
