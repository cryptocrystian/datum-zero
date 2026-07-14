#
# M2-6c / CR-37 — prod environment: composes the modules into the baseline.
#
# AUTHORED, NOT APPLIED. `terraform apply` here provisions PAID AWS infrastructure and is the user's
# action. CI runs `fmt -check` + `init -backend=false` + `validate` only — no credentials, no plan.
# See docs/DEPLOY.md for the apply sequence.
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

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Environment = var.environment
      ManagedBy   = "terraform"
      Project     = "datum-zero"
    }
  }
}

locals {
  name_prefix = "datum-zero-${var.environment}"
}

module "network" {
  source = "../../modules/network"

  environment        = var.environment
  name_prefix        = local.name_prefix
  vpc_cidr           = var.vpc_cidr
  azs                = var.azs
  app_port_web       = var.app_port_web
  app_port_inference = var.app_port_inference
}

module "ecr" {
  source = "../../modules/ecr"

  environment = var.environment
  name_prefix = local.name_prefix
}

module "storage" {
  source = "../../modules/storage"

  environment = var.environment
  name_prefix = local.name_prefix
  bucket_name = var.media_bucket_name
}

module "secrets" {
  source = "../../modules/secrets"

  environment = var.environment
  name_prefix = local.name_prefix
}

module "rds" {
  source = "../../modules/rds"

  environment        = var.environment
  name_prefix        = local.name_prefix
  private_subnet_ids = module.network.private_subnet_ids
  security_group_ids = [module.network.rds_sg_id]
  db_master_username = var.db_master_username
  db_app_username    = var.db_app_username
  instance_class     = var.db_instance_class
  multi_az           = var.db_multi_az
}

module "redis" {
  source = "../../modules/redis"

  environment        = var.environment
  name_prefix        = local.name_prefix
  private_subnet_ids = module.network.private_subnet_ids
  security_group_ids = [module.network.redis_sg_id]
  node_type          = var.redis_node_type
}

module "alb" {
  source = "../../modules/alb"

  environment        = var.environment
  name_prefix        = local.name_prefix
  vpc_id             = module.network.vpc_id
  public_subnet_ids  = module.network.public_subnet_ids
  security_group_ids = [module.network.alb_sg_id]
  app_port_web       = var.app_port_web
  certificate_arn    = var.certificate_arn
}

module "ecs" {
  source = "../../modules/ecs"

  environment        = var.environment
  name_prefix        = local.name_prefix
  region             = var.region
  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
  security_group_ids = [module.network.ecs_tasks_sg_id]
  target_group_arn   = module.alb.target_group_arn

  repository_urls = module.ecr.repository_urls
  image_tag       = var.image_tag
  secret_arns     = module.secrets.secret_arns

  media_bucket_arn = module.storage.bucket_arn
  media_bucket_id  = module.storage.bucket_id

  app_port_web       = var.app_port_web
  app_port_inference = var.app_port_inference

  # Until the domain exists (M2-6f), the cockpit origin is the ALB itself.
  app_base_url             = var.app_base_url != "" ? var.app_base_url : "http://${module.alb.dns_name}"
  ses_sending_identity_arn = var.ses_sending_identity_arn
}

# --- outputs ---
output "alb_dns_name" {
  description = "Public hostname of the cockpit until Route53 fronts it (M2-6f)."
  value       = module.alb.dns_name
}

output "https_enabled" {
  description = "False = HTTP-only listener. Set certificate_arn before any real traffic."
  value       = module.alb.https_enabled
}

output "ecr_repository_urls" {
  description = "Push targets for the images CI builds (M2-6b) — consumed by the deploy job (M2-6d)."
  value       = module.ecr.repository_urls
}

output "ecs_cluster_name" {
  value = module.ecs.cluster_name
}

output "media_bucket" {
  value = module.storage.bucket_id
}

output "db_address" {
  value = module.rds.address
}

output "db_master_user_secret_arn" {
  description = "AWS-managed master password. Compose DIRECT_DATABASE_URL (migration role) from this."
  value       = module.rds.master_user_secret_arn
}

output "db_app_username" {
  description = "The non-superuser runtime role (RLS-subject) — DATABASE_URL uses THIS, never the master (CR-20)."
  value       = module.rds.app_username
}

output "redis_url_hint" {
  description = "Shape of REDIS_URL (rediss:// — transit encryption is on). Not a secret value."
  value       = module.redis.redis_url_hint
}

output "secret_names" {
  description = "The Secrets Manager entries to populate out-of-band before the first deploy."
  value       = module.secrets.secret_names
}

output "internal_dns" {
  value = module.ecs.internal_dns
}
