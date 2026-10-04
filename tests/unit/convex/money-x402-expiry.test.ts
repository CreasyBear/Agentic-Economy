/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { getFunctionName } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import schema from '../../../convex/schema'
import { internal } from '../../../convex/_generated/api'
import type { ActionCtx } from '../../../convex/_generated/server'
import { buildDevelopmentPublishedToolEvidence } from '../capability-supply/fixtures/development-published-tool-evidence'

const rpc = vi.hoisted(() => ({ read: vi.fn(), targets: vi.fn() }))
vi.mock('@/modules/capability-supply/internal/x402-evm-receipt-reader', () => ({ readGuardedX402UnusedAuthorization: rpc.read }))
vi.mock('@/modules/capability-execution/call-worker/x402Settlement', () => ({ configuredX402RpcUrls: rpc.targets }))
import { recover } from '../../../convex/moneyX402ExpiryActions'

const modules = Object.fromEntries(Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
  .map(([path, load]) => [path.replace('../../../convex/', './'), load]))
const now = 1_790_067_600_000
const callRef = 'call:expired-unused'
const toolRef = `operation:v1:${'d'.repeat(64)}`
const attemptRef = 'attempt:expired-unused'
const nonce = `0x${'a'.repeat(64)}`
const identity = `sha256:${'b'.repeat(64)}`
const evidenceDigest = `sha256:${'c'.repeat(64)}`
const amount = { currency: 'AUD', units: '1408', exponent: 6 }
const usdc = { currency: 'USDC', units: '1000', exponent: 6 }
const payment = {
  dispatchRef: callRef, attemptRef, effectGeneration: 1, toolRef, inputDigest: 'sha256:input',
  paymentIdentifier: 'payment:expiry', operationKeyDigest: 'sha256:key', challengeDigest: 'sha256:challenge',
  challengeJson: '{}', selectedRequirementJson: '{}', providerEndpoint: 'https://example.com/weather',
  credentialRef: 'credential:expiry', scheme: 'exact', network: 'eip155:84532' as const,
  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const, payTo: '0x2222222222222222222222222222222222222222',
  amountUnits: '1000', currency: 'USDC', exponent: 6, custodyRef: 'custody:expiry',
  authorizationDigest: 'sha256:authorization', state: 'reconciliation_required' as const, preparedAt: now - 360_000,
  submissionStartedAt: now - 350_000, reservationRef: 'reserve:usdc',
  paymentPayer: '0x1111111111111111111111111111111111111111',
  paymentNonce: nonce, paymentIdentityDigest: identity, paymentAuthorizationExpiresAt: now - 60_000,
  evidenceRefs: [], settlementStatus: 'unknown' as const,
  spendReservationRef: 'spend:expiry', paymentUnsignedMaterialDigest: identity,
  paymentSigningIdempotencyKey: '11111111-1111-4111-8111-111111111111',
}
const call = {
  callRef, toolRef, ownerId: 'account:expiry', principalId: 'principal:expiry', credentialId: 'credential:expiry',
  applicationRef: 'app:expiry', idempotencyKey: 'idempotency:expiry', environment: 'sandbox' as const,
  grantRef: 'grant:expiry', grantGeneration: 1, policyDigest: 'sha256:policy', grantExpiresAt: now + 60_000,
  toolJson: JSON.stringify(buildDevelopmentPublishedToolEvidence().tool), inputJson: '{}',
  inputDigest: payment.inputDigest, requestDigest: 'sha256:request',
  state: 'reconciliation_required' as const, dispatchState: 'reconciliation_required' as const,
  formanceFinancialState: 'outcome_unknown' as const, formanceReservationRefs: ['reserve:aud', 'reserve:usdc'],
  createdAt: now - 360_000, updatedAt: now - 350_000,
  result: { kind: 'reconciliation_required' as const, callRef, toolRef,
    evidence: { attemptRef, effectGeneration: 1, evidenceSource: 'provider:expiry',
      requiredAt: new Date(now - 350_000).toISOString(), retry: 'reconcile_before_retry' as const },
    receipt: { commercialModel: 'account_aud' as const, receiptRef: 'receipt:expiry', state: 'reconciliation_required' as const,
      buyerCharge: amount, serviceFee: { ...amount, units: '0' }, totalBuyerCharge: amount,
      providerObligation: { amount: usdc, settlementMethod: 'managed_x402' as const, payoutEligible: false as const },
      providerSettlement: { amount: usdc, network: payment.network, asset: payment.asset },
      priceDigest: identity, evidenceHash: evidenceDigest, issuedAt: new Date(now - 350_000).toISOString(),
      refundState: 'unknown' as const, lossState: 'unknown' as const },
  },
}
const proof = { callRef, attemptRef, effectGeneration: 1, paymentIdentityDigest: identity,
  paymentNonce: nonce, evidenceDigest, evidenceRef: 'chain:safe:block' }

