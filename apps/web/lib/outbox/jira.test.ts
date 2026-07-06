import { describe, it, expect } from "vitest";
import {
  renderWorkOrder,
  mapToJiraIssue,
  buildJiraSummary,
  buildJiraDescriptionLines,
  resolveIssueTypeId,
  type RenderContext,
} from "@dz/adapters";

const VERDICT = /\b(violation|breach|back-?charge|penalty|liable|guilty)\b/i; // guardrail:allow-verdict-term

function ctx(overrides: Partial<RenderContext["anomaly"]> = {}): RenderContext {
  return {
    dispatchId: "00000000-0000-0000-00da-00000000000a",
    idempotencyKey: "anom-1:integ-jira",
    organizationId: "00000000-0000-0000-0000-000000000001",
    emittedAt: "2026-07-06T00:00:00.000Z",
    anomaly: {
      latitude: 32.22278,
      longitude: -110.97437,
      confidenceScore: 0.968,
      metricDelta: 18.4,
      metricUnit: "CELSIUS_DELTA",
      classification: "IEC TS 62446-3 Cat 2 — thermal abnormality",
      recommendation:
        "Measured +18.4°C delta vs. median (confidence 96.8%); classified IEC TS 62446-3 Cat 2 — thermal abnormality. Review recommended vs. IEC TS 62446-3 2017.",
      standardRef: "IEC TS 62446-3",
      modelVersion: "thermal-threshold-v0.1.0",
      reviewedById: "stub-qa-reviewer",
      reviewedAt: "2026-07-06T00:00:00.000Z",
      boundingBox: [180, 120, 250, 190],
      visualCropUrl: "s3://datum-zero-dev/org/x/visual_crop.bin",
      analyticsCropUrl: "s3://datum-zero-dev/org/x/analytics_crop.bin",
      ...overrides,
    },
    asset: { internalLabel: "APEX_SOLAR-GRID_04-ROW_02-STR_03", latitude: 32.22278, longitude: -110.97437 },
    capture: { modality: "DRONE_THERMAL", capturedAt: "2026-07-05T18:00:00.000Z", ndaaVerified: true, ingestionSessionId: "sess-1" },
  };
}

describe("NATIVE_JIRA mapping (M0-10, CR-05, CR-12)", () => {
  it("maps the canonical payload to a Jira Cloud issue (project DZ, resolved issue type id)", () => {
    const issue = mapToJiraIssue(renderWorkOrder(ctx()), { projectKey: "DZ", issueTypeId: "10001" });
    expect(issue.fields.project.key).toBe("DZ");
    // Team-managed project: issue type is referenced by id, not a global name.
    expect(issue.fields.issuetype.id).toBe("10001");
    expect(issue.fields.summary).toContain("APEX_SOLAR-GRID_04-ROW_02-STR_03");
    expect(issue.fields.summary).toContain("review recommended");
    expect(issue.fields.description.type).toBe("doc"); // ADF
    expect(issue.fields.labels).toContain("datum-zero");
  });

  it("resolves the 'Task' issue type id from project create-metadata", () => {
    const types = [
      { id: "10002", name: "Epic", subtask: false },
      { id: "10001", name: "Task", subtask: false },
      { id: "10003", name: "Subtask", subtask: true },
    ];
    expect(resolveIssueTypeId(types, "Task")).toBe("10001");
    // Falls back to the first non-subtask type when the preferred name is absent.
    expect(resolveIssueTypeId([{ id: "9", name: "Story", subtask: false }], "Task")).toBe("9");
    expect(resolveIssueTypeId([{ id: "1", name: "Subtask", subtask: true }], "Task")).toBeNull();
  });

  it("summary + description are evidence-framed, never a verdict (CR-12)", () => {
    const p = renderWorkOrder(ctx());
    const summary = buildJiraSummary(p as never);
    const descText = buildJiraDescriptionLines(p as never).join("\n");
    expect(summary).not.toMatch(VERDICT);
    expect(descText).not.toMatch(VERDICT);
    expect(descText).toContain("Review recommended");
  });

  it("bound-but-unclassified still yields an evidence-framed issue", () => {
    const p = renderWorkOrder(ctx({ classification: null, recommendation: null, metricDelta: 6.1 }));
    const issue = mapToJiraIssue(p, { projectKey: "DZ", issueTypeId: "10001" });
    expect(issue.fields.summary).toContain("Thermal finding");
    expect(issue.fields.summary).not.toMatch(VERDICT);
    expect(buildJiraDescriptionLines(p as never).join("\n")).toContain("review recommended");
  });
});
