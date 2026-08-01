import { z } from 'zod'

export const moneyRefSchema = z.string().trim().min(1).max(500)
export const currencySchema = z.string().trim().regex(/^[A-Z]{3}$/)
export const minorAmountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

const freeTierSchema = z.strictObject({
  maxCalls: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  window: z.enum(['day', 'month']),
})

export const pricingConfigSchema = z.strictObject({
  version: z.literal('pricing:v1'),
  unit: z.literal('call'),
  currency: currencySchema,
  paidAmountMinor: minorAmountSchema,
  freeTier: freeTierSchema.optional(),
})

export type PricingConfig = z.infer<typeof pricingConfigSchema>
export type PricingConfigInput = z.input<typeof pricingConfigSchema>

export type PricingResolution =
  | Readonly<{
      kind: 'free'
      reason: 'zero_price' | 'free_tier'
      currency: string
      amountMinor: 0
      priceDigest: string
    }>
  | Readonly<{
      kind: 'paid'
      currency: string
      amountMinor: number
      priceDigest: string
    }>
  | Readonly<{
      kind: 'refused'
      code: 'price_unavailable' | 'pricing_config_invalid' | 'currency_mismatch'
    }>

export type MoneyRefusalCode =
  | 'billing_identity_missing'
  | 'price_unavailable'
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
  currency: string
  balanceMinor: number
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
  amountMinor: number
  currency: string
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
  currency: string
  serviceRef: string
  offeringRef: string
  businessId: string
  invocationRef: string
  attemptRef: string
  operationKey: string
  priceDigest: string
  chargeState: ChargeState
  amountMinor: number
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
  currency: string
  grossAccrualMinor: number
  rakeMinor: number
  providerNetMinor: number
  minimumPayoutMinor: number
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
  currency?: string
  requiredAmountMinor?: number
  availableAmountMinor?: number
}>

export type MoneyAcceptedCharge = Readonly<{
  kind: 'accepted'
  chargeState: 'free_tier' | 'paid'
  currency: string
  amountMinor: number
  priceDigest: string
  transactionRef?: string
  providerNetMinor?: number
  rakeMinor?: number
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
  authorityMaximumSpend: Readonly<{ currency: string; amountMinor: number }>
}>

export type MoneyInvocationPort = Readonly<{
  authorizeInvocationCharge: (input: MoneyInvocationChargeInput) => Promise<ChargeAuthorizationResult>
  markChargeOutcomeUnknown?: (input: Readonly<{ transactionRef: string; principalId: string; invocationRef: string; attemptRef: string; effectGeneration: number }>) => Promise<MoneyRefusal>
  refundCharge?: (input: Readonly<{ transactionRef: string; principalId: string; invocationRef: string; attemptRef: string; effectGeneration: number }>) => Promise<MoneyRefusal | MoneyAcceptedCharge>
  reconcileCharge?: (input: Readonly<{ transactionRef: string; principalId: string; outcome: 'not_released' | 'released'; evidenceRefs: readonly string[] }>) => Promise<MoneyRefusal | MoneyAcceptedCharge>
}>

export type RakeConfig = Readonly<{ rakeBps: number }>
export type RakeSplit = Readonly<{
  grossAmountMinor: number
  rakeBps: number
  rakeMinor: number
  providerNetMinor: number
}>

export type CreditAccountQuery = Readonly<{ principalId: string; currency: string }>
export type CreditActivityQuery = Readonly<{
  principalId: string
  credentialId?: string
  currency?: string
  from?: number
  to?: number
  cursor?: string
  limit: number
}>
export type KeyUsageQuery = Readonly<{
  principalId: string
  credentialId?: string
  from?: number
  to?: number
  cursor?: string
  limit: number
}>
export type ProviderEarningsQuery = Readonly<{
  businessId: string
  currency: string
  cursor?: string
  limit: number
}>
export type PayoutStatusQuery = Readonly<{ businessId: string; currency: string }>

