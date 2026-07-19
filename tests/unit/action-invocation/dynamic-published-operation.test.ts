import { describe, expect, it, vi } from 'vitest'

import {
  createDevelopmentDynamicPublishedSource,
  createDynamicPublishedActionInvocationAdapter,
  loadDynamicPublishedAdapterSnapshot,
  type ActionInvocationOrigin,
  type InvocationActor,
} from '@/modules/action-invocation'
import { buildDevelopmentPublishedOperationEvidence } from '@/modules/capability-supply/development-published-operation-evidence'
import {
  admitRegisteredTransport,
  capabilityBindingRegistrationHash,
  capabilityOfferingRegistrationHash,
  materializePublishedOperation,
} from '@/modules/capability-supply/public'
import type {
  RouteTransportFetch,
  RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  attachCompletedTaskReference,
} from '@/modules/customer-request/application/public'
import {
  compileCustomerRequest,
} from '@/modules/customer-request/compiler'
import {
  buildDevelopmentDynamicInvocationEvidence,
  verifyDevelopmentDynamicInvocationEvidence,
} from '@/modules/capability-supply/development-dynamic-invocation-evidence'

const actor: InvocationActor = { callerRef: 'agent:development', principalRef: 'principal:development' }
const origins: readonly ActionInvocationOrigin[] = [
  { kind: 'request_owned', requestRef: 'request:development', revision: 4 },
  { kind: 'standalone', callerRef: actor.callerRef, principalRef: actor.principalRef },
]

