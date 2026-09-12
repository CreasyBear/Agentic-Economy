import { describe, expect, it } from 'vitest'

import { rateLimitedResponse, withHttpRateLimit } from '@/lib/server/rate-limit'
import {
  HTTP_RATE_LIMIT_NAMES,
  RATE_LIMIT_POLICY,
  httpRateLimitCapacity,
  httpRateLimitWindowMs,
} from '@/modules/security/rate-limit-policy'

// Guards the fix for the rate-limit policy duplication: convex/lib/rateLimit.ts
// and src/lib/server/rate-limit.ts both read this one shared module now, so
// these assert the HTTP headers actually reflect the shared policy's numbers
// rather than a second, independently maintained copy.
describe('shared rate-limit policy', () => {
  it('every HTTP-facing scope resolves against the shared policy table', () => {
    for (const name of HTTP_RATE_LIMIT_NAMES) {
      expect(RATE_LIMIT_POLICY[name]).toBeDefined()
      expect(httpRateLimitCapacity(name)).toBeGreaterThan(0)
      expect(httpRateLimitWindowMs(name)).toBeGreaterThan(0)
    }
  })

  it('builds a 429 problem response whose RateLimit-* headers come from the shared policy', () => {
    const response = rateLimitedResponse(5_000, 'public-read')
    expect(response.headers.get('Retry-After')).toBe('5')
    expect(response.headers.get('RateLimit-Limit')).toBe(String(httpRateLimitCapacity('public-read')))
    expect(response.headers.get('RateLimit-Remaining')).toBe('0')
    expect(response.headers.get('RateLimit-Reset')).toBe('5')
  })

  it('reports the configured capacity and window on an admitted request', async () => {
    // tests/setup/http-rate-limit.ts stubs admission to always-ok before every test.
    const response = await withHttpRateLimit(
      new Request('https://ae.test/x'),
      'oauth-device-poll',
      async () => new Response('ok'),
    )
    expect(response.headers.get('RateLimit-Limit')).toBe(String(httpRateLimitCapacity('oauth-device-poll')))
    expect(response.headers.get('RateLimit-Remaining')).toBe(String(httpRateLimitCapacity('oauth-device-poll')))
    expect(response.headers.get('RateLimit-Reset')).toBe(
      String(Math.ceil(httpRateLimitWindowMs('oauth-device-poll') / 1_000)),
    )
  })
})
