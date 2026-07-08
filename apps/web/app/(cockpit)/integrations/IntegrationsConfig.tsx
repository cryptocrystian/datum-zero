"use client";

import { useState, useTransition } from "react";
import type { IntegrationDTO, IntegrationInput } from "@/lib/integrations/admin";
import { createIntegrationAction, updateIntegrationAction, deleteIntegrationAction } from "./actions";

type ConfigFields = Record<string, { key: string; label: string; placeholder: string }[]>;

type Props = {
  integrations: IntegrationDTO[];
  canEdit: boolean;
  targetTypes: string[];
  configFields: ConfigFields;
};

type FormState = {
  id?: string;
  targetType: string;
  displayName: string;
  config: Record<string, string>;
  secretVaultKey: string;
  isActive: boolean;
};

const label = "font-mono text-[10px] uppercase tracking-widest text-datum-slate";
const field =
  "w-full rounded-sm border border-datum-slate/40 bg-datum-midnight px-2.5 py-1.5 font-mono text-[12px] text-white outline-none focus:border-tactical-gold";

function blankForm(p: Props): FormState {
  return { targetType: p.targetTypes[0] ?? "GENERIC_WEBHOOK", displayName: "", config: {}, secretVaultKey: "", isActive: true };
}

function toFormState(r: IntegrationDTO): FormState {
  return { id: r.id, targetType: r.targetType, displayName: r.displayName, config: { ...r.config }, secretVaultKey: r.secretVaultKey ?? "", isActive: r.isActive };
}

const configSummary = (c: Record<string, string>) => Object.entries(c).map(([k, v]) => `${k}=${v}`).join(" · ") || "—";

export function IntegrationsConfig(props: Props) {
  const { integrations, canEdit, targetTypes, configFields } = props;
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fields = form ? configFields[form.targetType] ?? [] : [];

  function submit() {
    if (!form) return;
    setError(null);
    // Only ship the config keys valid for the selected target type (no stray/secret keys).
    const allowed = new Set((configFields[form.targetType] ?? []).map((f) => f.key));
    const config: Record<string, string> = {};
    for (const [k, v] of Object.entries(form.config)) if (allowed.has(k) && v.trim()) config[k] = v.trim();
    const input: IntegrationInput = {
      targetType: form.targetType,
      displayName: form.displayName,
      config,
      secretVaultKey: form.secretVaultKey.trim() || null,
      isActive: form.isActive,
    };
    startTransition(async () => {
      const res = form.id ? await updateIntegrationAction(form.id, input) : await createIntegrationAction(input);
      if (res.ok) setForm(null);
      else setError(res.error);
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await deleteIntegrationAction(id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-datum-slate">
          {canEdit ? "Add the delivery targets your policies route to." : "Read-only — integration changes require the ADMIN role."}
        </p>
        {canEdit && !form && (
          <button
            onClick={() => { setError(null); setForm(blankForm(props)); }}
            className="rounded-sm border border-tactical-gold px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-tactical-gold transition-colors hover:bg-tactical-gold hover:text-datum-midnight"
          >
            [ + New Integration ]
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-sm border border-tactical-red/60 bg-tactical-red/10 px-3 py-2 font-mono text-[12px] text-tactical-red">{error}</div>
      )}

      {/* ---- integration list ---- */}
      <div className="overflow-hidden rounded-sm border border-datum-slate/25">
        <div className="grid grid-cols-[1.4fr_1fr_1.6fr_1fr_0.6fr_auto] items-center gap-3 border-b border-datum-slate/25 bg-datum-darknavy px-4 py-2">
          {["Target", "Type", "Config", "Secret Ref", "Active", ""].map((h, i) => <span key={i} className={label}>{h}</span>)}
        </div>
        {integrations.length === 0 && <div className="px-4 py-6 text-center font-mono text-[12px] text-datum-slate">No integrations yet.</div>}
        {integrations.map((r) => (
          <div key={r.id} className="grid grid-cols-[1.4fr_1fr_1.6fr_1fr_0.6fr_auto] items-center gap-3 border-b border-datum-slate/15 px-4 py-3 last:border-b-0">
            <div className="truncate text-[13px] font-semibold text-white">{r.displayName}</div>
            <span className="font-mono text-[11px] text-white/80">{r.targetType}</span>
            <span className="truncate font-mono text-[11px] text-white/70">{configSummary(r.config)}</span>
            <span className="truncate font-mono text-[11px] text-datum-slate">{r.secretVaultKey ?? "—"}</span>
            <span className={"font-mono text-[11px] " + (r.isActive ? "text-status-green" : "text-datum-slate/60")}>{r.isActive ? "● active" : "○ off"}</span>
            <div className="flex justify-end gap-2">
              {canEdit ? (
                <>
                  <button onClick={() => { setError(null); setForm(toFormState(r)); }} className="rounded-sm border border-datum-slate/50 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-white/80 transition-colors hover:border-tactical-gold hover:text-tactical-gold">[ Edit ]</button>
                  <button onClick={() => remove(r.id)} disabled={pending} className="rounded-sm border border-datum-slate/50 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-datum-slate transition-colors hover:border-tactical-red hover:text-tactical-red disabled:opacity-40">[ Delete ]</button>
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
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">{form.id ? "Edit Integration" : "New Integration"}</h2>
            <span className="font-mono text-[10px] uppercase tracking-widest text-datum-slate">Non-secret config only</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className={label}>Target Type</div>
              <select className={field} value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value, config: {} })}>
                {targetTypes.map((tt) => <option key={tt} value={tt}>{tt}</option>)}
              </select>
            </div>
            <div>
              <div className={label}>Display Name</div>
              <input className={field} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Generic Webhook (client IT)" />
            </div>

            {fields.map((f) => (
              <div key={f.key} className="col-span-2">
                <div className={label}>{f.label}</div>
                <input className={field} value={form.config[f.key] ?? ""} onChange={(e) => setForm({ ...form, config: { ...form.config, [f.key]: e.target.value } })} placeholder={f.placeholder} />
              </div>
            ))}
            {fields.length === 0 && (
              <p className="col-span-2 font-mono text-[11px] text-datum-slate">No non-secret settings for this target type.</p>
            )}

            <label className="col-span-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-datum-slate">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Active (eligible for routing)
            </label>
          </div>

          {/* ---- secret discipline: REFERENCE only, never a credential ---- */}
          <div className="mt-4 rounded-sm border border-datum-slate/25 bg-datum-midnight p-3">
            <div className={label}>Secret Vault Key (reference)</div>
            <input className={field + " mt-1"} value={form.secretVaultKey} onChange={(e) => setForm({ ...form, secretVaultKey: e.target.value })} placeholder="datumzero/jira/api-token" />
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-datum-slate">
              Reference only — a KEY that points at the credential in AWS Secrets Manager (dev: an env var).
              Never paste a token, password, or API key here; the raw secret is provisioned out-of-band and is
              never accepted, stored, or shown by this surface (CR-03, MANIFEST §3).
            </p>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button onClick={submit} disabled={pending} className="rounded-sm border border-tactical-gold bg-tactical-gold px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-datum-midnight transition-opacity hover:opacity-90 disabled:opacity-50">
              {pending ? "[ Saving… ]" : "[ Save Integration ]"}
            </button>
            <button onClick={() => { setForm(null); setError(null); }} disabled={pending} className="rounded-sm border border-datum-slate/50 px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-datum-slate transition-colors hover:text-white disabled:opacity-50">
              [ Cancel ]
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
