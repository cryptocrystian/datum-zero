#
# M2-6c / CR-37 — Secrets Manager entries: DECLARED, NEVER VALUED.
#
# This module creates the secret *containers* (names + ARNs) that ECS task definitions reference via
# `valueFrom`. It deliberately creates NO aws_secretsmanager_secret_version: a real secret value must
# never appear in .tf or in Terraform state (MANIFEST §3 — secrets in the vault, never repo/DB/logs).
# The user injects values out-of-band, once, after apply:
#
#   aws secretsmanager put-secret-value --secret-id <name> --secret-string '<value>'
#
# See docs/DEPLOY.md.
#
terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
}

# --- variables ---
variable "environment" {
  type        = string
  description = "Environment name."
}

variable "name_prefix" {
  type        = string
  description = "Resource name prefix."
}

variable "recovery_window_days" {
  type        = number
  description = "Deletion recovery window. 0 = immediate delete (handy pre-customer; raise for prod)."
  default     = 7
}

locals {
  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "datum-zero"
  }

  # The runtime configuration surface. Each is a container only — values are injected out-of-band.
  #
  # DATABASE_URL        -> the NON-SUPERUSER datumzero_app role (RLS-subject). The runtime uses this.
  # DIRECT_DATABASE_URL -> the elevated role, used ONLY by `prisma migrate deploy` (Prisma directUrl).
  #                        Collapsing these two would silently disable tenant isolation (CR-20/CR-35).
  # SES_SMTP_PASSWORD   -> only needed while SES uses SMTP creds. See the SES task-role note in the
  #                        ecs module: on ECS the adapter can use an IAM task role instead, removing
  #                        this long-lived credential entirely (a follow-on ticket).
  secret_names = [
    "DATABASE_URL",
    "DIRECT_DATABASE_URL",
    "REDIS_URL",
    "AUTH_SECRET",
    "INFERENCE_CALLBACK_TOKEN",
    "INGEST_API_TOKEN",
    "SES_SMTP_USER",
    "SES_SMTP_PASSWORD",
  ]
}

resource "aws_secretsmanager_secret" "this" {
  for_each                = toset(local.secret_names)
  name                    = "${var.name_prefix}/${each.value}"
  description             = "Datum Zero ${var.environment} — ${each.value}. Value injected out-of-band; never in Terraform."
  recovery_window_in_days = var.recovery_window_days
  tags                    = merge(local.tags, { Name = "${var.name_prefix}-${lower(each.value)}" })
}

# NOTE: no aws_secretsmanager_secret_version here — ON PURPOSE. Adding one would put the value in
# state. A guardrail asserts this file never gains one.

# --- outputs ---
output "secret_arns" {
  description = "Map of logical name to secret ARN — ECS task definitions reference these via valueFrom."
  value       = { for k, v in aws_secretsmanager_secret.this : k => v.arn }
}

output "secret_names" {
  value = { for k, v in aws_secretsmanager_secret.this : k => v.name }
}
