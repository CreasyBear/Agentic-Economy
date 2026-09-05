output "audit_trail_arn" {
  value = aws_cloudtrail.audit.arn
}

output "production_state_bucket" {
  value = aws_s3_bucket.production_state.id
}

output "production_state_kms_key_arn" {
  value = aws_kms_key.production_state.arn
}

output "infrastructure_alert_subscription_arn" {
  value = aws_sns_topic_subscription.infrastructure_email.arn
}
