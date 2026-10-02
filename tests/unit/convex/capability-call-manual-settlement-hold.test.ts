import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { loadReadyRecoveryWork, readRecoveryStatus, recoverCapabilityCall } from '@/modules/capability-execution/call-runtime'
import { internal } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import type { ActionCtx } from '../../../convex/_generated/server'
import { convexTestWithWorkers, type ConvexFixtureBackend } from '../../helpers/convex-fixtures'
import { buildDevelopmentPublishedToolEvidence } from '../capability-supply/fixtures/development-published-tool-evidence'

const NOW = Date.UTC(2026, 9, 1, 12)
type Call = Omit<Doc<'capabilityCalls'>, '_id' | '_creationTime'>
const identity = { callRef: 'call:manual-settlement', principalId: 'principal:original', credentialId: 'credential:original' }
const attemptRef = 'attempt:original'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW) })
afterEach(() => { vi.useRealTimers() })

function heldCall(overrides: Partial<Call> = {}): Call {
  const toolRef = 'tool:original'
  const input = { request: 'preserve the original input' }
  return {
    ...identity, ownerId: 'account:original', applicationRef: 'application:original', environment: 'sandbox',
    toolRef, idempotencyKey: 'original-key', grantRef: 'grant:original', grantGeneration: 1,
    policyDigest: canonicalDigest('original-policy'), grantExpiresAt: NOW + 60_000,
    toolJson: '{}', inputJson: JSON.stringify(input), inputDigest: canonicalDigest(input),
    requestDigest: canonicalDigest({ toolRef, input }),
    state: 'reconciliation_required', dispatchState: 'reconciliation_required', workId: 'original-restored-work',
    attemptRef, formanceFinancialState: 'outcome_unknown', formanceReservationRefs: ['original-aud', 'original-usdc', 'original-obligation'],
    result: { kind: 'reconciliation_required', callRef: identity.callRef, toolRef, evidence: {
      attemptRef, effectGeneration: 7, requiredAt: new Date(NOW).toISOString(),
      retry: 'reconcile_before_retry', evidenceSource: 'restore:original',
    } },
    reconciliation: { disposition: 'manual_review', reason: 'unknown_settlement', attemptCount: 0, nextAttemptAt: NOW },
    createdAt: NOW - 60_000, updatedAt: NOW, ...overrides,
  }
}

async function fixture(overrides: Partial<Call> = {}, canonicalState: 'leased' | 'retryable' = 'leased') {
  const backend = convexTestWithWorkers()
  const row = heldCall(overrides)
  const time = new Date(NOW - 1_000).toISOString()
  const actor = { callerRef: row.credentialId, principalRef: row.principalId }
  await backend.run(async ctx => {
    await ctx.db.insert('capabilityCalls', row)
    await ctx.db.insert('actionExecutionControls', {
      executionRef: row.callRef, executionVersion: 1, sourceRef: `operation-invocation-source:${row.callRef}`,
      currentAttemptRef: attemptRef, currentEffectGeneration: 7, updatedAt: time,
      control: { executionRef: row.callRef, executionVersion: 1, origin: { kind: 'standalone', ...actor }, owner: actor,
        action: { id: row.toolRef, contractVersion: '1' }, desired: { state: 'invoke' }, freshness: { state: 'not_observed' },
        control: canonicalState === 'leased'
          ? { state: 'leased', attemptRef, effectGeneration: 7, leaseOwner: 'old-worker', leaseExpiresAt: time, release: 'not_released' }
          : { state: 'retryable', reason: 'pre_release_failure' },
      },
    })
    await ctx.db.insert('actionExecutionAttempts', {
      executionRef: row.callRef, attemptRef, attemptNumber: 1, effectGeneration: 7, actor,
      idempotency: { operationKey: row.idempotencyKey, materialInputDigest: row.inputDigest, effectIdentity: 'original-payment' },
      lease: { owner: 'old-worker', expiresAt: time }, release: { state: 'not_released' },
      outcome: { state: 'running' }, recordedAt: time,
    })
  })
  // Bridge the runtime to real registered Convex operations, without replacing
  // recovery, money or control decisions. Held loading stops before parsing the
  // Tool or requesting any external evidence.
  const ctx = { runQuery: backend.query, runMutation: backend.mutation, runAction: backend.action } as unknown as ActionCtx
  return { backend, row, ctx }
}

