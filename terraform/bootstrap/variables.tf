variable "region" {
  description = "AWS region for the state backend (keep it the same as the main config)."
  type        = string
  default     = "us-east-1"
}

variable "state_bucket_name" {
  description = "Globally-unique S3 bucket name for Terraform remote state (e.g. datum-zero-tfstate-<acct>)."
  type        = string

  validation {
    condition     = length(var.state_bucket_name) > 2
    error_message = "state_bucket_name must be a real, globally-unique bucket name."
  }
}

variable "lock_table_name" {
  description = "DynamoDB table name for Terraform state locking."
  type        = string
  default     = "datum-zero-tf-lock"
}
