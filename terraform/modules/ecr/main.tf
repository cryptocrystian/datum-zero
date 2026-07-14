#
# M2-6c / CR-37 — ECR repositories for the three images built + validated in CI (M2-6b): web,
# inference, workers. Images carry NO secrets and NO DJI SDK (guardrail-enforced, DJI EULA §14).
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

variable "repositories" {
  type        = list(string)
  description = "Image names to host."
  default     = ["web", "inference", "workers"]
}

variable "keep_last_images" {
  type        = number
  description = "Untagged/old images beyond this are expired (cost control)."
  default     = 20
}

locals {
  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "datum-zero"
  }
}

# --- repositories ---
resource "aws_ecr_repository" "this" {
  for_each             = toset(var.repositories)
  name                 = "${var.name_prefix}/${each.value}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true # surface CVEs in the base images
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = merge(local.tags, { Name = "${var.name_prefix}-${each.value}" })
}

resource "aws_ecr_lifecycle_policy" "this" {
  for_each   = aws_ecr_repository.this
  repository = each.value.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Expire all but the most recent ${var.keep_last_images} images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = var.keep_last_images
      }
      action = { type = "expire" }
    }]
  })
}

# --- outputs ---
output "repository_urls" {
  description = "Map of image name to repository URL (the CI/CD push target — M2-6d)."
  value       = { for k, v in aws_ecr_repository.this : k => v.repository_url }
}

output "repository_arns" {
  value = { for k, v in aws_ecr_repository.this : k => v.arn }
}
