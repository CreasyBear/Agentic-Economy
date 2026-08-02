import type { RedactedPayload } from '@/modules/observability/public'
import { isRedactedPayload } from '@/modules/common/is-redacted-payload'

export function parseRedactedPayload(value: string): RedactedPayload {
  try {
    const parsed = JSON.parse(value) as unknown
    return isRedactedPayload(parsed) ? parsed : null
  } catch {
    return null
  }
}

