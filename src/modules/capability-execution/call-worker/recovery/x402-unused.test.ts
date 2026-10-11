import { describe, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { prepareX402RecoveryEvidence } from './x402'

const readReceipt = vi.hoisted(() => vi.fn())
vi.mock('@/modules/capability-execution/call-worker/x402Route', () => ({ readX402EvmReceipt: readReceipt }))
vi.mock('@/modules/capability-supply/server', async (original) => ({
  ...(await original<typeof import('@/modules/capability-supply/server')>()),
  verifyExactEvmX402AuthorizationCancellation: () => false,
  verifyExactEvmX402AuthorizationTransaction: () => true,
}))
vi.mock('@/modules/action-execution/runtime', async (original) => ({
  ...(await original<typeof import('@/modules/action-execution/runtime')>()),
  readPublicExecutionStatus: async () => ({ kind: 'found', control: 'reconciliation_required' }),
}))

type Work = Parameters<typeof prepareX402RecoveryEvidence>[1]
function fixture() {
  const now = Date.now()
  const attempt = {
    attemptRef: 'attempt:one', effectGeneration: 1, reservationRef: 'reservation:one',
    paymentIdentifier: 'payment:one', challengeDigest: 'sha256:challenge',
    amountUnits: '1000', currency: 'USDC', exponent: 6,
    transportRequestDigest: 'sha256:request', transportObservationDigest: 'sha256:transport',
    paymentObservationDigest: 'sha256:payment', paymentResponseDigest: 'sha256:response',
    responseStatus: 402, paymentPayer: '0xpayer', paymentNonce: '0xnonce',
    network: 'eip155:84532', asset: '0xasset', paymentAuthorizationExpiresAt: 1_000,
  }
  const work = {
    recovered: { callRef: 'call:one', toolRef: 'tool:one', inputDigest: 'sha256:input',
      credentialId: 'credential:one', principalId: 'principal:one', environment: 'sandbox' },
    operation: { operationId: 'tool:one', identity: { adapterId: 'x402-fetch:v2' },
      binding: { authority: { kind: 'provider_connection', providerRef: 'provider:one' } } },
    managedReservation: { reservationRef: 'reservation:one' }, x402Attempt: attempt,
    descriptor: { validateOutput: () => true },
    brokeredReceipt: () => undefined, port: {},
    trustedReconciliationEvidenceDigest: { value: undefined },
    control: { currentAttemptRef: 'attempt:one', currentEffectGeneration: 1,
      control: { control: { state: 'reconciliation_required' } } },
    attemptRows: [{ attemptRef: 'attempt:one', effectGeneration: 1,
      outcome: { state: 'uncertain', reconciliationRequiredAt: new Date(now - 5_000).toISOString() } }],
  } as unknown as Work
  const material = {
    kind: 'x402_payment_reconciliation' as const, version: 1 as const,
    evidenceRef: 'evidence:one', source: 'published-tool:tool:one',
    invocationRef: 'call:one', operationRef: 'tool:one', inputDigest: 'sha256:input',
    attemptRef: attempt.attemptRef, effectGeneration: 1, providerRef: 'provider:one',
    paymentIdentifier: attempt.paymentIdentifier, challengeDigest: attempt.challengeDigest,
    reservationRef: attempt.reservationRef, amount: { units: '1000', currency: 'USDC', exponent: 6 },
    transactionHash: `0x${'a'.repeat(64)}`, paymentResponseDigest: attempt.paymentResponseDigest,
    requestDigest: attempt.transportRequestDigest, transportObservationDigest: attempt.transportObservationDigest,
    paymentObservationDigest: attempt.paymentObservationDigest,
    observedAt: new Date(now - 1_000).toISOString(), settlementStatus: 'not_settled' as const,
  }
  const runMutation = vi.fn(async (_ref: unknown, _args?: unknown) => ({ kind: 'settled' }))
  const runAction = vi.fn(async (_ref: unknown, _args?: unknown) => ({ kind: 'accepted', state: 'released', replayed: false }))
  return { work, material, runMutation, runAction,
    ctx: { runMutation, runAction } as unknown as Parameters<typeof prepareX402RecoveryEvidence>[0] }
}

describe('x402 recovery with proven-unused authorization', () => {
  it('releases once and completes without marking the outcome unknown', async () => {
    readReceipt.mockResolvedValue({
      status: 'reverted', authorizationState: false, confirmations: 12n, observedBlockTimestamp: 2n,
    })
    const { work, material, ctx, runMutation, runAction } = fixture()
    const result = await prepareX402RecoveryEvidence(ctx, work, {
      ...material, digest: canonicalDigest(material as StableHashValue),
    })
    expect(runMutation.mock.calls[0]?.[1]).toMatchObject({ paymentUnusedProof: 'expired_unused' })
    expect(runAction.mock.calls.map(([ref]) => getFunctionName(ref as never)))
      .toEqual(['moneyManagedCallLifecycle:releaseUnusedAuthorization'])
    expect(runMutation.mock.calls.map(([ref]) => getFunctionName(ref as never)))
      .not.toContain('moneyManagedCallLifecycle:markOutcomeUnknown')
    expect(result).toMatchObject({ kind: 'prepared' })
  })
})
