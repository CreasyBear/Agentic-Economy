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
      Environment = "package4-release"
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
      Environment = "package4-release"
      ManagedBy   = "opentofu"
    }
  }
}

provider "cloudflare" {}
