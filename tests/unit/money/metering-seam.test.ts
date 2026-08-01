import { describe, expect, it, vi } from 'vitest'

import {
  createDevelopmentDynamicPublishedSource,
  createDynamicPublishedActionInvocationAdapter,
} from '../../../src/modules/action-invocation'
import type { RouteTransportRuntime } from '../../../src/modules/capability-supply/route-transport-runtime'
import { buildDevelopmentPublishedOperationEvidence } from '../../../src/modules/capability-supply/development-published-operation-evidence'
import type { MoneyInvocationPort } from '../../../src/modules/money/public'

const actor = { callerRef: 'agent:local', principalRef: 'clerk_api_key:key-1' }
const origin = { kind: 'standalone' as const, callerRef: actor.callerRef, principalRef: actor.principalRef }

describe('money metering at the published invocation seam', () => {
  it('refuses insufficient credit before provider send', async () => {
    const fixture = buildDevelopmentPublishedOperationEvidence()
    const sends = vi.fn()
    const runtime: RouteTransportRuntime = {
      send: async (...args) => { sends(...args); return new Response('{}', { status: 200 }) },
      resolveCredential: () => 'mock:credential',
      createX402PaymentSignature: async () => 'mock:signature',
      x402PaymentSigningAvailable: () => true,
    }
    const authorizeInvocationCharge = vi.fn(async () => ({ kind: 'refused' as const, code: 'insufficient_credit' as const, retryable: false, nextAction: 'credit_topup_required' as const, currency: 'USD', requiredAmountMinor: 1, availableAmountMinor: 0 }))
    const moneyPort: MoneyInvocationPort = { authorizeInvocationCharge }
    let invocation = 0
    let authority = 0
    let attempt = 0
    const adapter = createDynamicPublishedActionInvocationAdapter({
      operation: fixture.operation,
      source: createDevelopmentDynamicPublishedSource([fixture.operation]),
      runtime,
      moneyPort,
      now: () => fixture.operation.readiness.observedAt + 1_000,
      nextInvocationRef: () => `invocation:${++invocation}`,
      nextAuthorityRef: () => `authority:${++authority}`,
      nextAttemptRef: () => `attempt:${++attempt}`,
    })
    const prepared = adapter.prepare({ origin, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000 })
    const authorityReference = prepared.authority?.reference
    if (authorityReference === undefined) return
    const decided = adapter.decide({ invocationRef: prepared.invocationRef, expectedInvocationVersion: prepared.invocationVersion, authorityRef: authorityReference, actor, origin, accept: true })
    expect(decided.kind).toBe('accepted')
    if (decided.kind !== 'accepted') return
    const acquired = adapter.acquire({ invocationRef: prepared.invocationRef, expectedInvocationVersion: decided.view.invocationVersion, authorityRef: authorityReference, actor, origin, leaseOwner: 'worker:local', leaseMs: 30_000 })
    expect(acquired.kind).toBe('accepted')
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') return
    const result = await adapter.executeAcquired({ invocationRef: prepared.invocationRef, expectedInvocationVersion: acquired.view.invocationVersion, attemptRef: acquired.view.control.attemptRef, leaseOwner: acquired.view.control.leaseOwner, effectGeneration: acquired.view.control.effectGeneration })
    expect(result).toMatchObject({ kind: 'accepted', view: { observedResolution: { result: { kind: 'published_operation_refused', failureCode: 'insufficient_credit' } } } })
    expect(authorizeInvocationCharge).toHaveBeenCalledTimes(1)
    expect(sends).not.toHaveBeenCalled()
  })
})
