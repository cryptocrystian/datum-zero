# Terraform state backend bootstrap (run ONCE, by you)

Creates **only** the two things the main config's remote backend needs:

- an **S3 bucket** for Terraform state (versioned, encrypted, public access blocked), and
- a **DynamoDB table** for state locking (pay-per-request — no idle cost).

It uses **local state on purpose** (chicken-and-egg: it creates the backend everything else stores
state in). Nothing else is provisioned here.

> **This is not applied by CI or by Claude Code.** Applying creates real AWS resources. It is your
> action, and it requires an AWS account with billing enabled plus an IAM principal for Terraform.
> See [`docs/DEPLOY.md`](../../docs/DEPLOY.md) for the full sequence and the author-vs-apply boundary.

## Run

```bash
cd terraform/bootstrap
terraform init
terraform apply -var="state_bucket_name=datum-zero-tfstate-<your-account-id>"
```

Then copy the two outputs into `../envs/prod/backend.tf` (`bucket` and `dynamodb_table`) and run
`terraform init` in `../envs/prod`.

Cost: the state bucket and lock table are effectively free at this scale (cents/month).
