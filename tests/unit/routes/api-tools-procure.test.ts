import { afterEach, describe, expect, it, vi } from 'vitest'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { createProcurementEngine, handleToolProcurePost } from '@/lib/server/procure-api'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { CallService } from '@/modules/capability-execution/call-authority'
import type { ProcureIdentityPort } from '@/modules/capability-execution/procure-engine'

const toolRef = `operation:v1:${'a'.repeat(64)}`
const quoteRef = `operation-commitment:v1:${'b'.repeat(64)}`
const callRef = `operation-invocation:v1:${'c'.repeat(64)}`
const principal: AgentAccessPrincipal = {
  principalId: 'prn_00000000000040008000000000000044',
  ownerId: 'acc_00000000000040008000000000000044',
  credentialId: 'crd_test', applicationRef: 'app_test', environment: 'production',
  scopes: ['market_tools:call'], authorityMode: 'spending_policy',
}
const exactRequest = {
  kind: 'exact', toolRef, input: { from: 'America/New_York', to: 'Asia/Tokyo' },
  maxSpendAud: '0.50', idempotencyKey: 'caller-key-0001',
} as const

function testEngine() {
  const rows = new Map<string, { hash: string; quoteRef: string | null; resultJson: string | null }>()
  const identity: ProcureIdentityPort = {
    async reserve(input, actor) {
      const key = `${actor.principalId}:${input.idempotencyKey}`
      const row = rows.get(key)
      const hash = canonicalDigest(input)
      if (row) return row.hash === hash
        ? { kind: 'replay', quoteRef: row.quoteRef, resultJson: row.resultJson }
        : { kind: 'conflict' }
      rows.set(key, { hash, quoteRef: null, resultJson: null })
      return { kind: 'reserved' }
    },
    async checkpoint(input, actor, quote) {
      const row = rows.get(`${actor.principalId}:${input.idempotencyKey}`)!
      row.quoteRef = quote.quoteRef
      row.resultJson = JSON.stringify(quote)
      return { kind: 'replay', quoteRef: row.quoteRef, resultJson: row.resultJson }
    },
    async complete(input, actor, result) {
      const row = rows.get(`${actor.principalId}:${input.idempotencyKey}`)!
      row.resultJson = JSON.stringify(result)
      return { kind: 'replay', quoteRef: row.quoteRef, resultJson: row.resultJson }
    },
  }
  const service: CallService = {
    quoteTool: vi.fn(async () => ({
      kind: 'committed' as const, quoteRef, toolRef,
      toolVersion: 1, expiresAt: Date.now() + 60_000,
      normalizedInput: exactRequest.input,
      price: { currency: 'AUD' as const, units: '2000', exponent: 6 },
      account: { accountRef: 'account:test', available: { currency: 'AUD' as const, units: '1000000', exponent: 6 } },
      budget: { principalRef: principal.principalId, maximumPerCall: { currency: 'AUD' as const, units: '1000000', exponent: 6 } },
      policyRefs: [], evidenceDigest: 'quote-evidence',
      continuation: { action: 'tool.call' as const, method: 'POST' as const, path: '/api/v1/tools/call' as const,
        input: { quoteRef, idempotencyKey: exactRequest.idempotencyKey } },
    })),
    callTool: vi.fn(async () => ({
      kind: 'completed' as const, callRef, toolRef,
      output: { result: { convertedTime: '2026-07-05T04:30:00+09:00' } },
      evidenceHash: 'call-evidence',
      usage: {
        usageRef: 'usage:test', observedAt: Date.now(), chargeState: 'paid' as const,
        amount: { currency: 'AUD' as const, units: '2000', exponent: 6 },
        priceDigest: 'quoted-price',
      },
    })),
    readCallStatus: vi.fn(), cancelCall: vi.fn(), reconcileCall: vi.fn(),
  }
  return {
    engine: createProcurementEngine({
      principal, callService: service, identity, catalogSearcher: vi.fn(async () => []),
    }), service,
  }
}

function postProcureRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://ae.test/api/v1/tools/procure', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/v1/tools/procure route', () => {
  afterEach(() => setHttpRateLimitAdmissionForTests(undefined))

  it('delivers an exact Tool with native Quote/Call references and a status continuation', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const { engine, service } = testEngine()
    const response = await handleToolProcurePost(postProcureRequest(exactRequest), engine)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      status: 'delivered', quoteRef, callRef, idempotencyKey: exactRequest.idempotencyKey,
      price: { totalAud: 'A$0.01', netAud: 'A$0.01', gstAud: 'A$0.01' },
      next: [{ action: 'status', args: { ref: { kind: 'call', ref: callRef } }, authority: 'same_principal' }],
    })
    expect(service.quoteTool).toHaveBeenCalledTimes(1)
    expect(service.callTool).toHaveBeenCalledTimes(1)
  })

  it('replays the first purchase without another Quote or Call; rejects different material', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const { engine, service } = testEngine()
    const first = await (await handleToolProcurePost(postProcureRequest(exactRequest), engine)).json()
    const replay = await (await handleToolProcurePost(postProcureRequest(exactRequest), engine)).json()
    expect(replay).toEqual(first)
    expect(service.quoteTool).toHaveBeenCalledTimes(1)
    expect(service.callTool).toHaveBeenCalledTimes(1)
    const conflict = await handleToolProcurePost(postProcureRequest({ ...exactRequest, input: { from: 'UTC' } }), engine)
    expect(conflict.status).toBe(409)
    await expect(conflict.json()).resolves.toMatchObject({ kind: 'ALREADY_EXISTS', code: 'idempotency_conflict' })
  })

  it('refuses over-budget Quote before native Call while exposing Quote status', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const { engine, service } = testEngine()
    const response = await handleToolProcurePost(postProcureRequest({ ...exactRequest, maxSpendAud: '0.001' }), engine)
    expect(response.status).toBe(429)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    const body = await response.json()
    expect(body).toMatchObject({
      kind: 'RESOURCE_EXHAUSTED', code: 'budget_exceeded', retryable: false,
      refs: { quoteRef, idempotencyKey: exactRequest.idempotencyKey },
      next: [
        { action: 'fund', args: {}, authority: 'agent_key' },
        { action: 'status', args: { ref: { kind: 'quote', ref: quoteRef } }, authority: 'same_principal' },
      ],
    })
    const replay = await handleToolProcurePost(postProcureRequest({ ...exactRequest, maxSpendAud: '0.001' }), engine)
    expect(replay.status).toBe(429)
    expect((await replay.json()).code).toBe(body.code)
    expect(service.quoteTool).toHaveBeenCalledTimes(1)
    expect(service.callTool).not.toHaveBeenCalled()
  })

  it('projects a native Call budget refusal as RESOURCE_EXHAUSTED without terminalising the key', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const { engine, service } = testEngine()
    const callTool = vi.mocked(service.callTool)
    callTool.mockResolvedValue({ kind: 'refused', toolRef, code: 'budget_exceeded', retryable: false })
    const first = await handleToolProcurePost(postProcureRequest(exactRequest), engine)
    const replay = await handleToolProcurePost(postProcureRequest(exactRequest), engine)
    expect(first.status).toBe(429)
    expect(replay.status).toBe(429)
    await expect(first.json()).resolves.toMatchObject({
      kind: 'RESOURCE_EXHAUSTED', code: 'budget_exceeded', retryable: false,
      next: [
        { action: 'fund', args: {}, authority: 'agent_key' },
        { action: 'status', args: { ref: { kind: 'quote', ref: quoteRef } }, authority: 'same_principal' },
      ],
    })
    expect(service.quoteTool).toHaveBeenCalledTimes(1)
    expect(callTool).toHaveBeenCalledTimes(2)
    expect(callTool.mock.calls[0]?.[0].input.idempotencyKey).toBe(callTool.mock.calls[1]?.[0].input.idempotencyKey)
  })

  it('refuses need-mode procurement without a maximum spend before Quote or Call', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const { engine, service } = testEngine()
    const response = await handleToolProcurePost(postProcureRequest({
      kind: 'need', need: 'Find a timezone converter', idempotencyKey: 'missing-budget-1',
    }), engine)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ kind: 'INVALID_ARGUMENT', code: 'invalid_request' })
    expect(service.quoteTool).not.toHaveBeenCalled()
    expect(service.callTool).not.toHaveBeenCalled()
  })

  it('rejects unsupported content types with RFC 9457 problem details', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const response = await handleToolProcurePost(postProcureRequest('not-json', { 'content-type': 'text/plain' }), testEngine().engine)
    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toMatchObject({ kind: 'UNSUPPORTED_MEDIA_TYPE', code: 'invalid_content_type' })
  })

  it('rejects invalid JSON payloads with 400 INVALID_ARGUMENT', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const response = await handleToolProcurePost(postProcureRequest('{ invalid json'), testEngine().engine)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ kind: 'INVALID_ARGUMENT', code: 'invalid_json' })
  })

  it('rejects unknown procurement fields through the strict input contract', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const response = await handleToolProcurePost(postProcureRequest({ ...exactRequest, endpointUrl: 'https://attacker.example' }), testEngine().engine)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ kind: 'INVALID_ARGUMENT', code: 'invalid_request' })
  })
})
