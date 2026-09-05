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

variable "foundation_gates_passed" {
  description = "One-plan acknowledgment that the live AWS production gates in docs/operations/aws-foundation.md have passed."
  type        = bool
  default     = false
}
