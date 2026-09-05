output "drill_identifier" {
  value = aws_db_instance.drill.identifier
}

output "drill_endpoint" {
  value = aws_db_instance.drill.address
}

output "drill_secret_arn" {
  value     = aws_db_instance.drill.master_user_secret[0].secret_arn
  sensitive = true
}

output "source_database_identifier" {
  value = data.aws_db_instance.source.db_instance_identifier
}

output "source_k3s_instance_role" {
  value = data.aws_iam_role.k3s.name
}
