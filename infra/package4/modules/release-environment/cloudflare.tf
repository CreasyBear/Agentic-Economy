resource "cloudflare_zero_trust_tunnel_cloudflared" "formance" {
  account_id = var.cloudflare_account_id
  name       = "${var.name}-formance"
  config_src = "cloudflare"
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "formance" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.formance.id
  source     = "cloudflare"
  config = {
    ingress = [
      {
        hostname = var.formance_hostname
        service  = "http://gateway.${local.stack_name}.svc.cluster.local:8080"
      },
      {
        service = "http_status:404"
      },
    ]
  }
}

data "cloudflare_zero_trust_tunnel_cloudflared_token" "formance" {
  count      = var.cloudflare_tunnel_token_override == null ? 1 : 0
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.formance.id
}

resource "cloudflare_dns_record" "formance" {
  zone_id = var.cloudflare_zone_id
  name    = var.formance_hostname
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.formance.id}.cfargotunnel.com"
  proxied = true
  ttl     = 1
}

resource "cloudflare_zero_trust_access_service_token" "application" {
  account_id                        = var.cloudflare_account_id
  name                              = "${var.name}-formance-application"
  duration                          = "8760h"
  enabled                           = true
  client_secret_version             = var.cloudflare_access_secret_version
  previous_client_secret_expires_at = var.previous_cloudflare_access_secret_expires_at

  lifecycle {
    precondition {
      condition = (
        var.cloudflare_access_secret_version == null
        && var.previous_cloudflare_access_secret_expires_at == null
        ) || (
        var.cloudflare_access_secret_version != null
        && var.previous_cloudflare_access_secret_expires_at != null
      )
      error_message = "Access secret version and previous-secret expiry must be changed together."
    }
  }
}

resource "cloudflare_zero_trust_access_policy" "application" {
  account_id       = var.cloudflare_account_id
  name             = "${var.name}-formance-service-token-only"
  decision         = "non_identity"
  session_duration = "24h"
  include = [{
    service_token = {
      token_id = cloudflare_zero_trust_access_service_token.application.id
    }
  }]
}

resource "cloudflare_zero_trust_access_application" "formance" {
  account_id                = var.cloudflare_account_id
  name                      = "${var.name} Formance Gateway"
  domain                    = var.formance_hostname
  type                      = "self_hosted"
  app_launcher_visible      = false
  service_auth_401_redirect = true
  destinations = [{
    type = "public"
    uri  = var.formance_hostname
  }]
  policies = [{
    id         = cloudflare_zero_trust_access_policy.application.id
    precedence = 1
  }]
}

resource "aws_secretsmanager_secret" "cloudflare_tunnel" {
  name                    = "${var.name}/package4/cloudflare-tunnel-token"
  kms_key_id              = aws_kms_key.primary.arn
  recovery_window_in_days = 30
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "cloudflare_tunnel" {
  secret_id     = aws_secretsmanager_secret.cloudflare_tunnel.id
  secret_string = var.cloudflare_tunnel_token_override != null ? var.cloudflare_tunnel_token_override : data.cloudflare_zero_trust_tunnel_cloudflared_token.formance[0].token
}

resource "aws_secretsmanager_secret" "cloudflare_access" {
  name                    = "${var.name}/package4/cloudflare-access-application"
  kms_key_id              = aws_kms_key.primary.arn
  recovery_window_in_days = 30
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "cloudflare_access" {
  secret_id = aws_secretsmanager_secret.cloudflare_access.id
  secret_string = jsonencode({
    client_id     = cloudflare_zero_trust_access_service_token.application.client_id
    client_secret = cloudflare_zero_trust_access_service_token.application.client_secret
  })
}
