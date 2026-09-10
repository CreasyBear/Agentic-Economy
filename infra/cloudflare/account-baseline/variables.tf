variable "cloudflare_account_id" {
  description = "Cloudflare account receiving account-wide operational alerts."
  type        = string
  sensitive   = true
}

variable "alert_email" {
  description = "Mailbox receiving Cloudflare account alerts."
  type        = string
  default     = "joel@agentic-economy.ai"

  validation {
    condition     = can(regex("^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$", var.alert_email))
    error_message = "alert_email must be a valid email address."
  }
}
