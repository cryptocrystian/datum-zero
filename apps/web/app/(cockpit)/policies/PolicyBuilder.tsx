"use client";

import { useState, useTransition } from "react";
import type { RuleSetDTO, RuleSetInput } from "@/lib/rules/ruleset-admin";
import { createPolicyAction, updatePolicyAction, deletePolicyAction } from "./actions";

type Props = {
  policies: RuleSetDTO[];
  canEdit: boolean;
  routeTargetOptions: string[];
  modalities: string[];
  operators: string[];
  triggerMetrics: string[];
};

type FormState = {
  id?: string;
  name: string;
  targetModality: string;
  triggerMetric: string;
  operator: string;
  thresholdValue: string;
  routeTargets: string[];
  standardRef: string;
  standardVersion: string;
  isTemplate: boolean;
};

const label = "font-mono text-[10px] uppercase tracking-widest text-datum-slate";
const field =
  "w-full rounded-sm border border-datum-slate/40 bg-datum-midnight px-2.5 py-1.5 font-mono text-[12px] text-white outline-none focus:border-tactical-gold";

function blankForm(p: Props): FormState {
  return {
    name: "",
    targetModality: "DRONE_THERMAL",
    triggerMetric: p.triggerMetrics[0] ?? "Temp_Delta_Threshold",
    operator: ">=",
    thresholdValue: "10",
    routeTargets: [],
    standardRef: "IEC TS 62446-3",
    standardVersion: "2017",
    isTemplate: false,
  };
}

function toFormState(r: RuleSetDTO): FormState {
  return {
    id: r.id,
    name: r.name,
    targetModality: r.targetModality,
    triggerMetric: r.triggerMetric,
    operator: r.operator,
    thresholdValue: String(r.thresholdValue),
    routeTargets: [...r.routeTargets],
    standardRef: r.standardRef ?? "",
    standardVersion: r.standardVersion ?? "",
    isTemplate: r.isTemplate,
  };
}

/** Mirror of tolerance-eval: ΔT band vs. the escalation floor. Combined with the model category (max wins). */
function priorityBands(t: number) {
  return [
    { band: "MONITOR", range: `ΔT < ${t}°C`, tone: "text-status-green" },
    { band: "SCHEDULED", range: `${t}°C ≤ ΔT < ${t * 2}°C`, tone: "text-tactical-gold" },
    { band: "PROMPT", range: `ΔT ≥ ${t * 2}°C`, tone: "text-tactical-red" },
  ];
}

