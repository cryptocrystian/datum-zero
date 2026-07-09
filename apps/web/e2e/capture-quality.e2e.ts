import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

// --- env: DATABASE_URL from repo .env locally (CI sets it as job env) ---
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  // absent in CI — the job provides DATABASE_URL.
}
process.env.INFERENCE_CALLBACK_TOKEN = "e2e-callback-token";

import { NextRequest } from "next/server";
import { prisma, runWithOrg } from "@dz/db";
import { POST as captureQualityCallback } from "@/app/api/v1/inference/capture-quality/route";
import { listCaptureQualityEvents, listUnsupportedFormatCounts } from "@/lib/quality/events";
import { captureQualityReason } from "@/lib/quality/reason";
import { CaptureQualityStrip } from "@/app/(cockpit)/queue/CaptureQualityStrip";
import { UnsupportedFormats } from "@/app/(cockpit)/queue/UnsupportedFormats";

const ORG = "00000000-0000-0000-0000-000000000001"; // seeded concierge tenant
const OTHER = "00000000-0000-0000-0000-0000000000ff"; // a different tenant
const UNKNOWN_SESSION = "cqe-e2e-unknown-session";
const COLORIZED_SESSION = "cqe-e2e-colorized-session";
const VERDICT = /\b(violation|breach|back-?charge|penalty|liable|guilty|enforce)\b/i;

function post(body: unknown) {
  const req = new NextRequest("http://localhost/api/v1/inference/capture-quality", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.INFERENCE_CALLBACK_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return captureQualityCallback(req);
}

async function cleanup() {
  await runWithOrg(ORG, async () => {
    await prisma.captureQualityEvent.deleteMany({ where: { ingestionSessionId: { in: [UNKNOWN_SESSION, COLORIZED_SESSION] } } });
    await prisma.ingestionSession.deleteMany({ where: { id: { in: [UNKNOWN_SESSION, COLORIZED_SESSION] } } });
  });
}

beforeAll(async () => {
  await cleanup();
  await runWithOrg(ORG, async () => {
    for (const id of [UNKNOWN_SESSION, COLORIZED_SESSION]) {
      await prisma.ingestionSession.create({
        data: { id, organizationId: ORG, modality: "DRONE_THERMAL", pilotOrNodeId: "cqe-e2e", rawStoragePath: `s3://cqe/${id}` },
      });
    }
  });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("M2-1d/f — radiometric fail-closed data-quality, surfaced (end-to-end)", () => {
  it("an UNKNOWN_FORMAT capture records a CaptureQualityEvent — no anomaly, no dispatch", () =>
    runWithOrg(ORG, async () => {
      const res = await post({
        ingestion_session_id: UNKNOWN_SESSION,
        organization_id: ORG,
        status: "UNKNOWN_FORMAT",
        manufacturer: "Autel Robotics",
        model: "EVO II 640T",
        detected_format: null,
        format_fingerprint: "JPEG",
      });
      expect(res.status).toBe(201);

      const event = await prisma.captureQualityEvent.findFirstOrThrow({ where: { ingestionSessionId: UNKNOWN_SESSION } });
      expect(event.status).toBe("UNKNOWN_FORMAT");
      expect(event.formatFingerprint).toBe("JPEG");
      expect(event.manufacturer).toBe("Autel Robotics");
      // fail closed: a rejected capture creates NO anomaly and NO dispatch.
      expect(await prisma.anomaly.count({ where: { mediaAsset: { ingestionSessionId: UNKNOWN_SESSION } } })).toBe(0);
      expect(await prisma.workOrderDispatch.count({ where: { anomaly: { mediaAsset: { ingestionSessionId: UNKNOWN_SESSION } } } })).toBe(0);
    }));

  it("a colorized-only capture records NO_RADIOMETRIC_CHANNEL — counted SEPARATELY from unknown", () =>
    runWithOrg(ORG, async () => {
      const res = await post({
        ingestion_session_id: COLORIZED_SESSION,
        organization_id: ORG,
        status: "NO_RADIOMETRIC_CHANNEL",
        manufacturer: "Workswell",
        model: "WIRIS",
        detected_format: "RADIOMETRIC_TIFF",
        format_fingerprint: "TIFF",
      });
      expect(res.status).toBe(201);

      const event = await prisma.captureQualityEvent.findFirstOrThrow({ where: { ingestionSessionId: COLORIZED_SESSION } });
      expect(event.status).toBe("NO_RADIOMETRIC_CHANNEL");

      // the unsupported-format aggregate is UNKNOWN_FORMAT only: the unknown maker is present, the
      // colorized (NO_RADIOMETRIC_CHANNEL) maker is NOT — the two are reported separately (M2-1f).
      const groups = await listUnsupportedFormatCounts(ORG);
      expect(groups.some((g) => g.manufacturer === "Autel Robotics" && g.formatFingerprint === "JPEG")).toBe(true);
      expect(groups.some((g) => g.manufacturer === "Workswell")).toBe(false);
    }));

  it("the cockpit capture-quality section + unsupported-format aggregate render, evidence-framed", () =>
    runWithOrg(ORG, async () => {
      const events = await listCaptureQualityEvents(ORG);
      const stripHtml = renderToStaticMarkup(createElement(CaptureQualityStrip, { events }));
      // both rejected captures surface with the DERIVED evidence-framed reason; no verdict language.
      expect(stripHtml).toContain(captureQualityReason("UNKNOWN_FORMAT"));
      expect(stripHtml).toContain(captureQualityReason("NO_RADIOMETRIC_CHANNEL"));
      expect(stripHtml).not.toMatch(VERDICT);

      const groups = await listUnsupportedFormatCounts(ORG);
      const aggHtml = renderToStaticMarkup(createElement(UnsupportedFormats, { groups }));
      expect(aggHtml).toContain("Autel Robotics");
      expect(aggHtml).toContain("JPEG");
      expect(aggHtml).not.toMatch(VERDICT);
    }));

  it("capture-quality events are org-scoped — another org sees none of ours", () =>
    runWithOrg(OTHER, async () => {
      const events = await listCaptureQualityEvents(OTHER);
      expect(events.some((e) => e.ingestionSessionId === UNKNOWN_SESSION)).toBe(false);
      expect(events.some((e) => e.ingestionSessionId === COLORIZED_SESSION)).toBe(false);
      const groups = await listUnsupportedFormatCounts(OTHER);
      expect(groups.some((g) => g.manufacturer === "Autel Robotics")).toBe(false);
    }));
});
