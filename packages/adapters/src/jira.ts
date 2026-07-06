import type { DeliveryAdapter, DeliveryResult } from "./types";
import { resolveJiraCredentials } from "./secrets";

/**
 * NATIVE_JIRA adapter (CR-05) — maps the IDENTICAL canonical work order to a Jira Cloud issue.
 * Same routing interface as the generic webhook; the payload is the same, only the mapping differs.
 * Evidence-framed summary/description ONLY — never a verdict (CR-12).
 */

const DEFAULT_PROJECT_KEY = "DZ";

interface WorkOrder {
  work_order_id: string;
  idempotency_key: string;
  organization_id: string;
  asset: { internal_label: string; latitude: number | null; longitude: number | null };
  finding: {
    modality: string;
    standard_ref: string | null;
    classification: string | null;
    metric_delta: number | null;
    metric_unit: string | null;
    confidence_score: number;
    visual_crop_url: string | null;
    analytics_crop_url: string | null;
  };
  recommendation: { text: string; recommended_action: string; priority_hint: string | null };
  audit: {
    captured_at: string;
    model_version: string;
    reviewed_by: string;
    reviewed_at: string;
    ndaa_verified?: boolean;
  };
}

const coord = (n: number | null): string => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(6)}`);
const delta = (f: WorkOrder["finding"]): string =>
  f.metric_delta == null ? "" : `${f.metric_delta >= 0 ? "+" : ""}${f.metric_delta}°C Δ`;

/** Evidence-framed one-line summary (≤255 chars, no verdict language). */
export function buildJiraSummary(p: WorkOrder): string {
  const classification = p.finding.classification ?? "Thermal finding";
  const d = delta(p.finding);
  return `[Datum Zero] ${classification} — ${p.asset.internal_label}${d ? ` (${d})` : ""} · review recommended`.slice(0, 255);
}

/** Evidence-framed description lines (measurement + recommendation + audit). */
export function buildJiraDescriptionLines(p: WorkOrder): string[] {
  const f = p.finding;
  return [
    p.recommendation.text,
    `Asset: ${p.asset.internal_label}  (LAT ${coord(p.asset.latitude)} · LON ${coord(p.asset.longitude)})`,
    `Finding: ${f.modality} · ${f.classification ?? "unclassified"}${f.standard_ref ? ` · ${f.standard_ref}` : ""}`,
    `Measurement: ${delta(f) || "n/a"} · confidence ${f.confidence_score.toFixed(1)}%`,
    `Evidence: ${f.visual_crop_url ?? "—"} · ${f.analytics_crop_url ?? "—"}`,
    `Audit: model ${p.audit.model_version} · reviewed_by ${p.audit.reviewed_by} @ ${p.audit.reviewed_at} · captured ${p.audit.captured_at} · ndaa_verified ${String(p.audit.ndaa_verified ?? false)}`,
    `Recommended action: ${p.recommendation.recommended_action}${p.recommendation.priority_hint ? ` (priority ${p.recommendation.priority_hint})` : ""}`,
    `Datum Zero work order: ${p.work_order_id}`,
  ];
}

/** Atlassian Document Format doc (Jira Cloud v3 descriptions must be ADF). */
function adf(lines: string[]) {
  return {
    type: "doc",
    version: 1,
    content: lines
      .filter((l) => l.length > 0)
      .map((l) => ({ type: "paragraph", content: [{ type: "text", text: l }] })),
  };
}

/** Map the canonical work order → a Jira Cloud create-issue body (project DZ). */
export function mapToJiraIssue(payload: unknown, projectKey: string = DEFAULT_PROJECT_KEY) {
  const p = payload as WorkOrder;
  return {
    fields: {
      project: { key: projectKey },
      issuetype: { name: "Task" },
      summary: buildJiraSummary(p),
      description: adf(buildJiraDescriptionLines(p)),
      labels: ["datum-zero", `dz-${p.work_order_id}`], // stable, traceable (no spaces/colons)
    },
  };
}

export const nativeJiraAdapter: DeliveryAdapter = {
  targetType: "NATIVE_JIRA",

  async deliver(payload, target, opts): Promise<DeliveryResult> {
    // Credentials come from the vault (env in dev), never the DB. Absent creds → token-gated.
    const creds = resolveJiraCredentials(target.secretVaultKey);
    if (!creds) return { ok: false, status: 0, downstreamRef: null, retryable: false };

    const projectKey = (target.config as { projectKey?: string } | null)?.projectKey ?? DEFAULT_PROJECT_KEY;
    const issue = mapToJiraIssue(payload, projectKey);
    const auth = "Basic " + Buffer.from(`${creds.email}:${creds.apiToken}`).toString("base64");
    const url = `${creds.baseUrl.replace(/\/$/, "")}/rest/api/3/issue`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 10_000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", authorization: auth },
        body: JSON.stringify(issue),
        signal: controller.signal,
      });

      let downstreamRef: string | null = null;
      try {
        const body = (await res.clone().json()) as { key?: string; id?: string };
        downstreamRef = body?.key ?? body?.id ?? null;
      } catch {
        // Non-JSON body is fine.
      }

      const ok = res.status >= 200 && res.status < 300;
      const retryable = res.status >= 500 || res.status === 429;
      return { ok, status: res.status, downstreamRef, retryable };
    } catch {
      return { ok: false, status: 0, downstreamRef: null, retryable: true };
    } finally {
      clearTimeout(timer);
    }
  },
};
