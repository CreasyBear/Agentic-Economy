import { afterEach, describe, expect, it, vi } from 'vitest'
import { callJevSystemOne, executeDecisionGateway, JevUnavailableError, jevDiscoveryRecipient } from '@/modules/decision-engine/public'

const request = { state: { query: 'private buyer need' }, questions: { fits: { type: 'noul' as const } } }
const options = { typesafeApiKey: 'ts-test-secret', purpose: 'discovery' as const }
const response = () => Response.json({ model: 'jev-test', answers: { fits: { type: 'noul', noul: 0.8 } } })
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('Jev SDK lifecycle', () => {
  it.each([
    [undefined, null, null],
    [{ input_tokens: 0, output_tokens: 0 }, 0, 0],
    [{ input_tokens: 17 }, 17, null],
    [{ output_tokens: 4 }, null, 4],
    [{ input_tokens: -1, output_tokens: 1.5 }, null, null],
  ])('preserves observed usage without inventing missing values: %j', async (usage, inputTokens, outputTokens) => {
    const result = await callJevSystemOne(request, { ...options, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(Response.json({ model: 'jev-resolved', answers: { fits: { type: 'noul', noul: 0.8 } }, usage })) })
    expect(result.usage).toEqual({ inputTokens, outputTokens, estimatedCostAud: null })
  })

  it('does not log a malformed model field as arbitrary provider output', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    const result = await callJevSystemOne(request, { ...options, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(Response.json({ model: { body: 'private provider output' }, answers: { fits: { type: 'noul', noul: 0.8 } } })) })
    expect(result.model).toBe('jev-latest')
    expect(JSON.parse(String(log.mock.calls[0]?.[1]))).toMatchObject({ modelSource: 'requested' })
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|provider output/)
  })

  it('records every failed SDK path safely, with unknown consumption', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    await expect(callJevSystemOne(request, { ...options, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response('private upstream ts-test-secret', { status: 503 })) })).rejects.toMatchObject({ reason: 'service_unavailable' })
    const event = JSON.parse(String(log.mock.calls[0]?.[1]))
    expect(event).toMatchObject({ purpose: 'discovery', outcome: 'failed', reason: 'service_unavailable', outboundAttempts: 1, usage: { inputTokens: null, outputTokens: null, estimatedCostAud: null } })
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|ts-test-secret/)
  })

  it('does not report a successful retry as the total consumption', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ model: 'jev-resolved', answers: { fits: { type: 'noul', noul: 0.8 } }, usage: { input_tokens: 10, output_tokens: 0 } }))
    const result = await callJevSystemOne(request, { typesafeApiKey: 'ts-test', maxRetries: 1, fetchImpl })
    expect(result.usage).toEqual({ inputTokens: null, outputTokens: null, estimatedCostAud: null })
    expect(JSON.parse(String(log.mock.calls[0]?.[1]))).toMatchObject({ outboundAttempts: 2, outcome: 'completed', model: 'jev-resolved' })
  })

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

  it('accepts a decision delivered 1,700 ms into the discovery window', async () => {
    const started = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(started)
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => {
      clock.mockReturnValue(started + 1_700)
      return response()
    })
    await expect(callJevSystemOne(request, { ...options, fetchImpl })).resolves.toMatchObject({ answers: { fits: { noul: 0.8 } } })
  })

  it('caps discovery at 5,000 ms even when a caller supplies a larger timeout', async () => {
    const started = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(started)
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => {
      clock.mockReturnValue(started + 5_001)
      return response()
    })
    await expect(callJevSystemOne(request, { ...options, fetchImpl, timeoutMs: 20_000 })).rejects.toMatchObject({ reason: 'timeout' })
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

describe('query recipient disclosure', () => {
  it('follows the effective Jev route, not the credential vendor, and exposes no secret', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', 'ts-private-key')
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-private-key')
    vi.stubEnv('TYPESAFE_BASE_URL', 'https://partner.example.test/decisions?token=private-query-secret')
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => response())
    await callJevSystemOne(request, { purpose: 'discovery', fetchImpl })
    const actualHost = new URL(String(fetchImpl.mock.calls[0]?.[0])).hostname
    expect(jevDiscoveryRecipient()?.host).toBe(actualHost)
    expect(JSON.stringify(jevDiscoveryRecipient())).not.toMatch(/private-key|private-query-secret|decisions/)
    expect(jevDiscoveryRecipient()).toEqual({ label: 'partner.example.test', host: 'partner.example.test' })
    expect(jevDiscoveryRecipient({ typesafeApiKey: 'ts-override', baseURL: 'https://openrouter.ai/api/alpha' }))
      .toEqual({ label: 'OpenRouter', host: 'openrouter.ai' })
    vi.stubEnv('TYPESAFE_BASE_URL', undefined)
    expect(jevDiscoveryRecipient()).toEqual({ label: 'TypeSafe AI', host: 'api.typesafe.ai' })
    vi.stubEnv('TYPESAFE_API_KEY', '')
    expect(jevDiscoveryRecipient()).toEqual({ label: 'OpenRouter', host: 'openrouter.ai' })
  })

  it('does not claim a remote ranker when discovery is disabled, unconfigured or misconfigured', () => {
    vi.stubEnv('TYPESAFE_API_KEY', '')
    vi.stubEnv('OPENROUTER_API_KEY', '')
    expect(jevDiscoveryRecipient()).toBeUndefined()
    expect(jevDiscoveryRecipient({ typesafeApiKey: 'ts-key', disableJev: true })).toBeUndefined()
    vi.stubEnv('AE_JEV_DISCOVERY_ENABLED', 'false')
    expect(jevDiscoveryRecipient({ typesafeApiKey: 'ts-key' })).toBeUndefined()
    vi.stubEnv('AE_JEV_DISCOVERY_ENABLED', 'true')
    expect(jevDiscoveryRecipient({ typesafeApiKey: 'ts-key', baseURL: 'not a URL' })).toBeUndefined()
  })

})
