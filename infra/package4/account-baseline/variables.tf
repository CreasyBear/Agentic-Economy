variable "source_revision" {
  type = string

  validation {
    condition     = can(regex("^[0-9a-f]{40}$", var.source_revision))
    error_message = "source_revision must be a full Git commit SHA."
  }
}

variable "infrastructure_alert_topic_arn" {
  type = string

  validation {
    condition     = can(regex("^arn:aws:sns:ap-southeast-2:[0-9]{12}:package4-release-package4-alerts$", var.infrastructure_alert_topic_arn))
    error_message = "infrastructure_alert_topic_arn must be the Package 4 release alert topic in Sydney."
  }
}

variable "infrastructure_alert_email" {
  type    = string
  default = "joel@agentic-economy.ai"
}

variable "runway_budget_email" {
  type    = string
  default = "accounts@agentic-economy.ai"
}
