output "state_bucket" {
  description = "Use this as the backend 'bucket' in ../envs/prod/backend.tf."
  value       = aws_s3_bucket.state.id
}

output "lock_table" {
  description = "Use this as the backend 'dynamodb_table' in ../envs/prod/backend.tf."
  value       = aws_dynamodb_table.lock.name
}
