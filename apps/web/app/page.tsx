import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-5 px-6 py-16">
      <div className="font-mono text-[11px] uppercase tracking-widest text-datum-slate">
        Datum Zero · Reality Ledger
      </div>
      <h1 className="text-2xl font-bold uppercase tracking-wide text-white">Back-Office Cockpit</h1>
      <p className="max-w-prose text-sm leading-relaxed text-datum-slate">
        Headless at the edge — work orders land in the client&apos;s system, not here. This cockpit is
        the internal QA gate, RuleSet config, asset registry, and admin surface.
      </p>
      <div>
        <Link
          href="/queue"
          className="inline-block rounded-sm border border-tactical-gold bg-datum-midnight px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-white transition-colors duration-150 hover:bg-tactical-gold hover:text-datum-midnight"
        >
          [ Enter Validation Queue ]
        </Link>
      </div>
    </main>
  );
}
