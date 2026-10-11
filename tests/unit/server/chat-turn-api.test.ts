import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConvexError } from 'convex/values'

import { handleChatTurnPost, handleChatTurnResource, type ChatTurnOptions, type ChatTurnSource } from '@/lib/server/chat-turn-api'
import { ConvexSourceError } from '@/lib/server/convex-source'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { productionWebManifestFixture } from '../../helpers/production-web-manifest'

const turnRef = `turn_${'0'.repeat(8)}-${'0'.repeat(4)}-4000-8000-${'0'.repeat(12)}`
const threadId = 'thread_test'
const snapshot = { turnRef, threadId, promptMessageId: 'message_test', sequence: 7, state: 'completed' as const, callRefs: [`operation-invocation:v1:${'a'.repeat(64)}`], inFlightCallRefs: [] }
const clerkAuth = async () => ({ isAuthenticated: true, userId: 'user_test' })
const post = (clientTurnId = 'turn-stable') => new Request('https://ae.example/api/v1/chat/turns', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ prompt: 'Find a current weather Tool', clientTurnId }),
})
const resource = (method: 'GET' | 'DELETE') => new Request(`https://ae.example/api/v1/chat/turns/${turnRef}`, { method })

function source(overrides: Partial<ChatTurnSource> = {}): ChatTurnSource {
  return {
    start: async () => snapshot,
    cancel: async () => ({ kind: 'stopped', turnRef, inFlightEffects: [] }),
    read: async () => snapshot,
    deltas: async (_ref, args) => ({
      turnRef, sequence: 7, state: 'completed',
      streams: args.kind === 'list'
        ? { kind: 'list' as const, messages: [{ streamId: 's1', status: 'finished' as const }] }
        : { kind: 'deltas' as const, deltas: [{ streamId: 's1', start: 0, end: 3, parts: [
          { type: 'text-start', id: 't1' },
          { type: 'text-delta', id: 't1', delta: 'Current conditions' },
          { type: 'text-end', id: 't1' },
        ] }] },
    }),
    ...overrides,
  }
}
function options(store: ChatTurnSource): ChatTurnOptions {
  return { clerkAuth, source: () => store }
}
async function parts(response: Response): Promise<Record<string, unknown>[]> {
  const wire = await response.text()
  return wire.split('\n').filter(line => line.startsWith('data: {'))
    .map(line => JSON.parse(line.slice(6)) as Record<string, unknown>)
}

