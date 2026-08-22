import { describe, expect, it, vi } from 'vitest'

import { createDevelopmentDynamicPublishedSource } from '@/modules/action-invocation'
import { createPaymentAttemptRuntime } from '@/modules/action-invocation/dynamic-published-execution'
import { x402PaymentAttemptKey } from '@/modules/action-invocation/x402-payment-attempt'
import type { X402RouteTransportRuntime } from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { ExactAmount } from '@/modules/money/public'
import {
  buildDevelopmentPublishedOperationEvidence,
} from '../../../tools/dev/fixtures/capability-supply/development-published-operation-evidence'
import { createInMemoryX402PaymentAttemptPort } from '../../helpers/x402-payment-attempt'
import {
  actor,
  createAdapter,
  origins,
  paymentAttemptFixture,
  paymentAuthorizationRequest,
  paymentPreparedFixture,
  preReleaseRuntime,
  rematerializeFixedPrice,
  successRuntime,
} from './dynamic-published-operation-harness'

describe('dynamic PublishedOperation Action Invocation paid', () => {
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
      markX402PaymentPossiblySubmitted: () => undefined,
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
      readAuthorization: () => string
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
        const paymentSignature = 'raw:authorization:transient-fixture-header'
        const authorization = {
          custodyRef: canonicalDigest({ kind: 'test-x402-custody:v1', identity }),
          authorizationDigest: canonicalDigest({ kind: 'test-x402-authorization:v1', identity }),
        }
        custody.set(identity, { ...authorization, readAuthorization: () => paymentSignature })
        return authorization
      },
      markX402PaymentPossiblySubmitted: () => undefined,
      readX402PaymentAuthorization: async ({ custodyRef, authorizationDigest }) =>
        [...custody.values()].find((candidate) =>
          candidate.custodyRef === custodyRef
          && candidate.authorizationDigest === authorizationDigest)?.readAuthorization(),
      readX402PaymentAuthorizationByDigest: async ({ custodyRef, authorizationDigest }) =>
        [...custody.values()].find((candidate) =>
          candidate.custodyRef === custodyRef
          && candidate.authorizationDigest === authorizationDigest)?.readAuthorization(),
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
      .toBe('raw:authorization:transient-fixture-header')
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
      markX402PaymentPossiblySubmitted: () => undefined,
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
    expect(adapter.exportDevelopmentSnapshot().paymentAuthorizationEvents).toEqual([])
    expect(adapter.exportDevelopmentSnapshot().paymentAttempts).toEqual([])
  })

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
})
