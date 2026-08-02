import type { SourceHash } from '@/modules/common/ids'
import type { RedactedPayload } from '@/modules/observability/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

const sensitiveKeyPattern = /email|phone|contact|cookie|authorization|secret|token|session/i

export function redactPayload(value: unknown): RedactedPayload {
  if (value === null) {
    return null
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactPayload(item))
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, sensitiveKeyPattern.test(key) ? '[redacted]' : redactPayload(child)])
    )
  }

  return '[redacted]'
}

export function payloadHash(value: RedactedPayload): SourceHash {
  return canonicalDigest(value)
}

