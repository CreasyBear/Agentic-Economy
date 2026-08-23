import type {
  MoneyPayout,
  MoneyPayoutAccount,
  PayoutAccountState,
} from '../public'
import { addExactAmounts, compareExactAmounts } from './exact-amount'


// Stripe only guarantees idempotency-key retention for at least 24 hours.
// Stop automatic key-based recovery one hour before that lower bound.
export const STRIPE_TRANSFER_RECOVERY_WINDOW_MS = 23 * 60 * 60 * 1_000
export const STRIPE_CONNECT_RECOVERY_WINDOW_MS = 23 * 60 * 60 * 1_000
export const STRIPE_CONNECT_RECOVERY_LEASE_MS = 30 * 1_000
export type PayoutPolicyResult<T> = Readonly<{
  kind: 'accepted'
  value: T
} | {
  kind: 'refused'
  code: 'stripe_setup_required' | 'payout_not_ready' | 'payout_below_threshold' | 'payout_outcome_unknown' | 'payout_reconciliation_required' | 'ledger_idempotency_conflict'
  retryable: boolean
}>

export type PayoutAccountTransitionInput = Readonly<{
  current?: MoneyPayoutAccount
  businessId: string
  currency: string
  exponent: number
  stripeAccountId: string
  event:
    | Readonly<{ kind: 'onboarding_started'; observedAt: number }>
    | Readonly<{ kind: 'onboarding_returned'; observedAt: number }>
    | Readonly<{
        kind: 'status'
        detailsSubmitted: boolean
        recipientCapabilityActive: boolean
        restricted: boolean
        requirementsDigest: string
        stripeEventId: string
        payloadDigest: string
        providerObjectDigest: string
        observedAt: number
      }>
}>