async function fixture(settlementStatus: 'unknown' | 'not_settled' = 'unknown') {
  const backend = convexTest(schema, modules)
  await backend.run(async ctx => {
    await ctx.db.insert('capabilityCalls', call)
    await ctx.db.insert('moneyX402PaymentAttempts', { ...payment, settlementStatus })
    await ctx.db.insert('moneyX402SpendReservations', {
      reservationRef: payment.spendReservationRef, platformBudgetRef: 'platform:sandbox',
      custodyBudgetRef: 'wallet:sandbox', custodyRef: payment.custodyRef, custodyGeneration: 1,
      environment: 'sandbox', network: payment.network, asset: payment.asset.toLowerCase(), currency: 'USDC', exponent: 6,
      dispatchRef: callRef, attemptRef, effectGeneration: 1, authorizationDigest: payment.authorizationDigest,
      paymentIdentityDigest: identity, paymentUnsignedMaterialDigest: payment.paymentUnsignedMaterialDigest,
      paymentSigningIdempotencyKey: payment.paymentSigningIdempotencyKey, typedDataDigest: identity,
      normalizedPayTo: payment.payTo, amountUnits: payment.amountUnits, reservedAt: payment.preparedAt,
      policyRevision: 'policy:expiry', initialScreeningCheckRef: 'check:expiry', state: 'liability',
    })
    await ctx.db.insert('moneyProviderObligations', {
      obligationRef: 'obligation:expiry', callRef, toolRef, providerRef: 'provider:expiry', buyerAccountRef: call.ownerId,
      buyerAsset: 'AUD', buyerExponent: 6, buyerAmountUnits: '1408', providerAsset: 'USDC', providerExponent: 6,
      providerAmountUnits: '1000', settlementMethod: 'managed_x402', state: 'held',
      payoutEligibility: 'ineligible_x402', evidenceRefs: [], createdAt: now - 360_000, updatedAt: now - 350_000,
    })
  })
  return backend
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now)
  rpc.read.mockReset().mockResolvedValue({ blockHash: `0x${'d'.repeat(64)}`, blockNumber: 120n,
    blockTimestamp: BigInt(now / 1000), authorizationState: false })
  rpc.targets.mockReset().mockReturnValue([new URL('https://rpc.one.example'), new URL('https://rpc.two.example')])
})
afterEach(() => { vi.restoreAllMocks() })

