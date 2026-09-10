output "formance_gateway_url" {
  value = module.release_environment.formance_gateway_url
}

output "cloudflare_access_secret_arn" {
  value = module.release_environment.cloudflare_access_secret_arn
}

output "k3s_instance_id" {
  value = module.release_environment.k3s_instance_id
}

output "rds_instance_arn" {
  value = module.release_environment.rds_instance_arn
}

output "deployment_fingerprint" {
  value = module.release_environment.deployment_fingerprint
}

output "alert_topic_arn" {
  value = module.release_environment.alert_topic_arn
}
