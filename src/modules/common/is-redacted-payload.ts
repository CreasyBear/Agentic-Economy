import { z } from 'zod'

import type { RedactedPayload } from './audit-events'

const redactedPayloadSchema = z.json()

export function isRedactedPayload(value: unknown): value is RedactedPayload {
  return redactedPayloadSchema.safeParse(value).success
}
