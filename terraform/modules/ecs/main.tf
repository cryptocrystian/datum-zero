#
# M2-6c / CR-37 — ECS Fargate: the three services proven wired in the composed-stack DoD (CR-35):
#
#   ALB -> web -> Redis -> workers -> inference -> callback -> web -> Postgres -> outbox -> sink
#
# Only `web` is registered with the ALB. `inference` and `workers` are internal; the worker resolves
# inference through Cloud Map private DNS, and inference calls back to web the same way — the
# callback never leaves the VPC.
#
# IAM is least-privilege and split:
#   - execution role: pull images, ship logs, and read ONLY the declared secret ARNs (this is what
#     lets a task definition reference a secret without the value ever entering Terraform).
#   - task roles: one per service, each granted only what that service actually does.
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

variable "region" {
  type        = string
  description = "AWS region (for the awslogs driver)."
}

variable "vpc_id" {
  type        = string
  description = "VPC for the Cloud Map namespace."
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private subnets the tasks run in."
}

variable "security_group_ids" {
  type        = list(string)
  description = "Security groups — the ECS tasks SG."
}

variable "target_group_arn" {
  type        = string
  description = "ALB target group the web service registers into."
}

variable "repository_urls" {
  type        = map(string)
  description = "Map of image name (web|inference|workers) to ECR repository URL."
}

variable "image_tag" {
  type        = string
  description = "Image tag to run. M2-6d moves this to a deploy-time input; here it is explicit."
  default     = "latest"
}

variable "secret_arns" {
  type        = map(string)
  description = "Map of logical secret name to ARN (from the secrets module). Values are injected out-of-band."
}

variable "media_bucket_arn" {
  type        = string
  description = "S3 media bucket ARN."
}

variable "media_bucket_id" {
  type        = string
  description = "S3 media bucket name."
}

variable "app_port_web" {
  type        = number
  default     = 3000
  description = "Container port for web."
}

variable "app_port_inference" {
  type        = number
  default     = 8000
  description = "Container port for inference."
}

variable "app_base_url" {
  type        = string
  description = "Public origin of the cockpit (magic-link URLs render against this). M2-6f sets the real domain."
}

variable "log_retention_days" {
  type        = number
  default     = 30
  description = "CloudWatch log retention."
}

variable "web_cpu" {
  type    = number
  default = 512
}

variable "web_memory" {
  type    = number
  default = 1024
}

variable "inference_cpu" {
  type    = number
  default = 1024
}

variable "inference_memory" {
  type    = number
  default = 2048
}

variable "workers_cpu" {
  type    = number
  default = 512
}

variable "workers_memory" {
  type    = number
  default = 1024
}

variable "web_desired_count" {
  type    = number
  default = 1
}

variable "inference_desired_count" {
  type    = number
  default = 1
}

variable "workers_desired_count" {
  type        = number
  description = "Kept at 1 pre-customer. The inference job is idempotent (jobId = sessionId + a COMPLETE guard, CR-36), so >1 is safe when throughput demands it."
  default     = 1
}

variable "ses_sending_identity_arn" {
  type        = string
  description = <<-EOT
    ARN of the verified SES identity magic-link mail is sent from. Empty = no ses:SendEmail grant is
    attached (M2-6f verifies the domain). Scoping the grant to one identity keeps a compromised task
    from sending as anything else.
  EOT
  default     = ""
}

locals {
  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "datum-zero"
  }

  services = ["web", "inference", "workers"]

  # Every task definition reads its config from Secrets Manager at start. Nothing sensitive is baked
  # into the image (guardrail-enforced: the layer scanner in M2-6b fails CI on a secret in a layer)
  # and nothing sensitive appears here — only ARNs.
  secret_ref = { for k, v in var.secret_arns : k => { name = k, valueFrom = v } }
}

# --- cluster ---
resource "aws_ecs_cluster" "this" {
  name = var.name_prefix

  setting {
    name  = "containerInsights"
    value = "enabled" # M2-6e builds on this
  }

  tags = merge(local.tags, { Name = var.name_prefix })
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

# --- logs ---
resource "aws_cloudwatch_log_group" "this" {
  for_each          = toset(local.services)
  name              = "/ecs/${var.name_prefix}/${each.value}"
  retention_in_days = var.log_retention_days
  tags              = merge(local.tags, { Name = "${var.name_prefix}-${each.value}" })
}

# --- service discovery (private DNS: worker -> inference, inference -> web callback) ---
resource "aws_service_discovery_private_dns_namespace" "this" {
  name        = "${var.name_prefix}.local"
  description = "Internal service discovery for Datum Zero ${var.environment}."
  vpc         = var.vpc_id
  tags        = local.tags
}

resource "aws_service_discovery_service" "internal" {
  for_each = toset(["web", "inference"]) # workers is a consumer only — nothing dials it
  name     = each.value

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.this.id
    dns_records {
      ttl  = 10
      type = "A"
    }
    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }

  tags = local.tags
}

