module "release_environment" {
  source = "../../modules/release-environment"

  providers = {
    aws        = aws
    aws.dr     = aws.dr
    cloudflare = cloudflare
  }

  name                                         = "package4-release"
  cloudflare_account_id                        = var.cloudflare_account_id
  cloudflare_zone_id                           = var.cloudflare_zone_id
  formance_hostname                            = var.formance_hostname
  source_revision                              = var.source_revision
  flow_log_destination_arn                     = "arn:aws:s3:::agentic-economy-audit-197716152388-ap-southeast-2"
  cloudflare_access_secret_version             = var.cloudflare_access_secret_version
  previous_cloudflare_access_secret_expires_at = var.previous_cloudflare_access_secret_expires_at
  cloudflare_tunnel_token_override             = var.cloudflare_tunnel_token_override
}

import {
  to = module.release_environment.aws_cloudwatch_log_group.rds["postgresql"]
  id = "/aws/rds/instance/package4-release-formance/postgresql"
}
