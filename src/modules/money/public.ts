import type { PaginationOptions } from 'convex/server'
import type { ExactAmount } from './internal/exact-amount'
import type { PricingConfig } from './internal/pricing-contract'

export {
  moneyRefSchema,
  currencySchema,
  exactAmountSchema,
  pricingConfigSchema,
} from './internal/pricing-contract'
export {
  addExactAmounts,
  compareExactAmounts,
  formatCurrencyAmount,
  formatExactAmount,
  multiplyExactAmountByBps,
  parseDecimalExactAmount,
  rescaleExactAmount,
  subtractExactAmounts,
} from './internal/exact-amount'
export type { ExactAmount } from './internal/exact-amount'
export type { PricingConfig, PricingConfigInput } from './internal/pricing-contract'

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
      code: 'price_unavailable' | 'pricing_config_invalid' | 'currency_mismatch'
    }>

export type MoneyRefusalCode =
  | 'billing_identity_missing'
  | 'billing_identity_mismatch'
  | 'pricing_config_invalid'
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
  | 'stripe_setup_required'
  | 'payout_not_ready'
  | 'payout_below_threshold'
  | 'payout_outcome_unknown'
  | 'payout_reconciliation_required'
  | 'live_money_gate_open'
  | 'payment_binding_invalid'
  | 'payment_approval_expired'
  | 'fresh_approval_required'

export type EntryType = 'topup' | 'charge' | 'refund' | 'payout_accrual' | 'rake'
export type EntryDirection = 'credit' | 'debit'
export type AccountKind = 'operator_credit' | 'provider_earnings' | 'ae_rake'
export type AccountState = 'active' | 'locked'
export type TransactionState = 'pending' | 'applied' | 'outcome_unknown' | 'reversed'
export type ChargeState = 'free_tier' | 'paid' | 'insufficient_credit' | 'outcome_unknown' | 'refunded'
export type PayoutAccountState = 'not_started' | 'onboarding_started' | 'submitted' | 'restricted' | 'ready'
export type PayoutState = 'review' | 'held_kyc' | 'held_threshold' | 'transfer_pending' | 'paid' | 'failed' | 'outcome_unknown'

export type MoneyAccount = Readonly<{
  accountRef: string
  accountKind: AccountKind
  principalId?: string
  businessId?: string
  balance: ExactAmount
  version: number
  state: AccountState
  createdAt: number
  updatedAt: number
}>

export type MoneyLedgerEntry = Readonly<{
  entryRef: string
  accountRef: string
  entryType: EntryType
  direction: EntryDirection
  amount: ExactAmount
  transactionRef: string
  idempotencyKey: string
  principalId?: string
  businessId?: string
  invocationRef?: string
  attemptRef?: string
  sourceDigest: string
  evidenceRefs: readonly string[]
  createdAt: number
  reversalOf?: string
}>

export type MoneyTransaction = Readonly<{
  transactionRef: string
  kind: EntryType
  idempotencyKey: string
  inputDigest: string
  principalId: string
  currency: string
  exponent: number
  state: TransactionState
  expectedAccountVersion: number
  externalRef?: string
  reversalOf?: string
  createdAt: number
  updatedAt: number
}>

export type MoneyUsageEvent = Readonly<{
  usageRef: string
  principalId: string
  credentialId: string
  serviceRef: string
  offeringRef: string
  businessId: string
  invocationRef: string
  attemptRef: string
  operationKey: string
  priceDigest: string
  chargeState: ChargeState
  amount: ExactAmount
  transactionRef?: string
  observedAt: number
}>

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

export type MoneyPayoutAccount = Readonly<{
  businessId: string
  currency: string
  exponent: number
  stripeAccountId: string
  state: PayoutAccountState
  detailsSubmitted: boolean
  recipientCapabilityActive: boolean
  requirementsDigest: string
  lastStripeEventId?: string
  createdAt: number
  updatedAt: number
}>

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
  idempotencyKey: string
  failureCode?: string
  createdAt: number
  updatedAt: number
}>

