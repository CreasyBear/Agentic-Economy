import { afterEach, describe, expect, it, vi } from 'vitest'

import { setPublicSourceTransportForTests } from '@/lib/server/convex-source'

import { anonymousChatAdmissionKey, rateLimitedResponse, requestAdmissionKey, setHttpRateLimitAdmissionForTests, withHttpRateLimit } from '@/lib/server/rate-limit'
// The Convex limiter owns quota state. HTTP admission exposes only success and
// retry delay, so HTTP must not invent a remaining balance from policy capacity.
describe('HTTP admission quota headers', () => {
  afterEach(() => {
    setHttpRateLimitAdmissionForTests(undefined)
    setPublicSourceTransportForTests(undefined)
    vi.unstubAllEnvs()
  })

  it.each([
    new Error('private rejected service assertion'),
    new TypeError('private admission transport failure'),
  ])('refuses unavailable external admission without dispatch or leaking its cause: %s', async cause => {
    setHttpRateLimitAdmissionForTests(undefined)
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', 'rate-limit-fixture-service-key-at-least-32-characters')
    const mutation = vi.fn().mockRejectedValue(cause)
    setPublicSourceTransportForTests({ query: vi.fn(), mutation, action: vi.fn() })
    const operation = vi.fn(async () => new Response('must not run'))

    const response = await withHttpRateLimit(new Request('https://ae.test/x'), 'public-mutation', operation)

    expect(response.status).toBe(503)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('retry-after')).toBe('5')
    expect(response.headers.get('www-authenticate')).toBeNull()
    const body = await response.json()
    expect(body).toMatchObject({ status: 503, kind: 'UNAVAILABLE', code: 'source_unavailable', retryable: true })
    expect(JSON.stringify(body)).not.toContain('private')
    expect(mutation).toHaveBeenCalledOnce()
    expect(operation).not.toHaveBeenCalled()
  })

  it('performs fresh admission on a later retry without dispatching the failed attempt', async () => {
    setHttpRateLimitAdmissionForTests(undefined)
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', 'rate-limit-fixture-service-key-at-least-32-characters')
    const mutation = vi.fn().mockRejectedValueOnce(new Error('source offline')).mockResolvedValueOnce({ ok: true })
    setPublicSourceTransportForTests({ query: vi.fn(), mutation, action: vi.fn() })
    const operation = vi.fn(async () => new Response('admitted'))
    const request = new Request('https://ae.test/x')

    expect((await withHttpRateLimit(request, 'public-mutation', operation)).status).toBe(503)
    expect(mutation).toHaveBeenCalledOnce()
    expect(operation).not.toHaveBeenCalled()
    expect((await withHttpRateLimit(request, 'public-mutation', operation)).status).toBe(200)
    expect(mutation).toHaveBeenCalledTimes(2)
    expect(operation).toHaveBeenCalledOnce()
  })

  it('keeps pending and successful concurrent admissions independent', async () => {
    setHttpRateLimitAdmissionForTests(undefined)
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', 'rate-limit-fixture-service-key-at-least-32-characters')
    const pending = Promise.withResolvers<never>()
    const started = Promise.withResolvers<void>()
    const mutation = vi.fn().mockImplementationOnce(() => {
      started.resolve()
      return pending.promise
    }).mockResolvedValueOnce({ ok: true })
    setPublicSourceTransportForTests({ query: vi.fn(), mutation, action: vi.fn() })
    const failedOperation = vi.fn(async () => new Response('must not run'))
    const admittedOperation = vi.fn(async () => new Response('admitted'))
    const first = withHttpRateLimit(new Request('https://ae.test/first'), 'public-mutation', failedOperation)
    await started.promise

    expect((await withHttpRateLimit(new Request('https://ae.test/second'), 'public-mutation', admittedOperation)).status).toBe(200)
    expect(failedOperation).not.toHaveBeenCalled()
    pending.reject(new Error('source reply lost'))
    expect((await first).status).toBe(503)
    expect(failedOperation).not.toHaveBeenCalled()
    expect(admittedOperation).toHaveBeenCalledOnce()
  })

  it('preserves an admitted operation failure instead of reporting an admission outage', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const failure = new Error('operation failed after admission')
    await expect(withHttpRateLimit(new Request('https://ae.test/x'), 'public-mutation', async () => {
      throw failure
    })).rejects.toBe(failure)
  })

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

  it('ignores forged ingress IP headers on Vercel for generic and anonymous-chat buckets', () => {
    const previousVercel = process.env.VERCEL
    process.env.VERCEL = '1'
    const request = (headers: Record<string, string>) => new Request('https://ae.test/x', { headers })
    try {
      const vercelOnly = request({ 'x-vercel-forwarded-for': '198.51.100.7' })
      const forged = request({
        'x-vercel-forwarded-for': '198.51.100.7',
        'cf-connecting-ip': '203.0.113.9',
        'x-real-ip': '203.0.113.10',
      })
      const withoutVercel = request({})
      for (const key of [requestAdmissionKey, anonymousChatAdmissionKey]) {
        expect(key(forged)).toBe(key(vercelOnly))
        expect(key(request({ 'cf-connecting-ip': '203.0.113.9' }))).toBe(key(withoutVercel))
        expect(key(request({ 'x-real-ip': '203.0.113.10' }))).toBe(key(withoutVercel))
        expect(key(forged)).not.toBe(key(withoutVercel))
      }
    } finally {
      if (previousVercel === undefined) delete process.env.VERCEL
      else process.env.VERCEL = previousVercel
    }
  })
})
