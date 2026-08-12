import { describe, expect, it } from 'vitest'

import { payoutReviewWindow, transitionPayout, transitionPayoutAccount, type PayoutTransitionInput } from '../../../src/modules/money/public'
import type { ExactAmount, MoneyPayout } from '../../../src/modules/money/public'

const payout: MoneyPayout = {
  payoutRef: 'payout-1',
  businessId: 'business-1',
  grossAccrual: amount('USD', '2000', 2),
  rake: amount('USD', '200', 2),
  providerNet: amount('USD', '1800', 2),
  minimumPayout: amount('USD', '2000', 2),
  state: 'review',
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  idempotencyKey: 'payout-key',
  createdAt: 1,
  updatedAt: 1,
}
const aboveThresholdPayout = {
  ...payout,
  grossAccrual: amount('USD', '3200', 2),
  providerNet: amount('USD', '3000', 2),
}

describe('money payout policy', () => {
  it('refuses non-conserving accrual before payout transition', () => {
    const result = transitionPayout({
      current: { ...payout, rake: amount('USD', '201', 2) },
      now: 10,
      action: { kind: 'review', autoApprove: true },
      account: { state: 'ready', detailsSubmitted: true, recipientCapabilityActive: true },
    })

    expect(result).toEqual({ kind: 'refused', code: 'payout_not_ready', retryable: false })
  })

  it('requires status readback and does not infer KYC from redirect', () => {
    const started = transitionPayoutAccount({ businessId: 'business-1', currency: 'USD', exponent: 2, stripeAccountId: 'acct_1', event: { kind: 'onboarding_started', observedAt: 1 } })
    expect(started).toMatchObject({ kind: 'accepted', value: { state: 'onboarding_started' } })
    if (started.kind !== 'accepted') throw new Error('expected started account')
    const returned = transitionPayoutAccount({ businessId: 'business-1', currency: 'USD', exponent: 2, stripeAccountId: 'acct_1', current: started.value, event: { kind: 'onboarding_returned', observedAt: 2 } })
    expect(returned).toMatchObject({ kind: 'accepted', value: { state: 'submitted', detailsSubmitted: false } })
    const statusInput = { businessId: 'business-1', currency: 'USD', exponent: 2, stripeAccountId: 'acct_1', event: { kind: 'status' as const, detailsSubmitted: true, recipientCapabilityActive: true, restricted: false, requirementsDigest: 'sha256:requirements', stripeEventId: 'evt_1', payloadDigest: 'sha256:event', providerObjectDigest: 'sha256:account', observedAt: 3 }, ...(returned.kind === 'accepted' ? { current: returned.value } : {}) }
    const status = transitionPayoutAccount(statusInput)
    expect(status).toMatchObject({ kind: 'accepted', value: { state: 'ready', detailsSubmitted: true, recipientCapabilityActive: true, providerObjectDigest: 'sha256:account' } })
  })

  it('replays exact Connect events, conflicts digest drift, and ignores stale observations', () => {
    const current = {
      businessId: 'business-1',
      currency: 'USD',
      exponent: 2,
      stripeAccountId: 'acct_1',
      state: 'ready' as const,
      detailsSubmitted: true,
      recipientCapabilityActive: true,
      requirementsDigest: 'sha256:new',
      providerObjectDigest: 'sha256:account-new',
      lastStripePayloadDigest: 'sha256:event-new',
      lastStripeObservedAt: 20,
      lastStripeEventId: 'evt-new',
      createdAt: 1,
      updatedAt: 20,
      version: 2,
    }
    const base = { businessId: 'business-1', currency: 'USD', exponent: 2, stripeAccountId: 'acct_1', current }
    const event = { kind: 'status' as const, detailsSubmitted: true, recipientCapabilityActive: true, restricted: false, requirementsDigest: 'sha256:new', stripeEventId: 'evt-new', payloadDigest: 'sha256:event-new', providerObjectDigest: 'sha256:account-new', observedAt: 20 }
    expect(transitionPayoutAccount({ ...base, event })).toMatchObject({ kind: 'accepted', value: current })
    expect(transitionPayoutAccount({ ...base, event: { ...event, payloadDigest: 'sha256:drift' } })).toMatchObject({ kind: 'refused', code: 'ledger_idempotency_conflict' })
    expect(transitionPayoutAccount({ ...base, event: { ...event, stripeEventId: 'evt-old', payloadDigest: 'sha256:event-old', providerObjectDigest: 'sha256:account-old', observedAt: 19 } })).toMatchObject({ kind: 'accepted', value: current })
  })

  it('holds below fixture threshold and gates transfers by KYC', () => {
    const held = transitionPayout({ current: payout, now: 10, action: { kind: 'review', autoApprove: true }, account: { state: 'ready', detailsSubmitted: true, recipientCapabilityActive: true } })
    expect(held).toMatchObject({ kind: 'accepted', value: { state: 'held_threshold' } })
    const kyc = transitionPayout({ current: { ...aboveThresholdPayout, state: 'review' }, now: 10, action: { kind: 'review', autoApprove: true }, account: { state: 'submitted', detailsSubmitted: false, recipientCapabilityActive: false } })
    expect(kyc).toMatchObject({ kind: 'accepted', value: { state: 'held_kyc' } })
    const ready: PayoutTransitionInput = { current: { ...aboveThresholdPayout, state: 'held_threshold' }, now: 11, action: { kind: 'begin_transfer', payoutCommandId: 'command-1', requestDigest: 'sha256:request', idempotencyKey: 'idempotency-1' }, account: { state: 'ready', detailsSubmitted: true, recipientCapabilityActive: true } }
    expect(transitionPayout(ready)).toMatchObject({ kind: 'accepted', value: { state: 'transfer_pending', payoutCommandId: 'command-1', transferRequestDigest: 'sha256:request', transferStatus: 'pending' } })
  })

  it('retains restricted onboarding state and refuses release despite stale success flags', () => {
    const restricted = transitionPayoutAccount({
      businessId: 'business-1', currency: 'USD', stripeAccountId: 'acct_1',
      exponent: 2,
      current: {
        businessId: 'business-1', currency: 'USD', stripeAccountId: 'acct_1', state: 'restricted',
        exponent: 2,
        detailsSubmitted: true, recipientCapabilityActive: true, requirementsDigest: 'requirements',
        createdAt: 1, updatedAt: 1,
      },
      event: { kind: 'onboarding_returned', observedAt: 2 },
    })
    expect(restricted).toMatchObject({ kind: 'accepted', value: { state: 'restricted' } })
    expect(transitionPayout({
      current: { ...aboveThresholdPayout, state: 'held_threshold' },
      now: 3,
      action: { kind: 'begin_transfer', payoutCommandId: 'command-2', requestDigest: 'sha256:request-2', idempotencyKey: 'idempotency-2' },
      account: { state: 'restricted', detailsSubmitted: true, recipientCapabilityActive: true },
    })).toMatchObject({ kind: 'refused', code: 'payout_not_ready' })
  })

  it('moves pending to paid only with exact transfer evidence and replays without a second debit', () => {
    const pending = transitionPayout({
      current: { ...aboveThresholdPayout, state: 'held_threshold' },
      now: 4,
      action: { kind: 'begin_transfer', payoutCommandId: 'command-3', requestDigest: 'sha256:request-3', idempotencyKey: 'idempotency-3' },
      account: { state: 'ready', detailsSubmitted: true, recipientCapabilityActive: true },
    })
    const success = { kind: 'transfer_succeeded' as const, payoutCommandId: 'command-3', idempotencyKey: 'idempotency-3', stripeTransferId: 'tr_3', requestDigest: 'sha256:request-3', evidenceDigest: 'sha256:evidence-3', observedAt: 5 }
    if (pending.kind !== 'accepted') throw new Error('expected pending payout')
    const paid = transitionPayout({ current: pending.value, now: 5, action: success, account: { state: 'ready', detailsSubmitted: true, recipientCapabilityActive: true } })
    expect(paid).toMatchObject({ kind: 'accepted', value: { state: 'paid', stripeTransferId: 'tr_3', transferEvidenceDigest: 'sha256:evidence-3' } })
    if (paid.kind !== 'accepted') throw new Error('expected paid payout')
    expect(transitionPayout({ current: paid.value, now: 6, action: success, account: { state: 'ready', detailsSubmitted: true, recipientCapabilityActive: true } })).toMatchObject({ kind: 'accepted', value: paid.value })
    expect(transitionPayout({ current: paid.value, now: 6, action: { ...success, evidenceDigest: 'sha256:other' }, account: { state: 'ready', detailsSubmitted: true, recipientCapabilityActive: true } })).toMatchObject({ kind: 'refused', code: 'payout_reconciliation_required' })
  })
  it('moves paid to reversed only with the original transfer identity and replays reversal evidence', () => {
    const pending = transitionPayout({
      current: { ...aboveThresholdPayout, state: 'held_threshold' },
      now: 4,
      action: { kind: 'begin_transfer', payoutCommandId: 'command-reversal', requestDigest: 'sha256:request-reversal', idempotencyKey: 'idempotency-reversal' },
      account: { state: 'ready', detailsSubmitted: true, recipientCapabilityActive: true },
    })
    if (pending.kind !== 'accepted') throw new Error('expected pending payout')
    const paid = transitionPayout({
      current: pending.value,
      now: 5,
      action: { kind: 'transfer_succeeded', payoutCommandId: 'command-reversal', idempotencyKey: 'idempotency-reversal', stripeTransferId: 'tr_reversal', requestDigest: 'sha256:request-reversal', evidenceDigest: 'sha256:evidence-paid', observedAt: 5 },
      account: { state: 'ready', detailsSubmitted: true, recipientCapabilityActive: true },
    })
    if (paid.kind !== 'accepted') throw new Error('expected paid payout')
    const reversed = { kind: 'transfer_reversed' as const, payoutCommandId: 'command-reversal', idempotencyKey: 'idempotency-reversal', stripeTransferId: 'tr_reversal', requestDigest: 'sha256:request-reversal', evidenceDigest: 'sha256:evidence-reversed', observedAt: 6 }
    expect(transitionPayout({ current: paid.value, now: 6, action: reversed, account: { state: 'ready', detailsSubmitted: true, recipientCapabilityActive: true } })).toMatchObject({
      kind: 'accepted',
      value: { state: 'reversed', transferStatus: 'reversed', transferReversalEvidenceDigest: 'sha256:evidence-reversed' },
    })
    const reversedValue = transitionPayout({ current: paid.value, now: 6, action: reversed, account: { state: 'ready', detailsSubmitted: true, recipientCapabilityActive: true } })
    if (reversedValue.kind !== 'accepted') throw new Error('expected reversed payout')
    expect(transitionPayout({ current: reversedValue.value, now: 7, action: reversed, account: { state: 'ready', detailsSubmitted: true, recipientCapabilityActive: true } })).toMatchObject({ kind: 'accepted', value: reversedValue.value })
    expect(transitionPayout({ current: reversedValue.value, now: 7, action: { ...reversed, evidenceDigest: 'sha256:evidence-conflict' }, account: { state: 'ready', detailsSubmitted: true, recipientCapabilityActive: true } })).toMatchObject({ kind: 'refused', code: 'payout_reconciliation_required' })
  })

  it('freezes an unknown transfer and only settles with reconciliation', () => {
    const unknown = transitionPayout({
      current: { ...payout, state: 'transfer_pending', payoutCommandId: 'command-u', idempotencyKey: 'idempotency-u' },
      now: 10,
      action: { kind: 'transfer_unknown', payoutCommandId: 'command-u', idempotencyKey: 'idempotency-u', stripeTransferId: 'tr_1' },
      account: { state: 'ready', detailsSubmitted: true, recipientCapabilityActive: true },
    })
    expect(unknown).toMatchObject({ kind: 'accepted', value: { state: 'outcome_unknown' } })
    if (unknown.kind !== 'accepted') throw new Error('expected unknown payout')
    expect(transitionPayout({
      current: unknown.value,
      now: 11,
      action: { kind: 'reconcile', payoutCommandId: 'command-u', idempotencyKey: 'idempotency-u', outcome: 'not_released', stripeTransferId: 'tr_1' },
      account: { state: 'ready', detailsSubmitted: true, recipientCapabilityActive: true },
    })).toMatchObject({ kind: 'accepted', value: { state: 'held_threshold' } })
    expect(transitionPayout({
      current: unknown.value,
      now: 11,
      action: { kind: 'transfer_succeeded', payoutCommandId: 'command-u', idempotencyKey: 'idempotency-u', stripeTransferId: 'tr_1', requestDigest: 'sha256:request-u', evidenceDigest: 'sha256:evidence-u', observedAt: 11 },
      account: { state: 'ready', detailsSubmitted: true, recipientCapabilityActive: true },
    })).toMatchObject({ kind: 'accepted', value: { state: 'paid' } })
  })

  it('uses the UTC 11th to 14th review window', () => {
    expect(payoutReviewWindow({ now: Date.UTC(2026, 6, 10, 23, 0) }).phase).toBe('before_review')
    expect(payoutReviewWindow({ now: Date.UTC(2026, 6, 12, 0, 0) }).phase).toBe('review')
    expect(payoutReviewWindow({ now: Date.UTC(2026, 6, 15, 0, 0) }).phase).toBe('auto_approval')
  })
})

function amount(currency: string, units: string, exponent: number): ExactAmount {
  return { currency, units, exponent }
}
