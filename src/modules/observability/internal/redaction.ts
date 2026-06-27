import type { SourceHash } from '@/modules/common/ids'
import type { RedactedPayload } from '@/modules/observability/public'

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
  return stableHash(JSON.stringify(value) ?? 'undefined')
}

export function stableHash(value: string): SourceHash {
  let hash = 2166136261

  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }

  return `ae-hash-v1:${(hash >>> 0).toString(16).padStart(8, '0')}` as SourceHash
}
