variable "environment" {
  type        = string
  description = "Environment name. Drives every resource name, so a second environment is additive."
  default     = "prod"
}

variable "region" {
  type        = string
  description = "AWS region."
  default     = "us-east-1"
}

variable "azs" {
  type        = list(string)
  description = "Availability zones. Two minimum — the ALB and the RDS subnet group both require it."
  default     = ["us-east-1a", "us-east-1b"]

  validation {
    condition     = length(var.azs) >= 2
    error_message = "At least two availability zones are required (ALB + RDS subnet group)."
  }
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR for the VPC."
  default     = "10.20.0.0/16"
}

variable "media_bucket_name" {
  type        = string
  description = "Globally-unique S3 bucket for media/artifacts. Required — no default can be globally unique."

  validation {
    condition     = length(var.media_bucket_name) >= 3 && length(var.media_bucket_name) <= 63
    error_message = "S3 bucket names must be 3-63 characters."
  }
}

variable "app_port_web" {
  type        = number
  description = "Container port the web service listens on."
  default     = 3000
}

variable "app_port_inference" {
  type        = number
  description = "Container port the inference service listens on."
  default     = 8000
}

variable "app_base_url" {
  type        = string
  description = "Public origin of the cockpit. Empty = fall back to the ALB hostname until M2-6f."
  default     = ""
}

variable "certificate_arn" {
  type        = string
  description = "ACM certificate ARN for the HTTPS listener. Empty = HTTP-only; set before real traffic."
  default     = ""
}

variable "image_tag" {
  type        = string
  description = "Image tag the services run. M2-6d moves this to a deploy-time input."
  default     = "latest"
}

variable "db_master_username" {
  type        = string
  description = "Elevated role used ONLY by prisma migrate deploy (Prisma directUrl)."
  default     = "datumzero_migrator"
}

variable "db_app_username" {
  type        = string
  description = "Non-superuser runtime role (RLS-subject), created by the m1_02_rls migration."
  default     = "datumzero_app"
}

variable "db_instance_class" {
  type        = string
  description = "RDS instance class."
  default     = "db.t4g.micro"
}

variable "db_multi_az" {
  type        = bool
  description = "Multi-AZ failover. Turn on before real tenant data lands."
  default     = false
}

variable "redis_node_type" {
  type        = string
  description = "ElastiCache node type."
  default     = "cache.t4g.micro"
}

variable "ses_sending_identity_arn" {
  type        = string
  description = "Verified SES identity ARN for magic-link mail. Empty = no ses:SendEmail grant (M2-6f)."
  default     = ""
}
