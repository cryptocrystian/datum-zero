#
# M2-6c / CR-37 — ElastiCache Redis: the BullMQ broker for the session-inference queue (CR-36) and
# the delivery outbox. Private subnets only, encrypted in transit + at rest.
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
  description = "Private subnets for the cache subnet group."
}

variable "security_group_ids" {
  type        = list(string)
  description = "Security groups — the Redis SG, which admits the ECS tasks SG only."
}

variable "node_type" {
  type        = string
  description = "Cache node type. t4g.micro is the cheapest sane pre-customer default."
  default     = "cache.t4g.micro"
}

variable "engine_version" {
  type        = string
  description = "Redis engine version (BullMQ needs >= 6.2 for the commands it issues)."
  default     = "7.1"
}

locals {
  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "datum-zero"
  }
}

resource "aws_elasticache_subnet_group" "this" {
  name       = "${var.name_prefix}-redis"
  subnet_ids = var.private_subnet_ids
  tags       = merge(local.tags, { Name = "${var.name_prefix}-redis" })
}

resource "aws_elasticache_parameter_group" "this" {
  name        = "${var.name_prefix}-redis7"
  family      = "redis7"
  description = "Datum Zero ${var.environment} Redis parameters."

  # BullMQ REQUIRES noeviction. Under any other policy Redis may evict job keys when memory fills,
  # which silently drops queued inference jobs — an upload would be accepted and then never
  # processed. Fail loudly (writes error) instead of losing work.
  parameter {
    name  = "maxmemory-policy"
    value = "noeviction"
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(local.tags, { Name = "${var.name_prefix}-redis7" })
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id = "${var.name_prefix}-redis"
  description          = "Datum Zero ${var.environment} — BullMQ broker (session-inference + outbox)."

  engine               = "redis"
  engine_version       = var.engine_version
  node_type            = var.node_type
  num_cache_clusters   = 1 # single node pre-customer; raise + enable failover before real load
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.this.name

  subnet_group_name  = aws_elasticache_subnet_group.this.name
  security_group_ids = var.security_group_ids

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true # clients must use rediss://

  automatic_failover_enabled = false
  auto_minor_version_upgrade = true
  apply_immediately          = false

  snapshot_retention_limit = 1
  snapshot_window          = "05:00-06:00"
  maintenance_window       = "mon:06:30-mon:07:30"

  tags = merge(local.tags, { Name = "${var.name_prefix}-redis" })
}

# --- outputs ---
output "primary_endpoint_address" {
  value = aws_elasticache_replication_group.this.primary_endpoint_address
}

output "port" {
  value = aws_elasticache_replication_group.this.port
}

output "redis_url_hint" {
  description = <<-EOT
    Shape of the REDIS_URL to inject out-of-band. Transit encryption is on, so the scheme MUST be
    rediss:// — a redis:// URL will fail to connect. Not a secret; not a secret value.
  EOT
  value       = "rediss://${aws_elasticache_replication_group.this.primary_endpoint_address}:${aws_elasticache_replication_group.this.port}"
}
