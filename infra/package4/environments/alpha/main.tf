# Existing ae-alpha Formance infrastructure, retained as production authority.
# Bind this root only to its verified existing state. Resource names and addresses
# remain historical; this root does not authorize a second permanent stack.
# Source reconciliation is not permission to replace the financial host.
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
  description = "Historical gate name retained for state continuity. Acknowledge only a reviewed plan against the verified existing ae-alpha footprint; no second stack or financial authority expansion."
  type        = bool
  default     = false
}

resource "terraform_data" "alpha_sandbox_gate" {
  input = var.alpha_sandbox_acknowledged

  lifecycle {
    precondition {
      condition     = var.alpha_sandbox_acknowledged
      error_message = "Existing alpha infrastructure is locked. Explicitly acknowledge the reviewed saved plan against verified existing state; this does not authorize another stack, host replacement or financial authority expansion."
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

  # Keep the initial 50 GiB fixed for the alpha budget. The existing <10 GiB
  # free-space alarm prompts a reviewed capacity increase before storage fills.
  database_max_allocated_storage = 0

  depends_on = [terraform_data.alpha_sandbox_gate]
}

output "formance_gateway_url" {
  value = module.alpha_environment.formance_gateway_url
}

output "formance_ledger" {
  description = "Current production application ledger on the retained footprint. Verify live authority before using this descriptive output."
  value       = "agentic-economy-production"
}

output "application_binding" {
  description = "Descriptive non-secret binding for the current production app. Do not rebind consumers from an infrastructure output; fresh live verification and readiness remain required."
  value = {
    AE_DEPLOYMENT_ENVIRONMENT = "production"
    AE_FORMANCE_ENVIRONMENT   = "production"
    AE_FORMANCE_GATEWAY_URL   = module.alpha_environment.formance_gateway_url
    AE_FORMANCE_LEDGER        = "agentic-economy-production"
  }
}

output "cloudflare_access_secret_arn" {
  description = "Existing footprint credentials in Secrets Manager. Resolve current generation before any authorized consumer binding; never record values in source."
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