export type PayoutTransitionInput = Readonly<{
  current: MoneyPayout
  now: number
  action:
    | Readonly<{ kind: 'review'; autoApprove: boolean }>
    | Readonly<{ kind: 'begin_transfer'; payoutCommandId: string; requestDigest: string; idempotencyKey: string }>
    | Readonly<{ kind: 'transfer_succeeded'; payoutCommandId: string; idempotencyKey: string; stripeTransferId: string; requestDigest: string; evidenceDigest: string; observedAt: number }>
    | Readonly<{ kind: 'transfer_reversed'; payoutCommandId: string; idempotencyKey: string; stripeTransferId: string; requestDigest: string; evidenceDigest: string; observedAt: number }>
    | Readonly<{ kind: 'transfer_failed'; payoutCommandId: string; idempotencyKey: string; failureCode: string; stripeTransferId?: string; requestDigest?: string; evidenceDigest?: string; observedAt: number }>
    | Readonly<{ kind: 'transfer_unknown'; payoutCommandId: string; idempotencyKey: string; stripeTransferId?: string }>
    | Readonly<{ kind: 'reconcile'; payoutCommandId: string; idempotencyKey: string; outcome: 'not_released' | 'failed'; stripeTransferId?: string; evidenceDigest?: string }>
  account: Readonly<{ state: PayoutAccountState; detailsSubmitted: boolean; recipientCapabilityActive: boolean }>
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
    exponent: input.exponent,
    stripeAccountId: input.stripeAccountId,
    state: 'not_started' as const,
    detailsSubmitted: false,
    recipientCapabilityActive: false,
    requirementsDigest: 'sha256:unavailable',
    createdAt: input.event.observedAt,
    updatedAt: input.event.observedAt,
  }
  if (
    base.businessId !== input.businessId
    || base.currency !== input.currency
    || base.exponent !== input.exponent
    || base.stripeAccountId !== input.stripeAccountId
  ) return { kind: 'refused', code: 'stripe_setup_required', retryable: false }
  if (input.event.kind === 'onboarding_started') {
    return { kind: 'accepted', value: { ...base, state: 'onboarding_started', updatedAt: input.event.observedAt } }
  }
  if (input.event.kind === 'onboarding_returned') {
    const state: PayoutAccountState = base.state === 'ready' || base.state === 'restricted' ? base.state : 'submitted'
    return { kind: 'accepted', value: { ...base, state, updatedAt: input.event.observedAt } }
  }
  if (
    input.event.stripeEventId.length === 0
    || input.event.payloadDigest.length === 0
    || input.event.providerObjectDigest.length === 0
  ) return { kind: 'refused', code: 'stripe_setup_required', retryable: false }
  if (current !== undefined && current.lastStripeEventId === input.event.stripeEventId) {
    return current.lastStripePayloadDigest === input.event.payloadDigest
      && current.providerObjectDigest === input.event.providerObjectDigest
      ? { kind: 'accepted', value: current }
      : { kind: 'refused', code: 'ledger_idempotency_conflict', retryable: false }
  }
  if (current?.lastStripeObservedAt !== undefined && input.event.observedAt < current.lastStripeObservedAt) return { kind: 'accepted', value: current }
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
      providerObjectDigest: input.event.providerObjectDigest,
      lastStripePayloadDigest: input.event.payloadDigest,
      lastStripeObservedAt: input.event.observedAt,
      lastStripeEventId: input.event.stripeEventId,
      version: (base.version ?? 0) + 1,
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
  const expectedGross = addExactAmounts(current.providerNet, current.rake)
  if (
    expectedGross === undefined
    || compareExactAmounts(expectedGross, current.grossAccrual) !== 0
    || compareExactAmounts(current.providerNet, current.minimumPayout) === undefined
  ) return { kind: 'refused', code: 'payout_not_ready', retryable: false }
  if (input.action.kind === 'review') {
    if (!input.action.autoApprove || current.state !== 'review') return { kind: 'accepted', value: current }
    if (input.account.state !== 'ready' || !input.account.detailsSubmitted || !input.account.recipientCapabilityActive) {
      return { kind: 'accepted', value: { ...current, state: 'held_kyc', updatedAt: input.now } }
    }
    return { kind: 'accepted', value: { ...current, state: 'held_threshold', updatedAt: input.now } }
  }
  if (input.action.kind === 'begin_transfer') {
    if (current.state !== 'held_threshold' && current.state !== 'held_kyc') {
      return { kind: 'refused', code: current.state === 'outcome_unknown' ? 'payout_reconciliation_required' : 'payout_not_ready', retryable: false }
    }
    if (input.account.state !== 'ready' || !input.account.detailsSubmitted || !input.account.recipientCapabilityActive) return { kind: 'refused', code: 'payout_not_ready', retryable: false }
    if (compareExactAmounts(current.providerNet, current.minimumPayout) === -1) return { kind: 'refused', code: 'payout_below_threshold', retryable: false }
    if (input.action.payoutCommandId.length === 0 || input.action.requestDigest.length === 0 || input.action.idempotencyKey.length === 0) return { kind: 'refused', code: 'payout_not_ready', retryable: false }
    return {
      kind: 'accepted',
      value: {
        ...current,
        state: 'transfer_pending',
        payoutCommandId: input.action.payoutCommandId,
        transferRequestDigest: input.action.requestDigest,
        transferStatus: 'pending',
        idempotencyKey: input.action.idempotencyKey,
        updatedAt: input.now,
      },
    }
  }
  if (input.action.kind === 'transfer_succeeded') {
    if (
      input.action.payoutCommandId.length === 0
      || input.action.idempotencyKey.length === 0
      || input.action.stripeTransferId.length === 0
      || input.action.requestDigest.length === 0
      || input.action.evidenceDigest.length === 0
    ) return { kind: 'refused', code: 'payout_reconciliation_required', retryable: false }
    if (current.payoutCommandId !== input.action.payoutCommandId || current.idempotencyKey !== input.action.idempotencyKey) return { kind: 'refused', code: 'payout_reconciliation_required', retryable: false }
    if (current.state === 'paid') {
      return current.stripeTransferId === input.action.stripeTransferId
        && current.transferRequestDigest === input.action.requestDigest
        && current.transferEvidenceDigest === input.action.evidenceDigest
        ? { kind: 'accepted', value: current }
        : { kind: 'refused', code: 'payout_reconciliation_required', retryable: false }
    }
    if (current.state !== 'transfer_pending' && current.state !== 'outcome_unknown') return { kind: 'refused', code: 'payout_reconciliation_required', retryable: false }
    if (current.transferRequestDigest !== undefined && current.transferRequestDigest !== input.action.requestDigest) return { kind: 'refused', code: 'payout_reconciliation_required', retryable: false }
    if (current.stripeTransferId !== undefined && current.stripeTransferId !== input.action.stripeTransferId) return { kind: 'refused', code: 'payout_reconciliation_required', retryable: false }
    return {
      kind: 'accepted',
      value: {
        ...current,
        state: 'paid',
        stripeTransferId: input.action.stripeTransferId,
        transferRequestDigest: input.action.requestDigest,
        transferEvidenceDigest: input.action.evidenceDigest,
        transferObservedAt: input.action.observedAt,
        transferStatus: 'succeeded',
        updatedAt: input.now,
      },
    }
  }
  if (input.action.kind === 'transfer_reversed') {
    if (
      input.action.payoutCommandId.length === 0
      || input.action.idempotencyKey.length === 0
      || input.action.stripeTransferId.length === 0
      || input.action.requestDigest.length === 0
      || input.action.evidenceDigest.length === 0
      || current.payoutCommandId !== input.action.payoutCommandId
      || current.idempotencyKey !== input.action.idempotencyKey
    ) return { kind: 'refused', code: 'payout_reconciliation_required', retryable: false }
    if (current.state === 'reversed') {
      return current.transferStatus === 'reversed'
        && current.stripeTransferId === input.action.stripeTransferId
        && current.transferRequestDigest === input.action.requestDigest
        && current.transferEvidenceDigest !== undefined
        && current.transferReversalEvidenceDigest === input.action.evidenceDigest
        ? { kind: 'accepted', value: current }
        : { kind: 'refused', code: 'payout_reconciliation_required', retryable: false }
    }
    if (
      current.state !== 'paid'
      || current.transferStatus !== 'succeeded'
      || current.stripeTransferId !== input.action.stripeTransferId
      || current.transferRequestDigest !== input.action.requestDigest
      || current.transferEvidenceDigest === undefined
    ) return { kind: 'refused', code: 'payout_reconciliation_required', retryable: false }
    return {
      kind: 'accepted',
      value: {
        ...current,
        state: 'reversed',
        transferStatus: 'reversed',
        transferReversalEvidenceDigest: input.action.evidenceDigest,
        transferObservedAt: input.action.observedAt,
        updatedAt: input.now,
      },
    }
  }
  if (input.action.kind === 'transfer_failed') {
    if (
      current.state !== 'transfer_pending'
      && current.state !== 'outcome_unknown'
    ) return { kind: 'refused', code: 'payout_not_ready', retryable: false }
    if (
      input.action.payoutCommandId.length === 0
      || input.action.idempotencyKey.length === 0
      || input.action.failureCode.length === 0
      || current.payoutCommandId !== input.action.payoutCommandId
      || current.idempotencyKey !== input.action.idempotencyKey
    ) return { kind: 'refused', code: 'payout_reconciliation_required', retryable: false }
    if (input.action.requestDigest !== undefined && current.transferRequestDigest !== undefined && input.action.requestDigest !== current.transferRequestDigest) return { kind: 'refused', code: 'payout_reconciliation_required', retryable: false }
    if (input.action.stripeTransferId !== undefined && current.stripeTransferId !== undefined && input.action.stripeTransferId !== current.stripeTransferId) return { kind: 'refused', code: 'payout_reconciliation_required', retryable: false }
    return {
      kind: 'accepted',
      value: {
        ...current,
        state: input.account.state === 'ready' && input.account.detailsSubmitted && input.account.recipientCapabilityActive ? 'held_threshold' : 'held_kyc',
        ...(input.action.stripeTransferId === undefined ? {} : { stripeTransferId: input.action.stripeTransferId }),
        ...(input.action.requestDigest === undefined ? {} : { transferRequestDigest: input.action.requestDigest }),
        ...(input.action.evidenceDigest === undefined ? {} : { transferEvidenceDigest: input.action.evidenceDigest }),
        transferStatus: 'failed',
        failureCode: input.action.failureCode,
        updatedAt: input.now,
      },
    }
  }
  if (input.action.kind === 'transfer_unknown') {
    if (
      input.action.payoutCommandId.length === 0
      || input.action.idempotencyKey.length === 0
      || current.payoutCommandId !== input.action.payoutCommandId
      || current.idempotencyKey !== input.action.idempotencyKey
    ) return { kind: 'refused', code: 'payout_reconciliation_required', retryable: false }
    if (current.state === 'outcome_unknown') {
      return current.stripeTransferId === input.action.stripeTransferId
        ? { kind: 'accepted', value: current }
        : { kind: 'refused', code: 'payout_reconciliation_required', retryable: false }
    }
    if (current.state !== 'transfer_pending') return { kind: 'refused', code: 'payout_not_ready', retryable: false }
    return { kind: 'accepted', value: { ...current, state: 'outcome_unknown', ...(input.action.stripeTransferId === undefined ? {} : { stripeTransferId: input.action.stripeTransferId }), transferStatus: 'outcome_unknown', updatedAt: input.now } }
  }
  if (
    (current.state !== 'transfer_pending' && current.state !== 'outcome_unknown')
    || input.action.payoutCommandId.length === 0
    || input.action.idempotencyKey.length === 0
    || current.payoutCommandId !== input.action.payoutCommandId
    || current.idempotencyKey !== input.action.idempotencyKey
  ) return { kind: 'refused', code: 'payout_reconciliation_required', retryable: false }
  if (input.action.outcome === 'not_released' || input.action.outcome === 'failed') {
    return {
      kind: 'accepted',
      value: {
        ...current,
        state: input.account.state === 'ready' && input.account.detailsSubmitted && input.account.recipientCapabilityActive ? 'held_threshold' : 'held_kyc',
        ...(input.action.stripeTransferId === undefined ? {} : { stripeTransferId: input.action.stripeTransferId }),
        ...(input.action.evidenceDigest === undefined ? {} : { transferEvidenceDigest: input.action.evidenceDigest }),
        transferStatus: 'failed',
        updatedAt: input.now,
      },
    }
  }
  return { kind: 'refused', code: 'payout_reconciliation_required', retryable: false }
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10)
}
