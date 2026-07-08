"use client";

import { useState, useTransition, type FormEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import type { AssetDTO, AssetInput, ImportResult } from "@/lib/registry/asset-admin";
import { createAssetAction, updateAssetAction, deleteAssetAction, importAssetsAction } from "./actions";

type Props = { assets: AssetDTO[]; total: number; shown: number; take: number; canEdit: boolean; query: string };

type FormState = { id?: string; internalLabel: string; latitude: string; longitude: string; cadObjectId: string; erpAssetId: string; procoreLocationId: string };

const label = "font-mono text-[10px] uppercase tracking-widest text-datum-slate";
const field = "w-full rounded-sm border border-datum-slate/40 bg-datum-midnight px-2.5 py-1.5 font-mono text-[12px] text-white outline-none focus:border-tactical-gold";
const fmt = (n: number | null) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(6)}`);

const blank: FormState = { internalLabel: "", latitude: "", longitude: "", cadObjectId: "", erpAssetId: "", procoreLocationId: "" };
const toForm = (a: AssetDTO): FormState => ({
  id: a.id, internalLabel: a.internalLabel,
  latitude: a.latitude == null ? "" : a.latitude.toFixed(6), longitude: a.longitude == null ? "" : a.longitude.toFixed(6),
  cadObjectId: a.cadObjectId ?? "", erpAssetId: a.erpAssetId ?? "", procoreLocationId: a.procoreLocationId == null ? "" : String(a.procoreLocationId),
});
const toInput = (f: FormState): AssetInput => ({
  internalLabel: f.internalLabel, latitude: f.latitude || null, longitude: f.longitude || null,
  cadObjectId: f.cadObjectId || null, erpAssetId: f.erpAssetId || null, procoreLocationId: f.procoreLocationId || null,
});

export function AssetRegistry({ assets, total, shown, take, canEdit, query }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(query);
  const [form, setForm] = useState<FormState | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function runSearch(e: FormEvent) {
    e.preventDefault();
    router.replace(search.trim() ? `/registry?q=${encodeURIComponent(search.trim())}` : "/registry");
  }

  function submit() {
    if (!form) return;
    setError(null);
    startTransition(async () => {
      const res = form.id ? await updateAssetAction(form.id, toInput(form)) : await createAssetAction(toInput(form));
      if (res.ok) setForm(null); else setError(res.error);
    });
  }
  function remove(id: string) {
    setError(null);
    startTransition(async () => { const res = await deleteAssetAction(id); if (!res.ok) setError(res.error); });
  }
  function runImport() {
    if (csv == null) return;
    setError(null); setImportResult(null);
    startTransition(async () => {
      const res = await importAssetsAction(csv);
      if (res.ok) { setImportResult(res.result); if (res.result.errors.length === 0) setCsv(null); }
      else setError(res.error);
    });
  }
  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((t) => setCsv(t));
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ---- toolbar: search + actions ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={runSearch} className="flex items-center gap-2">
          <input className={field + " w-72"} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search label (e.g. APEX_SOLAR-GRID_04)" />
          <button type="submit" className="rounded-sm border border-datum-slate/50 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-white/80 transition-colors hover:border-tactical-gold hover:text-tactical-gold">[ Search ]</button>
          {query && <button type="button" onClick={() => { setSearch(""); router.replace("/registry"); }} className="font-mono text-[10px] uppercase tracking-wider text-datum-slate hover:text-white">clear</button>}
        </form>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button onClick={() => { setError(null); setImportResult(null); setCsv(csv == null ? "" : null); setForm(null); }} className="rounded-sm border border-datum-slate/50 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-white/80 transition-colors hover:border-tactical-gold hover:text-tactical-gold">[ Import CSV ]</button>
            <button onClick={() => { setError(null); setForm(blank); setCsv(null); }} className="rounded-sm border border-tactical-gold px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-tactical-gold transition-colors hover:bg-tactical-gold hover:text-datum-midnight">[ + New Asset ]</button>
          </div>
        )}
      </div>

      {error && <div className="rounded-sm border border-tactical-red/60 bg-tactical-red/10 px-3 py-2 font-mono text-[12px] text-tactical-red">{error}</div>}

      {shown < total && (
        <p className="font-mono text-[11px] text-datum-slate">Showing {shown} of {total.toLocaleString()} — refine the search to narrow (page cap {take}).</p>
      )}

      {/* ---- asset list ---- */}
      <div className="overflow-hidden rounded-sm border border-datum-slate/25">
        <div className="grid grid-cols-[2fr_1.1fr_1.1fr_1.4fr_auto] items-center gap-3 border-b border-datum-slate/25 bg-datum-darknavy px-4 py-2">
          {["Internal Label", "Latitude", "Longitude", "External IDs", ""].map((h, i) => <span key={i} className={label}>{h}</span>)}
        </div>
        {assets.length === 0 && <div className="px-4 py-6 text-center font-mono text-[12px] text-datum-slate">{query ? "No assets match." : "No assets yet."}</div>}
        {assets.map((a) => (
          <div key={a.id} className="grid grid-cols-[2fr_1.1fr_1.1fr_1.4fr_auto] items-center gap-3 border-b border-datum-slate/15 px-4 py-2.5 last:border-b-0">
            <span className="truncate font-mono text-[12px] text-white">{a.internalLabel}</span>
            <span className="font-mono text-[12px] text-white/80">{fmt(a.latitude)}</span>
            <span className="font-mono text-[12px] text-white/80">{fmt(a.longitude)}</span>
            <span className="truncate font-mono text-[10px] text-datum-slate">
              {[a.cadObjectId && `cad:${a.cadObjectId}`, a.erpAssetId && `erp:${a.erpAssetId}`, a.procoreLocationId != null && `procore:${a.procoreLocationId}`].filter(Boolean).join(" · ") || "—"}
            </span>
            <div className="flex justify-end gap-2">
              {canEdit ? (
                <>
                  <button onClick={() => { setError(null); setForm(toForm(a)); setCsv(null); }} className="rounded-sm border border-datum-slate/50 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-white/80 transition-colors hover:border-tactical-gold hover:text-tactical-gold">[ Edit ]</button>
                  <button onClick={() => remove(a.id)} disabled={pending} className="rounded-sm border border-datum-slate/50 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-datum-slate transition-colors hover:border-tactical-red hover:text-tactical-red disabled:opacity-40">[ Delete ]</button>
                </>
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-widest text-datum-slate/50">locked</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ---- CSV import panel ---- */}
      {canEdit && csv != null && (
        <div className="rounded-sm border border-tactical-gold/40 bg-datum-cardbg p-5">
          <div className="mb-3 flex items-center justify-between border-b border-datum-slate/25 pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">Bulk Import (CSV)</h2>
            <span className="font-mono text-[10px] uppercase tracking-widest text-datum-slate">columns: internalLabel, latitude, longitude, [cadObjectId, erpAssetId, procoreLocationId]</span>
          </div>
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="mb-2 block font-mono text-[11px] text-datum-slate file:mr-3 file:rounded-sm file:border file:border-datum-slate/50 file:bg-datum-midnight file:px-2 file:py-1 file:font-mono file:text-[10px] file:uppercase file:tracking-wider file:text-white/80" />
          <textarea className={field + " h-40 resize-y"} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"internalLabel,latitude,longitude\nAPEX_SOLAR-GRID_05-ROW_01-STR_01,32.230000,-110.980000"} />
          {importResult && (
            <div className="mt-3 rounded-sm border border-datum-slate/25 bg-datum-midnight p-3">
              <div className={label}>
                Imported <span className="text-status-green">{importResult.imported}</span>
                {importResult.errors.length > 0 && <> · <span className="text-tactical-red">{importResult.errors.length} row error(s) — nothing imported</span></>}
              </div>
              {importResult.errors.length > 0 && (
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                  {importResult.errors.map((er, i) => (
                    <li key={i} className="font-mono text-[11px] text-tactical-red">row {er.row}: {er.error}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="mt-4 flex items-center gap-3">
            <button onClick={runImport} disabled={pending || !csv?.trim()} className="rounded-sm border border-tactical-gold bg-tactical-gold px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-datum-midnight transition-opacity hover:opacity-90 disabled:opacity-50">{pending ? "[ Importing… ]" : "[ Import ]"}</button>
            <button onClick={() => { setCsv(null); setImportResult(null); setError(null); }} disabled={pending} className="rounded-sm border border-datum-slate/50 px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-datum-slate transition-colors hover:text-white disabled:opacity-50">[ Close ]</button>
          </div>
        </div>
      )}

      {/* ---- create / edit form ---- */}
      {canEdit && form && (
        <div className="rounded-sm border border-tactical-gold/40 bg-datum-cardbg p-5">
          <div className="mb-4 flex items-center justify-between border-b border-datum-slate/25 pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">{form.id ? "Edit Asset" : "New Asset"}</h2>
            <span className="font-mono text-[10px] uppercase tracking-widest text-datum-slate">CR-17 canonical label · 6-dp coords</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <div className={label}>Internal Label (SITE-ARRAY-ROW-STRING[-NODE])</div>
              <input className={field} value={form.internalLabel} onChange={(e) => setForm({ ...form, internalLabel: e.target.value })} placeholder="APEX_SOLAR-GRID_04-ROW_12-STR_08" />
            </div>
            <div>
              <div className={label}>Latitude (±DD.DDDDDD)</div>
              <input className={field} value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="32.222780" />
            </div>
            <div>
              <div className={label}>Longitude (±DDD.DDDDDD)</div>
              <input className={field} value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="-110.974370" />
            </div>
            <div>
              <div className={label}>CAD Object ID (optional)</div>
              <input className={field} value={form.cadObjectId} onChange={(e) => setForm({ ...form, cadObjectId: e.target.value })} />
            </div>
            <div>
              <div className={label}>ERP Asset ID (optional)</div>
              <input className={field} value={form.erpAssetId} onChange={(e) => setForm({ ...form, erpAssetId: e.target.value })} />
            </div>
            <div>
              <div className={label}>Procore Location ID (optional)</div>
              <input className={field} value={form.procoreLocationId} onChange={(e) => setForm({ ...form, procoreLocationId: e.target.value })} placeholder="1024" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={submit} disabled={pending} className="rounded-sm border border-tactical-gold bg-tactical-gold px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-datum-midnight transition-opacity hover:opacity-90 disabled:opacity-50">{pending ? "[ Saving… ]" : "[ Save Asset ]"}</button>
            <button onClick={() => { setForm(null); setError(null); }} disabled={pending} className="rounded-sm border border-datum-slate/50 px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-datum-slate transition-colors hover:text-white disabled:opacity-50">[ Cancel ]</button>
          </div>
        </div>
      )}
    </div>
  );
}
