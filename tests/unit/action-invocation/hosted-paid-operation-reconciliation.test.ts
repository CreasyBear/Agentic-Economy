import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  createHostedSandboxReconciliation,
} from '@/modules/action-invocation/hosted-sandbox-reconciliation'
import type { ReconciliationEvidenceMaterial } from '@/modules/action-invocation/reconciliation-evidence'
import type { X402PaymentReconciliationEvidenceMaterial } from '@/modules/action-invocation/x402-payment-reconciliation-evidence'

describe('hosted paid-operation reconciliation', () => {
  it('constructs the bound payment attempt only from the persisted proposal', () => {
    const gateway = readFileSync('convex/hostedPaidOperationGateway.ts', 'utf8')
    const boundAttempt = gateway.slice(
      gateway.indexOf('function boundPaymentAttempt'),
      gateway.indexOf('function trustedObservationEvidence'),
    )
    expect(boundAttempt).toContain('aggregate.paymentProposal')
    expect(boundAttempt).not.toMatch(/providerForAggregate|HOSTED_SANDBOX_PROVIDERS/u)
    expect(gateway.slice(gateway.indexOf('function mockObservationMatches')))
      .toMatch(/proposalDigest[\s\S]*paymentProposal/u)
  })

  it('rejects client result facts and unknown keys without observing or mutating', async () => {
    let observations = 0
    let mutations = 0
    const service = fixtureService(
      () => { observations += 1 },
      () => { mutations += 1 },
    )
    for (const forbidden of ['evidence', 'resolution', 'settled', 'result', 'safeToRetry', 'extra']) {
      await expect(service.reconcile({
        command: 'reconcile',
        commandId: `command:${forbidden}`,
        expectedInvocationVersion: 5,
        [forbidden]: true,
      })).resolves.toEqual({ kind: 'refused', code: 'reconcile_intent_invalid' })
    }
    expect({ observations, mutations }).toEqual({ observations: 0, mutations: 0 })
  })

  it('uses trusted bound observations and emits no new effect', async () => {
    let observations = 0
    let mutations = 0
    const service = fixtureService(
      () => { observations += 1 },
      () => { mutations += 1 },
    )
    await expect(service.reconcile({
      command: 'reconcile',
      commandId: 'command:reconcile:1',
      expectedInvocationVersion: 5,
    })).resolves.toEqual({
      kind: 'accepted',
      schema: 'agentic-paid-operation:v1',
      currentVersion: 6,
      relations: {
        invocationRef: 'invocation:1',
        attemptRef: 'attempt:1',
        effectGeneration: 1,
        paymentIdentifier: 'payment:1',
      },
    })
    expect({ observations, mutations }).toEqual({ observations: 1, mutations: 1 })
    expect(service.counters()).toEqual({
      observations: 1,
      mutations: 1,
      effects: 0,
      retries: 0,
      fallbacks: 0,
      switches: 0,
    })
  })
})

function fixtureService(onObserve: () => void, onApply: () => void) {
  const actionMaterial: ReconciliationEvidenceMaterial = {
    kind: 'action_invocation_reconciliation',
    version: 1,
    evidenceRef: `sha256:${'a'.repeat(64)}`,
    source: 'trusted:mock-a',
    invocationRef: 'invocation:1',
    attemptRef: 'attempt:1',
    effectGeneration: 1,
    resolution: 'released',
    observedAt: '2026-07-20T00:02:00.000Z',
  }
  const paymentMaterial: X402PaymentReconciliationEvidenceMaterial = {
    kind: 'x402_payment_reconciliation',
    version: 1,
    evidenceRef: `sha256:${'b'.repeat(64)}`,
    evidenceRefs: [`sha256:${'b'.repeat(64)}`],
    source: 'trusted:mock-a',
    paymentIdentifier: 'payment:1',
    challengeDigest: 'sha256:challenge',
    providerEndpoint: 'https://mock-a.invalid/btc-usd',
    scheme: 'exact',
    network: 'eip155:84532',
    asset: 'USDC',
    payTo: 'recipient:a',
    amount: '0.01',
    invocationRef: 'invocation:1',
    attemptRef: 'attempt:1',
    effectGeneration: 1,
    resolution: 'settled',
    settledAmount: { currency: 'USD', amountMinor: 1 },
    observedAt: '2026-07-20T00:02:00.000Z',
  }
  const actionEvidence = { ...actionMaterial, digest: canonicalDigest(actionMaterial) }
  const paymentEvidence = { ...paymentMaterial, digest: canonicalDigest(paymentMaterial) }
  return createHostedSandboxReconciliation({
    loadBoundAttempt: async () => ({
      source: 'trusted:mock-a',
      invocationRef: 'invocation:1',
      invocationVersion: 5,
      attemptRef: 'attempt:1',
      effectGeneration: 1,
      paymentAttempt: {
        paymentIdentifier: 'payment:1',
        invocationRef: 'invocation:1',
        attemptRef: 'attempt:1',
        effectGeneration: 1,
        operationKey: 'btc-usd-a',
        challengeDigest: 'sha256:challenge',
        scheme: 'exact',
        network: 'eip155:84532',
        asset: 'USDC',
        payTo: 'recipient:a',
        amount: '0.01',
        providerEndpoint: 'https://mock-a.invalid/btc-usd',
        operationRevision: '1',
        authorizationDigest: 'sha256:authorization',
        custodyRef: `sha256:${'c'.repeat(64)}`,
        state: 'reconciliation_required',
        preparedAt: Date.parse('2026-07-20T00:00:00.000Z'),
        submissionStartedAt: Date.parse('2026-07-20T00:01:00.000Z'),
        evidenceRefs: [],
      },
    }),
    observeTrustedFixture: async () => {
      onObserve()
      return { actionEvidence, paymentEvidence }
    },
    verifyActionEvidence: () => true,
    verifyPaymentEvidence: () => true,
    applyValidated: async () => {
      onApply()
      return { currentVersion: 6 }
    },
    now: () => Date.parse('2026-07-20T00:03:00.000Z'),
  })
}