describe('expired unused authorization claims', () => {
  it.each(['unknown', 'not_settled'] as const)('pins one financial evidence identity across concurrent %s recovery and blocks settlement while claimed', async settlementStatus => {
    const backend = await fixture(settlementStatus)
    const claims = await Promise.all([
      backend.mutation(internal.moneyX402Expiry.claim, proof),
      backend.mutation(internal.moneyX402Expiry.claim, { ...proof, evidenceDigest: `sha256:${'e'.repeat(64)}` }),
    ])
    expect(claims[0]).not.toBeNull()
    expect(claims[1]).toEqual(claims[0])
    const claimedCall = await backend.run(async ctx => await ctx.db.query('capabilityCalls').first())
    expect(claimedCall?.reconciliation?.nextAttemptAt).toBe(Number.MAX_SAFE_INTEGER)
    expect(await backend.mutation(internal.moneyManagedCallLifecycle.finalizeSettlement, {
      callRef, transactionRefs: ['settle:buyer', 'settle:provider'], now,
    })).toEqual({ kind: 'refused', code: 'managed_call_remedy_in_progress' })
    const row = await backend.run(async ctx => await ctx.db.query('moneyX402PaymentAttempts').first())
    expect(row?.reconciliationEvidenceDigest).toBe(claims[0]?.evidenceDigest)
  })

  it.each(['settled', 'response recorded', 'unexpired', 'other identity', 'other reservation'])(
    'does not claim %s payment', async reason => {
      const backend = await fixture()
      await backend.run(async ctx => {
        const row = await ctx.db.query('moneyX402PaymentAttempts').first()
        if (!row) throw new Error('fixture_missing')
        await ctx.db.patch(row._id, reason === 'settled' ? { settlementStatus: 'settled' }
          : reason === 'response recorded' ? { paymentResponseDigest: identity }
            : reason === 'unexpired' ? { paymentAuthorizationExpiresAt: now + 1 }
              : reason === 'other identity' ? { paymentIdentityDigest: `sha256:${'f'.repeat(64)}` }
                : { reservationRef: 'reserve:other' })
      })
      expect(await backend.mutation(internal.moneyX402Expiry.claim, proof)).toBeNull()
    },
  )

  it('does not take a live competing remedy lease', async () => {
    const backend = await fixture()
    await backend.run(async ctx => {
      const row = await ctx.db.query('capabilityCalls').first()
      if (!row) throw new Error('fixture_missing')
      await ctx.db.patch(row._id, { reconciliation: { disposition: 'automatic', reason: 'refund_pending',
        attemptCount: 0, nextAttemptAt: now, leaseOwner: 'paid-result-loss:transaction', leaseExpiresAt: now + 60_000 } })
    })
    expect(await backend.mutation(internal.moneyX402Expiry.claim, proof)).toBeNull()
  })

  it('records exhausted recovery for operator attention even before the first financial claim', async () => {
    const backend = await fixture()
    expect(await backend.mutation(internal.moneyX402Expiry.schedule, {
      callRef, runAt: now + 60_000, attempt: 5,
    })).toBe(false)
    const row = await backend.run(async ctx => await ctx.db.query('capabilityCalls').first())
    expect(row?.reconciliation).toMatchObject({ disposition: 'manual_review', reason: 'recovery_failed' })
    expect(row?.formanceFinancialState).toBe('outcome_unknown')
  })

  it.each(['unknown', 'not_settled'] as const)('finishes and replays one refunded Activity row for %s payment, with no delivery or Provider obligation', async settlementStatus => {
    const backend = await fixture(settlementStatus)
    await backend.mutation(internal.moneyX402Expiry.claim, proof)
    const finish = { callRef, evidenceDigest, transactionRefs: ['release:aud', 'release:usdc'] }
    expect(await backend.mutation(internal.moneyX402Expiry.finish, { ...finish, evidenceDigest: identity })).toEqual({ kind: 'refused' })
    expect(await backend.mutation(internal.moneyX402Expiry.finish, { ...finish, transactionRefs: ['release:aud'] })).toEqual({ kind: 'refused' })
    expect(await backend.mutation(internal.moneyX402Expiry.finish, finish)).toEqual({ kind: 'completed' })
    expect(await backend.mutation(internal.moneyX402Expiry.finish, finish)).toEqual({ kind: 'completed' })
    expect(await backend.mutation(internal.moneyX402Expiry.finish, { ...finish, transactionRefs: ['other:aud', 'other:usdc'] })).toEqual({ kind: 'refused' })
    const rows = await backend.run(async ctx => ({ call: await ctx.db.query('capabilityCalls').first(),
      attempt: await ctx.db.query('moneyX402PaymentAttempts').first(),
      obligation: await ctx.db.query('moneyProviderObligations').first(),
      activity: await ctx.db.query('capabilityCallProjections').collect() }))
    expect(rows.call).toMatchObject({ state: 'refused', formanceFinancialState: 'released',
      result: { retryable: false, receipt: { state: 'refunded', refundState: 'released', accountingTransactionRefs: finish.transactionRefs } } })
    expect(rows.call?.reconciliation).toBeUndefined()
    expect(rows.attempt).toMatchObject({ settlementStatus: 'not_settled' })
    expect(rows.obligation).toMatchObject({ state: 'reversed' })
    expect(rows.activity).toMatchObject([{ state: 'refused', paymentState: 'released', deliveryState: 'not_delivered' }])
    expect(await backend.run(async ctx => await ctx.db.query('moneyX402SpendReservations').first()))
      .toMatchObject({ state: 'unused', unusedProof: 'expired_unused', resolvedAt: now, resolutionEvidenceDigest: evidenceDigest })
  })
})

