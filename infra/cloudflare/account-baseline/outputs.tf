output "notification_policy_ids" {
  description = "Managed account-wide notification policy identifiers."
  value = {
    tunnel_health        = cloudflare_notification_policy.tunnel_health.id
    service_token_expiry = cloudflare_notification_policy.service_token_expiry.id
  }
}