async function durableState(backend: ConvexFixtureBackend) {
  return await backend.run(async ctx => ({
    calls: await ctx.db.query('capabilityCalls').collect(),
    controls: await ctx.db.query('actionExecutionControls').collect(),
    attempts: await ctx.db.query('actionExecutionAttempts').collect(),
    payments: await ctx.db.query('moneyX402PaymentAttempts').collect(),
    history: await ctx.db.query('actionExecutionHistory').collect(),
    scheduled: await ctx.db.system.query('_scheduled_functions').collect(),
  }))
}

/**
 * Requires the durable manual unknown-settlement hold, not merely an old local
 * not-released control. Ensures status and generic recovery preserve the same
 * Call/attempt and watchdog retries cannot unfreeze it. Invariant: no retry,
 * refund, new attempt or scheduled automatic work is inferred from the restore.
 * On violation: return the persisted uncertainty without writes. Unused proof
 * for an old nonce cannot exclude later post-snapshot attempts; verified-paid
 * remedies retain their independent exact-payment admission boundary.
 */
describe('manual unknown-settlement recovery hold', () => {
  it.each(['leased', 'retryable'] as const)('keeps status and all local recovery persisted despite an older %s control', async canonicalState => {
    const { backend, row, ctx } = await fixture({}, canonicalState)
    const before = await durableState(backend)
    const read = await backend.query(internal.capabilityCalls.readRecovery, {
      callRef: row.callRef, principalId: row.principalId,
    })
    expect(read).toMatchObject({ requiresManualSettlementReview: true, result: row.result, attemptRef })
    expect(await backend.query(internal.capabilityCalls.readOwnerRecovery, { callRef: row.callRef }))
      .toMatchObject({ requiresManualSettlementReview: true })
    expect(await loadReadyRecoveryWork(ctx, identity)).toMatchObject({ kind: 'persisted', recovered: read })
    const persisted = { kind: 'found', state: 'reconciliation_required', callRef: row.callRef,
      attemptRef, effectGeneration: 7, result: row.result }
    expect(await readRecoveryStatus(ctx, identity)).toMatchObject(persisted)
    for (const mode of ['cancel', 'reconcile_pre_submission', 'reconcile_managed_signing'] as const) {
      expect(await recoverCapabilityCall(ctx, { ...identity, mode,
        ...(mode === 'cancel' ? { idempotencyKey: 'cancel-original' } : {}),
      })).toMatchObject(persisted)
    }
    expect(await durableState(backend)).toEqual(before)
  })

  it('refuses repeated and concurrent watchdog restarts without changing the held payment or scheduling work', async () => {
    const { backend, row } = await fixture({ reconciliation: {
      disposition: 'manual_review', reason: 'unknown_settlement', attemptCount: 1, nextAttemptAt: NOW - 1_000,
      leaseOwner: 'paid-response:0', leaseExpiresAt: NOW - 1,
    } })
    const before = await durableState(backend)
    const retry = () => backend.mutation(internal.moneyX402PaymentAttempts.beginResponseRecovery, { callRef: row.callRef, attempt: 1 })
    expect(await Promise.all([retry(), retry()])).toEqual([false, false])
    expect(await retry()).toBe(false)
    expect(await backend.query(internal.moneyX402PaymentAttempts.responseRecoveryIsCurrent, { callRef: row.callRef, attempt: 0 })).toBe(false)
    expect(await durableState(backend)).toEqual(before)
  })

  it('rejects a stale all-clear reset through the registered projection without losing original financial/effect identity', async () => {
    const { backend, row } = await fixture({ evidenceHash: canonicalDigest('original-evidence') })
    const before = await durableState(backend)
    await expect(backend.mutation(internal.capabilityCalls.projectRecovery, {
      callRef: row.callRef, principalId: row.principalId, state: 'pending',
      clearResult: true, clearWorkId: true, clearAttemptRef: true, clearEvidenceHash: true, clearDispatchState: true,
      now: NOW + 1,
    })).rejects.toThrow('call_manual_settlement_review_required')
    expect(await durableState(backend)).toEqual(before)
  })

  it('rejects stale same-state projection and record writes before they replace held evidence', async () => {
    const { backend, row } = await fixture({ evidenceHash: canonicalDigest('original-evidence') })
    if (row.result?.kind !== 'reconciliation_required') throw new Error('fixture_result_missing')
    const before = await durableState(backend)
    const stale = { callRef: row.callRef, principalId: row.principalId, state: 'reconciliation_required' as const,
      result: { ...row.result, evidence: { ...row.result.evidence, evidenceSource: 'stale-local-no-release' } },
      attemptRef: 'stale-attempt', dispatchState: 'running' as const, now: NOW + 1 }
    await expect(backend.mutation(internal.capabilityCalls.projectRecovery, {
      ...stale, clearResult: false, clearWorkId: true, clearAttemptRef: false, clearEvidenceHash: true, clearDispatchState: false,
    })).rejects.toThrow('call_manual_settlement_review_required')
    await expect(backend.mutation(internal.capabilityCalls.record, { ...stale, evidenceHash: canonicalDigest('stale-evidence') }))
      .rejects.toThrow('call_manual_settlement_review_required')
    // Even an otherwise ignored transition must not acknowledge a stale held write.
    await expect(backend.mutation(internal.capabilityCalls.record, {
      callRef: row.callRef, principalId: row.principalId, state: 'pending', now: NOW + 1,
    })).rejects.toThrow('call_manual_settlement_review_required')
    expect(await durableState(backend)).toEqual(before)
  })

  it('admits the verified original paid result from the exact manual unknown-settlement hold', async () => {
    const settlementRefs = ['original-settled-buyer', 'original-settled-provider']
    const output = { weather: 'rain' }
    const evidenceHash = canonicalDigest(output)
    const { backend, row } = await fixture({ formanceFinancialState: 'settled', formanceSettlementRefs: settlementRefs,
      toolJson: JSON.stringify(buildDevelopmentPublishedToolEvidence().tool) })
    const payment: Omit<Doc<'moneyX402PaymentAttempts'>, '_id' | '_creationTime'> = {
      dispatchRef: row.callRef, attemptRef, effectGeneration: 7, toolRef: row.toolRef, inputDigest: row.inputDigest,
      paymentIdentifier: 'payment:original', operationKeyDigest: canonicalDigest('original-key'),
      challengeDigest: canonicalDigest('original-challenge'), challengeJson: '{}', selectedRequirementJson: '{}',
      providerEndpoint: 'https://provider.example/tool', credentialRef: row.credentialId, scheme: 'exact',
      network: 'eip155:84532', asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', payTo: `0x${'2'.repeat(40)}`,
      amountUnits: '1000', currency: 'USDC', exponent: 6, custodyRef: 'custody:original',
      authorizationDigest: canonicalDigest('original-authorization'), state: 'observed', preparedAt: NOW - 60_000,
      evidenceRefs: ['chain:original-payment'], settlementStatus: 'settled', responseStatus: 200,
      reconciliationEvidenceDigest: canonicalDigest('verified-original-payment'),
      quarantinedOutputJson: JSON.stringify(output), quarantinedResponseDigest: evidenceHash,
    }
    await backend.run(ctx => ctx.db.insert('moneyX402PaymentAttempts', payment))
    const amount = { currency: 'AUD', units: '1408', exponent: 6 }
    const usdc = { currency: 'USDC', units: '1000', exponent: 6 }
    const result = { kind: 'completed' as const, callRef: row.callRef, toolRef: row.toolRef, output, evidenceHash,
      receipt: { commercialModel: 'account_aud' as const, receiptRef: 'receipt:original', state: 'settled' as const,
        buyerCharge: amount, serviceFee: { ...amount, units: '0' }, totalBuyerCharge: amount,
        providerObligation: { amount: usdc, settlementMethod: 'managed_x402' as const, payoutEligible: false as const },
        providerSettlement: { amount: usdc, network: 'eip155:84532' as const,
          asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const },
        priceDigest: canonicalDigest('original-price'), evidenceHash, issuedAt: new Date(NOW).toISOString(),
        refundState: 'not_applicable' as const, lossState: 'none' as const } }
    expect(await backend.query(internal.capabilityCalls.readRecovery, { callRef: row.callRef, principalId: row.principalId }))
      .toMatchObject({ requiresManualSettlementReview: true })
    expect(await backend.mutation(internal.capabilityCalls.projectRecovery, {
      callRef: row.callRef, principalId: row.principalId, state: 'completed', result, attemptRef,
      dispatchState: 'completed', clearResult: false, clearWorkId: false, clearAttemptRef: false,
      clearEvidenceHash: false, clearDispatchState: false, now: NOW,
    })).toEqual({ kind: 'recorded' })
    const stored = (await durableState(backend)).calls[0]
    expect(stored).toMatchObject({ state: 'completed', attemptRef, workId: row.workId,
      inputJson: row.inputJson, formanceReservationRefs: row.formanceReservationRefs,
      formanceSettlementRefs: settlementRefs, formanceFinancialState: 'settled',
      result: { kind: 'completed', output, receipt: { accountingTransactionRefs: settlementRefs } } })
    expect(stored).not.toHaveProperty('reconciliation')
  })

  it.each(['projectRecovery', 'record'] as const)('requires original principal identity before reporting the %s hold', async operation => {
    const { backend, row } = await fixture()
    const before = await durableState(backend)
    const args = { callRef: row.callRef, principalId: 'another-principal', state: 'pending' as const, now: NOW }
    const mutation = operation === 'record'
      ? backend.mutation(internal.capabilityCalls.record, args)
      : backend.mutation(internal.capabilityCalls.projectRecovery, { ...args,
        clearResult: true, clearWorkId: true, clearAttemptRef: true, clearEvidenceHash: true, clearDispatchState: true })
    await expect(mutation).rejects.toThrow('operation_invoke_identity_refused')
    expect(await durableState(backend)).toEqual(before)
  })

  it.each([
    { disposition: 'automatic' as const, reason: 'unknown_settlement' as const },
    { disposition: 'manual_review' as const, reason: 'recovery_failed' as const },
  ])('retains existing reset behavior for $disposition/$reason', async reconciliation => {
    const { backend, row } = await fixture({ reconciliation: { ...reconciliation, attemptCount: 0, nextAttemptAt: NOW } })
    expect(await backend.mutation(internal.capabilityCalls.projectRecovery, {
      callRef: row.callRef, principalId: row.principalId, state: 'pending',
      clearResult: true, clearWorkId: true, clearAttemptRef: true, clearEvidenceHash: true, clearDispatchState: true, now: NOW,
    })).toEqual({ kind: 'recorded' })
    const stored = (await durableState(backend)).calls[0]
    expect(stored).toMatchObject({ callRef: row.callRef, state: 'pending',
      formanceFinancialState: row.formanceFinancialState, formanceReservationRefs: row.formanceReservationRefs })
    expect(stored).not.toHaveProperty('reconciliation')
  })

  it.each([0, 5])('refuses repeated/concurrent unused-expiry scheduling at attempt %s without erasing the hold', async attempt => {
    const { backend, row } = await fixture()
    const before = await durableState(backend)
    const schedule = () => backend.mutation(internal.moneyX402Expiry.schedule, { callRef: row.callRef, runAt: NOW, attempt })
    expect(await Promise.all([schedule(), schedule()])).toEqual([false, false])
    expect(await schedule()).toBe(false)
    expect(await backend.query(internal.capabilityCalls.readRecovery, { callRef: row.callRef, principalId: row.principalId }))
      .toMatchObject({ requiresManualSettlementReview: true })
    expect(await durableState(backend)).toEqual(before)
  })

  it('rejects an otherwise eligible expired-nonce claim without recording proof or releasing quarantine', async () => {
    const amount = { currency: 'AUD', units: '1408', exponent: 6 }
    const usdc = { currency: 'USDC', units: '1000', exponent: 6 }
    const paymentIdentityDigest = canonicalDigest('restored-payment-identity')
    const evidenceDigest = canonicalDigest('old-nonce-unused-proof')
    const paymentNonce = `0x${'a'.repeat(64)}`
    const call = heldCall()
    if (call.result?.kind !== 'reconciliation_required') throw new Error('fixture_result_missing')
    const { backend, row } = await fixture({ result: { ...call.result, receipt: {
      commercialModel: 'account_aud', receiptRef: 'receipt:original', state: 'reconciliation_required',
      buyerCharge: amount, serviceFee: { ...amount, units: '0' }, totalBuyerCharge: amount,
      providerObligation: { amount: usdc, settlementMethod: 'managed_x402', payoutEligible: false },
      providerSettlement: { amount: usdc, network: 'eip155:84532', asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' },
      priceDigest: paymentIdentityDigest, evidenceHash: evidenceDigest, issuedAt: new Date(NOW - 60_000).toISOString(),
      refundState: 'unknown', lossState: 'unknown',
    } } })
    const payment: Omit<Doc<'moneyX402PaymentAttempts'>, '_id' | '_creationTime'> = {
      dispatchRef: row.callRef, attemptRef, effectGeneration: 7, toolRef: row.toolRef, inputDigest: row.inputDigest,
      paymentIdentifier: 'payment:original', operationKeyDigest: canonicalDigest('original-key'),
      challengeDigest: canonicalDigest('original-challenge'), challengeJson: '{}', selectedRequirementJson: '{}',
      providerEndpoint: 'https://provider.example/tool', credentialRef: row.credentialId, scheme: 'exact',
      network: 'eip155:84532', asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', payTo: `0x${'2'.repeat(40)}`,
      amountUnits: usdc.units, currency: usdc.currency, exponent: usdc.exponent,
      custodyRef: 'custody:original', authorizationDigest: canonicalDigest('original-authorization'),
      state: 'reconciliation_required', preparedAt: NOW - 360_000, submissionStartedAt: NOW - 350_000,
      reservationRef: 'original-usdc', paymentPayer: `0x${'1'.repeat(40)}`, paymentNonce,
      paymentIdentityDigest, paymentAuthorizationExpiresAt: NOW - 60_000, evidenceRefs: [], settlementStatus: 'unknown',
    }
    await backend.run(ctx => ctx.db.insert('moneyX402PaymentAttempts', payment))
    const proof = { callRef: row.callRef, attemptRef, effectGeneration: 7, paymentIdentityDigest,
      paymentNonce, evidenceDigest, evidenceRef: 'chain:safe:original-nonce' }
    const before = await durableState(backend)
    const claim = () => backend.mutation(internal.moneyX402Expiry.claim, proof)
    expect(await Promise.all([claim(), claim()])).toEqual([null, null])
    expect(await claim()).toBeNull()
    expect(await durableState(backend)).toEqual(before)
    // Change only the quarantine classification: the same original receipt,
    // expired nonce, reservation and proof must otherwise admit the claim.
    await backend.run(async ctx => {
      const stored = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', row.callRef)).unique()
      if (stored?.reconciliation === undefined) throw new Error('fixture_hold_missing')
      await ctx.db.patch(stored._id, { reconciliation: { ...stored.reconciliation, disposition: 'automatic' } })
    })
    expect(await claim()).toEqual({ evidenceDigest })
  })

  it.each([
    { disposition: 'automatic' as const, reason: 'unknown_settlement' as const },
    { disposition: 'manual_review' as const, reason: 'recovery_failed' as const },
  ])('preserves existing response-recovery admission for $disposition/$reason', async reconciliation => {
    const { backend, row } = await fixture({ reconciliation: { ...reconciliation, attemptCount: 0, nextAttemptAt: NOW } })
    expect(await backend.query(internal.capabilityCalls.readRecovery, { callRef: row.callRef, principalId: row.principalId }))
      .not.toHaveProperty('requiresManualSettlementReview')
    expect(await backend.mutation(internal.moneyX402PaymentAttempts.beginResponseRecovery, { callRef: row.callRef, attempt: 0 })).toBe(true)
    expect(await backend.query(internal.moneyX402PaymentAttempts.responseRecoveryIsCurrent, { callRef: row.callRef, attempt: 0 })).toBe(true)
    expect((await durableState(backend)).scheduled).toHaveLength(2)
  })
})
