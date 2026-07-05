# Dev Pipeline & Drift-Avoidance Strategy

How a solo + AI-assisted team keeps a rule-dense system coherent across many threads. Context loss
and drift are the default outcome unless engineered against. Three layers + a retrieval aid.

## Layer 1 — Durable context (the anchor)
- **`CLAUDE.md`** (repo root) is auto-loaded into every thread. It carries the hard STOP rules and
  points to `MANIFEST.md` (the constitution) and `docs/PRD-Corrections-Log.md` (the why).
- The **`datum-zero-architect` skill** (see `skills/datum-zero-architect/SKILL.md`) supplies the
  deeper, task-specific playbook. Install via **Settings → Capabilities** (or drop it in
  `.claude/skills/`). One architect skill only — no per-subsystem skill proliferation until patterns stabilize.

## Layer 2 — Executable guardrails (enforcement — the layer that actually stops drift)
Documentation describes rules; **CI enforces them.** See `tests/guardrails/` + `.github/workflows/ci.yml`.
- **Verdict-language scan** — client-facing renderers may not emit `violation/breach/back-charge/…` (CR-12).
- **Coverage-limit guard** — no hardcoded `$2M`; the per-client profile must exist (CR-02).
- **Contract validation** — outbound payloads validate against `work-order.schema.json`.
- **Prisma validate** — schema integrity on every change.
- **Governance-files present** — MANIFEST / CLAUDE / CR log can't be deleted silently.
- Grow this suite as rules land (tenant-scope lint, idempotency checks, secret-scanning).
- **Escape hatch:** a single line may carry `guardrail:allow-verdict-term` only with an explicit, reviewed reason.

## Layer 3 — Thread process
- **One sprint ticket per thread.** Load `CLAUDE.md` + the relevant CR before coding.
- **Decisions change in the open:** if a thread alters a locked decision, update the CR log **in the
  same commit** and bump `MANIFEST.md`. Never let code and manifest diverge.
- **Conventional commits** reference ticket + CR: `feat(adapters): generic webhook renderer (M0-09, CR-12)`.
- **Green CI is the merge gate.**

## Retrieval aid — Graphify (from M1, not M0)
A queryable knowledge-graph "memory layer" over the repo. **Descriptive, not prescriptive** — it maps
what exists so threads stop grep-and-missing; it does **not** enforce any rule (that's Layers 1–2).
- Value ≈ 0 on a near-empty repo; adopt when code spans web + inference + adapters (≈ end of M0 / M1).
- Install: `uv tool install graphifyy` → `graphify install` (add `--project` to commit the skill into
  this repo; `--platform antigravity|cursor` for other tools). `graphify hook install` auto-refreshes
  the graph on commit. Use it with `/graphify .`.
- **Backend:** extraction uses an LLM backend — prefer AWS Bedrock (IAM) or local Ollama. Safe here
  because the MANIFEST forbids secrets in the repo, so nothing sensitive enters the graph.
- Keep `graphify-out/` git-ignored (regenerated artifact), commit only the skill files if `--project`.

## Manifest amendment process
The MANIFEST is not immutable — but changes are **deliberate amendments**, not ad-hoc code deviations:
1. Add/'update a CR in `docs/PRD-Corrections-Log.md` with the decision + rationale.
2. Update `MANIFEST.md` and bump its version.
3. Update/extend the guardrail that enforces it.
4. All in one reviewed commit.
