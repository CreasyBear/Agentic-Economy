import type { RedactedPayload } from '@/modules/observability/public'

export function parseRedactedPayload(value: string): RedactedPayload {
  try {
    const parsed = JSON.parse(value) as unknown
    return isRedactedPayload(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isRedactedPayload(value: unknown): value is RedactedPayload {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true
  }
  if (Array.isArray(value)) {
    return value.every(isRedactedPayload)
  }
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return Object.values(value).every(isRedactedPayload)
}
