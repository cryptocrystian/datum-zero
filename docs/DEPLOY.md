# DEPLOY — provisioning the AWS baseline

> **Status: AUTHORED, NOT APPLIED.** No AWS resource exists yet. Everything under `terraform/` has
> been formatted, initialized, and validated — never planned, never applied. **`terraform apply`
> provisions paid infrastructure and is a human decision.** CI lints this config; it can never
> provision anything (see [Author vs. apply](#author-vs-apply)).

Related: [`SANDBOX.md`](./SANDBOX.md) (free local stack, no AWS) · [`MANIFEST.md`](../MANIFEST.md) ·
CR-37 in [`PRD-Corrections-Log.md`](./PRD-Corrections-Log.md).

---

## Author vs. apply

| | Author (done, in CI) | Apply (yours, by hand) |
|---|---|---|
| Write + review `.tf` | ✅ | |
| `terraform fmt -check`, `init -backend=false`, `validate` | ✅ | |
| AWS account, billing, IAM principal | | ✅ |
| `terraform init` with the real backend, `plan`, `apply` | | ✅ |
| Inject secret **values** | | ✅ |

The CI `infra` job runs `init -backend=false`, so it has no state to reach and therefore needs no
credentials. That is structural, not a promise — and a guardrail
(`tests/guardrails/test_terraform_baseline.py`) fails the build if a `plan`, `apply`, or an AWS
credential ever appears in that job.

**Secrets never pass through Terraform.** The `secrets` module declares *containers* (names + ARNs)
that ECS task definitions reference by `valueFrom`; it creates no `secret_version`, so no plaintext
can enter a `.tf` file or the state file. RDS uses `manage_master_user_password`, so AWS generates and
holds the DB master password and Terraform never sees it. You inject the rest out-of-band in step 5.

---

## What gets created

```
                 internet
                    │  :80 → 301 → :443 (once certificate_arn is set)
              ┌─────▼─────┐  public subnets ×2
              │    ALB    │  (the ONLY public component)
              └─────┬─────┘
   private subnets  │  :3000
        ┌───────────▼───────────────────────────────┐
        │  ECS Fargate cluster                      │
        │    web  ──enqueue──►  Redis  ──►  workers │
        │     ▲                              │      │
        │     │        Cloud Map private DNS │      │
        │     └──callback── inference ◄──────┘      │
        └───────────┬──────────────┬────────────────┘
                    │              │
              ┌─────▼─────┐  ┌─────▼─────┐      ┌──────────────┐
              │ RDS (PG)  │  │ElastiCache│      │ S3 media +   │
              │ private   │  │  private  │      │ Secrets Mgr  │
              └───────────┘  └───────────┘      └──────────────┘
```

This is the same topology the composed-stack DoD already proves in CI (CR-35/CR-36) — the worker
dials inference and inference calls back to web **inside the VPC**; neither traverses the ALB.
Only `web` is internet-reachable. RDS and Redis admit the ECS tasks security group and nothing else.

**Rough cost, idle, pre-customer:** the NAT gateway (~$32/mo) dominates, then ALB (~$16/mo), then
`db.t4g.micro` + `cache.t4g.micro` + Fargate tasks. Budget roughly **$100–150/month** before traffic.
The NAT is the first thing to question if that matters — nothing else is trimmable without giving up
private subnets.

---

## Prerequisites

1. An AWS account with billing configured, and a **budget alarm** set before you apply.
2. An IAM principal (ideally an SSO role, not a long-lived key) with permission to create VPC, ECS,
   ECR, RDS, ElastiCache, ELB, S3, Secrets Manager, IAM, CloudWatch Logs, and Cloud Map resources.
3. `terraform >= 1.9` and the AWS CLI, authenticated: `aws sts get-caller-identity` must succeed.

---

## 1. Bootstrap the state backend (once, ever)

`terraform/bootstrap` creates only the S3 state bucket and the DynamoDB lock table. It uses **local
state on purpose** — it is the chicken-and-egg step that creates the backend everything else stores
state in.

```bash
cd terraform/bootstrap
terraform init
terraform apply -var="state_bucket_name=datum-zero-tfstate-<unique-suffix>"
```

Keep the resulting `terraform.tfstate` (it is gitignored). If you lose it, the bucket and table still
exist — you would import them rather than re-create.

## 2. Configure prod

```bash
cd ../envs/prod
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars     # media_bucket_name must be globally unique. No secrets in here.
```

Leave `app_base_url` and `certificate_arn` empty on the first apply — the ALB hostname does not exist
until the ALB does.

## 3. Init against the real backend

```bash
terraform init \
  -backend-config="bucket=datum-zero-tfstate-<unique-suffix>" \
  -backend-config="key=prod/terraform.tfstate" \
  -backend-config="region=us-east-1" \
  -backend-config="dynamodb_table=datum-zero-tflock"
```

## 4. Plan, read it, then apply

```bash
terraform plan -out=tfplan     # READ THIS. It is the last point before money.
terraform apply tfplan
```

The first apply takes ~15–20 minutes (RDS and ElastiCache dominate). The ECS services will start,
fail to reach their secrets, and back off — expected. Step 5 fixes that.

> If `plan` rejects `db_app_username`, that is the RLS dual-role validation doing its job — the
> runtime role must not equal the master role. Do not "fix" it by making them match; see step 5.

## 5. Inject the secret values (out-of-band — never Terraform)

```bash
terraform output secret_names               # the entries to populate
terraform output db_master_user_secret_arn  # AWS-managed master password
terraform output redis_url_hint             # note: rediss:// — transit encryption is on
```

Read the AWS-managed master password, then compose the **two distinct** connection strings:

| Secret | Role | Used by |
|---|---|---|
| `DATABASE_URL` | `datumzero_app` — **non-superuser**, RLS-subject | web + workers at runtime |
| `DIRECT_DATABASE_URL` | the master/migration role | `prisma migrate deploy` only (Prisma `directUrl`) |

> **This split IS tenant isolation (CR-20).** RLS does not apply to the owner/superuser: if the
> runtime connected as the master, every tenant policy would be bypassed and **no test would fail**.
> Never point `DATABASE_URL` at the master role.

`datumzero_app` itself is created by the idempotent RLS migration (`m1_02_rls`), not by Terraform —
the migration owns the role/grant/policy set so local, CI, and prod converge on identical DB state.
It exists after step 6's migrate, so populate `DATABASE_URL` now and let the first web tasks retry.

```bash
aws secretsmanager put-secret-value --secret-id datum-zero-prod/AUTH_SECRET \
  --secret-string "$(openssl rand -base64 32)"
# ...repeat for DATABASE_URL, DIRECT_DATABASE_URL, REDIS_URL, INFERENCE_CALLBACK_TOKEN,
#    INGEST_API_TOKEN, SES_SMTP_USER, SES_SMTP_PASSWORD
```

## 6. Push images and migrate

`terraform output ecr_repository_urls` gives the push targets. Build, tag, push, then run
`prisma migrate deploy` against `DIRECT_DATABASE_URL` (a one-shot ECS task, or from a bastion —
RDS is private and not reachable from your laptop by design).

**M2-6d automates steps 6 and onward.** Until then this is manual and that is fine — it runs once.

## 7. Verify, then close the front door

```bash
curl -fsS "http://$(terraform output -raw alb_dns_name)/api/health"
```

Then set `certificate_arn` (and `app_base_url`) and re-apply to get the HTTPS listener and the
HTTP→HTTPS redirect. `terraform output https_enabled` reports `false` until you do.

> **Do not put real traffic through the HTTP-only listener.** Magic-link tokens and capture data
> would cross the internet in the clear. The HTTP-only window exists solely because the ALB hostname
> must exist before a certificate can be attached to it. M2-6f wires domain + TLS + SES properly.

---

## Deliberately not here

- **`terraform apply` in CI.** A push must never provision, mutate, or destroy infrastructure.
  M2-6d adds a deploy pipeline; that is an image push and a service update, not an apply.
- **SES via task role.** The mail adapter (M2-5a) authenticates to SES with SMTP credentials, so
  `SES_SMTP_USER`/`SES_SMTP_PASSWORD` still exist. The `ecs` module already grants `ses:SendEmail`
  to the web task role, scoped to one verified identity — switching the adapter to it would delete a
  long-lived credential outright. Follow-on ticket.
- **The DJI Thermal SDK.** It is Confidential under **DJI EULA §14**, so it is never committed and
  never baked into an image; the decoder loads it from an env-configured vendored path at runtime
  (CR-22). That path is not provisioned in ECS yet, so **the DJI decoder stays inert** — which is
  fail-closed, not degraded: it refuses rather than guessing, and non-DJI radiometric paths (FLIR,
  plain TIFF) are unaffected. Provisioning it means fetching a private artifact at task start, under
  the EULA's distribution terms. Follow-on ticket.
- **flyr / EUPL.** Any on-prem or redistributed build carries the EUPL reciprocity obligation. Not
  triggered by this managed deployment; re-check before any on-prem offering.
  See [`LEGAL-REVIEW-BACKLOG.md`](./LEGAL-REVIEW-BACKLOG.md).
- **Multi-AZ, HA NAT, autoscaling, WAF, observability.** Single-AZ RDS, one NAT, fixed task counts.
  Deliberate pre-customer cost posture. `db_multi_az = true` before real tenant data lands; M2-6e
  covers observability.