const handler = (recover as unknown as { _handler: (ctx: ActionCtx, args: { callRef: string; attempt?: number }) => Promise<unknown> })._handler
function actionContext() {
  const runQuery = vi.fn(async (ref: unknown): Promise<unknown> => {
    switch (getFunctionName(ref as never)) {
      case 'capabilityCalls:readOwnerRecovery': return call
      case 'moneyX402PaymentAttempts:readX402PaymentAttempt': return payment
      case 'moneyManagedCall:readBooking': return { kind: 'available', expectedEnvironment: 'sandbox', booking: { providerAmountUnits: '1000', buyerAmountUnits: '1408' } }
      default: throw new Error(getFunctionName(ref as never))
    }
  })
  const runMutation = vi.fn(async (ref: unknown, _args: Record<string, unknown>): Promise<unknown> => {
    switch (getFunctionName(ref as never)) {
      case 'moneyX402Expiry:claim': return { evidenceDigest }
      case 'moneyX402Expiry:finish': return { kind: 'completed' }
      case 'moneyX402Expiry:schedule': return true
      default: throw new Error(getFunctionName(ref as never))
    }
  })
  const runAction = vi.fn(async (_ref: unknown, _args: unknown) => ({ kind: 'completed', transactionRefs: ['release:aud', 'release:usdc'] }))
  return { runQuery, runMutation, runAction }
}

