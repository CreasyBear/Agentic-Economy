variable "source_environment" {
  description = "Existing source environment; also the source Formance namespace."
  type        = string
  default     = "package4-release"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,30}$", var.source_environment))
    error_message = "source_environment must be a short lowercase environment identifier."
  }
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

variable "restore_time" {
  description = "Exact UTC cutoff from the accepted quiesced Formance baseline; wait until RDS reports it restorable before applying."
  type        = string

  validation {
    condition     = can(formatdate("YYYY-MM-DD", var.restore_time)) && can(regex("Z$", var.restore_time))
    error_message = "restore_time must be the baseline's RFC3339 UTC timestamp ending in Z."
  }
}
