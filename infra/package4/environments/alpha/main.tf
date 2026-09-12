# Independent Formance infrastructure for the hosted waitlist alpha: sandbox money
# only. This root shares the existing module and account audit sink, but creates
# its own VPC, database, stack, credentials, hostname and state. It does not unlock
# the production foundation or reuse the legacy Package 4 fixture.
terraform {
  required_version = "= 1.12.6"

  backend "s3" {}

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "= 6.57.1"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "= 5.24.0"
    }
  }
}

provider "aws" {
  region              = "ap-southeast-2"
  allowed_account_ids = ["197716152388"]

  default_tags {
    tags = {
      Application = "agentic-economy"
      Environment = "ae-alpha"
      ManagedBy   = "opentofu"
    }
  }
}

provider "aws" {
  alias               = "dr"
  region              = "ap-southeast-4"
  allowed_account_ids = ["197716152388"]

  default_tags {
    tags = {
      Application = "agentic-economy"
      Environment = "ae-alpha"
      ManagedBy   = "opentofu"
    }
  }
}

provider "cloudflare" {}

variable "cloudflare_account_id" {
  type      = string
  sensitive = true
}

variable "cloudflare_zone_id" {
  type      = string
  sensitive = true
}

variable "source_revision" {
  type = string

  validation {
    condition     = can(regex("^[0-9a-f]{40}$", var.source_revision))
    error_message = "source_revision must be a full Git commit SHA."
  }
}

variable "alpha_sandbox_acknowledged" {
  description = "Explicit acknowledgment for this reviewed saved plan: independent hosted waitlist alpha with sandbox money only; no production readiness or custody authorization."
  type        = bool
  default     = false
}

resource "terraform_data" "alpha_sandbox_gate" {
  input = var.alpha_sandbox_acknowledged

  lifecycle {
    precondition {
      condition     = var.alpha_sandbox_acknowledged
      error_message = "Alpha is locked. Explicitly acknowledge the independent sandbox-only waitlist alpha for this reviewed saved plan; this does not satisfy or bypass production foundation gates."
    }
  }
}

module "alpha_environment" {
  source = "../../modules/release-environment"

  providers = {
    aws        = aws
    aws.dr     = aws.dr
    cloudflare = cloudflare
  }

  name = "ae-alpha"
  # Checked-in release uses 10.42/16 and production reserves 10.43/16.
  # Verify live account/connected-network overlap before preparing a saved plan.
  vpc_cidr                 = "10.44.0.0/16"
  cloudflare_account_id    = var.cloudflare_account_id
  cloudflare_zone_id       = var.cloudflare_zone_id
  formance_hostname        = "formance-alpha.aecon.ai"
  source_revision          = var.source_revision
  instance_type            = "t4g.large"
  database_instance_class  = "db.t4g.medium"
  alert_email              = "joel@agentic-economy.ai"
  flow_log_destination_arn = "arn:aws:s3:::agentic-economy-audit-197716152388-ap-southeast-2"

  depends_on = [terraform_data.alpha_sandbox_gate]
}

output "formance_gateway_url" {
  value = module.alpha_environment.formance_gateway_url
}

output "formance_ledger" {
  description = "Dedicated application ledger name; initialize and verify its schema separately after infrastructure deployment."
  value       = "agentic-economy-alpha"
}

output "application_binding" {
  description = "Non-secret binding for the current hosted app. Provision and verify the ledger and supply fresh Access credentials before configuring the app; this output is not a readiness verdict."
  value = {
    AE_SERVICE_MODE         = "hosted_alpha"
    AE_FORMANCE_ENVIRONMENT = "sandbox"
    AE_FORMANCE_GATEWAY_URL = module.alpha_environment.formance_gateway_url
    AE_FORMANCE_LEDGER      = "agentic-economy-alpha"
  }
}

output "cloudflare_access_secret_arn" {
  description = "Fresh alpha credentials in Secrets Manager; bind their fields to AE_FORMANCE_ACCESS_CLIENT_ID and AE_FORMANCE_ACCESS_CLIENT_SECRET without recording their values in source."
  value       = module.alpha_environment.cloudflare_access_secret_arn
}

output "k3s_instance_id" {
  value = module.alpha_environment.k3s_instance_id
}

output "rds_instance_arn" {
  value = module.alpha_environment.rds_instance_arn
}

output "alert_topic_arn" {
  value = module.alpha_environment.alert_topic_arn
}

output "deployment_fingerprint" {
  description = "Inherited module configuration hash only. Fixed labels inside this hash do not prove an alpha restore rehearsal, daily close, or production readiness."
  value       = module.alpha_environment.deployment_fingerprint
}
