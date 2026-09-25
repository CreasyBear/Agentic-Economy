import type { ExactAmount } from './exact-amount'
import type { ConnectAccountView } from './connect-contracts'

export type PricingResolution =
  | Readonly<{
      kind: 'free'
      reason: 'zero_price' | 'free_tier'
      amount: ExactAmount
      priceDigest: string
    }>
  | Readonly<{
      kind: 'paid'
      amount: ExactAmount
      priceDigest: string
    }>
  | Readonly<{
      kind: 'refused'
      code:
        | 'price_unavailable'
        | 'pricing_config_invalid'
        | 'currency_mismatch'
    }>

export type MoneyRefusalCode =
  | 'billing_identity_missing'
  | 'billing_identity_mismatch'
  | 'price_unavailable'
  | 'pricing_config_invalid'
  | 'pricing_setup_required'
  | 'pricing_source_amount_invalid'
  | 'currency_mismatch'
  | 'price_changed'
  | 'rake_not_configured'
  | 'insufficient_credit'
  | 'ledger_idempotency_conflict'
  | 'ledger_cas_conflict'
  | 'charge_reconciliation_required'
  | 'credit_topup_amount_invalid'
  | 'credit_topup_required'
  | 'credit_topup_pending'
  | 'credit_topup_outcome_unknown'
  | 'funding_amount_invalid'
  | 'funding_pending'
  | 'funding_outcome_unknown'
  | 'funding_idempotency_conflict'
  | 'commercial_policy_required'
  | 'source_write_denied'
  | 'journal_invalid'
  | 'journal_idempotency_conflict'
  | 'journal_reconciliation_required'
  | 'stripe_setup_required'
  | 'payout_not_ready'
  | 'payout_below_threshold'
  | 'payout_outcome_unknown'
  | 'payout_reconciliation_required'
  | 'payment_binding_invalid'
  | 'payment_approval_expired'
  | 'fresh_approval_required'
  | 'reauthentication_required'
  | 'proof_stale'
  | 'proof_replayed'
  | 'command_changed'
  | 'rate_limited'
  | 'security_control_unavailable'
  | 'budget_policy_missing'
  | 'budget_generation_stale'
  | 'budget_call_limit_exceeded'
  | 'budget_daily_limit_exceeded'
  | 'budget_monthly_limit_exceeded'
  | 'budget_concurrency_exhausted'
  | 'budget_reconciliation_required'

export type ChargeState =
  | 'free_tier'
  | 'paid'
  | 'insufficient_credit'
  | 'outcome_unknown'
  | 'refunded'

export type PayoutAccountState = ConnectAccountView['state']

export type PayoutState =
  | 'review'
  | 'held_kyc'
  | 'held_threshold'
  | 'transfer_pending'
  | 'paid'
  | 'reversed'
  | 'failed'
  | 'outcome_unknown'

export type MoneyFreeTierCounter = Readonly<{
  counterRef: string
  principalId: string
  offeringRef: string
  window: 'day' | 'month'
  windowStart: string
  callsUsed: number
  version: number
  updatedAt: number
}>

export type MoneyStripeEvent = Readonly<{
  stripeEventId: string
  eventType: string
  payloadDigest: string
  status: 'received' | 'applied' | 'ignored' | 'failed'
  appliedRef?: string
  receivedAt: number
  appliedAt?: number
}>

export type MoneyPayoutAccount = ConnectAccountView

export type MoneyPayout = Readonly<{
  payoutRef: string
  businessId: string
  grossAccrual: ExactAmount
  rake: ExactAmount
  providerNet: ExactAmount
  minimumPayout: ExactAmount
  state: PayoutState
  periodStart: string
  periodEnd: string
  stripeTransferId?: string
  payoutCommandId?: string
  transferRequestDigest?: string
  transferEvidenceDigest?: string
  transferReversalEvidenceDigest?: string
  transferObservedAt?: number
  transferStatus?:
    | 'pending'
    | 'succeeded'
    | 'failed'
    | 'reversed'
    | 'outcome_unknown'
  providerHeldBefore?: ExactAmount
  providerHeldAfter?: ExactAmount
  providerPaidBefore?: ExactAmount
  providerPaidAfter?: ExactAmount
  idempotencyKey: string
  failureCode?: string
  createdAt: number
  updatedAt: number
}>

export type MoneyPayoutTransferStatus = Readonly<{
  payoutRef: string
  payoutCommandId: string
  state: PayoutState
  idempotencyKey: string
  inputDigest: string
  amount: ExactAmount
  destinationAccountId: string
  stripeTransferId?: string
  transferStatus?:
    | 'pending'
    | 'succeeded'
    | 'failed'
    | 'reversed'
    | 'outcome_unknown'
  requestDigest?: string
  evidenceDigest?: string
  reversalEvidenceDigest?: string
  providerHeldBefore?: ExactAmount
  providerHeldAfter?: ExactAmount
  providerPaidBefore?: ExactAmount
  providerPaidAfter?: ExactAmount
}>

export type MoneyRefusal = Readonly<{
  kind: 'refused'
  code: MoneyRefusalCode
  retryable: boolean
  correlationRef?: string
  nextAction?: 'credit_topup_required'
  requiredAmount?: ExactAmount
  availableAmount?: ExactAmount
}>

export function isMoneyRefusal(value: unknown): value is MoneyRefusal {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'refused'
  )
}

export type MoneyAcceptedCharge = Readonly<{
  kind: 'accepted'
  chargeState: 'free_tier' | 'paid'
  amount: ExactAmount
  priceDigest: string
  transactionRef?: string
  providerNet?: ExactAmount
  rake?: ExactAmount
}>

export type MoneyAcceptedCallCharge = MoneyAcceptedCharge &
  Readonly<{
    usageRef: string
    observedAt: number
  }>

export type ChargeAuthorizationResult =
  MoneyAcceptedCallCharge | MoneyRefusal

export type MoneyChargeOutcomeUnknown = Readonly<{
  kind: 'outcome_unknown'
  transactionRef: string
}>

export type RakeConfig = Readonly<{ rakeBps: number }>

export type RakeSplit = Readonly<{
  grossAmount: ExactAmount
  rakeBps: number
  rake: ExactAmount
  providerNet: ExactAmount
}>
