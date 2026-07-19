import { describe, expect, it, vi } from 'vitest'

import {
  createDevelopmentDynamicPublishedSource,
  createDynamicPublishedActionInvocationAdapter,
  loadDynamicPublishedAdapterSnapshot,
  type ActionInvocationOrigin,
  type InvocationActor,
} from '@/modules/action-invocation'
import { buildDevelopmentPublishedOperationEvidence } from '@/modules/capability-supply/development-published-operation-evidence'
import type {
  RouteTransportFetch,
  RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'

const actor: InvocationActor = { callerRef: 'agent:development', principalRef: 'principal:development' }
const origins: readonly ActionInvocationOrigin[] = [
  { kind: 'request_owned', requestRef: 'request:development', revision: 4 },
  { kind: 'standalone', callerRef: actor.callerRef, principalRef: actor.principalRef },
]

describe('dynamic PublishedOperation Action Invocation adapter', () => {
  it.each(origins)('executes exact persisted x402 material once for $kind', async (origin) => {
    const fixture = buildDevelopmentPublishedOperationEvidence()
    const clock = fixture.operation.readiness.observedAt + 1_000
    vi.spyOn(Date, 'now').mockReturnValue(clock)
    const effects = { payment: 0, provider: 0 }
    const adapter = createAdapter(fixture.operation, successRuntime(fixture.operation.binding.endpointUrl, effects), clock)
    const prepared = adapter.prepare({
      origin,
      actor,
      value: { symbol: 'BTC', convert: 'USD' },
      freshnessMs: 60_000,
    })
    expect(prepared.prepared?.dataUse.limits).toMatchObject({
      amountMinor: 1,
      publicationRevision: 7,
    })
    const decided = adapter.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin,
      accept: true,
    })
    expect(decided.kind).toBe('accepted')
    if (decided.kind !== 'accepted') return
    const acquired = adapter.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin,
      leaseOwner: 'worker:one',
      leaseMs: 30_000,
    })
    expect(acquired.kind).toBe('accepted')
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') return
    const completed = await adapter.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
    })
    expect(completed.kind).toBe('accepted')
    expect(completed.kind === 'accepted' && completed.view.observedResolution).toMatchObject({
      state: 'returned',
      result: { kind: 'published_operation_succeeded' },
    })
    expect(effects).toEqual({ payment: 1, provider: 1 })
    const duplicate = await adapter.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
    })
    expect(duplicate).toMatchObject({ kind: 'refused', code: 'stale_invocation_version' })
    expect(effects).toEqual({ payment: 1, provider: 1 })
  })

  it('holds post-payment loss for reconciliation and cold-resumes exact control', async () => {
    const fixture = buildDevelopmentPublishedOperationEvidence()
    const clock = fixture.operation.readiness.observedAt + 1_000
    vi.spyOn(Date, 'now').mockReturnValue(clock)
    const effects = { payment: 0, provider: 0 }
    const source = createDevelopmentDynamicPublishedSource([fixture.operation])
    const adapter = createAdapter(
      fixture.operation,
      lostResponseRuntime(fixture.operation.binding.endpointUrl, effects),
      clock,
      source,
    )
    const origin = origins[1]!
    const prepared = adapter.prepare({
      origin, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
    })
    const decided = adapter.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const acquired = adapter.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, leaseOwner: 'worker:one', leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') throw new Error('not leased')
    const uncertain = await adapter.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
    })
    expect(uncertain.kind === 'accepted' && uncertain.view.control).toMatchObject({
      state: 'reconciliation_required',
    })
    expect(effects).toEqual({ payment: 1, provider: 1 })
    const snapshot = adapter.exportSnapshot()
    const loaded = loadDynamicPublishedAdapterSnapshot(JSON.parse(JSON.stringify(snapshot)))
    const coldSource = createDevelopmentDynamicPublishedSource([fixture.operation], loaded.sourceRows)
    const cold = createAdapter(
      fixture.operation,
      successRuntime(fixture.operation.binding.endpointUrl, effects),
      clock + 1_000,
      coldSource,
      loaded.durableState,
    )
    expect(cold.inspect(prepared.invocationRef)?.control).toMatchObject({ state: 'reconciliation_required' })
    const cancelled = cold.cancel({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: uncertain.kind === 'accepted' ? uncertain.view.invocationVersion : 0,
      actor,
      origin,
    })
    expect(cancelled).toMatchObject({ kind: 'refused', code: 'invalid_control_state' })
    const retry = cold.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: uncertain.kind === 'accepted' ? uncertain.view.invocationVersion : 0,
      authorityRef: prepared.authority!.reference,
      actor, origin, leaseOwner: 'worker:two', leaseMs: 30_000,
    })
    expect(retry).toMatchObject({ kind: 'refused', code: 'invalid_control_state' })
    const view = cold.inspect(prepared.invocationRef)!
    const attempt = view.attempts[0]!
    const evidenceMaterial = {
      kind: 'action_invocation_reconciliation' as const,
      version: 1 as const,
      evidenceRef: 'provider:reconciliation:one',
      source: `published-operation:${fixture.operation.operationId}`,
      invocationRef: view.invocationRef,
      attemptRef: attempt.attemptRef,
      effectGeneration: attempt.effectGeneration,
      resolution: 'released' as const,
      observedAt: new Date(clock + 1_000).toISOString(),
    }
    const reconciled = cold.reconcile({
      invocationRef: view.invocationRef,
      expectedInvocationVersion: view.invocationVersion,
      attemptRef: attempt.attemptRef,
      actor,
      origin,
      evidence: { ...evidenceMaterial, digest: canonicalDigest(evidenceMaterial) },
    })
    expect(reconciled.kind === 'accepted' && reconciled.view.control).toEqual({ state: 'terminal' })
    expect(effects).toEqual({ payment: 1, provider: 1 })
  })

  it('rejects input, identity, source drift, stale workers, and invalid output evidence', async () => {
    const fixture = buildDevelopmentPublishedOperationEvidence()
    const clock = fixture.operation.readiness.observedAt + 1_000
    vi.spyOn(Date, 'now').mockReturnValue(clock)
    const source = createDevelopmentDynamicPublishedSource([fixture.operation])
    const adapter = createAdapter(
      fixture.operation,
      invalidOutputRuntime(fixture.operation.binding.endpointUrl),
      clock,
      source,
    )
    expect(() => adapter.prepare({
      origin: origins[0]!, actor, value: { symbol: 'BTC', convert: 'USD', method: 'POST' }, freshnessMs: 1_000,
    })).toThrow('published_operation_input_invalid')
    const prepared = adapter.prepare({
      origin: origins[0]!, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
    })
    expect(adapter.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor: { ...actor, principalRef: 'principal:attacker' },
      origin: origins[0]!,
      accept: true,
    })).toMatchObject({ kind: 'refused', code: 'cross_principal_refused' })
    const decided = adapter.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin: origins[0]!, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const acquired = adapter.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin: origins[0]!, leaseOwner: 'worker:one', leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') throw new Error('not leased')
    expect(await adapter.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion - 1,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
    })).toMatchObject({ kind: 'refused', code: 'stale_invocation_version' })
    const invalid = await adapter.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
    })
    expect(invalid.kind === 'accepted' && invalid.view.observedResolution).toMatchObject({
      state: 'returned',
      result: { kind: 'published_operation_invalid_evidence', failureCode: 'output_schema_invalid' },
    })
  })

  it('requalifies publication material immediately before release', async () => {
    const fixture = buildDevelopmentPublishedOperationEvidence()
    const clock = fixture.operation.readiness.observedAt + 1_000
    vi.spyOn(Date, 'now').mockReturnValue(clock)
    const effects = { payment: 0, provider: 0 }
    const source = createDevelopmentDynamicPublishedSource([fixture.operation])
    const adapter = createAdapter(
      fixture.operation,
      successRuntime(fixture.operation.binding.endpointUrl, effects),
      clock,
      source,
    )
    const origin = origins[0]!
    const prepared = adapter.prepare({
      origin, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
    })
    const decided = adapter.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    source.setCurrent({
      ...fixture.operation,
      identity: {
        ...fixture.operation.identity,
        paymentRecipient: '0xaltered-recipient',
      },
    })
    const acquired = adapter.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, leaseOwner: 'worker:one', leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') throw new Error('not leased')
    const refused = await adapter.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
    })
    expect(refused.kind === 'accepted' && refused.view.observedResolution).toMatchObject({
      state: 'returned',
      execution: 'pre_release_refused',
      result: { failureCode: 'operation_material_changed' },
    })
    expect(effects).toEqual({ payment: 0, provider: 0 })
  })
})

