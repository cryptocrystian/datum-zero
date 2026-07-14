#
# Remote state. The bucket + lock table are created ONCE by terraform/bootstrap (local state, by
# necessity — it creates the backend this config stores state in).
#
# Values are supplied at init time so no account-specific name is committed:
#
#   terraform init \
#     -backend-config="bucket=<state bucket from bootstrap>" \
#     -backend-config="key=prod/terraform.tfstate" \
#     -backend-config="region=us-east-1" \
#     -backend-config="dynamodb_table=<lock table from bootstrap>"
#
# CI validates with `terraform init -backend=false`, which skips this block entirely — that is why
# the lint job needs no credentials and no state.
#
# NOTE: state is sensitive. RDS uses AWS-managed master passwords and the secrets module declares
# containers only, so no secret VALUE reaches state — but resource identifiers still do. The bucket
# is private, versioned, and encrypted (see terraform/bootstrap).
#
terraform {
  backend "s3" {
    encrypt = true
  }
}
