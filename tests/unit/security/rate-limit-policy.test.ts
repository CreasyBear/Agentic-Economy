import { afterEach, describe, expect, it, vi } from 'vitest'

import { setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import * as convexSource from '@/lib/server/convex-source'
import { SOURCE_READ_TIMEOUT_MS } from '@/lib/bounded-read'

import { HOUR_MS, RATE_LIMIT_NAMES, RATE_LIMIT_POLICY } from '@/modules/security/rate-limit-policy'
import { anonymousChatAdmissionKey, rateLimitedResponse, requestAdmissionKey, setHttpRateLimitAdmissionForTests, withHttpRateLimit } from '@/lib/server/rate-limit'
describe('funding-checkout policy', () => {
  it('allows 5 checkout creations per hour per key', () => {
    expect(RATE_LIMIT_NAMES).toContain('funding-checkout')
    expect(RATE_LIMIT_POLICY['funding-checkout']).toEqual({ kind: 'fixed window', rate: 5, period: HOUR_MS })
  })
})

// The Convex limiter owns quota state. HTTP admission exposes only success and
// retry delay, so HTTP must not invent a remaining balance from policy capacity.
describe('HTTP admission quota headers', () => {
  afterEach(() => {
    setHttpRateLimitAdmissionForTests(undefined)
    setPublicSourceTransportForTests(undefined)
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('bounds a hung admission and ignores a late success without dispatch or retry', async () => {
    const deadline = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal)
    const pending = Promise.withResolvers<{ ok: true }>()
    const admission = vi.fn(() => pending.promise)
    setHttpRateLimitAdmissionForTests(admission)
    const operation = vi.fn(async () => new Response('must not run'))
    const response = withHttpRateLimit(new Request('https://ae.test/x'), 'public-mutation', operation)

    deadline.abort(new DOMException('Admission deadline', 'TimeoutError'))
    expect((await response).status).toBe(503)
    expect(timeout).toHaveBeenCalledWith(SOURCE_READ_TIMEOUT_MS)
    pending.resolve({ ok: true })
    await pending.promise
    expect(admission).toHaveBeenCalledOnce()
    expect(operation).not.toHaveBeenCalled()
  })

  it('does not request admission for an already cancelled request', async () => {
    const controller = new AbortController()
    controller.abort()
    const admission = vi.fn(async () => ({ ok: true as const }))
    setHttpRateLimitAdmissionForTests(admission)
    const operation = vi.fn(async () => new Response('must not run'))

    const response = await withHttpRateLimit(new Request('https://ae.test/x', { signal: controller.signal }), 'public-mutation', operation)

    expect(response.status).toBe(503)
    expect(admission).not.toHaveBeenCalled()
    expect(operation).not.toHaveBeenCalled()
  })

  it.each(['public-mutation', 'chat-anonymous-edge'] as const)('does not debit quota after cancellation during %s signing', async name => {
    setHttpRateLimitAdmissionForTests(undefined)
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', 'rate-limit-fixture-service-key-at-least-32-characters')
    const signing = Promise.withResolvers<void>()
    const original = convexSource.createConvexServerFunctionAssertion
    const assertion = vi.spyOn(convexSource, 'createConvexServerFunctionAssertion').mockImplementation(async input => {
      await signing.promise
      return await original(input)
    })
    const mutation = vi.fn().mockResolvedValue({ ok: true })
    setPublicSourceTransportForTests({ query: vi.fn(), mutation, action: vi.fn() })
    const controller = new AbortController()
    const operation = vi.fn(async () => new Response('must not run'))
    const response = withHttpRateLimit(new Request('https://ae.test/x', { signal: controller.signal }), name, operation)

    expect(assertion).toHaveBeenCalledOnce()
    controller.abort()
    expect((await response).status).toBe(503)
    signing.resolve()
    await assertion.mock.results[0]?.value
    expect(mutation).not.toHaveBeenCalled()
    expect(operation).not.toHaveBeenCalled()
  })

  it.each(['public-mutation', 'chat-anonymous-edge'] as const)('cancels the actual %s HTTP response body without retrying', async name => {
    setHttpRateLimitAdmissionForTests(undefined)
    setPublicSourceTransportForTests(undefined)
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', 'rate-limit-fixture-service-key-at-least-32-characters')
    vi.stubEnv('CONVEX_URL', 'https://admission-fixture.convex.cloud')
    const started = Promise.withResolvers<AbortSignal>()
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const signal = init?.signal
      if (signal == null) throw new Error('missing admission cancellation')
      started.resolve(signal)
      return new Response(new ReadableStream({
        start(controller) {
          signal.addEventListener('abort', () => controller.error(signal.reason), { once: true })
        },
      }), { headers: { 'content-type': 'application/json' } })
    })
    const controller = new AbortController()
    const operation = vi.fn(async () => new Response('must not run'))
    const response = withHttpRateLimit(new Request('https://ae.test/x', { signal: controller.signal }), name, operation)
    const transportSignal = await started.promise

    controller.abort()
    expect((await response).status).toBe(503)
    expect(transportSignal.aborted).toBe(true)
    expect(fetch).toHaveBeenCalledOnce()
    expect(operation).not.toHaveBeenCalled()
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
