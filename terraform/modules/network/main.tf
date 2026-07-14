#
# M2-6c / CR-37 — Network. Public subnets carry ONLY the ALB; ECS tasks, RDS, and Redis are private.
# Security groups are least-privilege: the database and Redis are reachable ONLY from the ECS tasks.
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
  description = "Environment name (prod, staging, ...). Everything is parameterized by this so a second environment is additive."
  type        = string
}

variable "name_prefix" {
  description = "Resource name prefix, e.g. datum-zero-prod."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR for the VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "azs" {
  description = "Availability zones to spread subnets across (2 is enough for a small footprint; RDS/ALB want >= 2)."
  type        = list(string)
}

variable "app_port_web" {
  description = "Container port the web service listens on."
  type        = number
  default     = 3000
}

variable "app_port_inference" {
  description = "Container port the inference service listens on."
  type        = number
  default     = 8000
}

locals {
  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "datum-zero"
  }
}

# --- VPC + gateways ---
resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true # ECS service discovery + RDS endpoints resolve by name
  tags                 = merge(local.tags, { Name = var.name_prefix })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = merge(local.tags, { Name = "${var.name_prefix}-igw" })
}

resource "aws_subnet" "public" {
  count                   = length(var.azs)
  vpc_id                  = aws_vpc.this.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = var.azs[count.index]
  map_public_ip_on_launch = true
  tags                    = merge(local.tags, { Name = "${var.name_prefix}-public-${count.index}", Tier = "public" })
}

resource "aws_subnet" "private" {
  count             = length(var.azs)
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 100)
  availability_zone = var.azs[count.index]
  tags              = merge(local.tags, { Name = "${var.name_prefix}-private-${count.index}", Tier = "private" })
}

# Single NAT gateway: private tasks need egress (ECR pulls, SES, callbacks). One NAT keeps the
# pre-customer footprint cheap; add one per AZ when traffic/HA justifies it.
resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = merge(local.tags, { Name = "${var.name_prefix}-nat" })
}

resource "aws_nat_gateway" "this" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  tags          = merge(local.tags, { Name = "${var.name_prefix}-nat" })
  depends_on    = [aws_internet_gateway.this]
}

# --- routing ---
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = merge(local.tags, { Name = "${var.name_prefix}-public" })
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this.id
  }
  tags = merge(local.tags, { Name = "${var.name_prefix}-private" })
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# --- security groups (least privilege) ---
resource "aws_security_group" "alb" {
  name        = "${var.name_prefix}-alb"
  description = "Public ALB: HTTP/HTTPS in from the internet, out to the ECS tasks."
  vpc_id      = aws_vpc.this.id
  tags        = merge(local.tags, { Name = "${var.name_prefix}-alb" })
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTPS from the internet"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP from the internet (redirected to HTTPS at the listener)"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "alb_out" {
  security_group_id = aws_security_group.alb.id
  description       = "ALB to targets"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_security_group" "ecs_tasks" {
  name        = "${var.name_prefix}-ecs-tasks"
  description = "ECS tasks: web from the ALB only; egress for ECR/SES/S3/callbacks."
  vpc_id      = aws_vpc.this.id
  tags        = merge(local.tags, { Name = "${var.name_prefix}-ecs-tasks" })
}

resource "aws_vpc_security_group_ingress_rule" "ecs_from_alb_web" {
  security_group_id            = aws_security_group.ecs_tasks.id
  description                  = "web port from the ALB only"
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = var.app_port_web
  to_port                      = var.app_port_web
  ip_protocol                  = "tcp"
}

# The worker calls the inference service by service discovery INSIDE the VPC — never from the ALB.
resource "aws_vpc_security_group_ingress_rule" "ecs_inference_internal" {
  security_group_id            = aws_security_group.ecs_tasks.id
  description                  = "inference port from other tasks in this SG (worker -> inference)"
  referenced_security_group_id = aws_security_group.ecs_tasks.id
  from_port                    = var.app_port_inference
  to_port                      = var.app_port_inference
  ip_protocol                  = "tcp"
}

# The inference callback goes back to the web service inside the VPC.
resource "aws_vpc_security_group_ingress_rule" "ecs_web_internal" {
  security_group_id            = aws_security_group.ecs_tasks.id
  description                  = "web port from other tasks in this SG (inference callback -> web)"
  referenced_security_group_id = aws_security_group.ecs_tasks.id
  from_port                    = var.app_port_web
  to_port                      = var.app_port_web
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "ecs_out" {
  security_group_id = aws_security_group.ecs_tasks.id
  description       = "task egress (ECR, Secrets Manager, S3, SES) via NAT"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_security_group" "rds" {
  name        = "${var.name_prefix}-rds"
  description = "Postgres: reachable ONLY from the ECS tasks."
  vpc_id      = aws_vpc.this.id
  tags        = merge(local.tags, { Name = "${var.name_prefix}-rds" })
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_ecs" {
  security_group_id            = aws_security_group.rds.id
  description                  = "Postgres from the ECS tasks only"
  referenced_security_group_id = aws_security_group.ecs_tasks.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

resource "aws_security_group" "redis" {
  name        = "${var.name_prefix}-redis"
  description = "Redis (BullMQ): reachable ONLY from the ECS tasks."
  vpc_id      = aws_vpc.this.id
  tags        = merge(local.tags, { Name = "${var.name_prefix}-redis" })
}

resource "aws_vpc_security_group_ingress_rule" "redis_from_ecs" {
  security_group_id            = aws_security_group.redis.id
  description                  = "Redis from the ECS tasks only"
  referenced_security_group_id = aws_security_group.ecs_tasks.id
  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"
}

# --- outputs ---
output "vpc_id" {
  value = aws_vpc.this.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "alb_sg_id" {
  value = aws_security_group.alb.id
}

output "ecs_tasks_sg_id" {
  value = aws_security_group.ecs_tasks.id
}

output "rds_sg_id" {
  value = aws_security_group.rds.id
}

output "redis_sg_id" {
  value = aws_security_group.redis.id
}