describe('authenticated chat Turn HTTP adapter', () => {
  beforeEach(() => setHttpRateLimitAdmissionForTests(async () => ({ ok: true })))
  afterEach(() => { setHttpRateLimitAdmissionForTests(undefined); vi.unstubAllEnvs() })
  it('blocks a production start before source dispatch when money is unready but preserves read and cancel', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    vi.stubEnv('AE_X402_CUSTODY_ENABLED', 'false')
    const store = source({ start: vi.fn(async () => snapshot), read: vi.fn(async () => snapshot),
      cancel: vi.fn(async () => ({ kind: 'stopped' as const, turnRef, inFlightEffects: [] })) })
    const started = await handleChatTurnPost(post(), options(store))
    expect(started.status).toBe(503)
    await expect(started.json()).resolves.toMatchObject({ kind: 'UNAVAILABLE', code: 'source_unavailable' })
    expect(store.start).not.toHaveBeenCalled()
    expect((await handleChatTurnResource(resource('GET'), turnRef, options(store))).status).toBe(200)
    expect((await handleChatTurnResource(resource('DELETE'), turnRef, options(store))).status).toBe(200)
    expect(store.read).toHaveBeenCalledOnce()
    expect(store.cancel).toHaveBeenCalledOnce()
  })

  it('admits a production start when the full money manifest is valid', async () => {
    for (const [name, value] of Object.entries(productionWebManifestFixture)) vi.stubEnv(name, value)
    const store = source({ start: vi.fn(async () => snapshot) })
    const response = await handleChatTurnPost(post(), options(store))
    expect(response.status).toBe(200)
    expect(store.start).toHaveBeenCalledOnce()
    await response.body?.cancel()
  })
  it('sends the durable Turn identity first in the SDK UI stream and then text deltas', async () => {
    const response = await handleChatTurnPost(post(), options(source()))
    expect(response.status).toBe(200)
    expect(response.headers.get('x-vercel-ai-ui-message-stream')).toBe('v1')
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const events = await parts(response)
    expect(events[0]).toMatchObject({ type: 'data-ae-state', data: { kind: 'turn', turnRef, contextId: threadId, sequence: 7, state: 'completed' } })
    expect(events).toContainEqual(expect.objectContaining({ type: 'text-delta', delta: 'Current conditions' }))
  })

  it('streams canonical tool calls and redacted results in order, bounding oversized output with a describe continuation', async () => {
    const toolRef = `operation:v1:${'c'.repeat(64)}`
    const store = source({ deltas: async (_ref, args) => ({
      turnRef, sequence: 7, state: 'completed' as const,
      streams: args.kind === 'list'
        ? { kind: 'list' as const, messages: [{ streamId: 's1', status: 'finished' as const }] }
        : { kind: 'deltas' as const, deltas: [{ streamId: 's1', start: 0, end: 4, parts: [
          { type: 'tool-input-available', toolCallId: 'search', toolName: 'registry_tools_search', input: { query: 'weather', apiKey: 'input-secret', nested: { authorization: 'nested-secret' } } },
          { type: 'tool-output-available', toolCallId: 'search', output: { kind: 'matched', result: { title: 'Weather', accessToken: 'output-secret' } } },
          { type: 'tool-input-available', toolCallId: 'large', toolName: 'registry_tools_search', input: { query: 'market tools' } },
          { type: 'tool-output-available', toolCallId: 'large', output: { results: [{ toolRef, title: 'Tool' }], detail: 'x'.repeat(6_000) } },
        ] }] },
    }) })
    const events = await parts(await handleChatTurnPost(post(), options(store)))
    expect(events.slice(1, 5)).toMatchObject([
      { type: 'tool-input-available', toolCallId: 'search', toolName: 'registry.tools.search', input: { query: 'weather', nested: {} } },
      { type: 'tool-output-available', toolCallId: 'search', output: { kind: 'matched', result: { title: 'Weather' } } },
      { type: 'tool-input-available', toolCallId: 'large', toolName: 'registry.tools.search', input: { query: 'market tools' } },
      { type: 'tool-output-available', toolCallId: 'large', output: {
        truncated: true, next: [{ action: 'registry.tools.describe', args: { toolRef }, authority: 'public' }],
      } },
    ])
    expect(JSON.stringify(events)).not.toMatch(/input-secret|nested-secret|output-secret|x{100}/u)
  })

  it('projects only canonical Quote and Call outcomes, preserving uncertain payment and status recovery', async () => {
    const quoteRef = `operation-commitment:v1:${'b'.repeat(64)}`
    const callRef = `operation-invocation:v1:${'a'.repeat(64)}`
    const amount = { currency: 'AUD', units: '2500000', exponent: 6 }
    const quote = {
      kind: 'committed', quoteRef, toolRef: `operation:v1:${'c'.repeat(64)}`, toolVersion: 1,
      expiresAt: 1800000000000, price: amount,
      account: { accountRef: 'account', available: amount },
      budget: { principalRef: 'agent', maximumPerCall: amount },
      policyRefs: [], evidenceDigest: 'sha256:quote',
      continuation: { action: 'tool.call', args: { quoteRef, idempotencyKey: 'chat-test-quote' } },
    }
    const uncertain = {
      kind: 'reconciliation_required', callRef, toolRef: quote.toolRef,
      evidence: { attemptRef: 'attempt', effectGeneration: 1, requiredAt: 'now', retry: 'reconcile_before_retry', evidenceSource: 'provider' },
    }
    const store = source({ deltas: async (_ref, args) => ({
      turnRef, sequence: 7, state: 'failed' as const,
      streams: args.kind === 'list'
        ? { kind: 'list' as const, messages: [{ streamId: 's1', status: 'finished' as const }] }
        : { kind: 'deltas' as const, deltas: [{ streamId: 's1', start: 0, end: 4, parts: [
          { type: 'tool-input-available', toolCallId: 'q', toolName: 'tool_quote', input: {} },
          { type: 'tool-output-available', toolCallId: 'q', output: JSON.stringify(quote) },
          { type: 'tool-input-available', toolCallId: 'c', toolName: 'tool_call', input: {} },
          { type: 'tool-output-available', toolCallId: 'c', output: uncertain },
        ] }] },
    }) })
    const events = await parts(await handleChatTurnPost(post(), options(store)))
    expect(events).toContainEqual(expect.objectContaining({ type: 'data-ae-quote', data: expect.objectContaining({ quoteRef, expiresAt: quote.expiresAt }) }))
    expect(events).toContainEqual(expect.objectContaining({ type: 'data-ae-receipt', data: expect.objectContaining({ callRef, payment: 'outcome_unknown', state: 'working' }) }))
    expect(events).toContainEqual(expect.objectContaining({ type: 'data-ae-problem', data: expect.objectContaining({
      code: 'outcome_unknown', refs: { callRef },
      next: [{ action: 'call.status', args: { callRef }, authority: 'same_principal' }],
    }) }))
  })

  it('passes the same clientTurnId to the atomic reservation; a replay returns the original Turn', async () => {
    const reserved = new Map<string, typeof snapshot>()
    let created = 0
    const store = source({ start: vi.fn(async ({ clientTurnId }) => {
      let existing = reserved.get(clientTurnId)
      if (existing === undefined) { existing = snapshot; reserved.set(clientTurnId, existing); created++ }
      return existing
    }) })
    const first = await parts(await handleChatTurnPost(post(), options(store)))
    const replay = await parts(await handleChatTurnPost(post(), options(store)))
    expect(first[0]).toMatchObject({ data: { turnRef, contextId: threadId } })
    expect(replay[0]).toMatchObject({ data: { turnRef, contextId: threadId } })
    expect(store.start).toHaveBeenNthCalledWith(2, { prompt: 'Find a current weather Tool', clientTurnId: 'turn-stable' })
    expect(created).toBe(1)
  })

  it('returns stopped or in-flight Call refs without claiming to reverse released effects', async () => {
    const stopped = await handleChatTurnResource(resource('DELETE'), turnRef, options(source()))
    expect(await stopped.json()).toEqual({ kind: 'stopped', turnRef, inFlightEffects: [] })
    const inFlightEffects = [{ callRef: `invocation:v1:${'a'.repeat(64)}` }]
    const inFlight = await handleChatTurnResource(resource('DELETE'), turnRef, options(source({
      cancel: async () => ({ kind: 'in_flight', turnRef, inFlightEffects }),
    })))
    expect(await inFlight.json()).toEqual({ kind: 'in_flight', turnRef, inFlightEffects })
  })

  it('rejects unauthenticated calls with RFC 9457 owner authentication handoff', async () => {
    const response = await handleChatTurnPost(post(), {
      clerkAuth: async () => ({ isAuthenticated: false, userId: null }),
      source: () => { throw new Error('must not reach source') },
    })
    expect(response.status).toBe(401)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    expect(await response.json()).toMatchObject({
      kind: 'UNAUTHENTICATED', status: 401,
      next: [], ownerHandoff: { actor: 'account_owner', reason: 'connect_required', destination: expect.stringContaining('/agent-access') },
    })
  })

  it('classifies an agent-key auth-source outage as retryable 503, never bad credentials', async () => {
    const request = post()
    request.headers.set('Authorization', 'Bearer outage-key')
    const response = await handleChatTurnPost(request, {
      authenticate: async () => { throw new Error('Clerk upstream down') },
      source: () => { throw new Error('must not reach source') },
    })
    expect(response.status).toBe(503)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    expect(response.headers.get('Retry-After')).toBe('5')
    expect(await response.json()).toMatchObject({ kind: 'UNAVAILABLE', retryable: true, next: [] })
  })

  it('enforces POST mutation and GET/DELETE read budgets before touching the Turn source', async () => {
    const names: string[] = []
    setHttpRateLimitAdmissionForTests(async ({ name }) => {
      names.push(name)
      return { ok: false, retryAfter: 2_500 }
    })
    const never = { clerkAuth, source: () => { throw new Error('rate limit must precede source') } }
    for (const [request, ref] of [[post(), undefined], [resource('GET'), turnRef], [resource('DELETE'), turnRef]] as const) {
      const response = ref === undefined ? await handleChatTurnPost(request, never) : await handleChatTurnResource(request, ref, never)
      expect(response.status).toBe(429)
      expect(response.headers.get('Retry-After')).toBe('3')
      expect(await response.json()).toMatchObject({ kind: 'RESOURCE_EXHAUSTED', code: 'rate_limited', retryable: true })
    }
    expect(names).toEqual(['public-mutation', 'public-read', 'public-read'])
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const coded = await handleChatTurnPost(post(), options(source({
      start: async () => { throw new ConvexError({ code: 'rate_limited', retryAfter: 2_500 }) },
    })))
    expect(coded.status).toBe(429)
    expect(coded.headers.get('Retry-After')).toBe('3')
  })

  it('preserves a Clerk source 401 as authentication with an owner handoff', async () => {
    const store = source({ start: async () => { throw new ConvexSourceError('missing_auth', 'Clerk token expired', 401) } })
    const response = await handleChatTurnPost(post(), options(store))
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({
      kind: 'UNAUTHENTICATED',
      next: [], ownerHandoff: { actor: 'account_owner', reason: 'connect_required', destination: expect.stringContaining('/agent-access') },
    })
  })

  it.each([
    ['turn_conflict', 409, 'ALREADY_EXISTS'],
    ['turn_invalid', 400, 'INVALID_ARGUMENT'],
    ['turn_not_found', 404, 'NOT_FOUND'],
  ] as const)('maps ConvexError.data.code %s to %i %s without inspecting redacted messages', async (code, status, kind) => {
    const store = source({ start: async () => { throw new ConvexError({ code }) } })
    const response = await handleChatTurnPost(post(), options(store))
    expect(response.status).toBe(status)
    expect(await response.json()).toMatchObject({ code, kind })
  })

  it('maps a typed not_started turn_fenced result to 409 without throwing', async () => {
    const store = source({ start: async () => ({ kind: 'not_started' as const, code: 'turn_fenced' as const }) })
    const response = await handleChatTurnPost(post(), options(store))
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'turn_fenced', kind: 'FAILED_PRECONDITION' })
  })

  it('projects stream-time key revocation as a nonretryable 401 with an owner authentication handoff', async () => {
    vi.stubEnv('AE_CANONICAL_BASE_URL', 'https://canonical.example')
    const store = source({ deltas: async () => { throw new ConvexError({ code: 'unauthenticated' }) } })
    const events = await parts(await handleChatTurnPost(post(), options(store)))
    expect(events[1]).toMatchObject({ type: 'data-ae-problem', data: {
      kind: 'UNAUTHENTICATED', next: [], ownerHandoff: { actor: 'account_owner', reason: 'connect_required', destination: 'https://canonical.example/agent-access' },
    } })
  })

  it('keeps GET status a read and does not cancel or start another Turn', async () => {
    const store = source({ read: vi.fn(async () => ({ ...snapshot, state: 'working' as const })), cancel: vi.fn() })
    const response = await handleChatTurnResource(resource('GET'), turnRef, options(store))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ turnRef, state: 'working', threadId, callRefs: snapshot.callRefs, inFlightCallRefs: [] })
    expect(store.read).toHaveBeenCalledOnce()
    expect(store.cancel).not.toHaveBeenCalled()
  })
  it('projects a read failure into a validated stream problem with the original Turn status continuation', async () => {
    const store = source({
      deltas: async () => { throw new TypeError('upstream disconnected: private key must not leak') },
    })
    const response = await handleChatTurnPost(post(), options(store))
    const events = await parts(response)
    expect(events[0]).toMatchObject({ type: 'data-ae-state', data: { turnRef, contextId: threadId } })
    expect(events[1]).toMatchObject({
      type: 'data-ae-problem',
      data: {
        kind: 'UNAVAILABLE', retryable: true,
        next: [{ action: 'journey.status', args: { ref: { kind: 'turn', ref: turnRef } }, authority: 'same_principal' }],
      },
    })
    expect(JSON.stringify(events)).not.toContain('private key')
  })
})
