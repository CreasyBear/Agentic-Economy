variable "name" {
  type = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,30}$", var.name))
    error_message = "name must be a short lowercase environment identifier."
  }
}

variable "vpc_cidr" {
  type    = string
  default = "10.42.0.0/16"
}

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

  validation {
    condition     = can(regex("^[0-9a-f]{40}$", var.source_revision))
    error_message = "source_revision must be a full Git commit SHA."
  }
}

variable "instance_type" {
  type    = string
  default = "t4g.large"
}

variable "database_instance_class" {
  type    = string
  default = "db.t4g.medium"
}

variable "alert_email" {
  description = "Optional operator mailbox subscribed to infrastructure alarms."
  type        = string
  default     = null
}

variable "flow_log_destination_arn" {
  description = "Optional encrypted S3 destination for VPC Flow Logs."
  type        = string
  default     = null
}

variable "cloudflare_access_secret_version" {
  description = "Set with previous_cloudflare_access_secret_expires_at to rotate through an overlap window."
  type        = number
  default     = null
}

variable "previous_cloudflare_access_secret_expires_at" {
  description = "RFC3339 end of the overlap window for the previous Access secret."
  type        = string
  default     = null
}

variable "cloudflare_tunnel_token_override" {
  description = "Existing tunnel token supplied only for an AWS-only plan when Cloudflare refresh is intentionally disabled."
  type        = string
  sensitive   = true
  default     = null
}
