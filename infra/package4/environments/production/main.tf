resource "terraform_data" "foundation_gate" {
  input = var.foundation_gates_passed

  lifecycle {
    precondition {
      condition     = var.foundation_gates_passed
      error_message = "Production is locked. Record passing alert, cost, audit, recovery and drift evidence before setting foundation_gates_passed=true for this reviewed plan."
    }
  }
}

module "production_environment" {
  source = "../../modules/release-environment"

  providers = {
    aws        = aws
    aws.dr     = aws.dr
    cloudflare = cloudflare
  }

  name                     = "ae-production"
  vpc_cidr                 = "10.43.0.0/16"
  cloudflare_account_id    = var.cloudflare_account_id
  cloudflare_zone_id       = var.cloudflare_zone_id
  formance_hostname        = "formance.aecon.ai"
  source_revision          = var.source_revision
  instance_type            = "t4g.large"
  database_instance_class  = "db.t4g.medium"
  alert_email              = "joel@agentic-economy.ai"
  flow_log_destination_arn = "arn:aws:s3:::agentic-economy-audit-197716152388-ap-southeast-2"

  depends_on = [terraform_data.foundation_gate]
}