locals {
  internal_web_url   = "http://web.${aws_service_discovery_private_dns_namespace.this.name}:${var.app_port_web}"
  internal_infer_url = "http://inference.${aws_service_discovery_private_dns_namespace.this.name}:${var.app_port_inference}"
}

# --- IAM: execution role (pull images, ship logs, read the declared secrets) ---
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.name_prefix}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Read ONLY these secret ARNs — not secretsmanager:* on the account.
data "aws_iam_policy_document" "execution_secrets" {
  statement {
    sid       = "ReadDeclaredSecrets"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = values(var.secret_arns)
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "${var.name_prefix}-execution-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets.json
}

# --- IAM: per-service task roles ---
resource "aws_iam_role" "task" {
  for_each           = toset(local.services)
  name               = "${var.name_prefix}-task-${each.value}"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = merge(local.tags, { Service = each.value })
}

# web + inference read and write media (raw masters in, rendered crops out).
data "aws_iam_policy_document" "s3_rw" {
  statement {
    sid       = "ListMediaBucket"
    actions   = ["s3:ListBucket"]
    resources = [var.media_bucket_arn]
  }
  statement {
    sid       = "ReadWriteMediaObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:AbortMultipartUpload"]
    resources = ["${var.media_bucket_arn}/*"]
  }
}

# workers only READ media (the outbox ships references + renders links; it does not author masters).
data "aws_iam_policy_document" "s3_ro" {
  statement {
    sid       = "ListMediaBucket"
    actions   = ["s3:ListBucket"]
    resources = [var.media_bucket_arn]
  }
  statement {
    sid       = "ReadMediaObjects"
    actions   = ["s3:GetObject"]
    resources = ["${var.media_bucket_arn}/*"]
  }
}

resource "aws_iam_role_policy" "s3_web" {
  name   = "${var.name_prefix}-task-web-s3"
  role   = aws_iam_role.task["web"].id
  policy = data.aws_iam_policy_document.s3_rw.json
}

resource "aws_iam_role_policy" "s3_inference" {
  name   = "${var.name_prefix}-task-inference-s3"
  role   = aws_iam_role.task["inference"].id
  policy = data.aws_iam_policy_document.s3_rw.json
}

resource "aws_iam_role_policy" "s3_workers" {
  name   = "${var.name_prefix}-task-workers-s3"
  role   = aws_iam_role.task["workers"].id
  policy = data.aws_iam_policy_document.s3_ro.json
}

# SES: web sends magic links; nothing else sends mail.
#
# FOLLOW-ON: the mail adapter (M2-5a) currently authenticates to SES with SMTP credentials, so
# SES_SMTP_USER/PASSWORD still exist as secrets. This grant lets the web task call the SES API under
# its task role instead — switching the adapter to it would delete a long-lived credential outright.
# Tracked as a follow-on ticket; not in scope here.
data "aws_iam_policy_document" "ses_send" {
  count = var.ses_sending_identity_arn != "" ? 1 : 0
  statement {
    sid       = "SendMagicLinkMail"
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = [var.ses_sending_identity_arn]
  }
}

resource "aws_iam_role_policy" "ses_web" {
  count  = var.ses_sending_identity_arn != "" ? 1 : 0
  name   = "${var.name_prefix}-task-web-ses"
  role   = aws_iam_role.task["web"].id
  policy = data.aws_iam_policy_document.ses_send[0].json
}

# --- task definitions ---
resource "aws_ecs_task_definition" "web" {
  family                   = "${var.name_prefix}-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.web_cpu
  memory                   = var.web_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task["web"].arn

  container_definitions = jsonencode([{
    name      = "web"
    image     = "${var.repository_urls["web"]}:${var.image_tag}"
    essential = true

    portMappings = [{ containerPort = var.app_port_web, protocol = "tcp" }]

    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = tostring(var.app_port_web) },
      { name = "APP_BASE_URL", value = var.app_base_url },
      { name = "STORAGE_DRIVER", value = "s3" },
      { name = "S3_BUCKET", value = var.media_bucket_id },
      { name = "AWS_REGION", value = var.region },
      { name = "INFERENCE_BASE_URL", value = local.internal_infer_url },
    ]

    secrets = [
      local.secret_ref["DATABASE_URL"],
      local.secret_ref["REDIS_URL"],
      local.secret_ref["AUTH_SECRET"],
      local.secret_ref["INFERENCE_CALLBACK_TOKEN"],
      local.secret_ref["INGEST_API_TOKEN"],
      local.secret_ref["SES_SMTP_USER"],
      local.secret_ref["SES_SMTP_PASSWORD"],
    ]

    healthCheck = {
      command     = ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:${var.app_port_web}/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.this["web"].name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "web"
      }
    }
  }])

  tags = merge(local.tags, { Name = "${var.name_prefix}-web" })
}

