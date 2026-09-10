terraform {
  required_version = "= 1.12.6"

  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "= 6.57.1"
      configuration_aliases = [aws.dr]
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "= 5.24.0"
    }
  }
}
