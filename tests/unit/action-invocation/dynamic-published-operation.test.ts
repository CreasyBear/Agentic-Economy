import { encodePaymentResponseHeader } from '@x402/core/http'
import { describe, expect, it, vi } from 'vitest'

import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDevelopmentDynamicPublishedSource,
  createInvocationApplication,
  createDynamicPublishedActionInvocationAdapter,
  createInMemoryActionInvocationTracer,
  derivePaidOperationSemantics,
  buildDynamicPublishedInput,
  loadDynamicPublishedAdapterSnapshot,
  readDevelopmentHostSnapshot,
  materialDigest,
  type ActionInvocationOrigin,
  type ActionInvocationView,
  type DynamicPublishedInvocationResult,
  type InvocationActor,
} from '@/modules/action-invocation'
import { defineAction } from '@/modules/common/action'
import { z } from 'zod'
import {
  buildDevelopmentPublishedOperationEvidence,
  createDevelopmentProviderLeaseIssuer,
  developmentProviderConnectionAuthorityDigest,
} from '@/modules/capability-supply/development-published-operation-evidence'
import {
  admitRegisteredTransport,
  capabilityBindingRegistrationHash,
  capabilityOfferingRegistrationHash,
  capabilityOperationId,
  createPublicOperationRef,
  defineCapabilityTransportBindingRegistration,
  materializePublishedOperation,
} from '@/modules/capability-supply/public'
import type {
  ProviderConnectionAuthorityLookup,
  RouteTransportFetch,
  RouteTransportRuntime,
  X402PaymentAuthorizationIdentity,
  X402PaymentSignatureRequest,
  X402RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { pricingConfigDigest, type ExactAmount } from '@/modules/money/public'
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
import {
  createPaymentAttemptRuntime,
  type DynamicPublishedPreparedTransport,
} from '@/modules/action-invocation/dynamic-published-execution'
import { createInMemoryX402PaymentAttemptPort } from '../../helpers/x402-payment-attempt'
import {
  x402PaymentAttemptKey,
  type X402PaymentAttempt,
} from '@/modules/action-invocation/x402-payment-attempt'

const actor: InvocationActor = { callerRef: 'agent:development', principalRef: 'principal:development' }
const origins: readonly ActionInvocationOrigin[] = [
  { kind: 'request_owned', requestRef: 'request:development', revision: 4 },
  { kind: 'standalone', callerRef: actor.callerRef, principalRef: actor.principalRef },
]

describe('dynamic PublishedOperation Action Invocation adapter', () => {
  it('cold-restores durable prepared and possibly-submitted payment cuts without duplicate effects', async () => {
    const prepared = paymentPreparedFixture()
    const request = paymentAuthorizationRequest()
    expect(request.selectedRequirement.amount).toBe('10000')
    expect(request.paymentAmount).toEqual({ currency: 'USD', units: '1', exponent: 2 })
    const durable = createInMemoryX402PaymentAttemptPort()
    let authorizations = 0
    let paidSends = 0
    const custodyRuntime: X402RouteTransportRuntime = {
      send: async () => { throw new Error('direct_provider_send_must_not_run') },
      readX402PaymentCredentialRef: () => 'env:AE_X402_PAYMENT_PRIVATE_KEY',
      resolveCredential: (connectionRef) => connectionRef === 'test:connection:x402' ? 'mock:credential' : undefined,
      prepareX402PaymentAuthorization: async () => {
        authorizations += 1
        return {
          custodyRef: `sha256:${'1'.repeat(64)}`,
          authorizationDigest: `sha256:${'2'.repeat(64)}`,
        }
      },
      readX402PaymentAuthorization: async () => 'raw:authorization:in-custody',
      readX402PaymentAuthorizationByDigest: async () => 'raw:authorization:in-custody',
    }

    const first = createPaymentAttemptRuntime(
      custodyRuntime, prepared, durable, () => 1,
    )
    const authorization = await first.prepareX402PaymentAuthorization!(request)
    expect(authorizations).toBe(1)
    expect(durable.list()).toEqual([expect.objectContaining({ state: 'prepared' })])

    const restoredPrepared = createPaymentAttemptRuntime(
      custodyRuntime, prepared, durable, () => 2,
    )
    expect(await restoredPrepared.prepareX402PaymentAuthorization!(request)).toEqual({
      custodyRef: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      authorizationDigest: authorization!.authorizationDigest,
    })
    expect(authorizations).toBe(1)
    await restoredPrepared.markX402PaymentPossiblySubmitted!({
      paymentIdentifier: request.paymentIdentifier,
      attemptRef: request.attemptRef,
      challengeDigest: request.challengeDigest,
      scheme: request.selectedRequirement.scheme,
      network: request.selectedRequirement.network,
      asset: request.selectedRequirement.asset,
      payTo: request.selectedRequirement.payTo,
      amount: request.paymentAmount,
      providerEndpoint: request.challenge.resource.url,
      custodyRef: authorization!.custodyRef,
      authorizationDigest: authorization!.authorizationDigest,
    })
    expect(durable.list()).toEqual([expect.objectContaining({
      state: 'possibly_submitted',
      amount: request.paymentAmount,
    })])
    paidSends += 1

    const restoredUncertain = createPaymentAttemptRuntime(
      custodyRuntime, prepared, durable, () => 3,
    )
    await expect(restoredUncertain.prepareX402PaymentAuthorization!(request))
      .rejects.toThrow('x402_payment_attempt_reconciliation_required')
    expect(authorizations).toBe(1)
    expect(paidSends).toBe(1)
  })

  it('reuses custody authorization after a crash between custody prepare and durable attempt preparation', async () => {
    const prepared = paymentPreparedFixture()
    const custody = new Map<string, Readonly<{
      custodyRef: string
      authorizationDigest: string
      paymentSignature: string
    }>>()
    let signaturesCreated = 0
    const custodyRuntime: X402RouteTransportRuntime = {
      send: async () => { throw new Error('provider_send_must_not_run') },
      readX402PaymentCredentialRef: () => 'env:AE_X402_PAYMENT_PRIVATE_KEY',
      resolveCredential: (connectionRef) => connectionRef === 'test:connection:x402' ? 'mock:credential' : undefined,
      prepareX402PaymentAuthorization: async (request) => {
        const identity = canonicalDigest({
          paymentIdentifier: request.paymentIdentifier,
          challengeDigest: request.challengeDigest,
          attemptRef: request.attemptRef,
          effectGeneration: request.effectGeneration,
        })
        const existing = custody.get(identity)
        if (existing !== undefined) {
          return {
            custodyRef: existing.custodyRef,
            authorizationDigest: existing.authorizationDigest,
          }
        }
        signaturesCreated += 1
        const paymentSignature = 'raw:authorization:must-remain-in-custody'
        const authorization = {
          custodyRef: canonicalDigest({ kind: 'test-x402-custody:v1', identity }),
          authorizationDigest: canonicalDigest(paymentSignature),
        }
        custody.set(identity, { ...authorization, paymentSignature })
        return authorization
      },
      readX402PaymentAuthorization: async ({ custodyRef, authorizationDigest }) =>
        [...custody.values()].find((candidate) =>
          candidate.custodyRef === custodyRef
          && candidate.authorizationDigest === authorizationDigest)?.paymentSignature,
      readX402PaymentAuthorizationByDigest: async ({ custodyRef, authorizationDigest }) =>
        [...custody.values()].find((candidate) =>
          candidate.custodyRef === custodyRef
          && candidate.authorizationDigest === authorizationDigest)?.paymentSignature,
    }
    const request = paymentAuthorizationRequest()
    const crashCutPort = {
      ...createInMemoryX402PaymentAttemptPort(),
      persist: () => { throw new Error('crash_after_custody_prepare') },
    }
    await expect(
      createPaymentAttemptRuntime(
        custodyRuntime,
        prepared,
        crashCutPort,
        () => 1,
      ).prepareX402PaymentAuthorization!(request),
    ).rejects.toThrow('crash_after_custody_prepare')
    expect(signaturesCreated).toBe(1)

    const restoredPort = createInMemoryX402PaymentAttemptPort()
    const restoredRuntime = createPaymentAttemptRuntime(
      custodyRuntime,
      prepared,
      restoredPort,
      () => 2,
    )
    const restored = await restoredRuntime.prepareX402PaymentAuthorization!(request)
    expect(signaturesCreated).toBe(1)
    expect(await restoredRuntime.readX402PaymentAuthorization!(restored!))
      .toBe('raw:authorization:must-remain-in-custody')
    expect(JSON.stringify(restoredPort.list())).not.toContain('raw:authorization')
  })

  it('restores prepared custody by reference and blocks uncertain custody before read or send', async () => {
    const prepared = paymentPreparedFixture()
    const request = paymentAuthorizationRequest()
    const durable = paymentAttemptFixture(prepared, request)
    let prepares = 0
    let reads = 0
    const runtime: X402RouteTransportRuntime = {
      send: async () => { throw new Error('provider_send_must_not_run') },
      readX402PaymentCredentialRef: () => 'env:AE_X402_PAYMENT_PRIVATE_KEY',
      resolveCredential: (connectionRef) => connectionRef === 'test:connection:x402' ? 'mock:credential' : undefined,
      prepareX402PaymentAuthorization: async () => {
        prepares += 1
        throw new Error('custody_prepare_must_not_repeat')
      },
      readX402PaymentAuthorization: async () => {
        reads += 1
        return 'raw:authorization:from-custody'
      },
      readX402PaymentAuthorizationByDigest: async () => {
        reads += 1
        return 'raw:authorization:from-custody'
      },
    }
    const preparedPort = createInMemoryX402PaymentAttemptPort([durable], [{
      invocationRef: prepared.invocationRef,
      attemptRef: prepared.attemptRef,
      effectGeneration: prepared.effectGeneration,
      operationKey: prepared.operationKey,
      queryRelease: 'released',
      authorization: 'created',
      recordedAt: durable.preparedAt,
      challengeDigest: durable.challengeDigest,
      authorizationDigest: durable.authorizationDigest,
    }])
    const restored = createPaymentAttemptRuntime(runtime, prepared, preparedPort, () => 2)
    expect(await restored.prepareX402PaymentAuthorization!(request)).toEqual({
      custodyRef: durable.custodyRef,
      authorizationDigest: durable.authorizationDigest,
    })
    expect(await restored.readX402PaymentAuthorization!({
      custodyRef: durable.custodyRef,
      authorizationDigest: durable.authorizationDigest,
    })).toBe('raw:authorization:from-custody')
    expect(prepares).toBe(0)
    expect(reads).toBe(1)

    await preparedPort.persist({
      attempt: { ...durable, state: 'possibly_submitted' },
      authorizationEvent: preparedPort.loadAuthorizationEvent(x402PaymentAttemptKey(prepared))!,
    })
    const uncertain = createPaymentAttemptRuntime(runtime, prepared, preparedPort, () => 3)
    await expect(uncertain.prepareX402PaymentAuthorization!(request))
      .rejects.toThrow('x402_payment_attempt_reconciliation_required')
    expect(prepares).toBe(0)
    expect(reads).toBe(1)
  })

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

  it.each([
    'challenge_invalid',
    'challenge_mismatch',
    'payment_outside_authority',
    'endpoint_refusal',
  ] as const)('classifies first-send %s by whether an operation release could occur', async (mode) => {
    const fixture = buildDevelopmentPublishedOperationEvidence()
    const clock = fixture.operation.readiness.observedAt + 1_000
    vi.spyOn(Date, 'now').mockReturnValue(clock)
    const source = createDevelopmentDynamicPublishedSource([fixture.operation])
    const adapter = createAdapter(
      fixture.operation,
      preReleaseRuntime(fixture.operation.binding.endpointUrl, mode),
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
      actor, origin, leaseOwner: 'worker:first-send', leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') throw new Error('not leased')
    const refused = await adapter.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
    })
    const possiblyReleased = mode === 'endpoint_refusal'
    expect(refused.kind === 'accepted' && refused.view).toMatchObject({
      control: { state: 'terminal' },
      observedResolution: { state: 'returned', execution: 'runner_returned' },
      attempts: [{
        release: { state: 'possibly_released' },
        outcome: { state: 'returned' },
      }],
    })
    expect(source.list()[0]?.observedResolution).toEqual(
      refused.kind === 'accepted' ? refused.view.observedResolution : undefined,
    )
    expect(adapter.exportDevelopmentSnapshot().paymentAuthorizationEvents).toEqual(possiblyReleased
      ? [expect.objectContaining({
          queryRelease: 'released',
          authorization: 'not_created',
        })]
      : [])
    expect(adapter.exportDevelopmentSnapshot().paymentAttempts).toEqual([])
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

  it.each(origins)('executes exact persisted x402 material once for $kind', async (origin) => {
    const fixture = buildDevelopmentPublishedOperationEvidence()
    const clock = fixture.operation.readiness.observedAt + 1_000
    vi.spyOn(Date, 'now').mockReturnValue(clock)
    const effects = { payment: 0, provider: 0 }
    const adapter = createAdapter(fixture.operation, successRuntime(fixture.operation.binding.endpointUrl, effects), clock)
    const prepared = await adapter.prepare({
      origin,
      actor,
      value: { symbol: 'BTC', convert: 'USD' },
      freshnessMs: 60_000,
    })
    expect(prepared.prepared?.dataUse.limits).toMatchObject({
      amount: { currency: 'USD', units: '1', exponent: 2 },
      publicationRevision: 7,
    })
    const decided = await adapter.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin,
      accept: true,
    })
    expect(decided.kind).toBe('accepted')
    if (decided.kind !== 'accepted') return
    const acquired = await adapter.acquire({
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
    const snapshot = adapter.exportDevelopmentSnapshot()
    expect(snapshot.controls[0]?.control.acceptedAuthority).toEqual({
      kind: 'approve_each',
      authorityRef: prepared.authority!.reference,
    })
    expect(readDevelopmentHostSnapshot({
      host: 'standalone_external_agent',
      snapshot,
    }).semanticRead.authority.kind).toBe('approve_each')
    const malformedHostSnapshot = JSON.parse(JSON.stringify(snapshot))
    const malformedHostControl = malformedHostSnapshot.controls[0]
    if (malformedHostControl === undefined) throw new Error('malformed_host_control_missing')
    malformedHostControl.control.acceptedAuthority = { kind: 'forged' }
    expect(() => readDevelopmentHostSnapshot({
      host: 'standalone_external_agent',
      snapshot: malformedHostSnapshot,
    })).toThrow('durable_control_authority_invalid')
    expect(snapshot.format).toBe('dynamic-published-action-invocation:development:v4')
    expect(snapshot.paymentAttempts).toEqual([
      expect.objectContaining({
        state: 'reconciliation_required',
        paymentIdentifier: expect.stringMatching(/^sha256:/),
        amount: { currency: 'USD', units: '10000', exponent: 6 },
        custodyRef: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        authorizationDigest: expect.stringMatching(/^sha256:/),
      }),
    ])
    expect(snapshot.paymentAuthorizationEvents).toEqual([
      expect.objectContaining({
        authorization: 'created',
        authorizationDigest: snapshot.paymentAttempts[0]?.authorizationDigest,
      }),
    ])
    expect(JSON.stringify(snapshot)).not.toContain('mock:signature')
    expect(JSON.stringify(snapshot)).not.toContain('mock:credential')
    if (uncertain.kind !== 'accepted') throw new Error(uncertain.code)
    const paymentAttempt = snapshot.paymentAttempts[0]
    if (paymentAttempt === undefined) throw new Error('payment_attempt_missing')
    const semantics = derivePaidOperationSemantics({
      view: uncertain.view,
      paymentAttempt,
      operation: {
        operationKey: fixture.operation.operationId,
        providerId: fixture.operation.identity.businessId,
        providerName: 'Development Quote Provider',
        operationRevision: String(fixture.operation.identity.publicationRevision),
        materialInputs: { symbol: 'BTC', convert: 'USD' },
      },
      presentation: {
        title: 'Get the latest BTC price in USD',
        summary: 'Retrieve one current BTC/USD measurement.',
        blocks: [{ kind: 'text', label: 'Pair', value: 'BTC/USD' }],
      },
      maximumAuthorizedCharge: { currency: 'USD', units: '1', exponent: 2 },
      queryRecipient: fixture.operation.identity.businessId,
      resultDelivery: { state: 'not_delivered' },
      environment: {
        name: 'local-development',
        evidenceClass: 'labelled_local_mock',
        claimCeiling: 'mechanism_only',
      },
    })
    expect(semantics).toMatchObject({
      queryRelease: { state: 'unknown' },
      paymentAuthorization: { state: 'created' },
      paymentSubmission: { state: 'possibly_submitted' },
      settlement: { state: 'unknown' },
      continuations: [{ kind: 'reconcile' }],
    })
    expect(semantics.continuations.some(({ kind }) => kind === 'retry')).toBe(false)
    const preparedMaterial = buildDynamicPublishedInput({
      operation: fixture.operation,
      descriptor: fixture.descriptor,
      value: { symbol: 'BTC', convert: 'USD' },
    })
    const snapshotAnchors = {
      operation: fixture.operation,
      descriptor: fixture.descriptor,
      actor,
      origin,
      issuedAuthority: {
        reference: prepared.authority!.reference,
        accepted: { kind: 'approve_each' as const, authorityRef: prepared.authority!.reference },
        materialInputDigest: materialDigest(
          preparedMaterial,
          ['operationKey', 'inputDigest', 'sourceSnapshotDigest', 'target'],
        ),
      },
      expectedEffectCount: 1,
      expectedChallengeDigest: snapshot.paymentAttempts[0]!.challengeDigest,
      expectedSemanticClaim: {
        ownerInvocationRef: prepared.invocationRef,
        status: 'uncertain' as const,
      },
    }
    const loaded = loadDynamicPublishedAdapterSnapshot(
      structuredClone(snapshot),
      snapshotAnchors,
    )
    const tamperCases: readonly [string, (copy: any) => void][] = [
      ['invocationRef', (copy) => { copy.paymentAttempts[0].invocationRef = 'invocation:other' }],
      ['attemptRef', (copy) => { copy.paymentAttempts[0].attemptRef = 'attempt:other' }],
      ['effectGeneration', (copy) => { copy.paymentAttempts[0].effectGeneration += 1 }],
      ['duplicate row', (copy) => { copy.paymentAttempts.push({ ...copy.paymentAttempts[0] }) }],
      ['missing row', (copy) => { copy.paymentAttempts = [] }],
      ['missing authorization event', (copy) => { copy.paymentAuthorizationEvents = [] }],
      ['authorization downgrade', (copy) => {
        copy.paymentAuthorizationEvents[0].authorization = 'not_created'
        delete copy.paymentAuthorizationEvents[0].authorizationDigest
      }],
      ['payTo', (copy) => { copy.paymentAttempts[0].payTo = '0xother-recipient' }],
      ['amount', (copy) => {
        copy.paymentAttempts[0].amount = { currency: 'USD', units: '999999', exponent: 6 }
      }],
      ['scheme', (copy) => { copy.paymentAttempts[0].scheme = 'other' }],
      ['network', (copy) => { copy.paymentAttempts[0].network = 'eip155:1' }],
      ['asset', (copy) => { copy.paymentAttempts[0].asset = '0xother-asset' }],
      ['challengeDigest', (copy) => {
        copy.paymentAttempts[0].challengeDigest = 'sha256:other-challenge'
      }],
    ]
    const tamperDispositions = tamperCases.map(([name, mutate]) => {
      const tampered = JSON.parse(JSON.stringify(snapshot))
      mutate(tampered)
      try {
        loadDynamicPublishedAdapterSnapshot(tampered, {
          operation: fixture.operation,
          descriptor: fixture.descriptor,
          actor,
          origin,
          issuedAuthority: {
            reference: prepared.authority!.reference,
            accepted: { kind: 'approve_each', authorityRef: prepared.authority!.reference },
            materialInputDigest: materialDigest(
              preparedMaterial,
              ['operationKey', 'inputDigest', 'sourceSnapshotDigest', 'target'],
            ),
          },
          expectedEffectCount: 1,
          expectedChallengeDigest: snapshot.paymentAttempts[0]!.challengeDigest,
          expectedSemanticClaim: {
            ownerInvocationRef: prepared.invocationRef,
            status: 'uncertain',
          },
        })
        return [name, 'accepted']
      } catch (error) {
        return [
          name,
          error instanceof Error ? error.message : 'non_error_rejection',
        ]
      }
    })
    expect(tamperDispositions).toEqual(tamperCases.map(([name]) => [
      name,
      'dynamic_published_snapshot_semantics_invalid',
    ]))
    expect(effects).toEqual({ payment: 1, provider: 1 })
    const coldSource = createDevelopmentDynamicPublishedSource(
      [fixture.operation],
      loaded.sourceRows,
      loaded.semanticClaims,
    )
    const cold = createAdapter(
      fixture.operation,
      successRuntime(fixture.operation.binding.endpointUrl, effects),
      clock + 1_000,
      coldSource,
      {
        durablePort: loaded.durablePort,
        developmentSnapshot: loaded.developmentSnapshot,
        initialSnapshot: loaded.initialSnapshot,
        sequenceBase: loaded.developmentSnapshot.controls.size,
        paymentAttemptPort: createInMemoryX402PaymentAttemptPort(
          loaded.paymentAttempts,
          loaded.paymentAuthorizationEvents,
        ),
        verifyPaymentReconciliationEvidence: () => true,
      },
    )
    expect(cold.inspect(prepared.invocationRef)?.control).toMatchObject({ state: 'reconciliation_required' })
    const cancelled = await cold.cancel({
      invocationRef: prepared.invocationRef,
      idempotencyKey: `cancel:${prepared.invocationRef}:possible-release`,
      expectedInvocationVersion: uncertain.kind === 'accepted' ? uncertain.view.invocationVersion : 0,
      actor,
      origin,
    })
    expect(cancelled).toMatchObject({ kind: 'refused', code: 'invalid_control_state' })
    const retry = await cold.acquire({
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
    const validEvidence = {
      ...evidenceMaterial,
      digest: canonicalDigest(evidenceMaterial),
    }
    const paymentEvidenceMaterial = {
      kind: 'x402_payment_reconciliation' as const,
      version: 1 as const,
      evidenceRef: 'payment:reconciliation:one',
      evidenceRefs: ['provider:payment-readback:one'],
      source: `x402:${paymentAttempt.providerEndpoint}`,
      paymentIdentifier: paymentAttempt.paymentIdentifier,
      challengeDigest: paymentAttempt.challengeDigest,
      providerEndpoint: paymentAttempt.providerEndpoint,
      scheme: paymentAttempt.scheme,
      network: paymentAttempt.network,
      asset: paymentAttempt.asset,
      payTo: paymentAttempt.payTo,
      amount: paymentAttempt.amount,
      invocationRef: paymentAttempt.invocationRef,
      attemptRef: paymentAttempt.attemptRef,
      effectGeneration: paymentAttempt.effectGeneration,
      resolution: 'not_settled' as const,
      observedAt: new Date(clock + 1_000).toISOString(),
    }
    const paymentEvidence = {
      ...paymentEvidenceMaterial,
      digest: canonicalDigest(paymentEvidenceMaterial),
    }
    const invalidControlApplication = createInvocationApplication({
      adapter: cold,
      sourceCommands: {
        leaseOwner: () => 'worker:reconciliation',
        reconciliationEvidence: () => undefined,
      },
    })
    const invalidControlHost = invalidControlApplication.bindStandalone({ actor })
    const invalidControl = await invalidControlHost.recoverPaidOperation(
      view.invocationRef,
      { ...validEvidence, evidenceRef: 'provider:reconciliation:tampered-after-signing' },
      paymentEvidence,
    )
    expect(invalidControl).toMatchObject({ kind: 'refused', code: 'evidence_digest_mismatch' })
    expect(cold.inspect(prepared.invocationRef)?.control)
      .toMatchObject({ state: 'reconciliation_required' })
    expect(cold.exportDevelopmentSnapshot().paymentAttempts[0]).toMatchObject({
      state: 'reconciliation_required',
    })
    expect(effects).toEqual({ payment: 1, provider: 1 })
    const interruptedApplication = createInvocationApplication({
      adapter: cold,
      sourceCommands: {
        leaseOwner: () => 'worker:reconciliation',
        reconciliationEvidence: () => undefined,
        afterPaymentReconciliationPersist: () => {
          throw new Error('development_crash_after_payment_reconciliation_persist')
        },
      },
    })
    await expect(interruptedApplication.bindStandalone({ actor }).recoverPaidOperation(
      view.invocationRef,
      validEvidence,
      paymentEvidence,
    )).rejects.toThrow('development_crash_after_payment_reconciliation_persist')
    const cutSnapshot = cold.exportDevelopmentSnapshot()
    expect(cutSnapshot.paymentAttempts[0]).toMatchObject({
      state: 'not_settled',
      reconciliationEvidenceRef: paymentEvidence.evidenceRef,
      reconciliationEvidenceDigest: paymentEvidence.digest,
    })
    expect(cold.inspect(prepared.invocationRef)?.control)
      .toMatchObject({ state: 'reconciliation_required' })
    const cutLoaded = loadDynamicPublishedAdapterSnapshot(
      structuredClone(cutSnapshot),
      {
        operation: fixture.operation,
        descriptor: fixture.descriptor,
        actor,
        origin,
        issuedAuthority: {
          reference: prepared.authority!.reference,
          accepted: { kind: 'approve_each', authorityRef: prepared.authority!.reference },
          materialInputDigest: materialDigest(
            preparedMaterial,
            ['operationKey', 'inputDigest', 'sourceSnapshotDigest', 'target'],
          ),
        },
        expectedEffectCount: 1,
        expectedChallengeDigest: cutSnapshot.paymentAttempts[0]!.challengeDigest,
        expectedSemanticClaim: {
          ownerInvocationRef: prepared.invocationRef,
          status: 'uncertain',
        },
      },
    )
    const replayAdapter = createAdapter(
      fixture.operation,
      successRuntime(fixture.operation.binding.endpointUrl, effects),
      clock + 1_000,
      createDevelopmentDynamicPublishedSource(
        [fixture.operation],
        cutLoaded.sourceRows,
        cutLoaded.semanticClaims,
      ),
      {
        durablePort: cutLoaded.durablePort,
        developmentSnapshot: cutLoaded.developmentSnapshot,
        initialSnapshot: cutLoaded.initialSnapshot,
        sequenceBase: cutLoaded.developmentSnapshot.controls.size,
        paymentAttemptPort: createInMemoryX402PaymentAttemptPort(
          cutLoaded.paymentAttempts,
          cutLoaded.paymentAuthorizationEvents,
        ),
        verifyPaymentReconciliationEvidence: () => true,
      },
    )
    const replayHost = createInvocationApplication({
      adapter: replayAdapter,
      sourceCommands: {
        leaseOwner: () => 'worker:reconciliation',
        reconciliationEvidence: () => undefined,
      },
    }).bindStandalone({ actor })
    const conflictingMaterial = {
      ...paymentEvidenceMaterial,
      evidenceRef: 'payment:reconciliation:conflict',
    }
    const conflicting = await replayHost.recoverPaidOperation(
      view.invocationRef,
      validEvidence,
      { ...conflictingMaterial, digest: canonicalDigest(conflictingMaterial) },
    )
    expect(conflicting).toMatchObject({
      kind: 'refused',
      code: 'reconciliation_evidence_unavailable',
    })
    expect(replayAdapter.inspect(prepared.invocationRef)?.control)
      .toMatchObject({ state: 'reconciliation_required' })
    const reconciled = await replayHost.recoverPaidOperation(
      view.invocationRef,
      validEvidence,
      paymentEvidence,
    )
    expect(reconciled.kind === 'reconciled' && reconciled.view.control).toEqual({
      state: 'terminal',
    })
    expect(replayAdapter.exportDevelopmentSnapshot().paymentAttempts[0]).toMatchObject({
      state: 'not_settled',
      reconciliationEvidenceDigest: paymentEvidence.digest,
    })
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
      mappings: [],
      now: clock,
    })
    if (compiled.kind !== 'compiled') throw new Error('request not compiled')
    const attached = await attachCompletedTaskReference({
      principalRef: actor.principalRef,
      callerRef: actor.callerRef,
      invocationRef: prepared.invocationRef,
      referencedAt: clock,
      candidateAggregate: compiled.aggregate,
    }, {
      readCompletedResultIdentity: async ({ invocationRef, actor: requestedActor }) =>
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

  it('derives a non-fixture fixed amount and currency from admitted operation material', async () => {
    const fixture = buildDevelopmentPublishedOperationEvidence()
    const amount: ExactAmount = { currency: 'AUD', units: '7', exponent: 3 }
    const operation = rematerializeFixedPrice(fixture, amount)
    const clock = operation.readiness.observedAt + 1_000
    vi.spyOn(Date, 'now').mockReturnValue(clock)
    const effects = { payment: 0, provider: 0 }
    const adapter = createAdapter(
      operation,
      successRuntime(operation.binding.endpointUrl, effects, '7000'),
      clock,
    )
    const origin = origins[0]!
    const prepared = await adapter.prepare({
      origin, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
    })
    expect(prepared.prepared?.dataUse.limits).toMatchObject({
      amount: { currency: 'AUD', units: '7', exponent: 3 },
    })
    if (prepared.prepared === undefined) throw new Error('missing prepared authority')
    expect(prepared.prepared.target).toMatchObject({
      effect: { amount },
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

  it('shares one uncertain provider outcome without retrying the effect', async () => {
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
    const lease = async (worker: string) => {
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
        actor, origin, leaseOwner: worker, leaseMs: 30_000,
      })
      if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') throw new Error('not leased')
      return { prepared, view: acquired.view }
    }
    const [first, second] = await Promise.all([
      lease('worker:uncertain:first'),
      lease('worker:uncertain:second'),
    ])
    if (first.view.control.state !== 'leased' || second.view.control.state !== 'leased') {
      throw new Error('not leased')
    }
    const execute = async (entry: typeof first) => await adapter.executeAcquired({
      invocationRef: entry.prepared.invocationRef,
      expectedInvocationVersion: entry.view.invocationVersion,
      attemptRef: entry.view.control.state === 'leased' ? entry.view.control.attemptRef : '',
      leaseOwner: entry.view.control.state === 'leased' ? entry.view.control.leaseOwner : '',
      effectGeneration: entry.view.control.state === 'leased' ? entry.view.control.effectGeneration : 0,
    })
    const [firstResult, secondResult] = await Promise.all([execute(first), execute(second)])
    expect(firstResult.kind === 'accepted' && firstResult.view.control)
      .toMatchObject({ state: 'reconciliation_required' })
    expect(secondResult.kind === 'accepted' && secondResult.view.control)
      .toMatchObject({ state: 'reconciliation_required' })
    expect(effects).toEqual({ payment: 1, provider: 1 })
    expect(source.list().every(
      ({ observedResolution }) => observedResolution.state === 'threw',
    )).toBe(true)
  })

  it('cold-reuses shared uncertainty with separate attribution and zero new effect', async () => {
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
    const first = await adapter.prepare({
      origin, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
    })
    const firstDecided = await adapter.decide({
      invocationRef: first.invocationRef,
      expectedInvocationVersion: first.invocationVersion,
      authorityRef: first.authority!.reference,
      actor, origin, accept: true,
    })
    if (firstDecided.kind !== 'accepted') throw new Error(firstDecided.code)
    const firstLease = await adapter.acquire({
      invocationRef: first.invocationRef,
      expectedInvocationVersion: firstDecided.view.invocationVersion,
      authorityRef: first.authority!.reference,
      actor, origin, leaseOwner: 'worker:cold:owner', leaseMs: 30_000,
    })
    if (firstLease.kind !== 'accepted' || firstLease.view.control.state !== 'leased') throw new Error('not leased')
    const uncertain = await adapter.executeAcquired({
      invocationRef: first.invocationRef,
      expectedInvocationVersion: firstLease.view.invocationVersion,
      attemptRef: firstLease.view.control.attemptRef,
      leaseOwner: firstLease.view.control.leaseOwner,
      effectGeneration: firstLease.view.control.effectGeneration,
    })
    expect(uncertain.kind === 'accepted' && uncertain.view.control)
      .toMatchObject({ state: 'reconciliation_required' })
    const snapshot = adapter.exportDevelopmentSnapshot()
    const loaded = loadDynamicPublishedAdapterSnapshot(
      structuredClone(snapshot),
      {
        ...dynamicSnapshotAnchors(fixture, first, origin, 'uncertain', 1),
        expectedChallengeDigest: snapshot.paymentAttempts[0]!.challengeDigest,
      },
    )
    const coldSource = createDevelopmentDynamicPublishedSource(
      [fixture.operation],
      loaded.sourceRows,
      loaded.semanticClaims,
    )
    const cold = createAdapter(
      fixture.operation,
      successRuntime(fixture.operation.binding.endpointUrl, effects),
      clock + 1,
      coldSource,
      {
        durablePort: loaded.durablePort,
        developmentSnapshot: loaded.developmentSnapshot,
        initialSnapshot: loaded.initialSnapshot,
        sequenceBase: loaded.developmentSnapshot.controls.size,
        paymentAttemptPort: createInMemoryX402PaymentAttemptPort(
          loaded.paymentAttempts,
          loaded.paymentAuthorizationEvents,
        ),
      },
    )
    const second = await cold.prepare({
      origin, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
    })
    const secondDecided = await cold.decide({
      invocationRef: second.invocationRef,
      expectedInvocationVersion: second.invocationVersion,
      authorityRef: second.authority!.reference,
      actor, origin, accept: true,
    })
    if (secondDecided.kind !== 'accepted') throw new Error(secondDecided.code)
    const secondLease = await cold.acquire({
      invocationRef: second.invocationRef,
      expectedInvocationVersion: secondDecided.view.invocationVersion,
      authorityRef: second.authority!.reference,
      actor, origin, leaseOwner: 'worker:cold:reuse', leaseMs: 30_000,
    })
    if (secondLease.kind !== 'accepted' || secondLease.view.control.state !== 'leased') throw new Error('not leased')
    const shared = await cold.executeAcquired({
      invocationRef: second.invocationRef,
      expectedInvocationVersion: secondLease.view.invocationVersion,
      attemptRef: secondLease.view.control.attemptRef,
      leaseOwner: secondLease.view.control.leaseOwner,
      effectGeneration: secondLease.view.control.effectGeneration,
    })
    expect(shared.kind === 'accepted' && shared.view.control)
      .toMatchObject({ state: 'reconciliation_required' })
    expect(shared.kind === 'accepted' && shared.view.acceptedAuthority)
      .not.toEqual(uncertain.kind === 'accepted' ? uncertain.view.acceptedAuthority : undefined)
    expect(effects).toEqual({ payment: 1, provider: 1 })
  })

  it('cold-continues an acquired owner after process loss between claim and release', async () => {
    const fixture = buildDevelopmentPublishedOperationEvidence()
    const clock = fixture.operation.readiness.observedAt + 1_000
    vi.spyOn(Date, 'now').mockReturnValue(clock)
    const source = createDevelopmentDynamicPublishedSource([fixture.operation])
    const adapter = createAdapter(
      fixture.operation,
      successRuntime(fixture.operation.binding.endpointUrl, { payment: 0, provider: 0 }),
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
      actor, origin, leaseOwner: 'worker:process-kill', leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') throw new Error('not leased')
    const row = source.read(prepared.invocationRef)!
    expect(source.claimSemanticEffect({
      semanticBaseKey: row.semanticBaseKey,
      semanticIdentityDigest: row.semanticIdentityDigest,
      principalRef: actor.principalRef,
      invocationRef: prepared.invocationRef,
    })).toEqual({ kind: 'owner' })
    const loaded = loadDynamicPublishedAdapterSnapshot(
      structuredClone(adapter.exportDevelopmentSnapshot()),
      dynamicSnapshotAnchors(fixture, prepared, origin, 'pending', 1),
    )
    const coldSource = createDevelopmentDynamicPublishedSource(
      [fixture.operation],
      loaded.sourceRows,
      loaded.semanticClaims,
    )
    const effects = { payment: 0, provider: 0 }
    const cold = createAdapter(
      fixture.operation,
      successRuntime(fixture.operation.binding.endpointUrl, effects),
      clock + 1,
      coldSource,
      {
        durablePort: loaded.durablePort,
        developmentSnapshot: loaded.developmentSnapshot,
        initialSnapshot: loaded.initialSnapshot,
        sequenceBase: loaded.developmentSnapshot.controls.size,
        paymentAttemptPort: createInMemoryX402PaymentAttemptPort(
          loaded.paymentAttempts,
          loaded.paymentAuthorizationEvents,
        ),
      },
    )
    const completed = await cold.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
    })
    expect(completed.kind === 'accepted' && completed.view.control).toEqual({ state: 'terminal' })
    expect(effects).toEqual({ payment: 1, provider: 1 })
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

  it('rejects redigested snapshot and evidence attacks from immutable anchors', async () => {
    const base = await buildDevelopmentDynamicInvocationEvidence()
    expect(base.evidenceContract.reconstructionMetadataOnly)
      .toBe('timestamps_and_order_without_external_root')
    expect(base.claimCeiling).toContain(
      'Timestamps and order metadata have no independent provenance',
    )
    const attacks: readonly [string, (packet: any) => void][] = [
      ['owner', (packet) => { packet.cases[0].snapshot.controls[0].control.owner.principalRef = 'principal:attacker' }],
      ['origin', (packet) => { packet.cases[0].snapshot.controls[0].control.origin = { kind: 'standalone', callerRef: 'x', principalRef: 'y' } }],
      ['mode', (packet) => { packet.cases[0].snapshot.controls[0].control.acceptedAuthority.kind = 'standing_mandate_use' }],
      ['coordinated authority reference', (packet) => {
        const control = packet.cases[0].snapshot.controls[0]
        control.control.authority.reference = 'authority:forged'
        control.control.acceptedAuthority.authorityRef = 'authority:forged'
        control.authorityBinding.reference = 'authority:forged'
        control.authorityBinding.acceptedBasis.authorityRef = 'authority:forged'
      }],
      ['generation', (packet) => { packet.cases[0].snapshot.attempts[0].rows[0].effectGeneration = 7 }],
      ['coordinated attempt material and effect', (packet) => {
        const snapshot = packet.cases[0].snapshot
        const attempt = snapshot.attempts[0].rows[0]
        attempt.idempotency.materialInputDigest = 'sha256:forged-material'
        attempt.idempotency.effectIdentity = canonicalDigest({
          actionId: snapshot.controls[0].control.action.id,
          operationKey: attempt.idempotency.operationKey,
          materialInputDigest: attempt.idempotency.materialInputDigest,
        })
        const transition = snapshot.history[0].rows.at(-1).attemptTransition
        const prior = {
          ...attempt,
          release: { state: 'not_released' },
          outcome: { state: 'running' },
        }
        transition.priorDigest = canonicalDigest(prior)
        transition.nextDigest = canonicalDigest(attempt)
      }],
      ['publication', (packet) => { packet.cases[0].snapshot.sourceRows[0].operation.identity.publicationRevision = 99 }],
      ['config', (packet) => { packet.cases[0].snapshot.sourceRows[0].operation.transport.configJson = '{}' }],
      ['payment', (packet) => { packet.cases[0].snapshot.sourceRows[0].operation.identity.payment.payTo = '0xattacker' }],
      ['price', (packet) => { packet.cases[0].snapshot.sourceRows[0].operation.identity.price.amount.units = '999' }],
      ['input', (packet) => { packet.cases[0].snapshot.sourceRows[0].input.input.symbol = 'ETH' }],
      ['output', (packet) => { packet.cases[0].snapshot.sourceRows[0].observedResolution.result.output = { data: { forged: true } } }],
      ['challenge', (packet) => { packet.cases[0].snapshot.sourceRows[0].observedResolution.result.paymentChallengeDigest = 'sha256:forged' }],
      ['evidence', (packet) => { packet.cases[0].snapshot.sourceRows[0].observedResolution.result.providerReceipt = 'forged:evidence' }],
      ['result', (packet) => { packet.cases[0].snapshot.sourceRows[0].resultIdentity.resultDigest = 'sha256:forged' }],
      ['attempt', (packet) => { packet.cases[0].snapshot.attempts[0].rows[0].attemptRef = 'attempt:forged' }],
      ['effects', (packet) => { packet.cases[0].paymentEffects = 2 }],
      ['coordinated command material and history', (packet) => {
        const snapshot = packet.cases[0].snapshot
        const command = snapshot.commands.at(-1)
        command.value.material.control = { state: 'awaiting_authority' }
        command.value.digest = canonicalDigest(command.value.material)
        const row = snapshot.history[0].rows.find(
          (candidate: any) => candidate.commandId === command.commandId,
        )
        row.commandDigest = command.value.digest
        command.value.result = { kind: 'applied', invocationVersion: row.invocationVersion }
      }],
      ['semantic invocation swap', (packet) => {
        packet.semanticReuse.invocations[1].invocationRef =
          packet.semanticReuse.invocations[0].invocationRef
      }],
      ['semantic attempt swap', (packet) => {
        packet.semanticReuse.invocations[1].attemptRef =
          packet.semanticReuse.invocations[0].attemptRef
      }],
      ['semantic generation', (packet) => {
        packet.semanticReuse.invocations[1].effectGeneration = 7
      }],
      ['semantic index', (packet) => {
        packet.semanticReuse.invocations[1].snapshot.sourceRows[0].semanticIdentityDigest =
          'sha256:forged-semantic-index'
      }],
      ['semantic owner', (packet) => {
        packet.semanticReuse.invocations[1].snapshot.semanticClaims[0].ownerInvocationRef =
          packet.semanticReuse.invocations[1].invocationRef
      }],
      ['semantic base', (packet) => {
        const snapshot = packet.semanticReuse.invocations[1].snapshot
        snapshot.sourceRows[0].semanticBaseKey = 'sha256:forged-base'
        snapshot.semanticClaims[0].semanticBaseKey = 'sha256:forged-base'
      }],
      ['semantic status', (packet) => {
        packet.semanticReuse.invocations[1].snapshot.semanticClaims[0].status = 'uncertain'
      }],
      ['semantic outcome', (packet) => {
        packet.semanticReuse.invocations[1].snapshot.semanticClaims[0].outcome.observedResolution =
          { state: 'threw', execution: 'runner_threw', message: 'forged' }
      }],
      ['semantic result reference', (packet) => {
        const entry = packet.semanticReuse.invocations[1]
        entry.snapshot.sourceRows[0].resultIdentity.sourceResultRef = 'result:forged'
        entry.snapshot.controls[0].sourceResultRef = 'result:forged'
        packet.semanticReuse.sharedOutcomeRef = 'result:forged'
      }],
      ['prepared continuation material', (packet) => {
        const snapshot = packet.processKill.snapshot
        snapshot.sourceRows[0].prepared.materialInputDigest = 'sha256:forged-prepared'
        snapshot.controls[0].preparedMaterialDigest = 'sha256:forged-prepared'
        snapshot.controls[0].authorityBinding.digest = 'sha256:forged-prepared'
        snapshot.attempts[0].rows[0].idempotency.materialInputDigest = 'sha256:forged-prepared'
      }],
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

function dynamicSnapshotAnchors(
  fixture: ReturnType<typeof buildDevelopmentPublishedOperationEvidence>,
  prepared: ActionInvocationView<DynamicPublishedInvocationResult>,
  origin: ActionInvocationOrigin,
  status: 'pending' | 'completed' | 'uncertain',
  expectedEffectCount: number,
) {
  const material = buildDynamicPublishedInput({
    operation: fixture.operation,
    descriptor: fixture.descriptor,
    value: { symbol: 'BTC', convert: 'USD' },
  })
  return {
    operation: fixture.operation,
    descriptor: fixture.descriptor,
    actor,
    origin,
    issuedAuthority: {
      reference: prepared.authority!.reference,
      accepted: { kind: 'approve_each' as const, authorityRef: prepared.authority!.reference },
      materialInputDigest: materialDigest(
        material,
        ['operationKey', 'inputDigest', 'sourceSnapshotDigest', 'target'],
      ),
    },
    expectedEffectCount,
    expectedSemanticClaim: {
      ownerInvocationRef: prepared.invocationRef,
      status,
      ...(status === 'completed'
        ? {
            outcomeResultRef: `published-result:${canonicalDigest({
              semanticBaseKey: canonicalDigest({
                principalRef: actor.principalRef,
                actionId: fixture.operation.operationId,
                actionVersion: fixture.descriptor.version,
                operationKey: material.operationKey,
              }),
              target: material.target,
              preparedMaterialDigest: materialDigest(
                material,
                ['operationKey', 'inputDigest', 'sourceSnapshotDigest', 'target'],
              ),
            })}`,
          }
        : {}),
    },
  }
}

function createAdapter(
  operation: ReturnType<typeof buildDevelopmentPublishedOperationEvidence>['operation'],
  runtime: RouteTransportRuntime,
  now: number,
  source = createDevelopmentDynamicPublishedSource([operation]),
  options: Readonly<{
    durablePort?: Parameters<typeof createDynamicPublishedActionInvocationAdapter>[0]['durablePort']
    developmentSnapshot?: Parameters<typeof createDynamicPublishedActionInvocationAdapter>[0]['developmentSnapshot']
    initialSnapshot?: Parameters<typeof createDynamicPublishedActionInvocationAdapter>[0]['initialSnapshot']
    sequenceBase?: number
    paymentAttemptPort?: Parameters<typeof createDynamicPublishedActionInvocationAdapter>[0]['paymentAttemptPort']
    verifyPaymentReconciliationEvidence?: Parameters<typeof createDynamicPublishedActionInvocationAdapter>[0]['verifyPaymentReconciliationEvidence']
  }> = {},
) {
  let durablePort = options.durablePort
  let developmentSnapshot = options.developmentSnapshot
  if (durablePort === undefined) {
    const state = createDevelopmentDurableState<DynamicPublishedInvocationResult>()
    durablePort = createDevelopmentDurablePort(state)
    developmentSnapshot = state
  }
  let invocation = options.sequenceBase ?? 0
  let authority = options.sequenceBase ?? 0
  let attempt = options.sequenceBase ?? 0
  const paymentAttemptPort = options.paymentAttemptPort ?? createInMemoryX402PaymentAttemptPort()
  return createDynamicPublishedActionInvocationAdapter({
    issueProviderLease: createDevelopmentProviderLeaseIssuer(operation, now),
    operation,
    source,
    runtime,
    now: () => now,
    nextInvocationRef: () => `invocation:${++invocation}`,
    nextAuthorityRef: () => `authority:${++authority}`,
    nextAttemptRef: () => `attempt:${++attempt}`,
    durablePort,
    paymentAttemptPort,
    ...(developmentSnapshot === undefined ? {} : { developmentSnapshot }),
    ...(options.initialSnapshot === undefined ? {} : { initialSnapshot: options.initialSnapshot }),
    ...(options.verifyPaymentReconciliationEvidence === undefined
      ? {}
      : { verifyPaymentReconciliationEvidence: options.verifyPaymentReconciliationEvidence }),
  })
}

function paymentPreparedFixture(): DynamicPublishedPreparedTransport {
  return {
    invocationRef: 'invocation:crash-cut',
    operationKey: 'operation:paid',
    attemptRef: 'attempt:one',
    effectGeneration: 3,
    plan: {
      invocation: {
        binding: {
          adapterId: 'x402-fetch:v2',
          endpointUrl: 'https://provider.example/paid',
          authority: {
            kind: 'provider_connection',
            connectionRef: 'test:connection:x402',
            providerRef: 'test:provider:x402',
          },
          configJson: '{}',
          configDigest: canonicalDigest({}),
        },
        authority: {
          attemptRef: 'attempt:one',
          effectGeneration: 3,
          authorityGeneration: 3,
          authorityDigest: canonicalDigest({ fixture: 'test-x402-authority', generation: 3 }),
          operationKeyDigest: 'operation:paid',
          mandateDigest: 'mandate:digest',
          grantDigest: 'grant:digest',
          capabilityContractDigest: 'operation:revision',
          maximumSpend: { currency: 'USD', units: '1', exponent: 2 },
          expiresAt: 10_000,
          callIdentity: { keyId: 'key:one', signature: 'call:signature' },
        },
        inputJson: '{}',
      },
      endpoint: new URL('https://provider.example/paid'),
      target: new URL('https://provider.example/paid'),
      configuration: {
        method: 'POST',
        requestTimeoutMs: 5_000,
        scheme: 'exact',
        network: 'eip155:8453',
        currency: 'USD',
        routeAmountExponent: 2,
        assetAmountExponent: 6,
        asset: '0xmock-usdc',
        payTo: '0xmock-provider',
      },
      requestDigest: canonicalDigest({ request: 'paid' }),
    },
  }
}

function paymentAuthorizationRequest():
  X402PaymentSignatureRequest & X402PaymentAuthorizationIdentity {
  const challenge = {
    x402Version: 2 as const,
    resource: { url: 'https://provider.example/paid' },
    accepts: [{
      scheme: 'exact',
      network: 'eip155:8453' as const,
      amount: '10000',
      asset: '0xmock-usdc',
      payTo: '0xmock-provider',
      maxTimeoutSeconds: 30,
      extra: {},
    }],
  }
  return {
    challenge,
    challengeDigest: canonicalDigest(challenge),
    credential: 'env:AE_X402_PAYMENT_PRIVATE_KEY',
    paymentIdentifier: 'operation:paid',
    selectedRequirement: challenge.accepts[0]!,
    paymentAmount: { currency: 'USD', units: '1', exponent: 2 },
    attemptRef: 'attempt:one',
    effectGeneration: 3,
  }
}

function paymentAttemptFixture(
  prepared: DynamicPublishedPreparedTransport,
  request: X402PaymentSignatureRequest & X402PaymentAuthorizationIdentity,
): X402PaymentAttempt {
  return {
    paymentIdentifier: request.paymentIdentifier,
    invocationRef: prepared.invocationRef,
    attemptRef: prepared.attemptRef,
    effectGeneration: prepared.effectGeneration,
    operationKey: prepared.operationKey,
    challengeDigest: request.challengeDigest,
    scheme: request.selectedRequirement.scheme,
    network: request.selectedRequirement.network,
    asset: request.selectedRequirement.asset,
    payTo: request.selectedRequirement.payTo,
    amount: request.paymentAmount,
    providerEndpoint: request.challenge.resource.url,
    operationRevision: prepared.plan.invocation.authority.capabilityContractDigest,
    authorizationDigest: canonicalDigest('raw:authorization:from-custody'),
    custodyRef: `sha256:${'3'.repeat(64)}`,
    state: 'prepared',
    preparedAt: 1,
    evidenceRefs: [],
  }
}

function successRuntime(
  endpoint: string,
  effects: { payment: number; provider: number },
  challengeAmount = '10000',
): RouteTransportRuntime {
  return runtime(endpoint, effects, JSON.stringify({
    data: {
      BTC: {
        symbol: 'BTC',
        quote: { USD: { price: 1, last_updated: '2026-07-20T00:00:00.000Z' } },
      },
    },
  }), challengeAmount)
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
  challengeAmount = '10000',
): X402RouteTransportRuntime {
  const custody = new Map<string, Readonly<{
    custodyRef: string
    authorizationDigest: string
    paymentSignature: string
  }>>()
  const challenge = {
    x402Version: 2,
    resource: { url: `${endpoint}?symbol=BTC&convert=USD` },
    accepts: [{
      scheme: 'exact',
      network: 'eip155:8453' as const,
      amount: challengeAmount,
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
    return response(200, output, {
      'payment-response': encodePaymentResponseHeader({
        success: true,
        transaction: 'test:dynamic-published-operation',
        network: challenge.accepts[0]!.network,
        amount: challenge.accepts[0]!.amount,
        payer: 'test:dynamic-published-operation',
      }),
      'provider-receipt': 'mock:receipt',
    })
  }
  return {
    send,
    resolveCredential: (connectionRef) => connectionRef.length > 0 ? 'mock:credential' : undefined,
    readX402PaymentCredentialRef: () => 'env:AE_X402_PAYMENT_PRIVATE_KEY',
    readProviderConnectionCredentialRef: readDevelopmentProviderCredential,
    validateProviderConnectionAuthority: () => ({ kind: 'valid' as const }),
    x402PaymentSigningAvailable: () => true,
    verifyX402Settlement: async () => true,
    prepareX402PaymentAuthorization: async (request) => {
      const identity = canonicalDigest({
        paymentIdentifier: request.paymentIdentifier,
        challengeDigest: request.challengeDigest,
        attemptRef: request.attemptRef,
        effectGeneration: request.effectGeneration,
      })
      const existing = custody.get(identity)
      if (existing !== undefined) {
        return {
          custodyRef: existing.custodyRef,
          authorizationDigest: existing.authorizationDigest,
        }
      }
      effects.payment += 1
      const paymentSignature = 'mock:signature'
      const prepared = {
        custodyRef: canonicalDigest({ kind: 'development-x402-custody:v1', identity }),
        authorizationDigest: canonicalDigest(paymentSignature),
      }
      custody.set(identity, { ...prepared, paymentSignature })
      return prepared
    },
    readX402PaymentAuthorization: async ({ custodyRef, authorizationDigest }) =>
      [...custody.values()].find((candidate) =>
        candidate.custodyRef === custodyRef
        && candidate.authorizationDigest === authorizationDigest)?.paymentSignature,
    readX402PaymentAuthorizationByDigest: async ({ authorizationDigest }) =>
      [...custody.values()].find((candidate) =>
        candidate.authorizationDigest === authorizationDigest)?.paymentSignature,
  }
}
function readDevelopmentProviderCredential(input: ProviderConnectionAuthorityLookup) {
  if (
    input.connectionRef !== 'connection:mock-provider'
    || input.providerRef !== 'provider:mock-provider'
    || input.adapterId !== 'x402-fetch:v2'
  ) {
    return { kind: 'unavailable' as const, reason: 'not_found' as const }
  }
  if (input.authorityGeneration !== 1) {
    return { kind: 'unavailable' as const, reason: 'stale_generation' as const }
  }
  if (input.authorityDigest !== developmentProviderConnectionAuthorityDigest({
    connectionRef: 'connection:mock-provider',
    businessId: 'mock:business:published-api',
    providerRef: 'provider:mock-provider',
    adapterId: 'x402-fetch:v2',
  })) {
    return { kind: 'unavailable' as const, reason: 'digest_mismatch' as const }
  }
  return { kind: 'resolved' as const, credentialRef: 'connection:mock-provider' }
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
    resolveCredential: (connectionRef) => connectionRef.length > 0 && mode !== 'credential_unavailable'
      ? 'mock:credential'
      : undefined,
    readProviderConnectionCredentialRef: (input) => mode === 'credential_unavailable'
      ? { kind: 'unavailable' as const, reason: 'credential_unavailable' as const }
      : readDevelopmentProviderCredential(input),
    validateProviderConnectionAuthority: () => ({ kind: 'valid' as const }),
    x402PaymentSigningAvailable: () => mode !== 'signing_unavailable',
    send: async () => mode === 'endpoint_refusal'
      ? response(503, JSON.stringify({ reason: 'unavailable' }), {})
      : response(402, '', {
          'payment-required': mode === 'challenge_invalid'
            ? 'not-base64-json'
            : Buffer.from(JSON.stringify(challenge)).toString('base64'),
        }),
  }
}

function response(status: number, body: string, headers: Record<string, string>): Response {
  return new Response(body, { status, headers })
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
  const currentConnectionAuthority = fixture.sourceMaterial.connectionAuthority
  if (currentConnectionAuthority === undefined) {
    throw new Error('published_operation_connection_authority_missing')
  }
  const connectionAuthority = {
    ...currentConnectionAuthority,
    operationRef: createPublicOperationRef({
      operationId: capabilityOperationId(fixture.sourceMaterial.contract.ref.capabilityId),
      publicationRef: publication.publicationRef,
      publicationRevision: publication.revision,
      contractRef: fixture.sourceMaterial.contract.ref,
    }),
  }
  return materializePublishedOperation({
    ...fixture.sourceMaterial,
    publication,
    qualification,
    connectionAuthority,
  })
}

function rematerializeFixedPrice(
  fixture: ReturnType<typeof buildDevelopmentPublishedOperationEvidence>,
  amount: ExactAmount,
) {
  const pricingConfig = {
    version: 'pricing:v2' as const,
    unit: 'call' as const,
    paidAmount: amount,
  }
  const offering = {
    ...fixture.sourceMaterial.offering,
    presentation: {
      ...fixture.sourceMaterial.offering.presentation,
      price: { kind: 'fixed' as const, amount: pricingConfig.paidAmount },
    },
  }
  const originalConfig = fixture.sourceMaterial.binding.adapter.config
  if (!isRecord(originalConfig)) throw new Error('published_operation_config_invalid')
  const config = {
    ...originalConfig,
    currency: amount.currency,
    routeAmountExponent: amount.exponent,
  }
  const binding = defineCapabilityTransportBindingRegistration({
    ...fixture.sourceMaterial.binding,
    adapter: { ...fixture.sourceMaterial.binding.adapter, config },
  })
  const admitted = admitRegisteredTransport({
    adapterId: binding.adapter.adapterId,
    endpointUrl: binding.endpointUrl,
    authority: binding.authority,
    continuation: binding.continuation,
    cancellation: binding.cancellation,
    config: binding.adapter.config,
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
    publication: {
      ...fixture.sourceMaterial.publication,
      pricingConfig,
      priceDigest: pricingConfigDigest(pricingConfig),
    },
    offering,
    binding,
    admittedTransport: admitted.transport,
    qualification,
  })
}