describe('expired unused authorization recovery action', () => {
  it('checks both RPCs and uses the pinned proof to release without a new payment', async () => {
    const ctx = actionContext()
    expect(await handler(ctx as unknown as ActionCtx, { callRef })).toEqual({ kind: 'completed' })
    expect(rpc.read).toHaveBeenCalledTimes(2)
    expect(rpc.read.mock.calls[0]?.[0]).toMatchObject({ payer: payment.paymentPayer, nonce, expiresAt: payment.paymentAuthorizationExpiresAt })
    expect(ctx.runAction).toHaveBeenCalledTimes(1)
    expect(getFunctionName(ctx.runAction.mock.calls[0]![0] as never)).toBe('moneyFormance:releaseExpiredUnusedCall')
    expect(ctx.runAction.mock.calls[0]?.[1]).toMatchObject({ externalEvidenceDigest: evidenceDigest })
    expect(getFunctionName(ctx.runMutation.mock.calls[0]![0] as never)).toBe('moneyX402Expiry:schedule')
    expect(ctx.runQuery.mock.invocationCallOrder[0]).toBeLessThan(ctx.runMutation.mock.invocationCallOrder[0]!)
    expect(ctx.runMutation.mock.invocationCallOrder[0]).toBeLessThan(rpc.read.mock.invocationCallOrder[0]!)
    expect(ctx.runMutation.mock.invocationCallOrder[0]).toBeLessThan(ctx.runAction.mock.invocationCallOrder[0]!)
  })

  it('keeps the reservation and schedules another proof check when either RPC cannot prove unused expiry', async () => {
    rpc.read.mockResolvedValueOnce(undefined)
    const ctx = actionContext()
    expect(await handler(ctx as unknown as ActionCtx, { callRef })).toEqual({ kind: 'pending' })
    expect(ctx.runAction).not.toHaveBeenCalled()
    expect(ctx.runMutation.mock.calls.map(([ref]) => getFunctionName(ref as never))).toEqual(['moneyX402Expiry:schedule'])
  })

  it('does not pin a permanent claim when the immutable booking disagrees with the Call amount', async () => {
    const ctx = actionContext()
    const normal = ctx.runQuery.getMockImplementation()!
    ctx.runQuery.mockImplementation(async ref => getFunctionName(ref as never) === 'moneyManagedCall:readBooking'
      ? { kind: 'available', booking: { providerAmountUnits: '1000', buyerAmountUnits: '9999' } }
      : normal(ref))
    expect(await handler(ctx as unknown as ActionCtx, { callRef })).toEqual({ kind: 'pending' })
    expect(ctx.runAction).not.toHaveBeenCalled()
    expect(ctx.runMutation.mock.calls.map(([ref]) => getFunctionName(ref as never))).toEqual(['moneyX402Expiry:schedule'])
  })

  it('refuses conflicting safe block identities at the same height', async () => {
    rpc.read.mockResolvedValueOnce({ blockHash: `0x${'e'.repeat(64)}`, blockNumber: 120n,
      blockTimestamp: BigInt(now / 1000), authorizationState: false })
    const ctx = actionContext()
    expect(await handler(ctx as unknown as ActionCtx, { callRef })).toEqual({ kind: 'pending' })
    expect(ctx.runAction).not.toHaveBeenCalled()
    expect(ctx.runMutation.mock.calls.map(([ref]) => getFunctionName(ref as never))).toEqual(['moneyX402Expiry:schedule'])
  })

  it('replays the same ledger command after a receipt-write interruption and schedules recovery', async () => {
    const ctx = actionContext()
    const normal = ctx.runMutation.getMockImplementation()!
    let interrupted = true
    ctx.runMutation.mockImplementation(async (ref, args) => {
      if (getFunctionName(ref as never) === 'moneyX402Expiry:finish' && interrupted) {
        interrupted = false
        throw new Error('transient database failure')
      }
      return normal(ref, args)
    })
    expect(await handler(ctx as unknown as ActionCtx, { callRef })).toEqual({ kind: 'pending' })
    expect(ctx.runMutation.mock.calls.some(([ref]) => getFunctionName(ref as never) === 'moneyX402Expiry:schedule')).toBe(true)
    expect(await handler(ctx as unknown as ActionCtx, { callRef, attempt: 1 })).toEqual({ kind: 'completed' })
    expect(ctx.runAction.mock.calls[1]).toEqual(ctx.runAction.mock.calls[0])
  })

  it('performs no RPC or financial work if the durable successor cannot be armed', async () => {
    const ctx = actionContext()
    ctx.runMutation.mockRejectedValueOnce(new Error('scheduler unavailable'))
    await expect(handler(ctx as unknown as ActionCtx, { callRef })).rejects.toThrow('scheduler unavailable')
    expect(rpc.read).not.toHaveBeenCalled()
    expect(ctx.runAction).not.toHaveBeenCalled()
  })

  it('stops before a new claim or ledger effect when retry exhaustion cannot arm a successor', async () => {
    const ctx = actionContext()
    ctx.runMutation.mockResolvedValueOnce(false)
    expect(await handler(ctx as unknown as ActionCtx, { callRef, attempt: 4 })).toEqual({ kind: 'pending' })
    expect(rpc.read).not.toHaveBeenCalled()
    expect(ctx.runAction).not.toHaveBeenCalled()
    expect(ctx.runMutation.mock.calls.map(([ref]) => getFunctionName(ref as never))).toEqual(['moneyX402Expiry:schedule'])
  })

  it('returns the completed recovery on terminal replay without arming another payment check', async () => {
    const ctx = actionContext()
    ctx.runMutation.mockResolvedValueOnce(false)
    ctx.runQuery.mockResolvedValue({ ...call, state: 'refused',
      result: { kind: 'refused', receipt: { refundState: 'released' } } })
    expect(await handler(ctx as unknown as ActionCtx, { callRef })).toEqual({ kind: 'completed' })
    expect(rpc.read).not.toHaveBeenCalled()
    expect(ctx.runAction).not.toHaveBeenCalled()
  })
})
