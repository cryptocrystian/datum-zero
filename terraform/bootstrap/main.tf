#
# M2-6c / CR-37 — Terraform state backend bootstrap. AUTHOR-ONLY: this is NOT applied by CI or by
# Claude Code. The USER applies it ONCE, by hand, before the main config in ../envs/prod.
#
# Chicken-and-egg: the main config stores state in S3 with a DynamoDB lock, but those must exist
# first. So this tiny config uses LOCAL state and creates ONLY those two resources.
#
#   cd terraform/bootstrap
#   terraform init
#   terraform apply -var="state_bucket_name=<globally-unique-name>"
#
# Commit the resulting bucket/table names into ../envs/prod/backend.tf. See docs/DEPLOY.md.
#
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
  # Local state ON PURPOSE — this config creates the remote backend everything else uses.
}

provider "aws" {
  region = var.region
}

# --- Remote state bucket: versioned (recover a clobbered state), encrypted, never public ---
resource "aws_s3_bucket" "state" {
  bucket = var.state_bucket_name

  # State is the source of truth for the whole estate — do not let a stray destroy remove it.
  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name      = var.state_bucket_name
    ManagedBy = "terraform"
    Purpose   = "terraform-remote-state"
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# --- State lock table: prevents two applies racing the same state ---
resource "aws_dynamodb_table" "lock" {
  name         = var.lock_table_name
  billing_mode = "PAY_PER_REQUEST" # no idle cost
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = {
    Name      = var.lock_table_name
    ManagedBy = "terraform"
    Purpose   = "terraform-state-lock"
  }
}