function createAdapter(
  operation: ReturnType<typeof buildDevelopmentPublishedOperationEvidence>['operation'],
  runtime: RouteTransportRuntime,
  now: number,
  source = createDevelopmentDynamicPublishedSource([operation]),
  durableState?: Parameters<typeof createDynamicPublishedActionInvocationAdapter>[0]['durableState'],
) {
  let invocation = 0
  let authority = 0
  let attempt = 0
  return createDynamicPublishedActionInvocationAdapter({
    operation,
    source,
    runtime,
    now: () => now,
    nextInvocationRef: () => `invocation:${++invocation}`,
    nextAuthorityRef: () => `authority:${++authority}`,
    nextAttemptRef: () => `attempt:${++attempt}`,
    ...(durableState === undefined ? {} : { durableState }),
  })
}

function successRuntime(endpoint: string, effects: { payment: number; provider: number }): RouteTransportRuntime {
  return runtime(endpoint, effects, JSON.stringify({ data: { BTC: { quote: { USD: { price: 1 } } } } }))
}

function invalidOutputRuntime(endpoint: string): RouteTransportRuntime {
  return runtime(endpoint, { payment: 0, provider: 0 }, JSON.stringify({ unexpected: true }))
}

function lostResponseRuntime(endpoint: string, effects: { payment: number; provider: number }): RouteTransportRuntime {
  const base = runtime(endpoint, effects, '{}')
  let calls = 0
  return {
    ...base,
    send: async (url, init) => {
      calls += 1
      if (calls === 2) {
        effects.provider += 1
        throw new Error('lost_x402_response')
      }
      return await base.send(url, init)
    },
  }
}

function runtime(
  endpoint: string,
  effects: { payment: number; provider: number },
  output: string,
): RouteTransportRuntime {
  const challenge = {
    x402Version: 2,
    resource: { url: `${endpoint}?symbol=BTC&convert=USD` },
    accepts: [{
      scheme: 'exact',
      network: 'eip155:8453',
      amount: '10000',
      asset: '0xmock-usdc',
      payTo: '0xmock-provider-recipient',
      maxTimeoutSeconds: 30,
      extra: {},
    }],
  }
  const send: RouteTransportFetch = async (_url, init) => {
    if (init?.headers?.['Payment-Signature'] === undefined) {
      return response(402, '', { 'payment-required': Buffer.from(JSON.stringify(challenge)).toString('base64') })
    }
    effects.provider += 1
    return response(200, output, { 'payment-response': 'mock:payment-proof', 'provider-receipt': 'mock:receipt' })
  }
  return {
    send,
    resolveCredential: () => 'mock:credential',
    createX402PaymentSignature: async () => {
      effects.payment += 1
      return 'mock:signature'
    },
  }
}

function response(status: number, body: string, headers: Record<string, string>) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? headers[name] ?? null },
    text: async () => body,
  }
}
