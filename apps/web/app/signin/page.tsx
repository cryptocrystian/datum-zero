import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { getSession } from "@/lib/session";

// Magic-link sign-in (no passwords). Concierge-provisioned users only (CR-14).
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; callbackUrl?: string }>;
}) {
  const sp = await searchParams;
  if (await getSession()) redirect("/queue");

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
        <p className="rounded-sm border border-tactical-gold/50 bg-datum-cardbg px-4 py-3 font-mono text-xs text-tactical-gold">
          Check your email for the sign-in link. (Dev: the link is printed to the server log.)
        </p>
      ) : null}
      {sp.error === "denied" ? (
        <p className="rounded-sm border border-tactical-red px-4 py-3 font-mono text-xs leading-relaxed text-tactical-red">
          That address isn&apos;t provisioned for cockpit access. Accounts are set up by Datum Zero —
          contact your administrator to be added.
        </p>
      ) : sp.error ? (
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
            // An AuthError means the sign-in was refused (AccessDenied = un-provisioned email,
            // CR-14). Fail closed to a friendly message instead of the raw Auth.js error page.
            if (error instanceof AuthError) {
              redirect(`/signin?error=${error.type === "AccessDenied" ? "denied" : "auth"}`);
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
