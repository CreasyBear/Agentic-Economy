data "aws_ssm_parameter" "ubuntu_arm64" {
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id"
}

resource "aws_iam_role" "k3s" {
  name = "${var.name}-package4-k3s"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.k3s.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "runtime_secrets" {
  name = "package4-runtime-secrets"
  role = aws_iam_role.k3s.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue",
      ]
      Resource = [
        aws_secretsmanager_secret.cloudflare_tunnel.arn,
        aws_db_instance.formance.master_user_secret[0].secret_arn,
      ]
      }, {
      Effect = "Allow"
      Action = [
        "kms:Decrypt",
      ]
      Resource = [aws_kms_key.primary.arn]
    }]
  })
}

resource "aws_iam_instance_profile" "k3s" {
  name = "${var.name}-package4-k3s"
  role = aws_iam_role.k3s.name
}

resource "aws_instance" "k3s" {
  ami                         = data.aws_ssm_parameter.ubuntu_arm64.value
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.app["a"].id
  associate_public_ip_address = false
  vpc_security_group_ids      = [aws_security_group.k3s.id]
  iam_instance_profile        = aws_iam_instance_profile.k3s.name
  user_data_replace_on_change = true
  user_data = templatefile("${path.module}/templates/bootstrap.sh.tftpl", {
    aws_region                   = "ap-southeast-2"
    stack_name                   = local.stack_name
    k3s_version                  = local.pins.k3s_version
    k3s_install_script_url       = local.pins.k3s_install_script_url
    k3s_install_script_sha       = local.pins.k3s_install_script_sha
    operator_chart_version       = local.pins.operator_chart_version
    operator_image               = local.pins.operator_image
    operator_utils_version       = local.pins.operator_utils_version
    ledger_version               = local.pins.ledger_version
    gateway_version              = local.pins.gateway_version
    caddy_image                  = local.pins.caddy_image
    cloudflared_image            = local.pins.cloudflared_image
    cloudflare_tunnel_secret_arn = aws_secretsmanager_secret.cloudflare_tunnel.arn
    rds_secret_arn               = aws_db_instance.formance.master_user_secret[0].secret_arn
    rds_endpoint                 = aws_db_instance.formance.address
    source_revision              = var.source_revision
  })

  root_block_device {
    encrypted   = true
    kms_key_id  = aws_kms_key.primary.arn
    volume_size = 40
    volume_type = "gp3"
  }

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  tags = merge(local.tags, { Name = "${var.name}-package4-k3s" })

  depends_on = [
    aws_iam_role_policy.runtime_secrets,
    aws_secretsmanager_secret_version.cloudflare_tunnel,
  ]
}

resource "aws_cloudwatch_metric_alarm" "instance_status" {
  alarm_name          = "${var.name}-k3s-status"
  alarm_description   = "Package 4 k3s host failed an EC2 status check."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed"
  dimensions          = { InstanceId = aws_instance.k3s.id }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "breaching"
  tags                = local.tags
}
