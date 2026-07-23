import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import {
  createDynamicPublishedActionInvocationAdapter,
  validateX402PaymentReconciliationEvidence,
  type X402PaymentReconciliationEvidenceMaterial,
} from '@/modules/action-invocation'
import { createDevelopmentFileX402PaymentAttemptPort } from '@/modules/action-invocation/development-file-x402-payment-attempt-port'
import type { X402PaymentAttempt, X402PaymentAuthorizationEvent } from '@/modules/action-invocation/x402-payment-attempt'
import { createDevelopmentDynamicPublishedSource } from '@/modules/action-invocation'
import { buildDevelopmentPublishedOperationEvidence } from '@/modules/capability-supply/development-published-operation-evidence'
import { canonicalDigest } from '@/modules/common/canonical-digest'

const now = Date.parse('2026-07-20T01:00:00.000Z')
const attempt: X402PaymentAttempt = {
  paymentIdentifier: 'payment:one',
  invocationRef: 'invocation:one',
  attemptRef: 'attempt:one',
  effectGeneration: 2,
  operationKey: 'operation:one',
  challengeDigest: canonicalDigest({ challenge: 'one' }),
  scheme: 'exact',
  network: 'eip155:8453',
  asset: '0xasset',
  payTo: '0xrecipient',
  amount: '10000',
  providerEndpoint: 'https://provider.example/paid',
  operationRevision: 'revision:one',
  authorizationDigest: canonicalDigest({ authorization: 'one' }),
  custodyRef: `sha256:${'a'.repeat(64)}`,
  state: 'reconciliation_required',
  preparedAt: now - 2_000,
  submissionStartedAt: now - 1_000,
  evidenceRefs: [],
}
const authorizationEvent: X402PaymentAuthorizationEvent = {
  invocationRef: attempt.invocationRef,
  attemptRef: attempt.attemptRef,
  effectGeneration: attempt.effectGeneration,
  operationKey: attempt.operationKey,
  queryRelease: 'released',
  authorization: 'created',
  recordedAt: attempt.preparedAt,
  challengeDigest: attempt.challengeDigest,
  authorizationDigest: attempt.authorizationDigest,
}

describe('x402 payment reconciliation evidence', () => {
  it('fails closed on missing source verification, tamper, stale time, and exact binding drift', () => {
    const evidence = issue('not_settled')
    expect(validateX402PaymentReconciliationEvidence({
      evidence,
      attempt,
      source: evidence.source,
      now,
      verifySourceEvidence: undefined,
    })).toBe('payment_evidence_source_unverified')
    expect(validateX402PaymentReconciliationEvidence({
      evidence: issue('settled'),
      attempt,
      source: evidence.source,
      now,
      verifySourceEvidence: () => true,
    })).toBe('payment_evidence_malformed')
    expect(validateX402PaymentReconciliationEvidence({
      evidence: { ...evidence, amount: '10001' },
      attempt,
      source: evidence.source,
      now,
      verifySourceEvidence: () => true,
    })).toBe('payment_evidence_digest_mismatch')
    const redigested = issue('not_settled', { payTo: '0xattacker' })
    expect(validateX402PaymentReconciliationEvidence({
      evidence: redigested,
      attempt,
      source: evidence.source,
      now,
      verifySourceEvidence: () => true,
    })).toBe('payment_evidence_binding_mismatch')
    const stale = issue('not_settled', { observedAt: new Date(attempt.preparedAt - 1).toISOString() })
    expect(validateX402PaymentReconciliationEvidence({
      evidence: stale,
      attempt,
      source: evidence.source,
      now,
      verifySourceEvidence: () => true,
    })).toBe('payment_evidence_time_invalid')
  })

  it.each([
    ['not_settled', undefined],
    ['settled', { currency: 'USD', amountMinor: 1 }],
  ] as const)('persists an attributable %s resolution across cold restore', async (resolution, settledAmount) => {
    const file = join(tmpdir(), `ae-x402-reconciliation-${resolution}-${process.pid}-${Date.now()}.json`)
    const port = createDevelopmentFileX402PaymentAttemptPort(file)
    port.persist({ attempt, authorizationEvent })
    const adapter = createAdapter(port)
    const evidence = issue(resolution, settledAmount === undefined ? {} : { settledAmount })
    expect(await adapter.reconcilePayment({ evidence })).toMatchObject({
      kind: 'accepted',
      attempt: {
        state: resolution,
        ...(settledAmount === undefined ? {} : { settledAmount }),
        evidenceRefs: [evidence.evidenceRef, ...evidence.evidenceRefs],
      },
    })
    expect(createDevelopmentFileX402PaymentAttemptPort(file).list()).toEqual([
      expect.objectContaining({
        paymentIdentifier: attempt.paymentIdentifier,
        state: resolution,
        ...(settledAmount === undefined ? {} : { settledAmount }),
      }),
    ])
  })
})

function issue(
  resolution: 'not_settled' | 'settled',
  override: Partial<X402PaymentReconciliationEvidenceMaterial> = {},
) {
  const material: X402PaymentReconciliationEvidenceMaterial = {
    kind: 'x402_payment_reconciliation',
    version: 1,
    evidenceRef: `evidence:${resolution}`,
    evidenceRefs: [`provider-receipt:${resolution}`],
    source: `x402:${attempt.providerEndpoint}`,
    paymentIdentifier: attempt.paymentIdentifier,
    challengeDigest: attempt.challengeDigest,
    providerEndpoint: attempt.providerEndpoint,
    scheme: attempt.scheme,
    network: attempt.network,
    asset: attempt.asset,
    payTo: attempt.payTo,
    amount: attempt.amount,
    invocationRef: attempt.invocationRef,
    attemptRef: attempt.attemptRef,
    effectGeneration: attempt.effectGeneration,
    resolution,
    observedAt: new Date(now).toISOString(),
    ...override,
  }
  return { ...material, digest: canonicalDigest(material) }
}

function createAdapter(
  paymentAttemptPort: ReturnType<typeof createDevelopmentFileX402PaymentAttemptPort>,
) {
  const fixture = buildDevelopmentPublishedOperationEvidence()
  return createDynamicPublishedActionInvocationAdapter({
    operation: fixture.operation,
    source: createDevelopmentDynamicPublishedSource([fixture.operation]),
    runtime: {
      send: async () => { throw new Error('not_used') },
      resolveCredential: () => undefined,
      createX402PaymentSignature: async () => undefined,
    },
    now: () => now,
    nextInvocationRef: () => 'invocation:not-used',
    nextAuthorityRef: () => 'authority:not-used',
    nextAttemptRef: () => 'attempt:not-used',
    paymentAttemptPort,
    verifyPaymentReconciliationEvidence: () => true,
  })
}
