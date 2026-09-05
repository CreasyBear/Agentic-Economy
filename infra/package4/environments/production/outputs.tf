output "formance_gateway_url" {
  value = module.production_environment.formance_gateway_url
}

output "formance_ledger" {
  value = "agentic-economy-production"
}

output "cloudflare_access_secret_arn" {
  value = module.production_environment.cloudflare_access_secret_arn
}

output "k3s_instance_id" {
  value = module.production_environment.k3s_instance_id
}

output "rds_instance_arn" {
  value = module.production_environment.rds_instance_arn
}

output "alert_topic_arn" {
  value = module.production_environment.alert_topic_arn
}

output "deployment_fingerprint" {
  value = module.production_environment.deployment_fingerprint
}
