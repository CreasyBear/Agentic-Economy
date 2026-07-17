import { describe, expect, it } from 'vitest'

import { resolveReplacementCommandKey } from '@/modules/customer-request/replacement-command-key'

describe('replacement command key', () => {
  it('reuses one key for an exact retry and rotates it when the payload changes at the same revision', () => {
    let sequence = 0
    const createId = () => `operation-${++sequence}`
    const original = {
      requestRef: 'request:itinerary', expectedRevision: 1,
      message: 'Find an accessible itinerary', mode: 'replace' as const,
    }

    const first = resolveReplacementCommandKey(undefined, original, createId)
    const retry = resolveReplacementCommandKey(first, original, createId)
    const changed = resolveReplacementCommandKey(retry, {
      ...original, message: 'Find an accessible itinerary under AUD 11,000',
    }, createId)

    expect(retry).toBe(first)
    expect(retry.idempotencyKey).toBe('replace:request:itinerary:1:operation-1')
    expect(changed.idempotencyKey).toBe('replace:request:itinerary:1:operation-2')
  })
})
