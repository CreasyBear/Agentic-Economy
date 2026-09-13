resource "aws_kms_key" "primary" {
  description             = "${var.name} Package 4 data"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  tags                    = local.tags
}

resource "aws_kms_alias" "primary" {
  name          = "alias/${var.name}-package4"
  target_key_id = aws_kms_key.primary.key_id
}

resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = values(aws_subnet.database)[*].id
  tags       = local.tags
}

resource "aws_db_instance" "formance" {
  identifier = "${var.name}-formance"

  engine                        = "postgres"
  engine_version                = "16"
  instance_class                = var.database_instance_class
  allocated_storage             = 50
  max_allocated_storage         = var.database_max_allocated_storage
  storage_type                  = "gp3"
  storage_encrypted             = true
  kms_key_id                    = aws_kms_key.primary.arn
  db_name                       = "formance"
  username                      = "formance_admin"
  manage_master_user_password   = true
  master_user_secret_kms_key_id = aws_kms_key.primary.arn

  multi_az                   = true
  publicly_accessible        = false
  db_subnet_group_name       = aws_db_subnet_group.this.name
  vpc_security_group_ids     = [aws_security_group.database.id]
  backup_retention_period    = 7
  backup_window              = "15:00-15:30"
  maintenance_window         = "sun:16:00-sun:17:00"
  auto_minor_version_upgrade = false
  deletion_protection        = true
  skip_final_snapshot        = false
  final_snapshot_identifier  = "${var.name}-formance-final"
  copy_tags_to_snapshot      = true

  performance_insights_enabled          = true
  performance_insights_kms_key_id       = aws_kms_key.primary.arn
  performance_insights_retention_period = 7
  enabled_cloudwatch_logs_exports       = ["postgresql", "upgrade"]

  tags = local.tags

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [aws_cloudwatch_log_group.rds]
}

resource "aws_cloudwatch_metric_alarm" "database_storage" {
  alarm_name          = "${var.name}-rds-low-storage"
  alarm_description   = "Package 4 Formance database free storage is below 10 GiB."
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.formance.identifier }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "LessThanThreshold"
  threshold           = 10737418240
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "breaching"
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "database_connections" {
  alarm_name          = "${var.name}-rds-connections"
  alarm_description   = "Package 4 Formance database connection pressure."
  namespace           = "AWS/RDS"
  metric_name         = "DatabaseConnections"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.formance.identifier }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 100
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "breaching"
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "database_cpu" {
  alarm_name          = "${var.name}-rds-cpu"
  alarm_description   = "Package 4 Formance database CPU is above 85 percent for 15 minutes."
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.formance.identifier }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  comparison_operator = "GreaterThanThreshold"
  threshold           = 85
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "breaching"
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "database_memory" {
  alarm_name          = "${var.name}-rds-low-memory"
  alarm_description   = "Package 4 Formance database free memory is below 512 MiB."
  namespace           = "AWS/RDS"
  metric_name         = "FreeableMemory"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.formance.identifier }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "LessThanThreshold"
  threshold           = 536870912
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "breaching"
  tags                = local.tags
}
