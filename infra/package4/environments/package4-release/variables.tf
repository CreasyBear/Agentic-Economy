variable "cloudflare_account_id" {
  type      = string
  sensitive = true
}

variable "cloudflare_zone_id" {
  type      = string
  sensitive = true
}

variable "formance_hostname" {
  type = string
}

variable "source_revision" {
  type = string
}

variable "cloudflare_access_secret_version" {
  type    = number
  default = null
}

variable "previous_cloudflare_access_secret_expires_at" {
  type    = string
  default = null
}
