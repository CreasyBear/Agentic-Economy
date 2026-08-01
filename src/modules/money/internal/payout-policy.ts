import type {
  MoneyPayout,
  MoneyPayoutAccount,
  PayoutAccountState,
  PayoutState,
} from '../public'

export type PayoutPolicyResult<T> = Readonly<{
  kind: 'accepted'
  value: T
} | {
  kind: 'refused'
  code: 'stripe_setup_required' | 'payout_not_ready' | 'payout_below_threshold' | 'payout_outcome_unknown' | 'payout_reconciliation_required'
  retryable: boolean
}>

export type PayoutAccountTransitionInput = Readonly<{
  current?: MoneyPayoutAccount
  businessId: string
  currency: string
  stripeAccountId: string
  event:
    | Readonly<{ kind: 'onboarding_started'; observedAt: number }>
    | Readonly<{ kind: 'onboarding_returned'; observedAt: number }>
    | Readonly<{ kind: 'status'; detailsSubmitted: boolean; recipientCapabilityActive: boolean; restricted: boolean; requirementsDigest: string; stripeEventId: string; observedAt: number }>
}>

export type PayoutTransitionInput = Readonly<{
  current: MoneyPayout
  now: number
  action:
    | Readonly<{ kind: 'review'; autoApprove: boolean }>
    | Readonly<{ kind: 'release_transfer'; stripeTransferId?: string }>
    | Readonly<{ kind: 'transfer_failed'; failureCode: string; released: false }>
    | Readonly<{ kind: 'transfer_unknown'; stripeTransferId?: string }>
    | Readonly<{ kind: 'reconcile'; outcome: 'not_released' | 'paid'; stripeTransferId?: string }>
  account: Readonly<{ detailsSubmitted: boolean; recipientCapabilityActive: boolean }>
}>

export type PayoutReviewWindow = Readonly<{
  periodStart: string
  periodEnd: string
  reviewOpensAt: string
  reviewClosesAt: string
  phase: 'before_review' | 'review' | 'auto_approval'
}>

export function transitionPayoutAccount(input: PayoutAccountTransitionInput): PayoutPolicyResult<MoneyPayoutAccount> {
  const current = input.current
  const base = current ?? {
    businessId: input.businessId,
    currency: input.currency,
    stripeAccountId: input.stripeAccountId,
    state: 'not_started' as const,
    detailsSubmitted: false,
    recipientCapabilityActive: false,
    requirementsDigest: 'sha256:unavailable',
    createdAt: input.event.observedAt,
    updatedAt: input.event.observedAt,
  }
  if (base.businessId !== input.businessId || base.currency !== input.currency || base.stripeAccountId !== input.stripeAccountId) {
    return { kind: 'refused', code: 'stripe_setup_required', retryable: false }
  }
  if (input.event.kind === 'onboarding_started') {
    return { kind: 'accepted', value: { ...base, state: 'onboarding_started', updatedAt: input.event.observedAt } }
  }
  if (input.event.kind === 'onboarding_returned') {
    const state: PayoutAccountState = base.state === 'ready' ? 'ready' : 'submitted'
    return { kind: 'accepted', value: { ...base, state, updatedAt: input.event.observedAt } }
  }
  const state: PayoutAccountState = input.event.restricted
    ? 'restricted'
    : input.event.detailsSubmitted && input.event.recipientCapabilityActive
      ? 'ready'
      : 'submitted'
  return {
    kind: 'accepted',
    value: {
      ...base,
      state,
      detailsSubmitted: input.event.detailsSubmitted,
      recipientCapabilityActive: input.event.recipientCapabilityActive,
      requirementsDigest: input.event.requirementsDigest,
      lastStripeEventId: input.event.stripeEventId,
      updatedAt: input.event.observedAt,
    },
  }
}

export function payoutReviewWindow(input: Readonly<{ now: number }>): PayoutReviewWindow {
  const now = new Date(input.now)
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const periodEndDate = new Date(Date.UTC(year, month, 0))
  const periodStartDate = new Date(Date.UTC(periodEndDate.getUTCFullYear(), periodEndDate.getUTCMonth(), 1))
  const reviewOpensAt = new Date(Date.UTC(year, month, 11, 0, 0, 0, 0))
  const reviewClosesAt = new Date(Date.UTC(year, month, 14, 23, 59, 59, 999))
  const phase = input.now < reviewOpensAt.getTime()
    ? 'before_review'
    : input.now <= reviewClosesAt.getTime()
      ? 'review'
      : 'auto_approval'
  return {
    periodStart: dateOnly(periodStartDate),
    periodEnd: dateOnly(periodEndDate),
    reviewOpensAt: reviewOpensAt.toISOString(),
    reviewClosesAt: reviewClosesAt.toISOString(),
    phase,
  }
}

export function transitionPayout(input: PayoutTransitionInput): PayoutPolicyResult<MoneyPayout> {
  const current = input.current
  if (input.action.kind === 'review') {
    if (!input.action.autoApprove || current.state !== 'review') return { kind: 'accepted', value: current }
    if (!input.account.detailsSubmitted || !input.account.recipientCapabilityActive) {
      return { kind: 'accepted', value: { ...current, state: 'held_kyc', updatedAt: input.now } }
    }
    if (current.providerNetMinor < current.minimumPayoutMinor) {
      return { kind: 'accepted', value: { ...current, state: 'held_threshold', updatedAt: input.now } }
    }
    return { kind: 'accepted', value: { ...current, state: 'held_threshold', updatedAt: input.now } }
  }
  if (input.action.kind === 'release_transfer') {
    if (current.state === 'outcome_unknown') return { kind: 'refused', code: 'payout_reconciliation_required', retryable: false }
    if (current.state !== 'held_threshold' && current.state !== 'held_kyc') return { kind: 'refused', code: 'payout_not_ready', retryable: false }
    if (!input.account.detailsSubmitted || !input.account.recipientCapabilityActive) return { kind: 'refused', code: 'payout_not_ready', retryable: false }
    if (current.providerNetMinor < current.minimumPayoutMinor) return { kind: 'refused', code: 'payout_below_threshold', retryable: false }
    return { kind: 'accepted', value: { ...current, state: 'transfer_pending', ...(input.action.stripeTransferId === undefined ? {} : { stripeTransferId: input.action.stripeTransferId }), updatedAt: input.now } }
  }
  if (input.action.kind === 'transfer_failed') {
    if (current.state !== 'transfer_pending') return { kind: 'refused', code: 'payout_not_ready', retryable: false }
    return { kind: 'accepted', value: { ...current, state: 'held_threshold', failureCode: input.action.failureCode, updatedAt: input.now } }
  }
  if (input.action.kind === 'transfer_unknown') {
    if (current.state !== 'transfer_pending') return { kind: 'refused', code: 'payout_not_ready', retryable: false }
    return { kind: 'accepted', value: { ...current, state: 'outcome_unknown', ...(input.action.stripeTransferId === undefined ? {} : { stripeTransferId: input.action.stripeTransferId }), updatedAt: input.now } }
  }
  if (current.state !== 'outcome_unknown') return { kind: 'refused', code: 'payout_reconciliation_required', retryable: false }
  if (input.action.outcome === 'not_released') {
    return { kind: 'accepted', value: { ...current, state: 'held_threshold', updatedAt: input.now } }
  }
  return { kind: 'accepted', value: { ...current, state: 'paid', ...(input.action.stripeTransferId === undefined ? {} : { stripeTransferId: input.action.stripeTransferId }), updatedAt: input.now } }
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10)
}