export type CreditAccountView = Readonly<{
  principalId: string
  currency: string
  balanceMinor: number
  pendingTopup?: Readonly<{ amountMinor: number; state: 'pending' | 'outcome_unknown'; externalRef?: string }>
  autoRecharge: Readonly<{
    enabled: boolean
    thresholdMinor: number
    rechargeAmountMinor: number
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
  grossAmountMinor: number
  currency: string
  chargeState: ChargeState
  observedAt: number
  transactionRef?: string
}>

export type KeyUsageView = Readonly<{
  credentialId: string
  callCount: number
  paidCallCount: number
  freeCallCount: number
  grossSpendMinor: number
  currency?: string
  states: readonly ChargeState[]
}>

export type ProviderEarningsView = Readonly<{
  businessId: string
  currency: string
  grossAccrualMinor: number
  rakeMinor: number
  providerNetMinor: number
  paidOutMinor: number
  heldMinor: number
  evidence: 'source' | 'labelled_local_dev'
}>

export type PayoutStatusView = Readonly<{
  businessId: string
  currency: string
  accountState: PayoutAccountState | 'missing'
  payoutState?: PayoutState
  providerNetMinor: number
  minimumPayoutMinor: number
  evidence: 'source' | 'labelled_local_dev'
}>

export type MoneyQueryPort = Readonly<{
  readCreditAccount: (input: CreditAccountQuery) => Promise<CreditAccountView>
  listCreditActivity: (input: CreditActivityQuery) => Promise<Readonly<{ items: readonly CreditActivityView[]; nextCursor?: string }>>
  readKeyUsage: (input: KeyUsageQuery) => Promise<Readonly<{ items: readonly KeyUsageView[]; nextCursor?: string }>>
  readProviderEarnings: (input: ProviderEarningsQuery) => Promise<ProviderEarningsView>
  readPayoutStatus: (input: PayoutStatusQuery) => Promise<PayoutStatusView>
}>

export function assertMoneyQueryLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1) return 1
  return Math.min(limit, 100)
}

export async function readCreditAccount(input: Readonly<{ port: MoneyQueryPort; query: CreditAccountQuery }>): Promise<CreditAccountView> {
  return await input.port.readCreditAccount(input.query)
}

export async function listCreditActivity(input: Readonly<{ port: MoneyQueryPort; query: CreditActivityQuery }>): Promise<Readonly<{ items: readonly CreditActivityView[]; nextCursor?: string }>> {
  const query = { ...input.query, limit: assertMoneyQueryLimit(input.query.limit) }
  return await input.port.listCreditActivity(query)
}

export async function readKeyUsage(input: Readonly<{ port: MoneyQueryPort; query: KeyUsageQuery }>): Promise<Readonly<{ items: readonly KeyUsageView[]; nextCursor?: string }>> {
  const query = { ...input.query, limit: assertMoneyQueryLimit(input.query.limit) }
  return await input.port.readKeyUsage(query)
}

export async function readProviderEarnings(input: Readonly<{ port: MoneyQueryPort; query: ProviderEarningsQuery }>): Promise<ProviderEarningsView> {
  return await input.port.readProviderEarnings(input.query)
}

export async function readPayoutStatus(input: Readonly<{ port: MoneyQueryPort; query: PayoutStatusQuery }>): Promise<PayoutStatusView> {
  return await input.port.readPayoutStatus(input.query)
}

export { computeRakeSplit, normalizePricingConfig, pricingConfigDigest, resolveInvocationPrice } from './internal/pricing-config'
export type { ResolveInvocationPriceInput, NormalizePricingConfigResult } from './internal/pricing-config'
export { createLedgerState, beginIdempotentTransaction, applyTopup, authorizePaidCharge, appendRefundReversal, markOutcomeUnknown, reconcileCharge, releasePayoutAccrual, accountRefForOperator, accountRefForProvider, accountRefForRake, buildChargeIdempotencyKey } from './internal/ledger'
export type { LedgerState, LedgerOperationResult, BeginTransactionInput, TopupInput, PaidChargeInput, RefundInput, OutcomeUnknownInput, ReconcileChargeInput, ReleasePayoutInput } from './internal/ledger'
export { transitionPayoutAccount, transitionPayout, payoutReviewWindow } from './internal/payout-policy'
export type { PayoutPolicyResult, PayoutAccountTransitionInput, PayoutTransitionInput } from './internal/payout-policy'
export type { CreditPaymentPort, CreditPaymentRequest, CreditPaymentEvidence, ConnectAccountPort, ConnectAccountRequest, OnboardingLinkRequest, ProviderTransferPort, ProviderTransferRequest, ProviderTransferEvidence } from './internal/ports'
export { createTopupState, beginCreditTopup, applyCreditTopup, markCreditTopupOutcomeUnknown, setAutoRecharge, fixtureUsdTopupConfig } from './internal/topup'
export type { CreditTopupConfig, AutoRechargeSettings, CreditTopupCommand, TopupState, BeginTopupResult } from './internal/topup'
export { createInMemoryMoneyQueryPort } from './internal/query-projections'
export { handleStripeWebhookRequest } from './internal/stripe-webhook'
export type { CreditTopupWebhookEvent, StripeWebhookVerifier, StripeWebhookApplier } from './internal/stripe-webhook'
