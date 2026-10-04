resource "aws_s3_bucket" "financial_evidence" {
  bucket              = "agentic-economy-financial-evidence-${local.account_id}-ap-southeast-2"
  object_lock_enabled = true
  tags                = local.tags
}

resource "aws_s3_bucket_public_access_block" "financial_evidence" {
  bucket                  = aws_s3_bucket.financial_evidence.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "financial_evidence" {
  bucket = aws_s3_bucket.financial_evidence.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "financial_evidence" {
  bucket = aws_s3_bucket.financial_evidence.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "financial_evidence" {
  bucket = aws_s3_bucket.financial_evidence.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_object_lock_configuration" "financial_evidence" {
  bucket = aws_s3_bucket.financial_evidence.id
  rule {
    default_retention {
      mode = "GOVERNANCE"
      days = 2557
    }
  }
  depends_on = [aws_s3_bucket_versioning.financial_evidence]
}

data "aws_iam_policy_document" "financial_evidence_bucket" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.financial_evidence.arn, "${aws_s3_bucket.financial_evidence.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  # No routine principal may bypass governance retention. A later exceptional
  # human action requires a separately reviewed policy/IAM change and audit.
  statement {
    sid       = "DenyGovernanceBypassForFinancialEvidence"
    effect    = "Deny"
    actions   = ["s3:BypassGovernanceRetention"]
    resources = ["${aws_s3_bucket.financial_evidence.arn}/financial/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
  }
}

resource "aws_s3_bucket_policy" "financial_evidence" {
  bucket = aws_s3_bucket.financial_evidence.id
  policy = data.aws_iam_policy_document.financial_evidence_bucket.json
}
