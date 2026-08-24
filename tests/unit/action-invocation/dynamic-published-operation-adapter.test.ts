import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
  createDevelopmentDynamicPublishedSource,
  createInMemoryActionInvocationTracer,
  type ActionInvocationView,
  type DynamicPublishedInvocationResult,
  type InvocationActor,
} from '@/modules/capability-execution/legacy-dynamic'
import { defineAction } from '@/modules/common/action'
import type { RouteTransportFetch } from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { pricingConfigDigest } from '@/modules/money/public'
import {
  buildDevelopmentPublishedOperationEvidence,
} from '../../../tools/dev/fixtures/capability-supply/development-published-operation-evidence'
import {
  actor,
  createAdapter,
  invalidOutputRuntime,
  origins,
  preReleaseRuntime,
  rematerializeRevision,
  successRuntime,
} from './dynamic-published-operation-harness'

describe('dynamic PublishedOperation Action Invocation adapter', () => {
  it('marks release conservatively before a malicious runner can return an opt-out shape', async () => {
    const now = () => '2026-07-20T00:00:00.000Z'
    let sequence = 0
    const tracer = createInMemoryActionInvocationTracer({
      action: defineAction({
        id: 'malicious.release.opt-out',
        name: 'Malicious release test',
        summary: 'Development test only.',
        boundaries: ['Development only.'],
        schema: z.object({ operationKey: z.string(), target: z.object({}) }),
        parameters: [],
        readOnly: false,
        effect: {
          class: 'external_state_change', reversible: false, recipientKind: 'provider_system',
          dataClasses: [], spendExposure: 'none', approval: 'approve_each',
        },
        surfaces: [],
        outputSchema: z.object({ kind: z.string(), release: z.string() }),
        invocationContract: {
          version: 'v1',
          consequenceClass: 'external_effect',
          materialInputPaths: ['operationKey', 'target'],
          authorityRequirement: 'principal',
          retryClass: 'reconcile_before_retry',
          expectedEvidence: [],
          safeContinuations: ['inspect'],
          invalidationConditions: [],
          developmentAttemptTimeoutMs: 1_000,
        },
        run: async () => ({ kind: 'malicious_return', release: 'not_released' }),
      }),
      now,
      nextInvocationRef: () => `malicious:invocation:${++sequence}`,
      nextAuthorityRef: () => `malicious:authority:${sequence}`,
      nextAttemptRef: () => `malicious:attempt:${sequence}`,
    })
    const origin = origins[0]!
    const material = { operationKey: 'operation:malicious', target: {} }
    const prepared = await tracer.prepare({
      origin, actor, input: material, context: {}, freshnessMs: 60_000,
    })
    const decided = await tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const result = await tracer.execute({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, materialInput: material,
    })
    if (result.kind !== 'accepted') throw new Error(result.code)
    expect(result.view.attempts[0]).toMatchObject({
      release: { state: 'possibly_released' },
      outcome: { state: 'returned' },
    })
    expect(result.view.control).toEqual({ state: 'terminal' })
  })

  it.each([
    'signing_unavailable',
  ] as const)('refuses %s before any transport effect', async (mode) => {
    const fixture = buildDevelopmentPublishedOperationEvidence()
    const clock = fixture.operation.readiness.observedAt + 1_000
    vi.spyOn(Date, 'now').mockReturnValue(clock)
    let sends = 0
    const baseRuntime = preReleaseRuntime(fixture.operation.binding.endpointUrl, mode)
    const source = createDevelopmentDynamicPublishedSource([fixture.operation])
    const adapter = createAdapter(
      fixture.operation,
      {
        ...baseRuntime,
        send: async (...args: Parameters<RouteTransportFetch>) => {
          sends += 1
          return await baseRuntime.send(...args)
        },
      },
      clock,
      source,
    )
    const origin = origins[0]!
    const prepared = await adapter.prepare({
      origin, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
    })
    const decided = await adapter.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const acquired = await adapter.acquire({
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
      control: { state: 'terminal' },
      observedResolution: { state: 'returned', execution: 'pre_release_refused' },
      attempts: [{
        release: { state: 'not_released' },
        outcome: { state: 'returned' },
      }],
    })
    expect(source.list()[0]?.observedResolution).toEqual(
      refused.kind === 'accepted' ? refused.view.observedResolution : undefined,
    )
    expect(sends).toBe(0)
  })

  it.each(['config', 'payment_authority'] as const)(
    'refuses invalid %s during zero-effect transport preparation',
    async (kind) => {
      const fixture = buildDevelopmentPublishedOperationEvidence()
      const invalidPaymentConfig = {
        ...fixture.operation.pricingConfig,
        paidAmount: { currency: 'EUR', units: '1', exponent: 2 },
      }
      const operation = kind === 'config'
        ? {
            ...fixture.operation,
            transport: {
              ...fixture.operation.transport,
              configJson: '{}',
              configDigest: canonicalDigest({}),
            },
          }
        : {
            ...fixture.operation,
            pricingConfig: invalidPaymentConfig,
            priceDigest: pricingConfigDigest(invalidPaymentConfig),
            identity: {
              ...fixture.operation.identity,
              pricingConfig: invalidPaymentConfig,
              priceDigest: pricingConfigDigest(invalidPaymentConfig),
              price: { kind: 'fixed' as const, amount: invalidPaymentConfig.paidAmount },
            },
          }
      const clock = operation.readiness.observedAt + 1_000
      vi.spyOn(Date, 'now').mockReturnValue(clock)
      let sends = 0
      const base = successRuntime(operation.binding.endpointUrl, { payment: 0, provider: 0 })
      const runtime = {
        ...base,
        send: async (...args: Parameters<RouteTransportFetch>) => {
          sends += 1
          return await base.send(...args)
        },
      }
      const adapter = createAdapter(operation, runtime, clock)
      const origin = origins[0]!
      const prepared = await adapter.prepare({
        origin, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
      })
      const decided = await adapter.decide({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: prepared.invocationVersion,
        authorityRef: prepared.authority!.reference,
        actor, origin, accept: true,
      })
      if (decided.kind !== 'accepted') throw new Error(decided.code)
      const acquired = await adapter.acquire({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: decided.view.invocationVersion,
        authorityRef: prepared.authority!.reference,
        actor, origin, leaseOwner: 'worker:zero-effect', leaseMs: 30_000,
      })
      if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') throw new Error('not leased')
      const result = await adapter.executeAcquired({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: acquired.view.invocationVersion,
        attemptRef: acquired.view.control.attemptRef,
        leaseOwner: acquired.view.control.leaseOwner,
        effectGeneration: acquired.view.control.effectGeneration,
      })
      expect(result.kind === 'accepted' && result.view).toMatchObject({
        observedResolution: { execution: 'pre_release_refused' },
        attempts: [{ release: { state: 'not_released' } }],
      })
      expect(sends).toBe(0)
    },
  )

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
    await expect(adapter.prepare({
      origin: origins[0]!, actor, value: { symbol: 'BTC', convert: 'USD', method: 'POST' }, freshnessMs: 1_000,
    })).rejects.toThrow('published_operation_input_invalid')
    const prepared = await adapter.prepare({
      origin: origins[0]!, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
    })
    expect(await adapter.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor: { ...actor, principalRef: 'principal:attacker' },
      origin: origins[0]!,
      accept: true,
    })).toMatchObject({ kind: 'refused', code: 'cross_principal_refused' })
    const decided = await adapter.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin: origins[0]!, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const acquired = await adapter.acquire({
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
      state: 'threw',
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
    const prepared = await adapter.prepare({
      origin, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
    })
    const decided = await adapter.decide({
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
    const acquired = await adapter.acquire({
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
    const prepared = await adapter.prepare({
      origin, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
    })
    const decided = await adapter.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const next = rematerializeRevision(fixture, 8)
    expect(next.operationId).toBe(fixture.operation.operationId)
    expect(next.connectionAuthority?.operationRef)
      .not.toBe(fixture.operation.connectionAuthority?.operationRef)
    source.setCurrent(next)
    const acquired = await adapter.acquire({
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
    const prepared = await adapter.prepare({
      origin, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
    })
    const decided = await adapter.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const acquired = await adapter.acquire({
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
    const attached = await adapter.readCompletedResult(prepared.invocationRef, actor)
    expect(attached).toMatchObject({
      kind: 'completed_result',
      invocationRef: prepared.invocationRef,
      actionId: fixture.operation.operationId,
    })
    expect(JSON.stringify(attached)).not.toMatch(/authorityRef|acceptedAuthority|attemptRef|leaseOwner/u)
    expect(effects).toEqual(before)
    expect(await adapter.readCompletedResult(prepared.invocationRef, {
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
    expect(await adapter.readCompletedResult(prepared.invocationRef, actor)).toMatchObject({
      kind: 'refused',
      code: 'source_result_mismatch',
    })
    expect(effects).toEqual(before)
  })

  it('isolates invocation ownership while reusing one principal-scoped semantic effect', async () => {
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
    const execute = async (prepared: ActionInvocationView<DynamicPublishedInvocationResult>, worker: string) => {
      const decided = await adapter.decide({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: prepared.invocationVersion,
        authorityRef: prepared.authority!.reference,
        actor, origin, accept: true,
      })
      if (decided.kind !== 'accepted') throw new Error(decided.code)
      const acquired = await adapter.acquire({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: decided.view.invocationVersion,
        authorityRef: prepared.authority!.reference,
        actor, origin, leaseOwner: worker, leaseMs: 30_000,
      })
      if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') throw new Error('not leased')
      return await adapter.executeAcquired({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: acquired.view.invocationVersion,
        attemptRef: acquired.view.control.attemptRef,
        leaseOwner: acquired.view.control.leaseOwner,
        effectGeneration: acquired.view.control.effectGeneration,
      })
    }
    const first = await adapter.prepare({
      origin, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
    })
    const firstResult = await execute(first, 'worker:first')
    if (firstResult.kind !== 'accepted') throw new Error(firstResult.code)
    const firstIdentity = await adapter.readCompletedResult(first.invocationRef, actor)
    const second = await adapter.prepare({
      origin, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
    })
    expect(second.invocationRef).not.toBe(first.invocationRef)
    expect(second.authority?.reference).not.toBe(first.authority?.reference)
    expect(await adapter.readCompletedResult(first.invocationRef, actor)).toEqual(firstIdentity)
    const secondResult = await execute(second, 'worker:second')
    if (secondResult.kind !== 'accepted') throw new Error(secondResult.code)
    expect(effects).toEqual({ payment: 1, provider: 1 })
    const rows = source.list()
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map(({ invocationRef }) => invocationRef)).size).toBe(2)
    expect(rows[0]?.resultIdentity?.sourceResultRef)
      .toBe(rows[1]?.resultIdentity?.sourceResultRef)
    expect(firstResult.view.attempts[0]?.attemptRef)
      .not.toBe(secondResult.view.attempts[0]?.attemptRef)
    expect(firstResult.view.acceptedAuthority)
      .not.toEqual(secondResult.view.acceptedAuthority)
  })

  it('atomically suppresses simultaneous exact invocations without crossing runtime attribution', async () => {
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
    const acquire = async (prepared: ActionInvocationView<DynamicPublishedInvocationResult>, worker: string) => {
      const decided = await adapter.decide({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: prepared.invocationVersion,
        authorityRef: prepared.authority!.reference,
        actor, origin, accept: true,
      })
      if (decided.kind !== 'accepted') throw new Error(decided.code)
      const acquired = await adapter.acquire({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: decided.view.invocationVersion,
        authorityRef: prepared.authority!.reference,
        actor, origin, leaseOwner: worker, leaseMs: 30_000,
      })
      if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') throw new Error('not leased')
      return acquired.view
    }
    const first = await adapter.prepare({
      origin, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
    })
    const second = await adapter.prepare({
      origin, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
    })
    const [firstLease, secondLease] = await Promise.all([
      acquire(first, 'worker:simultaneous:first'),
      acquire(second, 'worker:simultaneous:second'),
    ])
    if (firstLease.control.state !== 'leased' || secondLease.control.state !== 'leased') {
      throw new Error('not leased')
    }
    const [firstResult, secondResult] = await Promise.all([
      await adapter.executeAcquired({
        invocationRef: first.invocationRef,
        expectedInvocationVersion: firstLease.invocationVersion,
        attemptRef: firstLease.control.attemptRef,
        leaseOwner: firstLease.control.leaseOwner,
        effectGeneration: firstLease.control.effectGeneration,
      }),
      await adapter.executeAcquired({
        invocationRef: second.invocationRef,
        expectedInvocationVersion: secondLease.invocationVersion,
        attemptRef: secondLease.control.attemptRef,
        leaseOwner: secondLease.control.leaseOwner,
        effectGeneration: secondLease.control.effectGeneration,
      }),
    ])
    expect(firstResult.kind).toBe('accepted')
    expect(secondResult.kind).toBe('accepted')
    expect(effects).toEqual({ payment: 1, provider: 1 })
    expect(source.list().map(({ resultIdentity }) => resultIdentity?.sourceResultRef))
      .toEqual([source.list()[0]?.resultIdentity?.sourceResultRef, source.list()[0]?.resultIdentity?.sourceResultRef])
  })

  it('conflicts changed semantic material and isolates different principals', async () => {
    const fixture = buildDevelopmentPublishedOperationEvidence()
    const source = createDevelopmentDynamicPublishedSource([fixture.operation])
    expect(source.claimSemanticEffect({
      semanticBaseKey: 'semantic:base',
      semanticIdentityDigest: 'sha256:first',
      principalRef: actor.principalRef,
      invocationRef: 'invocation:first',
    })).toEqual({ kind: 'owner' })
    expect(source.claimSemanticEffect({
      semanticBaseKey: 'semantic:base',
      semanticIdentityDigest: 'sha256:changed-target-or-material',
      principalRef: actor.principalRef,
      invocationRef: 'invocation:second',
    })).toEqual({ kind: 'conflict' })

    const effects = { payment: 0, provider: 0 }
    const clock = fixture.operation.readiness.observedAt + 1_000
    vi.spyOn(Date, 'now').mockReturnValue(clock)
    const isolatedSource = createDevelopmentDynamicPublishedSource([fixture.operation])
    const adapter = createAdapter(
      fixture.operation,
      successRuntime(fixture.operation.binding.endpointUrl, effects),
      clock,
      isolatedSource,
    )
    const executeFor = async (principal: InvocationActor) => {
      const origin = {
        kind: 'standalone' as const,
        callerRef: principal.callerRef,
        principalRef: principal.principalRef,
      }
      const prepared = await adapter.prepare({
        origin, actor: principal, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
      })
      const decided = await adapter.decide({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: prepared.invocationVersion,
        authorityRef: prepared.authority!.reference,
        actor: principal, origin, accept: true,
      })
      if (decided.kind !== 'accepted') throw new Error(decided.code)
      const acquired = await adapter.acquire({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: decided.view.invocationVersion,
        authorityRef: prepared.authority!.reference,
        actor: principal,
        origin,
        leaseOwner: `worker:${principal.principalRef}`,
        leaseMs: 30_000,
      })
      if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') throw new Error('not leased')
      const result = await adapter.executeAcquired({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: acquired.view.invocationVersion,
        attemptRef: acquired.view.control.attemptRef,
        leaseOwner: acquired.view.control.leaseOwner,
        effectGeneration: acquired.view.control.effectGeneration,
      })
      return { prepared, result }
    }
    const other = { callerRef: 'agent:other', principalRef: 'principal:other' }
    const first = await executeFor(actor)
    await executeFor(other)
    expect(effects).toEqual({ payment: 2, provider: 2 })
    expect(await adapter.readCompletedResult(first.prepared.invocationRef, other))
      .toEqual({ kind: 'refused', code: 'cross_principal_refused' })
  })
})
