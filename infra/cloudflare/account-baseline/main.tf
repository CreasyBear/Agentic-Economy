resource "cloudflare_notification_policy" "tunnel_health" {
  account_id  = var.cloudflare_account_id
  name        = "Agentic Economy tunnel health"
  description = "Account-wide Cloudflare Tunnel health changes requiring operator attention."
  enabled     = true
  alert_type  = "tunnel_health_event"

  mechanisms = {
    email = [{ id = var.alert_email }]
  }
}

resource "cloudflare_notification_policy" "service_token_expiry" {
  account_id  = var.cloudflare_account_id
  name        = "Agentic Economy service token expiry"
  description = "Account-wide warning before a Cloudflare Access service token expires."
  enabled     = true
  alert_type  = "expiring_service_token_alert"

  mechanisms = {
    email = [{ id = var.alert_email }]
  }
}
