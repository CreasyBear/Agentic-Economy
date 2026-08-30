import type {
  ChargeAuthorizationResult,
  EntryType,
  ExactAmount,
  KeyUsageView,
  MoneyAccount,
  MoneyAcceptedCharge,
  MoneyLedgerEntry,
  MoneyRefusal,
  MoneyTransaction,
  MoneyUsageEvent,
  RakeConfig,
} from '../../public'
import type { PaymentBinding } from '../payment-binding'

export type MoneyCredentialUsageSummary = Readonly<KeyUsageView & { principalId: string }>

export type LedgerState = Readonly<{
  accounts: ReadonlyMap<string, MoneyAccount>
  entries: readonly MoneyLedgerEntry[]
  transactions: readonly MoneyTransaction[]
  usageEvents: readonly MoneyUsageEvent[]
  usageSummaries: ReadonlyMap<string, MoneyCredentialUsageSummary>
}>

export type LedgerOperationResult<T> = Readonly<{ state: LedgerState; result: T }>

export type ProviderAccountCreditApplication = Readonly<{
  account: MoneyAccount
  heldCredit: ExactAmount
  recoveryPayment: ExactAmount
}>

export type GenericChargeResult = MoneyAcceptedCharge | MoneyRefusal

export type BeginTransactionInput = Readonly<{
  transactionRef: string
  kind: EntryType
  idempotencyKey: string
  inputDigest: string
  principalId: string
  accountId?: string
  currency: string
  expectedAccountVersion: number
  now: number
  externalRef?: string
  reversalOf?: string
}>

export type TopupInput = Readonly<{
  transaction: BeginTransactionInput
  accountRef: string
  accountId: string
  amount: ExactAmount
  sourceDigest: string
  evidenceRefs: readonly string[]
}>

export type PaidChargeInput = Readonly<{
  transaction: BeginTransactionInput
  operatorAccountRef: string
  providerAccountRef: string
  rakeAccountRef: string
  grossAmount: ExactAmount
  providerAmount?: ExactAmount
  platformFee?: ExactAmount
  rakeConfig: RakeConfig
  priceDigest: string
  principalId: string
  accountId: string
  credentialId: string
  serviceRef: string
  offeringRef: string
  businessId: string
  invocationRef: string
  attemptRef: string
  operationKey: string
  sourceDigest: string
  evidenceRefs: readonly string[]
  observedAt: number
  freeTier?: boolean
  actionVersion?: string
  paymentBinding?: Readonly<{ approved: PaymentBinding; requested: PaymentBinding }>
}>

export type ChargePlanAccounts = Readonly<{
  operator: MoneyAccount
  provider: MoneyAccount
  rake: MoneyAccount
}>

export type ChargePlan = Readonly<{
  result: ChargeAuthorizationResult
  usage?: MoneyUsageEvent
  transaction?: MoneyTransaction
  entries: readonly MoneyLedgerEntry[]
  accounts?: ChargePlanAccounts
}>

export type PlanPaidChargeInput = PaidChargeInput & Readonly<{
  operator?: MoneyAccount
  provider?: MoneyAccount
  rake?: MoneyAccount
  priorTransaction?: MoneyTransaction
  priorUsage?: MoneyUsageEvent
  priorEntries?: readonly MoneyLedgerEntry[]
}>

export type RefundInput = Readonly<{
  transaction: BeginTransactionInput
  originalTransactionRef: string
  principalId: string
  sourceDigest: string
  evidenceRefs: readonly string[]
  observedAt: number
}>

export type OutcomeUnknownInput = Readonly<{
  transactionRef: string
  principalId: string
  updatedAt: number
}>

export type ReconcileChargeInput = Readonly<{
  transactionRef: string
  principalId: string
  evidence: 'reconciled_not_released' | 'reconciled_released'
  evidenceRefs: readonly string[]
  observedAt: number
  refund: Omit<RefundInput, 'originalTransactionRef' | 'transaction'> & Readonly<{
    transaction: BeginTransactionInput
  }>
}>

export type ChargeBudgetState = 'reserved' | 'settled' | 'released' | 'unknown'

export type ChargeOutcomeUnknownDecision =
  | Readonly<{ kind: 'already_unknown'; transactionRef: string }>
  | Readonly<{ kind: 'mark_unknown'; transactionRef: string }>
  | Readonly<{ kind: 'refused'; code: 'charge_reconciliation_required' }>

export type PayoutAccrualAmounts = Readonly<{
  transactionRef: string
  businessId: string
  currency: string
  exponent: number
  grossAccrual: ExactAmount
  rake: ExactAmount
  providerNet: ExactAmount
}>
