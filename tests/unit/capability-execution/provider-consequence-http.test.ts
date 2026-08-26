import { getFunctionName } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'

import type { ActionCtx } from '../../../convex/_generated/server'
import {
  abortProviderConsequenceJournal,
  attestProviderConsequenceTicket,
  beginProviderConsequenceJournal,
  completeProviderConsequenceJournal,
  providerConsequenceX402Rpc,
} from '../../../convex/providerConsequenceHttp'

const TOKEN = 'a'.repeat(43)
const DIGEST = (character: string) => `sha256:${character.repeat(64)}`
type HttpHandler = (ctx: ActionCtx, request: Request) => Promise<Response>
type HttpExport = { _handler: HttpHandler }

const begin = (beginProviderConsequenceJournal as unknown as HttpExport)._handler
const attest = (attestProviderConsequenceTicket as unknown as HttpExport)._handler
const complete = (completeProviderConsequenceJournal as unknown as HttpExport)._handler
const abort = (abortProviderConsequenceJournal as unknown as HttpExport)._handler
const x402 = (providerConsequenceX402Rpc as unknown as HttpExport)._handler

function request(body: unknown, token = TOKEN) {
  return new Request('https://deployment.convex.site/internal/provider-consequence', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
}

function rawRequest(body: string, headers: Record<string, string> = {}) {
  return new Request('https://deployment.convex.site/internal/provider-consequence', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, ...headers },
    body,
  })
}

function path(reference: unknown) {
  return getFunctionName(reference as never)
}

function authority() {
  return {
    kind: 'authorized' as const,
    invocationRef: 'invocation:canonical',
    operationRef: 'operation:canonical',
    attemptRef: 'attempt:canonical',
    effectGeneration: 3,
    credentialRef: `sec_${'1'.repeat(32)}`,
    principalId: `prn_${'2'.repeat(32)}`,
    credentialId: 'credential:canonical',
    grantRef: 'grant:canonical',
    grantGeneration: 4,
    environment: 'sandbox' as const,
    inputDigest: DIGEST('3'),
    providerRef: 'provider:canonical',
  }
}