export function PolicyBuilder(props: Props) {
  const { policies, canEdit, routeTargetOptions, modalities, operators, triggerMetrics } = props;
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const t = Math.max(0, Number(form?.thresholdValue) || 0);

  function toggleTarget(target: string) {
    if (!form) return;
    const has = form.routeTargets.includes(target);
    setForm({ ...form, routeTargets: has ? form.routeTargets.filter((x) => x !== target) : [...form.routeTargets, target] });
  }

  function submit() {
    if (!form) return;
    setError(null);
    const input: RuleSetInput = {
      name: form.name,
      targetModality: form.targetModality,
      triggerMetric: form.triggerMetric,
      operator: form.operator,
      thresholdValue: Number(form.thresholdValue),
      routeTargets: form.routeTargets,
      standardRef: form.standardRef || null,
      standardVersion: form.standardVersion || null,
      isTemplate: form.isTemplate,
    };
    startTransition(async () => {
      const res = form.id ? await updatePolicyAction(form.id, input) : await createPolicyAction(input);
      if (res.ok) setForm(null);
      else setError(res.error);
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await deletePolicyAction(id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-datum-slate">
          {canEdit
            ? "The highest-version policy per modality applies. New policies fork above the current version."
            : "Read-only — RuleSet policy changes require the ADMIN role."}
        </p>
        {canEdit && !form && (
          <button
            onClick={() => { setError(null); setForm(blankForm(props)); }}
            className="rounded-sm border border-tactical-gold px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-tactical-gold transition-colors hover:bg-tactical-gold hover:text-datum-midnight"
          >
            [ + New Policy ]
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-sm border border-tactical-red/60 bg-tactical-red/10 px-3 py-2 font-mono text-[12px] text-tactical-red">
          {error}
        </div>
      )}

      {/* ---- policy list ---- */}
      <div className="overflow-hidden rounded-sm border border-datum-slate/25">
        <div className="grid grid-cols-[1.6fr_1fr_1fr_1.4fr_0.6fr_auto] items-center gap-3 border-b border-datum-slate/25 bg-datum-darknavy px-4 py-2">
          {["Policy", "Modality", "Condition", "Route Targets", "Ver", ""].map((h, i) => (
            <span key={i} className={label}>{h}</span>
          ))}
        </div>
        {policies.length === 0 && (
          <div className="px-4 py-6 text-center font-mono text-[12px] text-datum-slate">No policies yet.</div>
        )}
        {policies.map((r) => (
          <div key={r.id} className="grid grid-cols-[1.6fr_1fr_1fr_1.4fr_0.6fr_auto] items-center gap-3 border-b border-datum-slate/15 px-4 py-3 last:border-b-0">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-white">{r.name}</div>
              <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-datum-slate">
                {r.isTemplate ? "template" : "override"}{r.standardRef ? ` · ${r.standardRef}` : ""}
              </div>
            </div>
            <span className="font-mono text-[11px] text-white/80">{r.targetModality}</span>
            <span className="font-mono text-[12px] text-white">
              {r.triggerMetric.includes("Delta") ? "ΔT" : r.triggerMetric} {r.operator}{" "}
              <span className="text-tactical-gold">{r.thresholdValue}°C</span>
            </span>
            <span className="font-mono text-[11px] text-white/80">{r.routeTargets.join(", ") || "—"}</span>
            <span className="font-mono text-[12px] text-white/70">v{r.version}</span>
            <div className="flex justify-end gap-2">
              {canEdit ? (
                <>
                  <button
                    onClick={() => { setError(null); setForm(toFormState(r)); }}
                    className="rounded-sm border border-datum-slate/50 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-white/80 transition-colors hover:border-tactical-gold hover:text-tactical-gold"
                  >
                    [ Edit ]
                  </button>
                  <button
                    onClick={() => remove(r.id)}
                    disabled={pending}
                    className="rounded-sm border border-datum-slate/50 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-datum-slate transition-colors hover:border-tactical-red hover:text-tactical-red disabled:opacity-40"
                  >
                    [ Delete ]
                  </button>
                </>
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-widest text-datum-slate/50">locked</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ---- create / edit form ---- */}
      {canEdit && form && (
        <div className="rounded-sm border border-tactical-gold/40 bg-datum-cardbg p-5">
          <div className="mb-4 flex items-center justify-between border-b border-datum-slate/25 pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              {form.id ? "Edit Policy" : "New Policy"}
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-widest text-datum-slate">
              Client policy · never the anomaly type
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <div className={label}>Name</div>
              <input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Solar thermal — hot string" />
            </div>

            <div>
              <div className={label}>Target Modality</div>
              <select className={field} value={form.targetModality} onChange={(e) => setForm({ ...form, targetModality: e.target.value })}>
                {modalities.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <div className={label}>Trigger Metric</div>
              <select className={field} value={form.triggerMetric} onChange={(e) => setForm({ ...form, triggerMetric: e.target.value })}>
                {triggerMetrics.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div>
              <div className={label}>Operator</div>
              <select className={field} value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })}>
                {operators.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <div className={label}>Escalation Threshold (°C ΔT)</div>
              <input className={field} type="number" min="0" step="0.1" value={form.thresholdValue} onChange={(e) => setForm({ ...form, thresholdValue: e.target.value })} />
            </div>

            <div className="col-span-2">
              <div className={label}>Route Targets (active integrations)</div>
              {routeTargetOptions.length === 0 ? (
                <p className="mt-1 font-mono text-[11px] text-tactical-red">No active integrations — add one before routing.</p>
              ) : (
                <div className="mt-1 flex flex-wrap gap-2">
                  {routeTargetOptions.map((tt) => {
                    const on = form.routeTargets.includes(tt);
                    return (
                      <button
                        key={tt}
                        type="button"
                        onClick={() => toggleTarget(tt)}
                        className={
                          "rounded-sm border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors " +
                          (on ? "border-tactical-gold bg-tactical-gold/10 text-tactical-gold" : "border-datum-slate/40 text-datum-slate hover:text-white")
                        }
                      >
                        {on ? "[✓] " : "[ ] "}{tt}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className={label}>Standard Ref</div>
              <input className={field} value={form.standardRef} onChange={(e) => setForm({ ...form, standardRef: e.target.value })} placeholder="IEC TS 62446-3" />
            </div>
            <div>
              <div className={label}>Standard Version</div>
              <input className={field} value={form.standardVersion} onChange={(e) => setForm({ ...form, standardVersion: e.target.value })} placeholder="2017" />
            </div>

            <label className="col-span-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-datum-slate">
              <input type="checkbox" checked={form.isTemplate} onChange={(e) => setForm({ ...form, isTemplate: e.target.checked })} />
              Shipped template (vs. client override)
            </label>
          </div>

          {/* ---- live preview: derived priority + evidence-framed recommendation ---- */}
          <div className="mt-4 rounded-sm border border-datum-slate/25 bg-datum-midnight p-3">
            <div className={label}>Derived priority (model IEC category combined with ΔT — max wins)</div>
            <div className="mt-2 flex flex-wrap gap-4">
              {priorityBands(t).map((b) => (
                <div key={b.band} className="font-mono text-[11px]">
                  <span className={"font-bold " + b.tone}>{b.band}</span>
                  <span className="ml-2 text-datum-slate">{b.range}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-datum-slate/20 pt-2">
              <div className={label}>Recommendation (generated · evidence-framed)</div>
              <p className="mt-1 font-mono text-[11px] leading-relaxed text-white/80">
                Measured +{(t || 0).toFixed(1)}°C delta vs. median (confidence 96.8%); model classified{" "}
                {form.standardRef || "the standard"} Cat 2 — Cell. Priority SCHEDULED. Review recommended vs.{" "}
                {[form.standardRef, form.standardVersion].filter(Boolean).join(" ") || "the applicable standard"}.
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={submit}
              disabled={pending}
              className="rounded-sm border border-tactical-gold bg-tactical-gold px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-datum-midnight transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "[ Saving… ]" : "[ Save Policy ]"}
            </button>
            <button
              onClick={() => { setForm(null); setError(null); }}
              disabled={pending}
              className="rounded-sm border border-datum-slate/50 px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-datum-slate transition-colors hover:text-white disabled:opacity-50"
            >
              [ Cancel ]
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
