terraform {
  required_version = "= 1.12.6"

  backend "s3" {}

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "= 6.57.1"
    }
  }
}

provider "aws" {
  region              = "ap-southeast-2"
  allowed_account_ids = ["197716152388"]

  default_tags {
    tags = {
      Application = "agentic-economy"
      Environment = "account-baseline"
      ManagedBy   = "opentofu"
    }
  }
}
