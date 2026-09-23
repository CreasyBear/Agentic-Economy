import { describe, expect, it } from 'vitest'

import { rateLimitedResponse, requestAdmissionKey, withHttpRateLimit } from '@/lib/server/rate-limit'
// The Convex limiter owns quota state. HTTP admission exposes only success and
// retry delay, so HTTP must not invent a remaining balance from policy capacity.
describe('HTTP admission quota headers', () => {
  it('keeps Retry-After on 429 without publishing an invented bucket balance', () => {
    const response = rateLimitedResponse(5_000)
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('5')
    expect(response.headers.get('RateLimit')).toBeNull()
    expect(response.headers.get('RateLimit-Policy')).toBeNull()
    expect(response.headers.get('RateLimit-Remaining')).toBeNull()
  })

  it('omits quota headers when admission does not expose live remaining quota', async () => {
    const response = await withHttpRateLimit(
      new Request('https://ae.test/x'),
      'oauth-device-poll',
      async () => new Response('ok'),
    )
    expect(response.status).toBe(200)
    for (const name of ['RateLimit', 'RateLimit-Policy', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset']) {
      expect(response.headers.get(name)).toBeNull()
    }
  })

  it('does not mint a finer bucket than IP from an unverified Bearer or X-Api-Key', () => {
    const ipHeaders = { 'cf-connecting-ip': '203.0.113.9' }
    const fromIp = requestAdmissionKey(new Request('https://ae.test/x', { headers: ipHeaders }))
    const fromBearer = requestAdmissionKey(new Request('https://ae.test/x', {
      headers: { ...ipHeaders, authorization: 'Bearer totally-fake' },
    }))
    const fromApiKey = requestAdmissionKey(new Request('https://ae.test/x', {
      headers: { ...ipHeaders, 'x-api-key': 'spoofed-catalogue-key' },
    }))
    expect(fromBearer).toBe(fromIp)
    expect(fromApiKey).toBe(fromIp)
  })
})
