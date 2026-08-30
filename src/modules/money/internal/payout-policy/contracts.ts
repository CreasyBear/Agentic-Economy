import type {
  MoneyPayout,
  MoneyPayoutAccount,
  PayoutAccountState,
} from '../../public'

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

export type PayoutAction = PayoutTransitionInput['action']
export type PayoutActionOf<Kind extends PayoutAction['kind']> = Extract<PayoutAction, { kind: Kind }>

export type PayoutReviewWindow = Readonly<{
  periodStart: string
  periodEnd: string
  reviewOpensAt: string
  reviewClosesAt: string
  phase: 'before_review' | 'review' | 'auto_approval'
}>
