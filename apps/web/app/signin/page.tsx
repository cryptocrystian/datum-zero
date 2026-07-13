import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { getSession } from "@/lib/session";
import { signInErrorRedirect } from "@/lib/auth-core";
import { devDeliveryAllowed } from "@/lib/email";

// Magic-link sign-in (no passwords). Concierge-provisioned users only (CR-14).
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; callbackUrl?: string }>;
}) {
  const sp = await searchParams;
  if (await getSession()) redirect("/queue");

  // Dev convenience: no SMTP in dev, so surface the just-issued magic link right on the page.
  // Prod NEVER reads this — gated by the single devDeliveryAllowed() predicate (M2-5a, CR-34), the
  // same one that gates the dev adapter's write. Localhost-only, single-use token.
  let devMagicLink: string | null = null;
  if (sp.sent && devDeliveryAllowed()) {
    try {
      const [{ readFile }, os, path] = await Promise.all([
        import("node:fs/promises"),
        import("node:os"),
        import("node:path"),
      ]);
      const raw = await readFile(path.join(os.tmpdir(), "dz-magic-link.json"), "utf8");
      const data = JSON.parse(raw) as { url: string; at: number };
      if (Date.now() - data.at < 10 * 60 * 1000) devMagicLink = data.url;
    } catch {
      // no recent link stashed — the server log still has it
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-widest text-datum-slate">
          Datum Zero Systems · Reality Ledger
        </div>
        <h1 className="mt-2 text-2xl font-bold uppercase tracking-wide text-white">Cockpit Sign-in</h1>
        <p className="mt-2 text-xs uppercase tracking-wider text-datum-slate">
          Magic-link only · access is concierge-provisioned
        </p>
      </div>

      {sp.sent ? (
        <div className="rounded-sm border border-tactical-gold/50 bg-datum-cardbg px-4 py-3">
          <p className="font-mono text-xs text-tactical-gold">Check your email for the sign-in link.</p>
          {devMagicLink ? (
            <a
              href={devMagicLink}
              className="mt-3 block break-all rounded-sm border border-tactical-gold bg-datum-midnight px-3 py-2 text-center font-mono text-[11px] uppercase tracking-wider text-white transition-colors duration-150 hover:bg-tactical-gold hover:text-datum-midnight"
            >
              [ Dev · Open Sign-in Link ]
            </a>
          ) : (
            <p className="mt-1 font-mono text-[10px] text-datum-slate">
              Dev: the link is also printed to the server log.
            </p>
          )}
        </div>
      ) : null}
      {sp.error ? (
        // Generic, non-revealing (M2-5a, CR-34): an un-provisioned email is redirected to ?sent=1, not
        // here, so this never confirms or denies account existence. Only genuine faults land here.
        <p className="rounded-sm border border-tactical-red px-4 py-3 font-mono text-xs leading-relaxed text-tactical-red">
          Sign-in couldn&apos;t be completed. Please try again, or contact Datum Zero if this persists.
        </p>
      ) : null}

      <form
        action={async (formData: FormData) => {
          "use server";
          const email = String(formData.get("email") ?? "").trim().toLowerCase();
          try {
            await signIn("nodemailer", { email, redirectTo: sp.callbackUrl ?? "/queue" });
          } catch (error) {
            // signIn throws a NEXT_REDIRECT on success (→ verify-request); let that propagate.
            // An AuthError means the sign-in was refused. NO enumeration (M2-5a, CR-34): AccessDenied
            // (un-provisioned/inactive email) is mapped to the SAME generic "check your email" as a
            // successful send; only genuine faults show a generic retry message.
            if (error instanceof AuthError) {
              redirect(signInErrorRedirect(error.type));
            }
            throw error;
          }
        }}
        className="flex flex-col gap-3"
      >
        <label className="block">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-datum-slate">
            Work email
          </span>
          <input
            type="email"
            name="email"
            required
            placeholder="you@operator.example"
            className="w-full rounded-sm border border-datum-slate bg-datum-darknavy px-3 py-2 font-mono text-sm text-white outline-none focus:border-tactical-gold"
          />
        </label>
        <button
          type="submit"
          className="rounded-sm border border-tactical-gold bg-datum-midnight px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-white transition-colors duration-150 hover:bg-tactical-gold hover:text-datum-midnight"
        >
          [ Send Magic Link ]
        </button>
      </form>
    </main>
  );
}