export type MoneyRefusal = Readonly<{
  kind: 'refused'
  code: MoneyRefusalCode
  retryable: boolean
  nextAction?: 'credit_topup_required'
  requiredAmount?: ExactAmount
  availableAmount?: ExactAmount
}>
export function isMoneyRefusal(value: unknown): value is MoneyRefusal {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'refused'
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

export type ChargeAuthorizationResult = MoneyAcceptedCharge | MoneyRefusal
export type MoneyInvocationChargeInput = Readonly<{
  principalId: string
  operationKey: string
  invocationRef: string
  attemptRef: string
  effectGeneration: number
  capabilityContractDigest: string
  businessId: string
  offeringRef: string
  pricingConfig: PricingConfig
  priceDigest: string
  priceSourceDigest: string
  authorityMaximumSpend: ExactAmount
}>

export type MoneyInvocationPort = Readonly<{
  authorizeInvocationCharge: (input: MoneyInvocationChargeInput) => Promise<ChargeAuthorizationResult>
  markChargeOutcomeUnknown?: (input: Readonly<{ transactionRef: string; principalId: string; invocationRef: string; attemptRef: string; effectGeneration: number }>) => Promise<MoneyRefusal>
  refundCharge?: (input: Readonly<{ transactionRef: string; principalId: string; invocationRef: string; attemptRef: string; effectGeneration: number }>) => Promise<MoneyRefusal | MoneyAcceptedCharge>
  reconcileCharge?: (input: Readonly<{ transactionRef: string; principalId: string; outcome: 'not_released' | 'released'; evidenceRefs: readonly string[] }>) => Promise<MoneyRefusal | MoneyAcceptedCharge>
}>

export type RakeConfig = Readonly<{ rakeBps: number }>
export type RakeSplit = Readonly<{
  grossAmount: ExactAmount
  rakeBps: number
  rake: ExactAmount
  providerNet: ExactAmount
}>

export type CreditAccountQuery = Readonly<{ principalId: string; currency: string }>
export type CreditActivityQuery = Readonly<{
  principalId: string
  credentialId: string
  currency: string
  paginationOpts: PaginationOptions
}>
export type KeyUsageQuery = Readonly<{
  principalId: string
  credentialId: string
  currency: string
}>
export type ProviderEarningsQuery = Readonly<{
  businessId: string
  currency: string
}>
export type PayoutStatusQuery = Readonly<{ businessId: string; currency: string }>

export type CreditAccountView = Readonly<{
  principalId: string
  balance: ExactAmount
  pendingTopup?: Readonly<{ amount: ExactAmount; state: 'pending' | 'outcome_unknown'; externalRef?: string }>
  autoRecharge: Readonly<{
    enabled: boolean
    threshold: ExactAmount
    rechargeAmount: ExactAmount
  }>
  evidence: 'source' | 'labelled_local_dev'
}>

export type CreditActivityView = Readonly<{
  activityRef: string
  credentialId: string
  serviceRef: string
  offeringRef: string
  businessId: string
  operationKey: string
  grossAmount: ExactAmount
  chargeState: ChargeState
  observedAt: number
  transactionRef?: string
}>

export type KeyUsageView = Readonly<{
  credentialId: string
  callCount: number
  paidCallCount: number
  freeCallCount: number
  grossSpend: ExactAmount
  states: readonly ChargeState[]
}>

export type ProviderEarningsView = Readonly<{
  businessId: string
  grossAccrual: ExactAmount
  rake: ExactAmount
  providerNet: ExactAmount
  paidOut: ExactAmount
  held: ExactAmount
  /** True when the source capped its ledger scan at the latest 100 entries. */
  truncated: boolean
  evidence: 'source' | 'labelled_local_dev'
}>

export type PayoutStatusView = Readonly<{
  businessId: string
  accountState: PayoutAccountState | 'missing'
  payoutState?: PayoutState
  providerNet: ExactAmount
  minimumPayout: ExactAmount
  evidence: 'source' | 'labelled_local_dev'
}>

export type MoneyPaginationPage<Item> = Readonly<{
  page: readonly Item[]
  isDone: boolean
  continueCursor: string
}>

export type MoneyQueryPort = Readonly<{
  readCreditAccount: (input: CreditAccountQuery) => Promise<CreditAccountView>
  listCreditActivity: (input: CreditActivityQuery) => Promise<MoneyPaginationPage<CreditActivityView>>
  readKeyUsage: (input: KeyUsageQuery) => Promise<KeyUsageView>
  readProviderEarnings: (input: ProviderEarningsQuery) => Promise<ProviderEarningsView>
  readPayoutStatus: (input: PayoutStatusQuery) => Promise<PayoutStatusView>
}>

export async function readCreditAccount(input: Readonly<{ port: MoneyQueryPort; query: CreditAccountQuery }>): Promise<CreditAccountView> {
  return await input.port.readCreditAccount(input.query)
}

export async function listCreditActivity(input: Readonly<{ port: MoneyQueryPort; query: CreditActivityQuery }>): Promise<MoneyPaginationPage<CreditActivityView>> {
  return await input.port.listCreditActivity(input.query)
}

export async function readKeyUsage(input: Readonly<{ port: MoneyQueryPort; query: KeyUsageQuery }>): Promise<KeyUsageView> {
  return await input.port.readKeyUsage(input.query)
}

export async function readProviderEarnings(input: Readonly<{ port: MoneyQueryPort; query: ProviderEarningsQuery }>): Promise<ProviderEarningsView> {
  return await input.port.readProviderEarnings(input.query)
}

export async function readPayoutStatus(input: Readonly<{ port: MoneyQueryPort; query: PayoutStatusQuery }>): Promise<PayoutStatusView> {
  return await input.port.readPayoutStatus(input.query)
}

export { computeRakeSplit, normalizePricingConfig, pricingConfigDigest, resolveInvocationPrice } from './internal/pricing-config'
export { createLedgerState, beginIdempotentTransaction, validateChargeAccounts, applyTopup, authorizePaidCharge, appendRefundReversal, markOutcomeUnknown, reconcileCharge, releasePayoutAccrual, accountRefForOperator, accountRefForProvider, accountRefForRake } from './internal/ledger'
export type { LedgerState, LedgerOperationResult, BeginTransactionInput, TopupInput, PaidChargeInput, RefundInput, OutcomeUnknownInput, ReconcileChargeInput, ReleasePayoutInput } from './internal/ledger'
export { transitionPayoutAccount, transitionPayout, payoutReviewWindow } from './internal/payout-policy'
export type { PayoutPolicyResult, PayoutAccountTransitionInput, PayoutTransitionInput } from './internal/payout-policy'
export type { CreditPaymentPort, CreditPaymentRequest, CreditPaymentEvidence, ConnectAccountPort, ConnectAccountRequest, OnboardingLinkRequest } from './internal/ports'
export { createTopupState, beginCreditTopup, applyCreditTopup, markCreditTopupOutcomeUnknown, setAutoRecharge, fixtureUsdTopupConfig } from './internal/topup'
export { LIVE_MONEY_COUNSEL_DECISIONS, LIVE_MONEY_GATE_POLICY, evaluateLiveMoneyGate, liveMoneyGatePolicySchema, paymentBindingSchema, validatePaymentBinding } from './internal/live-money-gate'
export type { LiveMoneyCounselDecision, LiveMoneyCounselSignoff, LiveMoneyGatePolicy, LiveMoneyGateResult, PaymentBinding, PaymentBindingValidation } from './internal/live-money-gate'
export type { CreditTopupConfig, AutoRechargeSettings, CreditTopupCommand, TopupState, BeginTopupResult } from './internal/topup'
export { createInMemoryMoneyQueryPort } from './internal/query-projections'
