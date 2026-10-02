import { describe, expect, it, vi } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { prepareX402RecoveryEvidence } from '@/modules/capability-execution/call-worker/recovery/x402'

const readReceipt = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('@/modules/capability-execution/call-worker/x402Route', () => ({ readX402EvmReceipt: readReceipt }))
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
    responseStatus: 200,
    quarantinedOutputJson: '{"result":"weather"}', quarantinedResponseDigest: canonicalDigest('response'),
    paymentPayer: '0xpayer', paymentNonce: '0xnonce', network: 'eip155:84532', asset: '0xasset',
  }
  const work = {
    recovered: { callRef: 'call:one', toolRef: 'tool:one', inputDigest: 'sha256:input',
      credentialId: 'credential:one', principalId: 'principal:one', environment: 'sandbox' },
    operation: { operationId: 'tool:one', identity: { adapterId: 'x402-fetch:v2' },
      binding: { authority: { kind: 'provider_connection', providerRef: 'provider:one' } } },
    managedReservation: { reservationRef: 'reservation:one' }, x402Attempt: attempt,
    descriptor: { validateOutput: (output: { result?: unknown }) => typeof output.result === 'string' },
    brokeredReceipt: () => undefined, port: {},
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
    observedAt: new Date(now - 1_000).toISOString(), settlementStatus: 'settled' as const,
  }
  const runMutation = vi.fn()
  const runAction = vi.fn()
  return { work, material, ctx: { runMutation, runAction } as unknown as Parameters<typeof prepareX402RecoveryEvidence>[0], runMutation, runAction }
}

describe('x402 recovery evidence before money', () => {
  it.each([
    ['wrong source', { source: 'operation:tool:one' }],
    ['future time', { observedAt: new Date(Date.now() + 60_000).toISOString() }],
    ['before reconciliation', { observedAt: '2000-01-01T00:00:00.000Z' }],
    ['wrong generation', { effectGeneration: 2 }],
    ['wrong request', { requestDigest: 'sha256:wrong' }],
    ['wrong transport observation', { transportObservationDigest: 'sha256:wrong' }],
  ])('rejects %s before chain lookup or financial mutations', async (_name, change) => {
    readReceipt.mockClear()
    const { work, material, ctx, runMutation, runAction } = fixture()
    const changed = { ...material, ...change }
    const evidence = { ...changed, digest: canonicalDigest(changed as StableHashValue) }
    expect(await prepareX402RecoveryEvidence(ctx, work, evidence)).toMatchObject({ kind: 'required' })
    expect(readReceipt).not.toHaveBeenCalled()
    expect(runMutation).not.toHaveBeenCalled()
    expect(runAction).not.toHaveBeenCalled()
  })

  it('verifies the chain for a paid 2xx even when the output fails its contract', async () => {
    readReceipt.mockClear()
    const { work, material, ctx, runMutation, runAction } = fixture()
    work.x402Attempt!.quarantinedOutputJson = '{"unexpected":true}'
    expect(await prepareX402RecoveryEvidence(ctx, work, {
      ...material, digest: canonicalDigest(material as StableHashValue),
    })).toMatchObject({ kind: 'required' })
    expect(readReceipt).toHaveBeenCalledOnce()
    expect(runMutation).not.toHaveBeenCalled()
    expect(runAction).not.toHaveBeenCalled()
  })

  it('checks chain evidence after valid attribution without moving money when no receipt exists', async () => {
    readReceipt.mockClear()
    const { work, material, ctx, runMutation, runAction } = fixture()
    expect(await prepareX402RecoveryEvidence(ctx, work, {
      ...material, digest: canonicalDigest(material as StableHashValue),
    })).toMatchObject({ kind: 'required' })
    expect(readReceipt).toHaveBeenCalledTimes(1)
    expect(runMutation).not.toHaveBeenCalled()
    expect(runAction).not.toHaveBeenCalled()
  })
})
