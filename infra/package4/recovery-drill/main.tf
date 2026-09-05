locals {
  drill_identifier = "${var.source_environment}-restore-${var.drill_date}"
  tags = {
    DrillIdentifier = local.drill_identifier
    SourceRevision  = var.source_revision
  }
}

data "aws_db_instance" "source" {
  db_instance_identifier = "${var.source_environment}-formance"
}

data "aws_vpc" "source" {
  filter {
    name   = "tag:Name"
    values = [var.source_environment]
  }
}

data "aws_security_group" "k3s" {
  vpc_id = data.aws_vpc.source.id

  filter {
    name   = "group-name"
    values = ["${var.source_environment}-k3s-*"]
  }
}

data "aws_iam_role" "k3s" {
  name = "${var.source_environment}-package4-k3s"
}

resource "aws_security_group" "database" {
  name_prefix = "${local.drill_identifier}-database-"
  description = "Recovery drill PostgreSQL access from the private k3s host only"
  vpc_id      = data.aws_vpc.source.id
  tags        = local.tags
}

resource "aws_vpc_security_group_ingress_rule" "database_from_k3s" {
  security_group_id            = aws_security_group.database.id
  description                  = "Recovery drill PostgreSQL from the private k3s host"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = data.aws_security_group.k3s.id
}

resource "aws_vpc_security_group_egress_rule" "k3s_to_database" {
  security_group_id            = data.aws_security_group.k3s.id
  description                  = "Temporary access to the isolated recovery drill database"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.database.id
}

resource "aws_cloudwatch_log_group" "postgresql" {
  name              = "/aws/rds/instance/${local.drill_identifier}/postgresql"
  retention_in_days = 7
  tags              = local.tags
}

resource "aws_db_instance" "drill" {
  identifier = local.drill_identifier

  restore_to_point_in_time {
    source_db_instance_identifier = data.aws_db_instance.source.db_instance_identifier
    use_latest_restorable_time    = true
  }

  instance_class                  = "db.t4g.medium"
  db_subnet_group_name            = data.aws_db_instance.source.db_subnet_group
  vpc_security_group_ids          = [aws_security_group.database.id]
  publicly_accessible             = false
  multi_az                        = false
  storage_encrypted               = true
  kms_key_id                      = data.aws_db_instance.source.kms_key_id
  manage_master_user_password     = true
  master_user_secret_kms_key_id   = data.aws_db_instance.source.kms_key_id
  backup_retention_period         = 0
  deletion_protection             = false
  skip_final_snapshot             = true
  apply_immediately               = true
  auto_minor_version_upgrade      = false
  enabled_cloudwatch_logs_exports = ["postgresql"]
  copy_tags_to_snapshot           = false
  performance_insights_enabled    = false
  monitoring_interval             = 0

  tags = local.tags

  depends_on = [aws_cloudwatch_log_group.postgresql]
}

data "aws_iam_policy_document" "drill_secret" {
  statement {
    sid    = "ReadRecoveryDrillDatabaseSecret"
    effect = "Allow"
    actions = [
      "secretsmanager:DescribeSecret",
      "secretsmanager:GetSecretValue",
    ]
    resources = [aws_db_instance.drill.master_user_secret[0].secret_arn]
  }

  statement {
    sid       = "DecryptRecoveryDrillDatabaseSecret"
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = [data.aws_db_instance.source.kms_key_id]
  }
}

resource "aws_iam_role_policy" "drill_secret" {
  name   = "${local.drill_identifier}-secret"
  role   = data.aws_iam_role.k3s.name
  policy = data.aws_iam_policy_document.drill_secret.json
}
