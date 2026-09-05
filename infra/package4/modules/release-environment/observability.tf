locals {
  cloudwatch_agent_namespace = "AgenticEconomy/${var.name}"
  host_log_groups = {
    system      = "/agentic-economy/${var.name}/system"
    k3s         = "/agentic-economy/${var.name}/k3s"
    cloudflared = "/agentic-economy/${var.name}/cloudflared"
  }
}

resource "aws_cloudwatch_log_group" "host" {
  for_each          = local.host_log_groups
  name              = each.value
  retention_in_days = 30
  tags              = local.tags
}

resource "aws_cloudwatch_log_group" "rds" {
  for_each          = toset(["postgresql", "upgrade"])
  name              = "/aws/rds/instance/${var.name}-formance/${each.key}"
  retention_in_days = 30
  tags              = local.tags
}

data "aws_iam_policy_document" "cloudwatch_agent" {
  statement {
    sid       = "PublishHostMetrics"
    effect    = "Allow"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = [local.cloudwatch_agent_namespace]
    }
  }

  statement {
    sid    = "WriteHostLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:DescribeLogStreams",
      "logs:PutLogEvents",
    ]
    resources = [for group in values(aws_cloudwatch_log_group.host) : "${group.arn}:*"]
  }

  statement {
    sid       = "ReadAgentConfiguration"
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = [aws_ssm_parameter.cloudwatch_agent.arn]
  }
}

resource "aws_iam_role_policy" "cloudwatch_agent" {
  name   = "package4-cloudwatch-agent"
  role   = aws_iam_role.k3s.id
  policy = data.aws_iam_policy_document.cloudwatch_agent.json
}

resource "aws_ssm_parameter" "cloudwatch_agent" {
  name        = "/agentic-economy/${var.name}/cloudwatch-agent"
  description = "Bounded host metrics and logs for ${var.name}"
  type        = "String"
  value = jsonencode({
    agent = {
      metrics_collection_interval = 60
      region                      = "ap-southeast-2"
    }
    metrics = {
      namespace              = local.cloudwatch_agent_namespace
      aggregation_dimensions = [["InstanceId"]]
      append_dimensions = {
        InstanceId = "$${aws:InstanceId}"
      }
      metrics_collected = {
        disk = {
          measurement                 = ["used_percent"]
          resources                   = ["/"]
          metrics_collection_interval = 60
          drop_original_metrics       = ["used_percent"]
        }
        mem = {
          measurement                 = ["used_percent"]
          metrics_collection_interval = 60
        }
      }
    }
    logs = {
      logs_collected = {
        files = {
          collect_list = [
            {
              file_path       = "/var/log/syslog"
              log_group_name  = aws_cloudwatch_log_group.host["system"].name
              log_stream_name = "{instance_id}/syslog"
            },
            {
              file_path       = "/var/log/containers/*_${var.name}_*.log"
              log_group_name  = aws_cloudwatch_log_group.host["k3s"].name
              log_stream_name = "{instance_id}/workloads"
            },
            {
              file_path       = "/var/log/containers/*cloudflared*_${var.name}_*.log"
              log_group_name  = aws_cloudwatch_log_group.host["cloudflared"].name
              log_stream_name = "{instance_id}/cloudflared"
            },
          ]
        }
      }
    }
  })
  tags = local.tags
}

resource "aws_ssm_association" "install_cloudwatch_agent" {
  association_name                 = "${var.name}-install-cloudwatch-agent"
  name                             = "AWS-ConfigureAWSPackage"
  wait_for_success_timeout_seconds = 600

  parameters = {
    action           = "Install"
    installationType = "In-place update"
    name             = "AmazonCloudWatchAgent"
    version          = local.pins.cloudwatch_agent
  }

  targets {
    key    = "InstanceIds"
    values = [aws_instance.k3s.id]
  }
}

resource "aws_ssm_association" "configure_cloudwatch_agent" {
  association_name                 = "${var.name}-configure-cloudwatch-agent"
  name                             = "AmazonCloudWatch-ManageAgent"
  wait_for_success_timeout_seconds = 600

  parameters = {
    action                        = "configure"
    mode                          = "ec2"
    optionalConfigurationSource   = "ssm"
    optionalConfigurationLocation = aws_ssm_parameter.cloudwatch_agent.name
    optionalRestart               = "yes"
  }

  targets {
    key    = "InstanceIds"
    values = [aws_instance.k3s.id]
  }

  depends_on = [
    aws_iam_role_policy.cloudwatch_agent,
    aws_ssm_association.install_cloudwatch_agent,
  ]
}

resource "aws_cloudwatch_metric_alarm" "instance_disk" {
  alarm_name          = "${var.name}-k3s-disk"
  alarm_description   = "Package 4 k3s root disk usage is above 80 percent."
  namespace           = local.cloudwatch_agent_namespace
  metric_name         = "disk_used_percent"
  dimensions          = { InstanceId = aws_instance.k3s.id }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 80
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "breaching"
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "instance_memory" {
  alarm_name          = "${var.name}-k3s-memory"
  alarm_description   = "Package 4 k3s memory usage is above 85 percent."
  namespace           = local.cloudwatch_agent_namespace
  metric_name         = "mem_used_percent"
  dimensions          = { InstanceId = aws_instance.k3s.id }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 85
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "breaching"
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "instance_cpu" {
  alarm_name          = "${var.name}-k3s-cpu"
  alarm_description   = "Package 4 k3s CPU is above 90 percent for 15 minutes."
  namespace           = "AWS/EC2"
  metric_name         = "CPUUtilization"
  dimensions          = { InstanceId = aws_instance.k3s.id }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  comparison_operator = "GreaterThanThreshold"
  threshold           = 90
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "breaching"
  tags                = local.tags
}

resource "aws_flow_log" "vpc" {
  count                    = var.flow_log_destination_arn == null ? 0 : 1
  log_destination          = "${var.flow_log_destination_arn}/vpc-flow/${var.name}"
  log_destination_type     = "s3"
  traffic_type             = "ALL"
  vpc_id                   = aws_vpc.this.id
  max_aggregation_interval = 60
  tags                     = local.tags
}
