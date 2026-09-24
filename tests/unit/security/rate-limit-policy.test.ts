import { afterEach, describe, expect, it } from 'vitest'

import { rateLimitedResponse, requestAdmissionKey, setHttpRateLimitAdmissionForTests, withHttpRateLimit } from '@/lib/server/rate-limit'
// The Convex limiter owns quota state. HTTP admission exposes only success and
// retry delay, so HTTP must not invent a remaining balance from policy capacity.
describe('HTTP admission quota headers', () => {
  afterEach(() => setHttpRateLimitAdmissionForTests(undefined))

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

  it('keeps a caller in the same bucket when they rotate unverified session headers and cookies', async () => {
    const attempts = new Map<string, number>()
    setHttpRateLimitAdmissionForTests(async ({ key }) => {
      const used = attempts.get(key) ?? 0
      attempts.set(key, used + 1)
      return used === 0 ? { ok: true } : { ok: false, retryAfter: 5_000 }
    })
    const request = (session: string) => new Request('https://ae.test/x', {
      headers: {
        'cf-connecting-ip': '203.0.113.9',
        'x-ae-session-id': session,
        cookie: `ae_session=${session}`,
      },
    })

    expect((await withHttpRateLimit(request('first'), 'public-read', async () => new Response('ok'))).status).toBe(200)
    expect((await withHttpRateLimit(request('second'), 'public-read', async () => new Response('ok'))).status).toBe(429)
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
