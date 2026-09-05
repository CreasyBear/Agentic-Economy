variable "source_environment" {
  type    = string
  default = "package4-release"
}

variable "drill_date" {
  description = "UTC drill date used in the isolated database and Formance namespace names."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{8}$", var.drill_date))
    error_message = "drill_date must use YYYYMMDD."
  }
}

variable "source_revision" {
  type = string

  validation {
    condition     = can(regex("^[0-9a-f]{40}$", var.source_revision))
    error_message = "source_revision must be a full Git commit SHA."
  }
}
