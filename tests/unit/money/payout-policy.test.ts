import { describe, expect, it } from 'vitest'

import { payoutReviewWindow, transitionPayout, transitionPayoutAccount, type PayoutTransitionInput } from '../../../src/modules/money/public'
import type { MoneyPayout } from '../../../src/modules/money/public'

const payout: MoneyPayout = {
  payoutRef: 'payout-1',
  businessId: 'business-1',
  currency: 'USD',
  grossAccrualMinor: 2_000,
  rakeMinor: 200,
  providerNetMinor: 1_800,
  minimumPayoutMinor: 2_000,
  state: 'review',
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  idempotencyKey: 'payout-key',
  createdAt: 1,
  updatedAt: 1,
}

describe('money payout policy', () => {
  it('requires status readback and does not infer KYC from redirect', () => {
    const started = transitionPayoutAccount({ businessId: 'business-1', currency: 'USD', stripeAccountId: 'acct_1', event: { kind: 'onboarding_started', observedAt: 1 } })
    expect(started).toMatchObject({ kind: 'accepted', value: { state: 'onboarding_started' } })
    if (started.kind !== 'accepted') throw new Error('expected started account')
    const returned = transitionPayoutAccount({ businessId: 'business-1', currency: 'USD', stripeAccountId: 'acct_1', current: started.value, event: { kind: 'onboarding_returned', observedAt: 2 } })
    expect(returned).toMatchObject({ kind: 'accepted', value: { state: 'submitted', detailsSubmitted: false } })
    const statusInput = { businessId: 'business-1', currency: 'USD', stripeAccountId: 'acct_1', event: { kind: 'status' as const, detailsSubmitted: true, recipientCapabilityActive: true, restricted: false, requirementsDigest: 'sha256:requirements', stripeEventId: 'evt_1', observedAt: 3 }, ...(returned.kind === 'accepted' ? { current: returned.value } : {}) }
    const status = transitionPayoutAccount(statusInput)
    expect(status).toMatchObject({ kind: 'accepted', value: { state: 'ready', detailsSubmitted: true, recipientCapabilityActive: true } })
  })

  it('holds below fixture threshold and gates transfers by KYC', () => {
    const held = transitionPayout({ current: payout, now: 10, action: { kind: 'review', autoApprove: true }, account: { state: 'ready', detailsSubmitted: true, recipientCapabilityActive: true } })
    expect(held).toMatchObject({ kind: 'accepted', value: { state: 'held_threshold' } })
    const kyc = transitionPayout({ current: { ...payout, state: 'review', providerNetMinor: 3_000 }, now: 10, action: { kind: 'review', autoApprove: true }, account: { state: 'submitted', detailsSubmitted: false, recipientCapabilityActive: false } })
    expect(kyc).toMatchObject({ kind: 'accepted', value: { state: 'held_kyc' } })
    const ready: PayoutTransitionInput = { current: { ...payout, providerNetMinor: 3_000, state: 'held_threshold' }, now: 11, action: { kind: 'release_transfer', stripeTransferId: 'tr_1' }, account: { state: 'ready', detailsSubmitted: true, recipientCapabilityActive: true } }
    expect(transitionPayout(ready)).toMatchObject({ kind: 'accepted', value: { state: 'transfer_pending', stripeTransferId: 'tr_1' } })
  })

  it('retains restricted onboarding state and refuses release despite stale success flags', () => {
    const restricted = transitionPayoutAccount({
      businessId: 'business-1', currency: 'USD', stripeAccountId: 'acct_1',
      current: {
        businessId: 'business-1', currency: 'USD', stripeAccountId: 'acct_1', state: 'restricted',
        detailsSubmitted: true, recipientCapabilityActive: true, requirementsDigest: 'requirements',
        createdAt: 1, updatedAt: 1,
      },
      event: { kind: 'onboarding_returned', observedAt: 2 },
    })
    expect(restricted).toMatchObject({ kind: 'accepted', value: { state: 'restricted' } })
    expect(transitionPayout({
      current: { ...payout, state: 'held_threshold', providerNetMinor: 3_000 },
      now: 3,
      action: { kind: 'release_transfer' },
      account: { state: 'restricted', detailsSubmitted: true, recipientCapabilityActive: true },
    })).toMatchObject({ kind: 'refused', code: 'payout_not_ready' })
  })

  it('freezes an unknown transfer and only settles with reconciliation', () => {
    const unknown = transitionPayout({ current: { ...payout, state: 'transfer_pending' }, now: 10, action: { kind: 'transfer_unknown', stripeTransferId: 'tr_1' }, account: { state: 'ready', detailsSubmitted: true, recipientCapabilityActive: true } })
    expect(unknown).toMatchObject({ kind: 'accepted', value: { state: 'outcome_unknown' } })
    if (unknown.kind !== 'accepted') throw new Error('expected unknown payout')
    expect(transitionPayout({ current: unknown.value, now: 11, action: { kind: 'reconcile', outcome: 'not_released', stripeTransferId: 'tr_1' }, account: { state: 'ready', detailsSubmitted: true, recipientCapabilityActive: true } })).toMatchObject({ kind: 'accepted', value: { state: 'held_threshold' } })
    expect(transitionPayout({ current: unknown.value, now: 11, action: { kind: 'reconcile', outcome: 'paid', stripeTransferId: 'tr_1' }, account: { state: 'ready', detailsSubmitted: true, recipientCapabilityActive: true } })).toMatchObject({ kind: 'accepted', value: { state: 'paid' } })
  })

  it('uses the UTC 11th to 14th review window', () => {
    expect(payoutReviewWindow({ now: Date.UTC(2026, 6, 10, 23, 0) }).phase).toBe('before_review')
    expect(payoutReviewWindow({ now: Date.UTC(2026, 6, 12, 0, 0) }).phase).toBe('review')
    expect(payoutReviewWindow({ now: Date.UTC(2026, 6, 15, 0, 0) }).phase).toBe('auto_approval')
  })
})
