"use client";

import { useState, useTransition } from "react";
import type { UserDTO } from "@/lib/users/admin";
import { createUserAction, updateUserAction, deleteUserAction } from "./actions";

type Props = { users: UserDTO[]; selfId: string; roles: string[] };
type NewState = { email: string; name: string; role: string };
type EditState = { id: string; email: string; name: string; role: string; isActive: boolean };

const label = "font-mono text-[10px] uppercase tracking-widest text-datum-slate";
const field = "w-full rounded-sm border border-datum-slate/40 bg-datum-midnight px-2.5 py-1.5 font-mono text-[12px] text-white outline-none focus:border-tactical-gold";
const landingFor = (role: string) => (role === "PILOT" ? "field validator" : "cockpit");

export function UserManagement({ users, selfId, roles }: Props) {
  const [creating, setCreating] = useState<NewState | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) onOk?.();
      else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-datum-slate">
          ADMIN &amp; REVIEWER land in the cockpit; PILOT lands in the field validator. Deactivating a user blocks their next sign-in.
        </p>
        {!creating && (
          <button
            onClick={() => { setError(null); setEditing(null); setCreating({ email: "", name: "", role: "REVIEWER" }); }}
            className="rounded-sm border border-tactical-gold px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-tactical-gold transition-colors hover:bg-tactical-gold hover:text-datum-midnight"
          >
            [ + Provision User ]
          </button>
        )}
      </div>

      {error && <div className="rounded-sm border border-tactical-red/60 bg-tactical-red/10 px-3 py-2 font-mono text-[12px] text-tactical-red">{error}</div>}

      {/* ---- user list ---- */}
      <div className="overflow-hidden rounded-sm border border-datum-slate/25">
        <div className="grid grid-cols-[2fr_1.2fr_0.9fr_0.8fr_auto] items-center gap-3 border-b border-datum-slate/25 bg-datum-darknavy px-4 py-2">
          {["Email", "Name", "Role", "Status", ""].map((h, i) => <span key={i} className={label}>{h}</span>)}
        </div>
        {users.map((u) => {
          const isSelf = u.id === selfId;
          return (
            <div key={u.id} className="grid grid-cols-[2fr_1.2fr_0.9fr_0.8fr_auto] items-center gap-3 border-b border-datum-slate/15 px-4 py-2.5 last:border-b-0">
              <span className="truncate font-mono text-[12px] text-white">
                {u.email}{isSelf && <span className="ml-2 rounded-sm border border-tactical-gold/50 px-1 font-mono text-[9px] uppercase tracking-wider text-tactical-gold">you</span>}
              </span>
              <span className="truncate text-[12px] text-white/80">{u.name ?? "—"}</span>
              <span className="font-mono text-[11px] text-white/80" title={`lands in the ${landingFor(u.role)}`}>{u.role}</span>
              <span className={"font-mono text-[11px] " + (u.isActive ? "text-status-green" : "text-datum-slate/60")}>{u.isActive ? "● active" : "○ inactive"}</span>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setError(null); setCreating(null); setEditing({ id: u.id, email: u.email, name: u.name ?? "", role: u.role, isActive: u.isActive }); }}
                  className="rounded-sm border border-datum-slate/50 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-white/80 transition-colors hover:border-tactical-gold hover:text-tactical-gold"
                >[ Edit ]</button>
                <button
                  onClick={() => run(() => updateUserAction(u.id, { name: u.name, role: u.role, isActive: !u.isActive }))}
                  disabled={pending || (isSelf && u.isActive)}
                  title={isSelf && u.isActive ? "you cannot deactivate yourself" : ""}
                  className="rounded-sm border border-datum-slate/50 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-datum-slate transition-colors hover:border-tactical-gold hover:text-tactical-gold disabled:opacity-30"
                >{u.isActive ? "[ Deactivate ]" : "[ Reactivate ]"}</button>
                <button
                  onClick={() => run(() => deleteUserAction(u.id))}
                  disabled={pending || isSelf}
                  title={isSelf ? "you cannot delete yourself" : ""}
                  className="rounded-sm border border-datum-slate/50 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-datum-slate transition-colors hover:border-tactical-red hover:text-tactical-red disabled:opacity-30"
                >[ Delete ]</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ---- provision (create) ---- */}
      {creating && (
        <div className="rounded-sm border border-tactical-gold/40 bg-datum-cardbg p-5">
          <div className="mb-4 flex items-center justify-between border-b border-datum-slate/25 pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">Provision User</h2>
            <span className="font-mono text-[10px] uppercase tracking-widest text-datum-slate">concierge · email + role</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <div className={label}>Work Email</div>
              <input className={field} value={creating.email} onChange={(e) => setCreating({ ...creating, email: e.target.value })} placeholder="new.reviewer@client.example" />
            </div>
            <div>
              <div className={label}>Role</div>
              <select className={field} value={creating.role} onChange={(e) => setCreating({ ...creating, role: e.target.value })}>
                {roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <div className={label}>Name (optional)</div>
              <input className={field} value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} />
            </div>
          </div>
          <p className="mt-3 font-mono text-[10px] text-datum-slate">Lands in the {landingFor(creating.role)} after sign-in. They receive access by magic link — no password.</p>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={() => run(() => createUserAction({ email: creating.email, name: creating.name || null, role: creating.role }), () => setCreating(null))} disabled={pending} className="rounded-sm border border-tactical-gold bg-tactical-gold px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-datum-midnight transition-opacity hover:opacity-90 disabled:opacity-50">{pending ? "[ Provisioning… ]" : "[ Provision ]"}</button>
            <button onClick={() => { setCreating(null); setError(null); }} disabled={pending} className="rounded-sm border border-datum-slate/50 px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-datum-slate transition-colors hover:text-white disabled:opacity-50">[ Cancel ]</button>
          </div>
        </div>
      )}

      {/* ---- edit ---- */}
      {editing && (
        <div className="rounded-sm border border-tactical-gold/40 bg-datum-cardbg p-5">
          <div className="mb-4 flex items-center justify-between border-b border-datum-slate/25 pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">Edit User</h2>
            <span className="font-mono text-[11px] text-datum-slate">{editing.email}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className={label}>Role</div>
              <select className={field} value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })} disabled={editing.id === selfId}>
                {roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              {editing.id === selfId && <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-datum-slate">you cannot change your own role</p>}
            </div>
            <div>
              <div className={label}>Name</div>
              <input className={field} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <label className="col-span-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-datum-slate">
              <input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} disabled={editing.id === selfId} />
              Active (can sign in){editing.id === selfId && " — you cannot deactivate yourself"}
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={() => run(() => updateUserAction(editing.id, { name: editing.name || null, role: editing.role, isActive: editing.isActive }), () => setEditing(null))} disabled={pending} className="rounded-sm border border-tactical-gold bg-tactical-gold px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-datum-midnight transition-opacity hover:opacity-90 disabled:opacity-50">{pending ? "[ Saving… ]" : "[ Save User ]"}</button>
            <button onClick={() => { setEditing(null); setError(null); }} disabled={pending} className="rounded-sm border border-datum-slate/50 px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-datum-slate transition-colors hover:text-white disabled:opacity-50">[ Cancel ]</button>
          </div>
        </div>
      )}
    </div>
  );
}
