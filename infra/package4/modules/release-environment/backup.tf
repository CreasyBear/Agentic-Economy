resource "aws_kms_key" "dr" {
  provider                = aws.dr
  description             = "${var.name} Package 4 regional backup copy"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  tags                    = local.tags
}

resource "aws_backup_vault" "primary" {
  name        = "${var.name}-package4-primary"
  kms_key_arn = aws_kms_key.primary.arn
  tags        = local.tags
}

resource "aws_backup_vault" "dr" {
  provider    = aws.dr
  name        = "${var.name}-package4-dr"
  kms_key_arn = aws_kms_key.dr.arn
  tags        = local.tags
}

resource "aws_iam_role" "backup" {
  name = "${var.name}-package4-backup"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "backup.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "backup" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

resource "aws_backup_plan" "formance" {
  name = "${var.name}-package4"

  rule {
    rule_name         = "nightly-regional-copy"
    target_vault_name = aws_backup_vault.primary.name
    schedule          = "cron(0 16 * * ? *)"

    lifecycle {
      delete_after = 7
    }

    copy_action {
      destination_vault_arn = aws_backup_vault.dr.arn
      lifecycle {
        delete_after = 7
      }
    }
  }

  tags = local.tags
}

resource "aws_backup_selection" "formance" {
  name         = "${var.name}-package4-rds"
  iam_role_arn = aws_iam_role.backup.arn
  plan_id      = aws_backup_plan.formance.id
  resources    = [aws_db_instance.formance.arn]
}

resource "aws_cloudwatch_event_rule" "backup_failure" {
  name        = "${var.name}-package4-backup-failure"
  description = "Package 4 backup or copy did not complete."
  event_pattern = jsonencode({
    source      = ["aws.backup"]
    detail-type = ["Backup Job State Change", "Copy Job State Change"]
    detail = {
      state = ["FAILED", "ABORTED", "EXPIRED"]
    }
  })
  tags = local.tags
}

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "alerts_key" {
  # In a KMS key policy, Resource "*" refers only to the attached key.
  statement {
    sid       = "EnableAccountAdministration"
    effect    = "Allow"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  statement {
    sid       = "AllowCloudWatchAlerts"
    effect    = "Allow"
    actions   = ["kms:GenerateDataKey*", "kms:Decrypt"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:cloudwatch:ap-southeast-2:${data.aws_caller_identity.current.account_id}:alarm:${var.name}-*"]
    }
  }

  # EventBridge-to-SNS does not support SourceAccount/SourceArn/SourceOrgID
  # KMS conditions. Confine this service grant to a dedicated alerts key.
  # https://docs.aws.amazon.com/sns/latest/dg/sns-key-management.html
  statement {
    sid       = "AllowEventBridgeAlerts"
    effect    = "Allow"
    actions   = ["kms:GenerateDataKey*", "kms:Decrypt"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
  }
}

resource "aws_kms_key" "alerts" {
  description             = "${var.name} infrastructure alert encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.alerts_key.json
  tags                    = local.tags
}

resource "aws_sns_topic" "alerts" {
  name              = "${var.name}-package4-alerts"
  kms_master_key_id = aws_kms_key.alerts.arn
  tags              = local.tags
}

resource "aws_sns_topic_subscription" "alerts_email" {
  for_each  = var.alert_email == null ? toset([]) : toset([var.alert_email])
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

data "aws_iam_policy_document" "alerts" {
  statement {
    sid       = "AllowEventBridgePublish"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
    # Follow EventBridge's supported SNS resource-policy statement: the exact
    # topic and service principal bound this grant; omit Condition blocks.
    # https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-use-resource-based.html
  }

  statement {
    sid       = "AllowCloudWatchPublish"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]
    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:cloudwatch:ap-southeast-2:${data.aws_caller_identity.current.account_id}:alarm:${var.name}-*"]
    }
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts.json
}

resource "aws_cloudwatch_event_target" "backup_failure" {
  rule      = aws_cloudwatch_event_rule.backup_failure.name
  target_id = "notify"
  arn       = aws_sns_topic.alerts.arn

  depends_on = [aws_sns_topic_policy.alerts]
}
