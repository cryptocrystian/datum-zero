# Datum Zero Systems

**Autonomous Reality Ledger Reconciliation** — a headless verification layer that turns physical-reality capture (drone thermal/RGB, 360° video, IoT) into verified, evidence-framed work orders routed into a client's existing systems.

> **Read [`MANIFEST.md`](./MANIFEST.md) before writing any code.** It is the single source of truth for architecture, conventions, and the non-negotiable product/compliance rules. Every development thread, code-generation sequence, and engineering hire inherits those decisions without relitigating them.

---

## Repository layout

```
datum-zero/
├── MANIFEST.md                       # ← THE core system manifest (start here)
├── README.md
├── docs/
│   ├── M0-WALKING-SKELETON-SPRINT.md # active sprint backlog
│   └── PRD-Corrections-Log.md        # CR-01..CR-15 — the "why" behind every decision
├── apps/
│   └── web/                          # Next.js 15 (App Router) — cockpit + Infield Validator PWA
├── services/
│   └── inference/                    # FastAPI (Python) — CV + spatial engine
├── packages/
│   ├── db/prisma/schema.prisma       # multi-tenant data model (all CRs applied)
│   ├── adapters/                     # Generic Delivery Adapter Suite (webhook / PDF / CSV)
│   │   └── contracts/work-order.schema.json
│   └── rulesets/                     # standards-anchored default RuleSet templates (IEC 62446-3)
└── scripts/
    └── seed/                         # concierge onboarding — manual tenant provisioning
```

## Current phase

**M0 — Walking Skeleton.** Thin end-to-end loop on sample solar-thermal data. See `docs/M0-WALKING-SKELETON-SPRINT.md`.

## Build context

Solo founder + AI-assisted. Optimize for leverage, buy-over-build, and ruthless scope control. M1 is **concierge-onboarded** (multi-tenant-native DB, but no self-serve registration / public billing / self-onboarding in initial scope).

## Email deliverability — auth magic links (M2-5a, CR-34)

Sign-in is passwordless magic-link (Auth.js v5, CR-20). Delivery goes through the **`EmailPort` seam**
(`apps/web/lib/email/`): a **dev** adapter (console + temp file, local only) and a production **AWS SES**
adapter (default). The provider is chosen by `EMAIL_PROVIDER` (defaults to `ses` in production, `dev`
otherwise). Credentials come **only from the secrets vault** (env-backed) — never the repo/DB/logs.

**Production env (populated from AWS Secrets Manager at deploy, never committed):**

| Var | Purpose |
| --- | --- |
| `EMAIL_PROVIDER` | `ses` (default in prod) · `dev` is **refused** in production |
| `EMAIL_FROM` | verified sender, e.g. `no-reply@yourdomain.com` |
| `EMAIL_REPLY_TO` | optional; defaults to `EMAIL_FROM` |
| `SES_SMTP_HOST` | `email-smtp.<region>.amazonaws.com` |
| `SES_SMTP_PORT` | `587` (STARTTLS) or `465` (TLS); defaults to `587` |
| `SES_SMTP_USER` / `SES_SMTP_PASSWORD` | SES SMTP credentials derived from an IAM user |

**Deliverability prerequisites (manual, ops — required regardless of provider):**

1. **Domain authentication on the sending domain** — publish DNS records so mail isn't spoofable and
   lands in the inbox:
   - **SPF**: a TXT record authorizing the provider (for SES: `v=spf1 include:amazonses.com ~all`).
   - **DKIM**: the provider's signing CNAMEs (SES gives three `*_domainkey` CNAMEs — "Easy DKIM").
   - **DMARC**: a `_dmarc` TXT policy (start `p=none` to monitor, then tighten to `quarantine`/`reject`).
2. **SES production-access request** — a new SES account is **sandboxed** (only verified recipients,
   low quota). Open a production-access request in the SES console to exit the sandbox before real
   clients sign in.
3. Postmark/Resend are drop-in fallbacks behind the same `EmailPort` if SES deliverability or sandbox
   friction bites — a config change, not a refactor.

> These steps are **not automated**. Flag the architect thread once the sending domain is authenticated
> and SES production access is granted.
