import { describe, expect, it } from 'vitest'

import { classifyResendOutcome } from '../../../convex/lib/principalAccount/notifications/resendOutcome'

describe('classifyResendOutcome', () => {
  it('marks successful provider responses sent', () => {
    expect(classifyResendOutcome(200, 1)).toEqual({ outcome: 'sent' })
  })

  it.each([
    { status: 429, attemptCount: 1, code: 'provider_rate_limited', retryDelayMs: 60_000 },
    { status: 409, attemptCount: 2, code: 'provider_conflict', retryDelayMs: 120_000 },
    { status: 503, attemptCount: 3, code: 'provider_unavailable', retryDelayMs: 240_000 },
    { status: 'network_error' as const, attemptCount: 1, code: 'network_error', retryDelayMs: 60_000 },
  ])('retries transient response $status with bounded exponential delay', ({ status, attemptCount, code, retryDelayMs }) => {
    expect(classifyResendOutcome(status, attemptCount)).toEqual({
      outcome: 'retry',
      code,
      retryDelayMs,
    })
  })

  it('fails permanent provider rejection and exhausted transient retries', () => {
    expect(classifyResendOutcome(400, 1)).toEqual({ outcome: 'failed', code: 'provider_rejected_400' })
    expect(classifyResendOutcome(429, 8)).toEqual({ outcome: 'failed', code: 'retries_exhausted' })
  })
})
