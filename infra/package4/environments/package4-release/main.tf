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
  cloudflare_access_secret_version             = var.cloudflare_access_secret_version
  previous_cloudflare_access_secret_expires_at = var.previous_cloudflare_access_secret_expires_at
}