describe('dynamic PublishedOperation Action Invocation adapter', () => {
  it.each([
    'credential_unavailable',
    'challenge_invalid',
    'challenge_mismatch',
    'payment_outside_authority',
    'signing_unavailable',
    'endpoint_refusal',
  ] as const)('classifies %s as typed pre-release refusal', async (mode) => {
    const fixture = buildDevelopmentPublishedOperationEvidence()
    const clock = fixture.operation.readiness.observedAt + 1_000
    vi.spyOn(Date, 'now').mockReturnValue(clock)
    const adapter = createAdapter(
      fixture.operation,
      preReleaseRuntime(fixture.operation.binding.endpointUrl, mode),
      clock,
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
    const acquired = adapter.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, leaseOwner: 'worker:preflight', leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') throw new Error('not leased')
    const refused = await adapter.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
    })
    expect(refused.kind === 'accepted' && refused.view).toMatchObject({
      control: { state: 'retryable', reason: 'pre_release_failure' },
      observedResolution: { state: 'returned', execution: 'pre_release_refused' },
      attempts: [{
        release: { state: 'not_released' },
        outcome: { state: 'failed', retry: 'safe_before_release' },
      }],
    })
  })

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

  it('retires old material when the stable publication slot advances revision', async () => {
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
    const next = rematerializeRevision(fixture, 8)
    expect(next.operationId).not.toBe(fixture.operation.operationId)
    source.setCurrent(next)
    const acquired = adapter.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, leaseOwner: 'worker:old-revision', leaseMs: 30_000,
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

  it('references a principal-bound standalone result without replay or inherited authority', async () => {
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
      actor, origin, leaseOwner: 'worker:standalone', leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') throw new Error('not leased')
    const completed = await adapter.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
    })
    if (completed.kind !== 'accepted') throw new Error(completed.code)
    const before = { ...effects }
    const compiled = compileCustomerRequest({
      requestId: 'request:reuse',
      expectedRevision: 0,
      principalId: actor.principalRef,
      delegatedAgentId: actor.callerRef,
      intent: 'Continue from the completed quote.',
      networkId: 'mock:network:development',
      proposal: { kind: 'unsupported_request', reason: 'requested_result_not_available' },
      interpreterId: 'mock:interpreter',
      bindings: [],
      models: [],
      now: clock,
    })
    if (compiled.kind !== 'compiled') throw new Error('request not compiled')
    const attached = attachCompletedTaskReference({
      principalRef: actor.principalRef,
      callerRef: actor.callerRef,
      invocationRef: prepared.invocationRef,
      referencedAt: clock,
      candidateAggregate: compiled.aggregate,
    }, {
      readCompletedResultIdentity: ({ invocationRef, actor: requestedActor }) =>
        adapter.readCompletedResult(invocationRef, requestedActor),
    })
    expect(attached).toMatchObject({
      kind: 'attached',
      noEffect: true,
      reference: {
        invocationRef: prepared.invocationRef,
        actionId: fixture.operation.operationId,
      },
    })
    expect(JSON.stringify(attached)).not.toMatch(/authorityRef|acceptedAuthority|attemptRef|leaseOwner/u)
    expect(effects).toEqual(before)
    expect(adapter.readCompletedResult(prepared.invocationRef, {
      ...actor,
      principalRef: 'principal:other',
    })).toMatchObject({ kind: 'refused', code: 'cross_principal_refused' })
    const row = source.list()[0]!
    if (row.observedResolution.state !== 'returned') throw new Error('missing result')
    source.write({
      ...row,
      observedResolution: {
        ...row.observedResolution,
        result: { ...row.observedResolution.result, output: { data: { altered: true } } },
      },
    })
    expect(adapter.readCompletedResult(prepared.invocationRef, actor)).toMatchObject({
      kind: 'refused',
      code: 'source_result_mismatch',
    })
    expect(effects).toEqual(before)
  })

  it('derives a non-fixture fixed amount and currency from admitted operation material', async () => {
    const fixture = buildDevelopmentPublishedOperationEvidence()
    const operation = rematerializeFixedPrice(fixture, 'AUD', 7)
    const clock = operation.readiness.observedAt + 1_000
    vi.spyOn(Date, 'now').mockReturnValue(clock)
    const effects = { payment: 0, provider: 0 }
    const adapter = createAdapter(
      operation,
      successRuntime(operation.binding.endpointUrl, effects),
      clock,
    )
    const origin = origins[0]!
    const prepared = adapter.prepare({
      origin, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
    })
    expect(prepared.prepared?.dataUse.limits.amountMinor).toBe(7)
    if (prepared.prepared === undefined) throw new Error('missing prepared authority')
    expect((prepared.prepared.target as any).effect.amount).toEqual({
      currency: 'AUD',
      amountMinor: 7,
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
      actor, origin, leaseOwner: 'worker:aud', leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') throw new Error('not leased')
    const completed = await adapter.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
    })
    expect(completed.kind === 'accepted' && completed.view.observedResolution).toMatchObject({
      state: 'returned',
      result: { kind: 'published_operation_succeeded' },
    })
    expect(effects).toEqual({ payment: 1, provider: 1 })
  })

  it('rejects redigested snapshot and evidence attacks from immutable anchors', async () => {
    const base = await buildDevelopmentDynamicInvocationEvidence()
    const attacks: readonly [string, (packet: any) => void][] = [
      ['owner', (packet) => { packet.cases[0].snapshot.controls[0].control.owner.principalRef = 'principal:attacker' }],
      ['origin', (packet) => { packet.cases[0].snapshot.controls[0].control.origin = { kind: 'standalone', callerRef: 'x', principalRef: 'y' } }],
      ['mode', (packet) => { packet.cases[0].snapshot.controls[0].control.acceptedAuthority.kind = 'standing_mandate_use' }],
      ['generation', (packet) => { packet.cases[0].snapshot.attempts[0].rows[0].effectGeneration = 7 }],
      ['publication', (packet) => { packet.cases[0].snapshot.sourceRows[0].operation.identity.publicationRevision = 99 }],
      ['config', (packet) => { packet.cases[0].snapshot.sourceRows[0].operation.transport.configJson = '{}' }],
      ['payment', (packet) => { packet.cases[0].snapshot.sourceRows[0].operation.identity.payment.payTo = '0xattacker' }],
      ['price', (packet) => { packet.cases[0].snapshot.sourceRows[0].operation.identity.price.amountMinor = 999 }],
      ['input', (packet) => { packet.cases[0].snapshot.sourceRows[0].input.input.symbol = 'ETH' }],
      ['output', (packet) => { packet.cases[0].snapshot.sourceRows[0].observedResolution.result.output = { data: { forged: true } } }],
      ['challenge', (packet) => { packet.cases[0].snapshot.sourceRows[0].observedResolution.result.paymentChallengeDigest = 'sha256:forged' }],
      ['evidence', (packet) => { packet.cases[0].snapshot.sourceRows[0].observedResolution.result.providerReceipt = 'forged:evidence' }],
      ['result', (packet) => { packet.cases[0].snapshot.sourceRows[0].resultIdentity.resultDigest = 'sha256:forged' }],
      ['attempt', (packet) => { packet.cases[0].snapshot.attempts[0].rows[0].attemptRef = 'attempt:forged' }],
      ['effects', (packet) => { packet.cases[0].paymentEffects = 2 }],
      ['schema', (packet) => { packet.cases[0].snapshot.untrusted = true }],
    ]
    for (const [name, attack] of attacks) {
      const packet: any = JSON.parse(JSON.stringify(base))
      attack(packet)
      const { packetDigest: _prior, ...material } = packet
      packet.packetDigest = canonicalDigest(material)
      expect(() => verifyDevelopmentDynamicInvocationEvidence(packet), name).toThrow()
    }
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

function preReleaseRuntime(
  endpoint: string,
  mode: 'credential_unavailable' | 'challenge_invalid' | 'challenge_mismatch'
    | 'payment_outside_authority' | 'signing_unavailable' | 'endpoint_refusal',
): RouteTransportRuntime {
  const challenge = {
    x402Version: 2,
    resource: { url: `${endpoint}?symbol=BTC&convert=USD` },
    accepts: [{
      scheme: 'exact',
      network: 'eip155:8453',
      amount: '10000',
      asset: '0xmock-usdc',
      payTo: mode === 'challenge_mismatch' ? '0xother-recipient' : '0xmock-provider-recipient',
      maxTimeoutSeconds: mode === 'payment_outside_authority' ? 100_000 : 30,
      extra: {},
    }],
  }
  return {
    resolveCredential: () => mode === 'credential_unavailable' ? undefined : 'mock:credential',
    createX402PaymentSignature: async () => mode === 'signing_unavailable' ? undefined : 'mock:signature',
    send: async () => mode === 'endpoint_refusal'
      ? response(503, JSON.stringify({ reason: 'unavailable' }), {})
      : response(402, '', {
          'payment-required': mode === 'challenge_invalid'
            ? 'not-base64-json'
            : Buffer.from(JSON.stringify(challenge)).toString('base64'),
        }),
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

function rematerializeRevision(
  fixture: ReturnType<typeof buildDevelopmentPublishedOperationEvidence>,
  revision: number,
) {
  const publicationDigest = canonicalDigest({ fixture: 'publication', revision })
  const publication = {
    ...fixture.sourceMaterial.publication,
    revision,
    sourceDigest: publicationDigest,
  }
  const qualification = {
    ...fixture.sourceMaterial.qualification,
    candidate: { ...fixture.sourceMaterial.qualification.candidate, revision },
    qualificationDigest: canonicalDigest({ fixture: 'qualification', revision }),
    sources: fixture.sourceMaterial.qualification.sources.map((source) =>
      source.kind === 'publication'
        ? { ...source, ref: `${publication.publicationRef}@${revision}`, digest: publicationDigest }
        : source),
  }
  return materializePublishedOperation({
    ...fixture.sourceMaterial,
    publication,
    qualification,
  })
}

function rematerializeFixedPrice(
  fixture: ReturnType<typeof buildDevelopmentPublishedOperationEvidence>,
  currency: string,
  amountMinor: number,
) {
  const offering = {
    ...fixture.sourceMaterial.offering,
    presentation: {
      ...fixture.sourceMaterial.offering.presentation,
      price: { kind: 'fixed' as const, currency, amountMinor },
    },
  }
  const config = {
    ...fixture.sourceMaterial.binding.adapter.config as Record<string, unknown>,
    currency,
  }
  const binding = {
    ...fixture.sourceMaterial.binding,
    adapter: { ...fixture.sourceMaterial.binding.adapter, config },
  }
  const admitted = admitRegisteredTransport({
    adapterId: binding.adapter.adapterId,
    endpointUrl: binding.endpointUrl,
    credentialRef: binding.credentialRef,
    continuation: binding.continuation,
    cancellation: binding.cancellation,
    config: binding.adapter.config as never,
  })
  if (admitted.kind !== 'admitted') throw new Error(admitted.reason)
  const offeringDigest = capabilityOfferingRegistrationHash(offering)
  const bindingDigest = capabilityBindingRegistrationHash(binding, admitted.transport)
  const qualification = {
    ...fixture.sourceMaterial.qualification,
    sources: fixture.sourceMaterial.qualification.sources.map((source) =>
      source.kind === 'offering'
        ? { ...source, digest: offeringDigest }
        : source.kind === 'binding'
          ? { ...source, digest: bindingDigest }
          : source),
  }
  return materializePublishedOperation({
    ...fixture.sourceMaterial,
    offering,
    binding,
    admittedTransport: admitted.transport,
    qualification,
  })
}
