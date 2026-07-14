#
# M2-6c / CR-37 — Public ALB fronting the web service ONLY.
#
# The inference service is NOT exposed here: the worker reaches it over the VPC (CR-36), and its
# /internal/* surface is token-guarded. Putting it behind a public listener would widen the attack
# surface for zero benefit.
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

variable "vpc_id" {
  type        = string
  description = "VPC to place the target group in."
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "Public subnets for the ALB (>= 2 AZs)."
}

variable "security_group_ids" {
  type        = list(string)
  description = "Security groups — the ALB SG."
}

variable "app_port_web" {
  type        = number
  description = "Container port the web service listens on."
  default     = 3000
}

variable "health_check_path" {
  type        = string
  description = "Health endpoint. /api/health is the same probe compose + the composed-stack DoD use."
  default     = "/api/health"
}

variable "certificate_arn" {
  type        = string
  description = <<-EOT
    ACM certificate ARN for the HTTPS listener. Empty = HTTP-only (a bootstrapping convenience before
    the domain exists — M2-6f wires domain/TLS). Set it before any real traffic: magic-link auth
    tokens and capture data must not cross the internet in the clear.
  EOT
  default     = ""
}

variable "ssl_policy" {
  type        = string
  description = "ALB TLS policy (TLS 1.2+)."
  default     = "ELBSecurityPolicy-TLS13-1-2-2021-06"
}

variable "deregistration_delay" {
  type        = number
  description = "Seconds to drain in-flight requests before removing a target."
  default     = 30
}

locals {
  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "datum-zero"
  }

  https_enabled = var.certificate_arn != ""
}

resource "aws_lb" "this" {
  name               = "${var.name_prefix}-alb"
  load_balancer_type = "application"
  internal           = false
  subnets            = var.public_subnet_ids
  security_groups    = var.security_group_ids

  drop_invalid_header_fields = true
  enable_deletion_protection = false
  idle_timeout               = 120 # capture uploads are large; the default 60s truncates them

  tags = merge(local.tags, { Name = "${var.name_prefix}-alb" })
}

resource "aws_lb_target_group" "web" {
  name        = "${var.name_prefix}-web"
  port        = var.app_port_web
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip" # awsvpc networking on Fargate

  deregistration_delay = var.deregistration_delay

  health_check {
    enabled             = true
    path                = var.health_check_path
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  # Server Components + magic-link flows are stateless; no stickiness needed.
  tags = merge(local.tags, { Name = "${var.name_prefix}-web" })
}

# HTTP: redirect to HTTPS once a cert exists; forward only in the pre-domain window.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = local.https_enabled ? [1] : []
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }

  dynamic "default_action" {
    for_each = local.https_enabled ? [] : [1]
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.web.arn
    }
  }
}

resource "aws_lb_listener" "https" {
  count             = local.https_enabled ? 1 : 0
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = var.ssl_policy
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

# --- outputs ---
output "dns_name" {
  description = "ALB hostname — the Route53 alias target in M2-6f."
  value       = aws_lb.this.dns_name
}

output "zone_id" {
  value = aws_lb.this.zone_id
}

output "target_group_arn" {
  description = "Web target group — the ECS service registers into this."
  value       = aws_lb_target_group.web.arn
}

output "https_enabled" {
  description = "False means the listener is HTTP-only; set certificate_arn before real traffic."
  value       = local.https_enabled
}