describe('provider consequence Convex HTTP callbacks', () => {
  it('hashes the bearer and binds the exact journal-begin body', async () => {
    const runMutation = vi.fn<(
      reference: unknown,
      args: Record<string, unknown>
    ) => Promise<unknown>>(async () => ({ kind: 'claimed', claimRef: 'claim:test' }))
    const ctx = { runMutation } as unknown as ActionCtx
    const body = {
      ticketRef: 'ticket:test',
      effectRef: 'effect:test',
      requestDigest: DIGEST('1'),
      invocationDigest: DIGEST('2'),
      ticketClaimsDigest: DIGEST('3'),
      expiresAt: 2_000_000_010_000,
    }

    const response = await begin(ctx, request(body))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ kind: 'claimed', claimRef: 'claim:test' })
    expect(runMutation).toHaveBeenCalledOnce()
    expect(path(runMutation.mock.calls[0]?.[0])).toBe(
      'capabilityProviderConsequenceJournal:claimProviderConsequence',
    )
    const args = runMutation.mock.calls[0]?.[1] as Record<string, unknown>
    expect(args).toMatchObject(body)
    expect(args.journalTokenDigest).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(JSON.stringify(args)).not.toContain(TOKEN)
  })

  it('attests only the exact pending ticket and contains malformed or unavailable reads', async () => {
    const body = {
      ticketRef: 'ticket:test',
      ticketClaimsDigest: DIGEST('3'),
      expiresAt: 2_000_000_010_000,
    }
    const runQuery = vi.fn<(
      reference: unknown,
      args: Record<string, unknown>
    ) => Promise<unknown>>(async () => ({ kind: 'attested' }))
    const success = await attest({ runQuery } as unknown as ActionCtx, request(body))
    expect(success.status).toBe(200)
    expect(runQuery).toHaveBeenCalledOnce()
    expect(path(runQuery.mock.calls[0]?.[0])).toBe(
      'capabilityProviderConsequenceJournal:attestProviderConsequenceTicket',
    )
    const args = runQuery.mock.calls[0]?.[1] as Record<string, unknown>
    expect(args).toMatchObject(body)
    expect(args.journalTokenDigest).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(JSON.stringify(args)).not.toContain(TOKEN)

    await expect(attest({ runQuery: vi.fn(async () => ({ kind: 'unavailable' })) } as unknown as ActionCtx, request(body)))
      .resolves.toMatchObject({ status: 409 })
    for (const candidate of [
      request({ ...body, extra: true }),
      request({ ...body, ticketRef: '' }),
      request({ ...body, ticketClaimsDigest: 'caller-proof' }),
      request({ ...body, expiresAt: 1.5 }),
    ]) {
      await expect(attest({ runQuery: vi.fn() } as unknown as ActionCtx, candidate))
        .resolves.toMatchObject({ status: 400 })
    }
    const unauthenticated = request(body)
    unauthenticated.headers.delete('authorization')
    await expect(attest({ runQuery: vi.fn() } as unknown as ActionCtx, unauthenticated))
      .resolves.toMatchObject({ status: 401 })
    await expect(attest({
      runQuery: vi.fn(async () => { throw new Error('journal_unavailable') }),
    } as unknown as ActionCtx, request(body))).resolves.toMatchObject({ status: 503 })
  })

  it.each([
    ['missing bearer', '', 401],
    ['short bearer', 'short', 401],
    ['extra body key', TOKEN, 400],
  ])('rejects invalid begin authentication or shape: %s', async (label, token, status) => {
    const runMutation = vi.fn()
    const body: Record<string, unknown> = {
      ticketRef: 'ticket:test',
      effectRef: 'effect:test',
      requestDigest: DIGEST('1'),
      invocationDigest: DIGEST('2'),
      ticketClaimsDigest: DIGEST('3'),
      expiresAt: 2_000_000_010_000,
    }
    if (label === 'extra body key') body.callerPrincipal = 'attacker'
    const raw = request(body, token)
    if (token === '') raw.headers.delete('authorization')

    const response = await begin({ runMutation } as unknown as ActionCtx, raw)

    expect(response.status).toBe(status)
    expect(runMutation).not.toHaveBeenCalled()
  })

  it('returns conflict for denied completion/abort and success only for exact terminal acknowledgement', async () => {
    const terminalBody = { ticketRef: 'ticket:test', claimRef: 'claim:test' }
    for (const entry of [
      { handler: complete, body: { ...terminalBody, observation: { transport: 'http' } }, accepted: 'completed' },
      { handler: abort, body: terminalBody, accepted: 'aborted' },
    ]) {
      const denied = vi.fn<(
        reference: unknown,
        args: Record<string, unknown>
      ) => Promise<unknown>>(async () => ({ kind: 'unavailable' }))
      const conflict = await entry.handler({ runMutation: denied } as unknown as ActionCtx, request(entry.body))
      expect(conflict.status).toBe(409)
      const acknowledged = vi.fn<(
        reference: unknown,
        args: Record<string, unknown>
      ) => Promise<unknown>>(async () => ({ kind: entry.accepted }))
      const success = await entry.handler({ runMutation: acknowledged } as unknown as ActionCtx, request(entry.body))
      expect(success.status).toBe(200)
      const args = acknowledged.mock.calls[0]?.[1] as Record<string, unknown>
      expect(args).toMatchObject(terminalBody)
      expect(args.journalTokenDigest).toMatch(/^sha256:[0-9a-f]{64}$/u)
      expect(JSON.stringify(args)).not.toContain(TOKEN)
    }
  })

  it('canonicalizes provider-direct reserve identity and strips every caller custody field', async () => {
    const calls: Array<{ path: string; args: Record<string, unknown> }> = []
    const runMutation = vi.fn(async (reference: unknown, args: Record<string, unknown>) => {
      calls.push({ path: path(reference), args })
      if (calls.length === 1) return authority()
      return { kind: 'accepted', status: 'reserved' }
    })
    const supplied = {
      principalId: 'attacker',
      credentialId: 'attacker',
      grantRef: 'grant:attacker',
      grantGeneration: 999,
      environment: 'production',
      invocationRef: 'invocation:attacker',
      operationRef: 'operation:attacker',
      attemptRef: 'attempt:attacker',
      effectGeneration: 999,
      providerRef: 'provider:attacker',
      paymentIdentifier: DIGEST('4'),
      challengeDigest: DIGEST('5'),
      amount: { currency: 'USD', units: '125', exponent: 2 },
      custodyRef: 'wallet:attacker',
      custodyGeneration: 99,
      custodyDailyMaximum: { currency: 'USD', units: '999999', exponent: 2 },
      observedAt: 1,
    }

    const response = await x402({ runMutation, runQuery: vi.fn() } as unknown as ActionCtx, request({
      ticketRef: 'ticket:test',
      operation: 'reserve_external_spend',
      args: supplied,
    }))

    expect(response.status).toBe(200)
    expect(calls[0]?.path).toBe(
      'capabilityProviderConsequenceJournal:authorizeProviderConsequenceX402Rpc',
    )
    expect(calls[0]?.args.args).toEqual(supplied)
    expect(calls[1]).toEqual({
      path: 'moneyLedger:reserveExternalInvocationSpend',
      args: expect.objectContaining({
        principalId: authority().principalId,
        credentialId: authority().credentialId,
        grantRef: authority().grantRef,
        grantGeneration: authority().grantGeneration,
        environment: 'sandbox',
        invocationRef: authority().invocationRef,
        operationRef: authority().operationRef,
        attemptRef: authority().attemptRef,
        effectGeneration: authority().effectGeneration,
        providerRef: authority().providerRef,
        paymentIdentifier: DIGEST('4'),
      }),
    })
    expect(calls[1]?.args).not.toHaveProperty('custodyRef')
    expect(calls[1]?.args).not.toHaveProperty('custodyGeneration')
    expect(calls[1]?.args).not.toHaveProperty('custodyDailyMaximum')
  })

  it('canonicalizes prepared authorization provenance and removes managed-custody substitution', async () => {
    const calls: Array<{ path: string; args: Record<string, unknown> }> = []
    const runMutation = vi.fn(async (reference: unknown, args: Record<string, unknown>) => {
      calls.push({ path: path(reference), args })
      return calls.length === 1 ? authority() : { custodyRef: 'attempt:test', authorizationDigest: DIGEST('8') }
    })
    const supplied = {
      dispatchRef: 'invocation:attacker',
      operationRef: 'operation:attacker',
      inputDigest: DIGEST('f'),
      attemptRef: 'attempt:attacker',
      effectGeneration: 99,
      credentialRef: `sec_${'0'.repeat(32)}`,
      custodyBudgetRef: 'wallet:attacker',
      custodyGeneration: 99,
      custodyDailyMaximumUnits: '999999',
      paymentIdentifier: DIGEST('4'),
      operationKeyDigest: DIGEST('4'),
      challengeDigest: DIGEST('5'),
      challengeJson: '{}',
      selectedRequirementJson: '{}',
      providerEndpoint: 'https://provider.example/pay',
      scheme: 'exact',
      network: 'eip155:8453',
      asset: '0xasset',
      payTo: '0xpayee',
      amountUnits: '125',
      currency: 'USD',
      exponent: 2,
      reservationRef: 'external-spend:test',
    }

    const response = await x402({ runMutation, runQuery: vi.fn() } as unknown as ActionCtx, request({
      ticketRef: 'ticket:test',
      operation: 'prepare_authorization',
      args: supplied,
    }))

    expect(response.status).toBe(200)
    expect(calls[1]?.args).toMatchObject({
      dispatchRef: authority().invocationRef,
      operationRef: authority().operationRef,
      inputDigest: authority().inputDigest,
      attemptRef: authority().attemptRef,
      effectGeneration: authority().effectGeneration,
      credentialRef: authority().credentialRef,
      reservationRef: 'external-spend:test',
    })
    expect(calls[1]?.args).not.toHaveProperty('custodyBudgetRef')
    expect(calls[1]?.args).not.toHaveProperty('custodyGeneration')
    expect(calls[1]?.args).not.toHaveProperty('custodyDailyMaximumUnits')
  })

  it('denies non-allowlisted operations and does not cross a denied journal authorization', async () => {
    const runMutation = vi.fn(async () => ({ kind: 'unavailable' }))
    const ctx = { runMutation, runQuery: vi.fn() } as unknown as ActionCtx
    const disallowed = await x402(ctx, request({
      ticketRef: 'ticket:test', operation: 'claim_authorization', args: {},
    }))
    expect(disallowed.status).toBe(400)
    expect(runMutation).not.toHaveBeenCalled()

    const denied = await x402(ctx, request({
      ticketRef: 'ticket:test', operation: 'observe_attempt', args: {},
    }))
    expect(denied.status).toBe(409)
    expect(runMutation).toHaveBeenCalledOnce()
  })

  it('rejects every malformed JSON transport and canonical begin field before mutation', async () => {
    const valid = {
      ticketRef: 'ticket:test', effectRef: 'effect:test', requestDigest: DIGEST('1'),
      invocationDigest: DIGEST('2'), ticketClaimsDigest: DIGEST('3'), expiresAt: 2_000_000_010_000,
    }
    const cases = [
      rawRequest(JSON.stringify(valid)),
      rawRequest(JSON.stringify(valid), { 'Content-Type': 'application/json', 'Content-Length': String(129 * 1024) }),
      rawRequest(JSON.stringify({ ...valid, padding: 'x'.repeat(129 * 1024) }), { 'Content-Type': 'application/json' }),
      rawRequest('{', { 'Content-Type': 'application/json' }),
      rawRequest('[]', { 'Content-Type': 'application/json' }),
      request({ ...valid, ticketRef: '' }),
      request({ ...valid, effectRef: [] }),
      request({ ...valid, requestDigest: 'caller-proof' }),
      request({ ...valid, invocationDigest: null }),
      request({ ...valid, ticketClaimsDigest: DIGEST('z') }),
      request({ ...valid, expiresAt: 1.5 }),
    ]
    for (const candidate of cases) {
      const runMutation = vi.fn()
      const response = await begin({ runMutation } as unknown as ActionCtx, candidate)
      expect(response.status).toBe(400)
      expect(runMutation).not.toHaveBeenCalled()
    }
    const runMutation = vi.fn(async () => { throw new Error('journal_unavailable') })
    await expect(begin({ runMutation } as unknown as ActionCtx, request(valid)))
      .resolves.toMatchObject({ status: 503 })
  })

  it('rejects malformed terminal callbacks and contains journal outages', async () => {
    const ctx = { runMutation: vi.fn() } as unknown as ActionCtx
    for (const [handler, body] of [
      [complete, { ticketRef: '', claimRef: 'claim:test', observation: {} }],
      [complete, { ticketRef: 'ticket:test', claimRef: [] as unknown[], observation: {} }],
      [abort, { ticketRef: '', claimRef: 'claim:test' }],
      [abort, { ticketRef: 'ticket:test', claimRef: null }],
      [complete, { ticketRef: 'ticket:test', claimRef: 'claim:test' }],
      [abort, { ticketRef: 'ticket:test', claimRef: 'claim:test', extra: true }],
    ] as const) {
      const response = await handler(ctx, request(body))
      expect(response.status).toBe(400)
    }
    expect(ctx.runMutation).not.toHaveBeenCalled()

    for (const [handler, body] of [
      [complete, { ticketRef: 'ticket:test', claimRef: 'claim:test', observation: {} }],
      [abort, { ticketRef: 'ticket:test', claimRef: 'claim:test' }],
    ] as const) {
      const unauthenticated = request(body)
      unauthenticated.headers.delete('authorization')
      await expect(handler(ctx, unauthenticated)).resolves.toMatchObject({ status: 401 })
    }

    const throwing = { runMutation: vi.fn(async () => { throw new Error('journal_unavailable') }) } as unknown as ActionCtx
    await expect(complete(throwing, request({
      ticketRef: 'ticket:test', claimRef: 'claim:test', observation: {},
    }))).resolves.toMatchObject({ status: 503 })
    await expect(abort(throwing, request({
      ticketRef: 'ticket:test', claimRef: 'claim:test',
    }))).resolves.toMatchObject({ status: 503 })

    const completeRequest = request({
      ticketRef: 'ticket:test', claimRef: 'claim:test', observation: { marker: true },
    })
    const stringify = JSON.stringify
    const stringifySpy = vi.spyOn(JSON, 'stringify').mockImplementation((value, ...args) => {
      if ((value as { marker?: boolean })?.marker === true) throw new TypeError('non_serializable')
      return stringify(value, ...args)
    })
    await expect(complete(ctx, completeRequest)).resolves.toMatchObject({ status: 400 })
    stringifySpy.mockRestore()
  })

  it.each([
    ['read_authorization', 'moneyX402PaymentAttempts:readX402PaymentAuthorization', 'query'],
    ['read_authorization_by_digest', 'moneyX402PaymentAttempts:readX402PaymentAuthorizationByDigest', 'query'],
    ['record_signature_digest', 'moneyX402PaymentAttempts:recordX402PaymentSignatureDigest', 'mutation'],
    ['mark_possibly_submitted', 'moneyX402PaymentAttempts:markX402PaymentPossiblySubmitted', 'mutation'],
    ['observe_attempt', 'moneyX402PaymentAttempts:observeX402PaymentAttempt', 'mutation'],
  ] as const)('routes allowlisted x402 operation %s only after journal authorization', async (operation, expectedPath, kind) => {
    const calls: Array<{ path: string; args: Record<string, unknown> }> = []
    const runMutation = vi.fn(async (reference: unknown, args: Record<string, unknown>) => {
      calls.push({ path: path(reference), args })
      return calls.length === 1 ? authority() : { applied: true }
    })
    const runQuery = vi.fn(async (reference: unknown, args: Record<string, unknown>) => {
      calls.push({ path: path(reference), args })
      return { state: 'prepared' }
    })
    const supplied = { custodyRef: 'attempt:test', authorizationDigest: DIGEST('a') }
    const response = await x402({ runMutation, runQuery } as unknown as ActionCtx, request({
      ticketRef: 'ticket:test', operation, args: supplied,
    }))
    expect(response.status).toBe(200)
    expect(calls[1]).toEqual({ path: expectedPath, args: supplied })
    expect(kind === 'query' ? runQuery : runMutation).toHaveBeenCalled()
  })

  it('rejects malformed x402 callback envelopes and contains authorized operation failures', async () => {
    const ctx = { runMutation: vi.fn(), runQuery: vi.fn() } as unknown as ActionCtx
    for (const body of [
      { ticketRef: '', operation: 'observe_attempt', args: {} },
      { ticketRef: 'ticket:test', operation: 7, args: {} },
      { ticketRef: 'ticket:test', operation: 'observe_attempt', args: [] },
      { ticketRef: 'ticket:test', operation: 'observe_attempt' },
    ]) {
      await expect(x402(ctx, request(body))).resolves.toMatchObject({ status: 400 })
    }
    expect(ctx.runMutation).not.toHaveBeenCalled()
    const unauthenticated = request({
      ticketRef: 'ticket:test', operation: 'observe_attempt', args: {},
    })
    unauthenticated.headers.delete('authorization')
    await expect(x402(ctx, unauthenticated)).resolves.toMatchObject({ status: 401 })

    const throwing = {
      runMutation: vi.fn(async () => { throw new Error('operation_unavailable') }),
      runQuery: vi.fn(),
    } as unknown as ActionCtx
    await expect(x402(throwing, request({
      ticketRef: 'ticket:test', operation: 'observe_attempt', args: {},
    }))).resolves.toMatchObject({ status: 503 })
  })
})