resource "aws_ecs_task_definition" "inference" {
  family                   = "${var.name_prefix}-inference"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.inference_cpu
  memory                   = var.inference_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task["inference"].arn

  # NOTE: no DJI Thermal SDK is baked into this image or mounted here. The SDK is Confidential under
  # the DJI EULA §14, so it can never be committed or shipped in a layer; the DJI decoder loads it
  # from an env-configured vendored path at runtime (CR-22). Provisioning that path in ECS (a private
  # artifact fetched at task start) is a follow-on ticket. Without it the DJI decoder stays inert —
  # which is fail-closed, not degraded: non-DJI radiometric paths are unaffected.
  container_definitions = jsonencode([{
    name      = "inference"
    image     = "${var.repository_urls["inference"]}:${var.image_tag}"
    essential = true

    portMappings = [{ containerPort = var.app_port_inference, protocol = "tcp" }]

    environment = [
      { name = "PORT", value = tostring(var.app_port_inference) },
      { name = "STORAGE_DRIVER", value = "s3" },
      { name = "S3_BUCKET", value = var.media_bucket_id },
      { name = "AWS_REGION", value = var.region },
      # The callback returns to web inside the VPC — it never traverses the ALB or the internet.
      { name = "CALLBACK_BASE_URL", value = local.internal_web_url },
    ]

    secrets = [
      local.secret_ref["INFERENCE_CALLBACK_TOKEN"],
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.this["inference"].name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "inference"
      }
    }
  }])

  tags = merge(local.tags, { Name = "${var.name_prefix}-inference" })
}

resource "aws_ecs_task_definition" "workers" {
  family                   = "${var.name_prefix}-workers"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.workers_cpu
  memory                   = var.workers_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task["workers"].arn

  container_definitions = jsonencode([{
    name      = "workers"
    image     = "${var.repository_urls["workers"]}:${var.image_tag}"
    essential = true

    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "STORAGE_DRIVER", value = "s3" },
      { name = "S3_BUCKET", value = var.media_bucket_id },
      { name = "AWS_REGION", value = var.region },
      { name = "APP_BASE_URL", value = var.app_base_url },
      # Same wiring the composed stack proved: the worker dials inference over the VPC.
      { name = "INFERENCE_BASE_URL", value = local.internal_infer_url },
    ]

    secrets = [
      local.secret_ref["DATABASE_URL"],
      local.secret_ref["REDIS_URL"],
      local.secret_ref["INFERENCE_CALLBACK_TOKEN"],
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.this["workers"].name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "workers"
      }
    }
  }])

  tags = merge(local.tags, { Name = "${var.name_prefix}-workers" })
}

# --- services ---
resource "aws_ecs_service" "web" {
  name            = "web"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = var.web_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = var.security_group_ids
    assign_public_ip = false # egress is via NAT
  }

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = "web"
    container_port   = var.app_port_web
  }

  service_registries {
    registry_arn = aws_service_discovery_service.internal["web"].arn
  }

  health_check_grace_period_seconds = 60

  deployment_circuit_breaker {
    enable   = true
    rollback = true # a task that cannot boot rolls back rather than draining the healthy one
  }

  lifecycle {
    # M2-6d (CI/CD) advances the image tag out-of-band; don't fight the deploy pipeline on apply.
    ignore_changes = [task_definition, desired_count]
  }

  tags = merge(local.tags, { Name = "${var.name_prefix}-web" })
}

resource "aws_ecs_service" "inference" {
  name            = "inference"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.inference.arn
  desired_count   = var.inference_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = var.security_group_ids
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.internal["inference"].arn
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  tags = merge(local.tags, { Name = "${var.name_prefix}-inference" })
}

resource "aws_ecs_service" "workers" {
  name            = "workers"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.workers.arn
  desired_count   = var.workers_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = var.security_group_ids
    assign_public_ip = false
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  tags = merge(local.tags, { Name = "${var.name_prefix}-workers" })
}

# --- outputs ---
output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "cluster_arn" {
  value = aws_ecs_cluster.this.arn
}

output "service_names" {
  value = {
    web       = aws_ecs_service.web.name
    inference = aws_ecs_service.inference.name
    workers   = aws_ecs_service.workers.name
  }
}

output "task_definition_families" {
  description = "Families the M2-6d deploy job registers new revisions against."
  value = {
    web       = aws_ecs_task_definition.web.family
    inference = aws_ecs_task_definition.inference.family
    workers   = aws_ecs_task_definition.workers.family
  }
}

output "internal_dns" {
  description = "Cloud Map names for the in-VPC hops (worker -> inference, inference -> web callback)."
  value = {
    web       = local.internal_web_url
    inference = local.internal_infer_url
  }
}

output "execution_role_arn" {
  value = aws_iam_role.execution.arn
}

output "task_role_arns" {
  value = { for k, v in aws_iam_role.task : k => v.arn }
}
