import { describe, expect, it } from 'vitest'

import { assertCsrf, rateLimitClaim } from '@/modules/security/public'
import type { AbuseRateLimitBucketRecord } from '@/modules/security/public'

describe('CSRF and rate limit controls', () => {
  it('accepts matching CSRF token/cookie and same-site origin', () => {
    expect(
      assertCsrf({
        csrfToken: 'token',
        csrfCookie: 'token',
        allowedOrigins: ['https://ae.example'],
      })
    ).toEqual({ kind: 'accepted', mode: 'csrf_token' })

    expect(
      assertCsrf({
        origin: 'https://ae.example',
        allowedOrigins: ['https://ae.example'],
      })
    ).toEqual({ kind: 'accepted', mode: 'same_site_origin' })
  })

  it('rejects missing and foreign CSRF evidence', () => {
    expect(assertCsrf({ allowedOrigins: ['https://ae.example'] })).toEqual({
      kind: 'rejected',
      reason: 'missing_csrf',
    })
    expect(assertCsrf({ origin: 'https://evil.example', allowedOrigins: ['https://ae.example'] })).toEqual({
      kind: 'rejected',
      reason: 'foreign_origin',
    })
  })

  it('updates source-owned claim rate-limit buckets', () => {
    const buckets: AbuseRateLimitBucketRecord[] = []
    const first = rateLimitClaim(buckets, rateLimit())

    expect(first).toMatchObject({ kind: 'accepted', bucket: { count: 1, state: 'open' } })
    const second = rateLimitClaim(buckets, rateLimit())

    expect(second).toMatchObject({ kind: 'limited', bucket: { count: 1, state: 'limited' } })
  })
})

function rateLimit() {
  return {
    scope: 'claim_submit' as const,
    key: 'actor:1',
    now: 1_000,
    limit: 1,
    windowMs: 60_000,
  }
}
