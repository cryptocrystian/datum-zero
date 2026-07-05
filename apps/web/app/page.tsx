export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Datum Zero — Cockpit</h1>
      <p className="text-neutral-400">
        Back-office cockpit (QA queue, RuleSet builder, asset registry, integrations, admin).
        Headless at the edge — work orders land in the client&apos;s system, not here.
      </p>
      <p className="text-sm text-neutral-500">
        M0 walking skeleton. Health: <code className="text-neutral-300">/api/health</code>.
      </p>
    </main>
  );
}
