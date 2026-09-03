locals {
  tags = {
    Application    = "agentic-economy"
    Environment    = var.name
    ManagedBy      = "opentofu"
    Package        = "4"
    SourceRevision = var.source_revision
  }

  availability_zones = ["ap-southeast-2a", "ap-southeast-2b"]
  public_subnets = {
    a = { cidr = cidrsubnet(var.vpc_cidr, 4, 0), az = local.availability_zones[0] }
    b = { cidr = cidrsubnet(var.vpc_cidr, 4, 1), az = local.availability_zones[1] }
  }
  app_subnets = {
    a = { cidr = cidrsubnet(var.vpc_cidr, 4, 4), az = local.availability_zones[0] }
    b = { cidr = cidrsubnet(var.vpc_cidr, 4, 5), az = local.availability_zones[1] }
  }
  database_subnets = {
    a = { cidr = cidrsubnet(var.vpc_cidr, 4, 8), az = local.availability_zones[0] }
    b = { cidr = cidrsubnet(var.vpc_cidr, 4, 9), az = local.availability_zones[1] }
  }

  stack_name = var.name
  pins = {
    k3s_version            = "v1.33.12+k3s1"
    k3s_install_script_url = "https://raw.githubusercontent.com/k3s-io/k3s/v1.33.12%2Bk3s1/install.sh"
    k3s_install_script_sha = "9ca7930c31179d83bc13de20078fd8ad3e1ee00875b31f39a7e524ca4ef7d9de"
    operator_chart_version = "3.9.6"
    operator_image         = "ghcr.io/formancehq/operator@sha256:3781ee4dd554c3933b2bc972732de4d5b37db6afebb7612616d00800dfcab418"
    operator_utils_version = "v3.9.6@sha256:0dbba5d4314bdadee67a6cc7f587de821d99053de75c4ee140273e0d5fb19a42"
    ledger_version         = "v2.4.12@sha256:4d72bd5cbf0a83a0cce9b37ea96a376ba33197517e40b97d16c43c36753727df"
    gateway_version        = "v2.3.1@sha256:239926753312410ee9a602aa0bffe1e5c89cd340540a98a6df58694f3d6e4165"
    caddy_image            = "docker.io/library/caddy:2.7.6-alpine@sha256:2e1d4592f1718bb47645da5a83a846fe19094f18e6c921fdf56d174f05c63213"
    cloudflared_image      = "cloudflare/cloudflared:2026.7.2@sha256:4f6655284ab3d252b7f28fedb19fe6c8fc82ee5b1295c20ac74d475e5398a52d"
  }
}
