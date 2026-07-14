#
# M2-6c / CR-37 — Postgres (RDS). Private subnets only, encrypted, never publicly accessible.
#
# RLS DUAL-ROLE TOPOLOGY (CR-20, proven in CR-35):
#   - The MASTER role created here is elevated. It is used ONLY by `prisma migrate deploy`, via
#     Prisma's `directUrl`. Its password is AWS-managed (see manage_master_user_password) so it never
#     touches .tf or Terraform state.
#   - The RUNTIME role (`datumzero_app`) is a NON-superuser and is therefore subject to RLS. It is
#     created by the idempotent RLS migration (m1_02_rls), not by Terraform — the migration owns the
#     role/grant/policy set so local, CI, and prod converge on identical DB state.
#   - If the runtime connected as the master, RLS would be BYPASSED and tenant isolation would
#     silently vanish. The variable validation below makes that unrepresentable in config.
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

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private subnets for the DB subnet group (>= 2 AZs)."
}

variable "security_group_ids" {
  type        = list(string)
  description = "Security groups — the RDS SG, which admits the ECS tasks SG only."
}

variable "db_name" {
  type        = string
  description = "Initial database name."
  default     = "datumzero"
}

variable "db_master_username" {
  type        = string
  description = "Elevated role used ONLY by prisma migrate deploy (Prisma directUrl). Password is AWS-managed."
  default     = "datumzero_migrator"
}

variable "db_app_username" {
  type        = string
  description = <<-EOT
    The NON-SUPERUSER runtime role (RLS-subject). Created by the m1_02_rls migration, not by
    Terraform; declared here so the dual-role split is explicit and checkable in config.
  EOT
  default     = "datumzero_app"

  validation {
    # Terraform 1.9 cross-variable validation. Collapsing these two roles is the single change that
    # would silently disable tenant isolation — so it fails at plan time, not in production.
    condition     = var.db_app_username != var.db_master_username
    error_message = "The runtime DB role must NOT be the master/migration role — RLS is bypassed for the owner/superuser, which would silently disable tenant isolation (CR-20/CR-35)."
  }
}

variable "instance_class" {
  type        = string
  description = "Instance class. db.t4g.micro is the cheapest sane pre-customer default."
  default     = "db.t4g.micro"
}

variable "engine_version" {
  type        = string
  description = "Postgres major.minor. Matches the compose/CI service container family."
  default     = "16.4"
}

variable "allocated_storage" {
  type        = number
  description = "GiB. Autoscales to max_allocated_storage."
  default     = 20
}

variable "max_allocated_storage" {
  type        = number
  description = "GiB ceiling for storage autoscaling."
  default     = 100
}

variable "backup_retention_days" {
  type        = number
  description = "Automated backup retention."
  default     = 7
}

variable "multi_az" {
  type        = bool
  description = "Multi-AZ failover. Off pre-customer (doubles cost); on before real tenant data."
  default     = false
}

variable "deletion_protection" {
  type        = bool
  description = "Block accidental destroy."
  default     = true
}

locals {
  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "datum-zero"
  }
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name_prefix}-db"
  subnet_ids = var.private_subnet_ids
  tags       = merge(local.tags, { Name = "${var.name_prefix}-db" })
}

resource "aws_db_parameter_group" "this" {
  name        = "${var.name_prefix}-pg16"
  family      = "postgres16"
  description = "Datum Zero ${var.environment} Postgres parameters."

  # Reject non-TLS connections outright. The app connects over the VPC, but "private network" is not
  # a substitute for encryption in transit (fail closed).
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(local.tags, { Name = "${var.name_prefix}-pg16" })
}

resource "aws_db_instance" "this" {
  identifier     = "${var.name_prefix}-db"
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  db_name  = var.db_name
  username = var.db_master_username

  # AWS generates + rotates the master password into its own Secrets Manager secret. No password is
  # passed through Terraform, so none can land in .tf or in state (MANIFEST §3).
  manage_master_user_password = true

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = var.security_group_ids
  parameter_group_name   = aws_db_parameter_group.this.name
  publicly_accessible    = false # never; reachable only from the ECS tasks SG
  multi_az               = var.multi_az

  backup_retention_period = var.backup_retention_days
  backup_window           = "07:00-08:00"
  maintenance_window      = "Mon:08:30-Mon:09:30"

  auto_minor_version_upgrade = true
  deletion_protection        = var.deletion_protection
  skip_final_snapshot        = false
  final_snapshot_identifier  = "${var.name_prefix}-db-final"

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  tags = merge(local.tags, { Name = "${var.name_prefix}-db" })
}

# --- outputs ---
output "endpoint" {
  description = "host:port."
  value       = aws_db_instance.this.endpoint
}

output "address" {
  value = aws_db_instance.this.address
}

output "port" {
  value = aws_db_instance.this.port
}

output "db_name" {
  value = aws_db_instance.this.db_name
}

output "master_user_secret_arn" {
  description = <<-EOT
    ARN of the AWS-managed master password secret. The user composes DIRECT_DATABASE_URL from this
    (migration role) and DATABASE_URL from the datumzero_app role, then injects both out-of-band.
    See docs/DEPLOY.md.
  EOT
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}

output "app_username" {
  description = "The RLS-subject runtime role the m1_02_rls migration creates."
  value       = var.db_app_username
}
