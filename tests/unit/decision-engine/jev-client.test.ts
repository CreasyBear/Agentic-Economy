import { afterEach, describe, expect, it, vi } from 'vitest'
import { callJevSystemOne, executeDecisionGateway, JevUnavailableError } from '@/modules/decision-engine/public'

const request = { state: { query: 'private buyer need' }, questions: { fits: { type: 'noul' as const } } }
const options = { typesafeApiKey: 'ts-test-secret', purpose: 'discovery' as const }
const response = () => Response.json({ model: 'jev-test', answers: { fits: { type: 'noul', noul: 0.8 } } })
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('Jev SDK lifecycle', () => {
  it.each([[401, 'authentication'], [403, 'authentication'], [429, 'rate_limited'], [500, 'service_unavailable'], [503, 'service_unavailable']])('classifies HTTP %s without retry or leaking the body', async (status, reason) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('private upstream body ts-secret', { status: Number(status) }))
    const failure = await callJevSystemOne(request, { ...options, maxRetries: 5, fetchImpl }).catch(cause => cause)
    expect(failure).toBeInstanceOf(JevUnavailableError)
    expect(failure.reason).toBe(reason)
    expect(String(failure)).not.toMatch(/private|ts-secret/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it.each([{}, { answers: {} }, { answers: { fits: { type: 'noul', noul: 2 } } }, { answers: { fits: { type: 'choice', choice: 'yes' } } }, 'not JSON', null])('rejects malformed or partial response %j', async payload => {
    await expect(callJevSystemOne(request, { ...options, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload)) })).rejects.toMatchObject({ reason: 'invalid_response' })
  })

  it('does not send a pre-cancelled request or an expired deadline', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    await expect(callJevSystemOne(request, { ...options, fetchImpl, signal: AbortSignal.abort() })).rejects.toMatchObject({ reason: 'cancelled' })
    await expect(callJevSystemOne(request, { ...options, fetchImpl, deadlineAt: Date.now() - 1 })).rejects.toMatchObject({ reason: 'timeout' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('aborts slow headers at the caller deadline, without retry', async () => {
    let signal: AbortSignal | null | undefined
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      signal = init?.signal
      return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(signal?.reason), { once: true }))
    })
    const started = Date.now()
    await expect(callJevSystemOne(request, { ...options, fetchImpl, timeoutMs: 1500, deadlineAt: started + 30 })).rejects.toMatchObject({ reason: 'timeout' })
    expect(Date.now() - started).toBeLessThan(500)
    expect(signal?.aborted).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('aborts a slow response body through the SDK timeout', async () => {
    let signal: AbortSignal | null | undefined
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      signal = init?.signal
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"answers":')); } }), { headers: { 'Content-Type': 'application/json' } })
    })
    await expect(callJevSystemOne(request, { ...options, fetchImpl, timeoutMs: 30 })).rejects.toMatchObject({ reason: 'timeout' })
    expect(signal?.aborted).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('propagates mid-request cancellation and never escalates to another model', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
        controller.abort()
      })
    })
    await expect(executeDecisionGateway(request, { ...options, fetchImpl, signal: controller.signal })).rejects.toMatchObject({ reason: 'cancelled' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects oversized evidence intact instead of truncating buyer constraints', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    await expect(callJevSystemOne({ ...request, state: { query: 'x'.repeat(32_001) } }, { ...options, fetchImpl })).rejects.toMatchObject({ reason: 'evidence_too_large' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('keeps the discovery rollback switch separate from other inference', async () => {
    vi.stubEnv('AE_JEV_DISCOVERY_ENABLED', 'false')
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => response())
    await expect(callJevSystemOne(request, { ...options, fetchImpl })).rejects.toMatchObject({ reason: 'disabled' })
    expect(fetchImpl).not.toHaveBeenCalled()
    await expect(callJevSystemOne(request, { typesafeApiKey: 'ts-test', fetchImpl })).resolves.toMatchObject({ tier: 'jev_system_one' })
  })

  it('surfaces programmer configuration errors instead of returning fallback answers', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    await expect(executeDecisionGateway(request, { ...options, fetchImpl, timeoutMs: -1 })).rejects.toBeInstanceOf(RangeError)
    await expect(executeDecisionGateway({ ...request, questions: {} }, { ...options, fetchImpl })).rejects.toThrow('At least one question')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each(['https://openrouter.ai/api/alpha', 'https://openrouter.ai.example.test/api/alpha', 'https://api.typesafe.ai'])('adapts only the actual OpenRouter host: %s', async baseURL => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => response())
    await callJevSystemOne(request, { ...options, baseURL, fetchImpl })
    const [url, init] = fetchImpl.mock.calls[0]!
    const isOpenRouter = new URL(baseURL).hostname === 'openrouter.ai'
    expect(String(url)).toBe(baseURL + (isOpenRouter ? '/decisions' : '/v1/systemone'))
    expect(new Headers(init?.headers).has('HTTP-Referer')).toBe(isOpenRouter)
  })
  it.each([400, 422])('surfaces HTTP %s as a sanitized request defect', async status => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('private bad request', { status }))
    await expect(callJevSystemOne(request, { ...options, fetchImpl })).rejects.toThrow('Jev request rejected as invalid')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('caps discovery at 1,500 ms even when a caller supplies a larger timeout', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    }))
    const started = Date.now()
    await expect(callJevSystemOne(request, { ...options, fetchImpl, timeoutMs: 10_000 })).rejects.toMatchObject({ reason: 'timeout' })
    expect(Date.now() - started).toBeLessThan(1800)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('does not allow non-discovery SDK retry backoff to overrun an explicit deadline', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 503 }))
    const started = Date.now()
    await expect(callJevSystemOne(request, { typesafeApiKey: 'ts-test', fetchImpl, deadlineAt: started + 30 })).rejects.toMatchObject({ reason: 'timeout' })
    expect(Date.now() - started).toBeLessThan(500)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

})
