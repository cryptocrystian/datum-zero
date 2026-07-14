#
# M2-6c / CR-37 — S3 media/artifacts bucket (the StoragePort target, MANIFEST §3): raw radiometric
# captures (source of record) + rendered crops. Never public; encrypted at rest.
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

variable "bucket_name" {
  type        = string
  description = "Globally-unique bucket name for media/artifacts."
}

variable "cold_transition_days" {
  type        = number
  description = "Days before raw masters move to Glacier IR (MANIFEST: cold masters). 0 disables."
  default     = 2
}

locals {
  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "datum-zero"
  }
}

resource "aws_s3_bucket" "media" {
  bucket = var.bucket_name
  tags   = merge(local.tags, { Name = var.bucket_name, Purpose = "media-artifacts" })
}

# The raw capture is the source of record for every measurement (CR-22) — keep versions.
resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  count  = var.cold_transition_days > 0 ? 1 : 0
  bucket = aws_s3_bucket.media.id

  rule {
    id     = "raw-masters-to-cold"
    status = "Enabled"

    filter {
      prefix = "raw/"
    }

    transition {
      days          = var.cold_transition_days
      storage_class = "GLACIER_IR" # retrievable for audit readback without a restore job
    }
  }
}

# --- outputs ---
output "bucket_id" {
  value = aws_s3_bucket.media.id
}

output "bucket_arn" {
  value = aws_s3_bucket.media.arn
}
