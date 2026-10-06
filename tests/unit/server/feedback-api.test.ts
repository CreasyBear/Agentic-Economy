import { beforeEach, describe, expect, it, vi } from 'vitest'

import { handleFeedbackPost } from '@/lib/server/feedback-api'
import type { AgentAccessPrincipalResolver } from '@/lib/server/agent-access-auth'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { authenticateWithScopes, handleMcpRequest, postMcp, readMcpBody } from './mcp-api-harness'

const mocks = vi.hoisted(() => ({ send: vi.fn(), capture: vi.fn() }))
vi.mock('@/modules/network-guard/server', () => ({ sendGuardedHttpRequest: mocks.send }))
vi.mock('posthog-node', () => ({ PostHog: class { capture = mocks.capture } }))

const principal = { principalId: 'prn_00000000000040008000000000000071', ownerId: 'acc_00000000000040008000000000000071' }
const resolvePrincipal: AgentAccessPrincipalResolver = async projection => ({ ...projection, ...principal })
const auth = {
  authenticate: authenticateWithScopes(['market_tools:call']),
  resolvePrincipal,
}
const message = 'I expected help to explain the cursor; the result omitted how to continue.'
const request = (body: unknown = { message }, init: RequestInit = {}, query = '') => new Request(`https://ae.example/api/v1/feedback${query}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', authorization: 'Bearer private-test-key' },
  body: JSON.stringify(body), ...init,
})
const call = { jsonrpc: '2.0', id: 'feedback', method: 'tools/call', params: { name: 'ae_feedback_submit', arguments: { message } } }
const list = { jsonrpc: '2.0', id: 'list', method: 'tools/list', params: {} }

beforeEach(() => {
  mocks.send.mockReset().mockResolvedValue(new Response('{}', { status: 200 }))
  mocks.capture.mockReset()
  for (const name of ['DO_NOT_TRACK', 'AE_DISABLE_ANALYTICS', 'VITE_AE_DISABLE_ANALYTICS', 'AE_DISABLE_OBSERVABILITY', 'VITE_AE_DISABLE_OBSERVABILITY']) vi.stubEnv(name, '')
  vi.stubEnv('POSTHOG_KEY', 'phc_feedback_test')
  vi.stubEnv('POSTHOG_HOST', 'https://us.i.posthog.com')
  vi.stubEnv('AE_CANONICAL_BASE_URL', 'https://ae.example')
  vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
})

describe('explicit product feedback', () => {
  it.each(['market_tools:call', 'market_supply:manage'])('accepts %s only after vendor acknowledgment, with server-owned pseudonyms', async scope => {
    const ingest = Promise.withResolvers<Response>()
    mocks.send.mockReturnValueOnce(ingest.promise)
    let completed = false
    const pending = handleFeedbackPost(request(), { ...auth, authenticate: authenticateWithScopes([scope]) }).then(result => { completed = true; return result })
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1))
    expect(completed).toBe(false)
    const outbound: Request = mocks.send.mock.calls[0]![0]
    const wire = await outbound.text()
    const body = JSON.parse(wire)
    expect(outbound.url).toBe('https://us.i.posthog.com/batch/')
    expect(outbound.method).toBe('POST')
    expect(outbound.headers.get('authorization')).toBeNull()
    expect(body).toMatchObject({ api_key: 'phc_feedback_test', batch: [{
      event: 'feedback_submitted', distinct_id: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      uuid: expect.any(String), properties: { message, accountRefDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u), $process_person_profile: false, $geoip_disable: true },
    }] })
    for (const forbidden of ['private-test-key', principal.principalId, principal.ownerId, 'user_test', 'key:test']) expect(wire).not.toContain(forbidden)
    ingest.resolve(new Response('{}', { status: 200 }))
    const response = await pending
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-ae-request-id')).toBeTruthy()
    await expect(response.json()).resolves.toEqual({ kind: 'accepted' })
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain(message)
  })

  it.each([{}, { message: '' }, { message: '  \n' }, { message: 'x'.repeat(10_001) }, { message, principalId: 'spoofed' }, { message, event: 'other' }, { message: 1 }])('rejects invalid or attributed input before disclosure: %j', async body => {
    expect((await handleFeedbackPost(request(body), auth)).status).toBe(400)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('rejects malformed, oversized, wrong-media, cross-origin and query-bearing requests before disclosure', async () => {
    const cases = [
      [request(undefined, { body: '{' }), 400],
      [request(undefined, { body: 'x'.repeat(65_537) }), 413],
      [request(undefined, { headers: { 'content-type': 'text/plain' } }), 415],
      [request(undefined, { headers: { 'content-type': 'application/json', origin: 'https://other.example' } }), 403],
      [request(undefined, {}, '?account=spoofed'), 400],
    ] as const
    for (const [input, status] of cases) expect((await handleFeedbackPost(input, auth)).status).toBe(status)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('requires authenticated scope and rate admission before disclosure', async () => {
    const missing = await handleFeedbackPost(request(), { authenticate: async () => ({ isAuthenticated: false, tokenType: null, id: null, subject: null, scopes: null }) })
    expect(missing.status).toBe(401)
    expect((await handleFeedbackPost(request(), { ...auth, authenticate: authenticateWithScopes([]) })).status).toBe(403)
    setHttpRateLimitAdmissionForTests(async () => ({ ok: false, retryAfter: 1000 }))
    expect((await handleFeedbackPost(request(), auth)).status).toBe(429)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it.each(['DO_NOT_TRACK', 'AE_DISABLE_ANALYTICS', 'VITE_AE_DISABLE_ANALYTICS', 'AE_DISABLE_OBSERVABILITY'])('skips ingestion when %s opts out', async name => {
    vi.stubEnv(name, 'true')
    const response = await handleFeedbackPost(request(), auth)
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: 'feedback_disabled', retryable: false })
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('disables feedback without a configured analytics destination key', async () => {
    vi.stubEnv('POSTHOG_KEY', '')
    vi.stubEnv('VITE_POSTHOG_KEY', '')
    expect((await handleFeedbackPost(request(), auth)).status).toBe(409)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it.each([302, 400, 429, 500])('never accepts or retries ingestion HTTP %s', async status => {
    mocks.send.mockResolvedValue(new Response('vendor-private-diagnostic', { status }))
    const response = await handleFeedbackPost(request(), auth)
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body).toMatchObject({ kind: 'UNAVAILABLE', code: 'feedback_unavailable', retryable: false })
    expect(JSON.stringify(body)).not.toContain('vendor-private-diagnostic')
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })

  it('bounds uncertain delivery at five seconds without a retry or diagnostic leak', async () => {
    mocks.send.mockImplementation((outbound: Request) => new Promise((_resolve, reject) => {
      outbound.signal.addEventListener('abort', () => reject(new Error(`private transport ${message}`)), { once: true })
    }))
    const response = await handleFeedbackPost(request(), auth)
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain(message)
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain(message)
  }, 10_000)

  it.each(['http://collector.example', 'https://user:password@collector.example', 'https://collector.example?redirect=1'])('rejects unsafe configured destinations: %s', async host => {
    vi.stubEnv('POSTHOG_HOST', host)
    expect((await handleFeedbackPost(request(), auth)).status).toBe(503)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('keeps concurrent attribution separate and treats deliberate resubmission as a separate event', async () => {
    const other = { principalId: 'prn_00000000000040008000000000000072', ownerId: 'acc_00000000000040008000000000000072' }
    const pending = Promise.withResolvers<Response>()
    mocks.send.mockReturnValueOnce(pending.promise)
    const first = handleFeedbackPost(request(), auth)
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1))
    expect((await handleFeedbackPost(request(), { ...auth, resolvePrincipal: async projection => ({ ...projection, ...other }) })).status).toBe(200)
    pending.resolve(new Response('{}', { status: 200 }))
    expect((await first).status).toBe(200)
    expect((await handleFeedbackPost(request(), auth)).status).toBe(200)
    const events = await Promise.all(mocks.send.mock.calls.map(async call => {
      const outbound: Request = call[0]
      return (await outbound.json()).batch[0]
    }))
    expect(events[0].distinct_id).not.toBe(events[1].distinct_id)
    expect(events[0].properties.accountRefDigest).not.toBe(events[1].properties.accountRefDigest)
    expect(events[0].distinct_id).toBe(events[2].distinct_id)
    expect(new Set(events.map(event => event.uuid)).size).toBe(3)
  })
})

describe('MCP feedback adapter', () => {
  it('advertises the disclosure only to authenticated write-enabled connections', async () => {
    for (const [scopes, readOnly, present] of [[[], false, false], [['market_tools:call'], false, true], [['market_supply:manage'], false, true], [['market_tools:call'], true, false]] as const) {
      const response = await handleMcpRequest(new Request(`https://ae.example/mcp${readOnly ? '?readonly=1' : ''}`, {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(scopes.length ? { authorization: 'Bearer test' } : {}) }, body: JSON.stringify(list),
      }), scopes.length ? authFor(scopes) : {})
      const body = await readMcpBody(response)
      const tool = ((body.result?.tools ?? []) as Array<{ name: string; annotations: unknown }>).find(tool => tool.name === 'ae_feedback_submit')
      expect(tool !== undefined).toBe(present)
      if (tool) expect(tool.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true })
    }
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('shares confirmed acceptance and uncertainty semantics with HTTP', async () => {
    const options = authFor(['market_supply:manage'])
    const accepted = await readMcpBody(await postMcp(call, options, { authorization: 'Bearer test' }))
    expect(accepted.result).toMatchObject({ structuredContent: { result: { kind: 'accepted' } } })
    mocks.send.mockRejectedValueOnce(new Error('ingestion failed'))
    const refused = await readMcpBody(await postMcp(call, options, { authorization: 'Bearer test' }))
    expect(refused.result).toMatchObject({ isError: true, structuredContent: { kind: 'UNAVAILABLE', code: 'feedback_unavailable', retryable: false, next: [] } })
    expect(mocks.send).toHaveBeenCalledTimes(2)
  })
})

function authFor(scopes: readonly string[]) {
  return { ...auth, authenticate: authenticateWithScopes(scopes) }
}
