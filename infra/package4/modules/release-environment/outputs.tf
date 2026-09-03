output "formance_gateway_url" {
  value = "https://${var.formance_hostname}"
}

output "cloudflare_access_secret_arn" {
  value = aws_secretsmanager_secret.cloudflare_access.arn
}

output "cloudflare_tunnel_id" {
  value = cloudflare_zero_trust_tunnel_cloudflared.formance.id
}

output "k3s_instance_id" {
  value = aws_instance.k3s.id
}

output "rds_instance_arn" {
  value = aws_db_instance.formance.arn
}

output "alert_topic_arn" {
  value = aws_sns_topic.alerts.arn
}

output "deployment_fingerprint" {
  value = sha256(jsonencode({
    name           = var.name
    sourceRevision = var.source_revision
    formanceHost   = var.formance_hostname
    stack          = local.stack_name
    pins           = local.pins
    rpoMinutes     = 5
    rtoMinutes     = 60
    backupControl  = "postgres_pitr"
    restoreControl = "production_rehearsed"
    dailyClose     = "human_signed"
  }))
}
