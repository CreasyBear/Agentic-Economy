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
} from '../public'
export type { MoneyAccount } from '../public'
import { addExactAmounts, compareExactAmounts, exactAmountSchema, rescaleExactAmount, subtractExactAmounts } from './exact-amount'
import { validatePaymentBinding, type PaymentBinding } from './live-money-gate'
import { computeRakeSplit } from './pricing-config'

export type MoneyCredentialUsageSummary = Readonly<KeyUsageView & {
  principalId: string
}>

export type LedgerState = Readonly<{
  accounts: ReadonlyMap<string, MoneyAccount>
  entries: readonly MoneyLedgerEntry[]
  transactions: readonly MoneyTransaction[]
  usageEvents: readonly MoneyUsageEvent[]
  usageSummaries: ReadonlyMap<string, MoneyCredentialUsageSummary>
}>

export type LedgerOperationResult<T> = Readonly<{
  state: LedgerState
  result: T
}>
type GenericChargeResult = MoneyAcceptedCharge | MoneyRefusal

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
  refund: Omit<RefundInput, 'originalTransactionRef' | 'transaction'> & Readonly<{ transaction: BeginTransactionInput }>
}>


const emptyAccounts = new Map<string, MoneyAccount>()

export function createLedgerState(accounts: readonly MoneyAccount[] = []): LedgerState {
  const nextAccounts = new Map(emptyAccounts)
  for (const account of accounts) nextAccounts.set(account.accountRef, account)
  return { accounts: nextAccounts, entries: [], transactions: [], usageEvents: [], usageSummaries: new Map() }
}

export function usageSummaryKey(principalId: string, credentialId: string, currency: string): string {
  return `${principalId}\u0000${credentialId}\u0000${currency}`
}

export function accountRefForOwner(ownerId: string, currency: string): string {
  return `owner:${ownerId}:${currency}`
}

/** Names pre-re-key per-key wallet rows for detection only; do not create or debit accounts with it. */
export function legacyPerKeyAccountRef(principalId: string, currency: string): string {
  return `clerk_api_key:${principalId.replace(/^clerk_api_key:/, '')}:${currency}`
}

export function accountRefForProvider(businessId: string, currency: string): string {
  return `business:${businessId}:${currency}`
}

export function accountRefForRake(currency: string): string {
  return `ae:rake:${currency}`
}

export function validateChargeAccounts(input: Readonly<{
  operator: MoneyAccount | undefined
  provider: MoneyAccount | undefined
  rake: MoneyAccount | undefined
  operatorAccountRef: string
  providerAccountRef: string
  rakeAccountRef: string
  accountId: string
  businessId: string
  currency: string
}>): MoneyRefusal | undefined {
  const { operator, provider, rake } = input
  if (operator === undefined || provider === undefined || rake === undefined) return refusalResult('billing_identity_missing', false)
  if (
    operator.accountKind !== 'operator_credit'
    || provider.accountKind !== 'provider_earnings'
    || rake.accountKind !== 'ae_rake'
    || operator.accountId !== input.accountId
    || operator.businessId !== undefined
    || provider.businessId !== input.businessId
    || provider.accountId !== undefined
    || rake.accountId !== undefined
    || rake.businessId !== undefined
    || operator.accountRef !== input.operatorAccountRef
    || provider.accountRef !== input.providerAccountRef
    || rake.accountRef !== input.rakeAccountRef
    || input.operatorAccountRef === input.providerAccountRef
    || input.operatorAccountRef === input.rakeAccountRef
    || input.providerAccountRef === input.rakeAccountRef
  ) return refusalResult('billing_identity_mismatch', false)
  if (operator.balance.currency !== input.currency || provider.balance.currency !== input.currency || rake.balance.currency !== input.currency) return refusalResult('currency_mismatch', false)
  if (provider.balance.exponent !== operator.balance.exponent || rake.balance.exponent !== operator.balance.exponent) return refusalResult('currency_mismatch', false)
}

export function beginIdempotentTransaction(input: Readonly<{ state: LedgerState; transaction: BeginTransactionInput }>): LedgerOperationResult<Readonly<{ kind: 'new' } | { kind: 'replay'; transaction: MoneyTransaction } | { kind: 'refused'; refusal: MoneyRefusal }>> {
  const prior = input.state.transactions.find((transaction) => transaction.idempotencyKey === input.transaction.idempotencyKey)
  if (prior !== undefined) {
    if (prior.inputDigest !== input.transaction.inputDigest || prior.principalId !== input.transaction.principalId || prior.kind !== input.transaction.kind) {
      return { state: input.state, result: { kind: 'refused', refusal: refusal('ledger_idempotency_conflict', false) } }
    }
    return { state: input.state, result: { kind: 'replay', transaction: prior } }
  }
  return { state: input.state, result: { kind: 'new' } }
}
export function applyTopup(input: TopupInput & Readonly<{ state: LedgerState }>): LedgerOperationResult<GenericChargeResult> {
  if (!validAmount(input.amount) || input.evidenceRefs.length === 0 || input.amount.currency !== input.transaction.currency) {
    return { state: input.state, result: refusalResult('credit_topup_amount_invalid', false) }
  }
  const account = input.state.accounts.get(input.accountRef)
  if (account === undefined || account.accountKind !== 'operator_credit' || account.balance.currency !== input.amount.currency) {
    return { state: input.state, result: refusalResult('currency_mismatch', false) }
  }
  if (account.accountId !== input.accountId) return { state: input.state, result: refusalResult('billing_identity_mismatch', false) }
  const amount = rescaleExactAmount(input.amount, account.balance.exponent)
  if (amount === undefined) return { state: input.state, result: refusalResult('currency_mismatch', false) }
  const begun = beginIdempotentTransaction({ state: input.state, transaction: input.transaction })
  if (begun.result.kind === 'refused') return { state: input.state, result: begun.result.refusal }
  if (begun.result.kind === 'replay') return { state: input.state, result: acceptedCharge(amount, input.transaction.inputDigest, input.transaction.transactionRef) }
  const nextTransaction = transactionFrom(input.transaction, 'topup', 'applied', amount.exponent)
  const nextEntry = createEntry({
    accountRef: account.accountRef,
    entryType: 'topup',
    direction: 'credit',
    amount,
    transactionRef: input.transaction.transactionRef,
    idempotencyKey: input.transaction.idempotencyKey,
    sourceDigest: input.sourceDigest,
    evidenceRefs: input.evidenceRefs,
    createdAt: input.transaction.now,
    principalId: input.transaction.principalId,
  })
  const nextAccount = updateBalance(account, amount, 'credit', input.transaction.now)
  const nextState = withChanges(input.state, nextAccount, [nextEntry], nextTransaction)
  return { state: nextState, result: acceptedCharge(amount, input.transaction.inputDigest, input.transaction.transactionRef) }
}

export function authorizePaidCharge(input: PaidChargeInput & Readonly<{ state: LedgerState }>): LedgerOperationResult<ChargeAuthorizationResult> {
  if (input.principalId !== input.transaction.principalId) return { state: input.state, result: refusalResult('billing_identity_mismatch', false) }
  if (!validAmount(input.grossAmount)) return { state: input.state, result: refusalResult('rake_not_configured', false) }
  if (input.paymentBinding !== undefined) {
    const requestedBinding: PaymentBinding = {
      ...input.paymentBinding.requested,
      amount: input.grossAmount,
      providerRef: input.providerAccountRef,
      idempotencyKey: input.transaction.idempotencyKey,
      ...(input.actionVersion === undefined ? {} : { actionVersion: input.actionVersion }),
    }
    const binding = validatePaymentBinding({ approved: input.paymentBinding.approved, requested: requestedBinding, now: input.observedAt })
    if (binding.kind === 'refused') return { state: input.state, result: binding }
  }
  const operator = input.state.accounts.get(input.operatorAccountRef)
  const provider = input.state.accounts.get(input.providerAccountRef)
  const rake = input.state.accounts.get(input.rakeAccountRef)
  const accountRefusal = validateChargeAccounts({
    operator,
    provider,
    rake,
    operatorAccountRef: input.operatorAccountRef,
    providerAccountRef: input.providerAccountRef,
    rakeAccountRef: input.rakeAccountRef,
    accountId: input.accountId,
    businessId: input.businessId,
    currency: input.transaction.currency,
  })
  if (accountRefusal !== undefined) return { state: input.state, result: accountRefusal }
  if (operator === undefined || provider === undefined || rake === undefined) {
    return { state: input.state, result: refusalResult('billing_identity_missing', false) }
  }
  if (input.grossAmount.currency !== input.transaction.currency || provider.balance.exponent !== operator.balance.exponent || rake.balance.exponent !== operator.balance.exponent) {
    return { state: input.state, result: refusalResult('currency_mismatch', false) }
  }
  const grossAmount = rescaleExactAmount(input.grossAmount, operator.balance.exponent)
  if (grossAmount === undefined) return { state: input.state, result: refusalResult('currency_mismatch', false) }
  const usageRef = `${input.invocationRef}:${input.attemptRef}:${input.operationKey}`
  const begun = beginIdempotentTransaction({ state: input.state, transaction: input.transaction })
  if (begun.result.kind === 'refused') return { state: input.state, result: begun.result.refusal }
  if (input.freeTier === true || grossAmount.units === '0') {
    const priorUsage = input.state.usageEvents.find((usage) => usage.usageRef === usageRef)
    if (priorUsage !== undefined) {
      if (priorUsage.chargeState !== 'free_tier' || compareExactAmounts(priorUsage.amount, zeroAmountLike(grossAmount)) !== 0 || priorUsage.priceDigest !== input.priceDigest) {
        return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
      }
      return {
        state: input.state,
        result: {
          kind: 'accepted',
          chargeState: 'free_tier',
          amount: priorUsage.amount,
          priceDigest: priorUsage.priceDigest,
          usageRef: priorUsage.usageRef,
          observedAt: priorUsage.observedAt,
          ...(priorUsage.transactionRef === undefined ? {} : { transactionRef: priorUsage.transactionRef }),
        },
      }
    }
    const usage = createUsage(input, 'free_tier', zeroAmountLike(grossAmount))
    const nextState = appendUsage(input.state, usage)
    const persistedUsage = nextState.usageEvents.find((item) => item.usageRef === usageRef)
    if (persistedUsage === undefined) return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
    return {
      state: nextState,
      result: {
        kind: 'accepted',
        chargeState: 'free_tier',
        amount: persistedUsage.amount,
        priceDigest: persistedUsage.priceDigest,
        usageRef: persistedUsage.usageRef,
        observedAt: persistedUsage.observedAt,
        ...(persistedUsage.transactionRef === undefined ? {} : { transactionRef: persistedUsage.transactionRef }),
      },
    }
  }
  const split = computeRakeSplit(grossAmount, input.rakeConfig)
  if ('kind' in split) return { state: input.state, result: refusalResult(split.code, false) }
  if (begun.result.kind === 'replay') {
    const priorUsage = input.state.usageEvents.find((usage) => usage.usageRef === usageRef)
    if (priorUsage === undefined || priorUsage.chargeState !== 'paid' || compareExactAmounts(priorUsage.amount, grossAmount) !== 0 || priorUsage.priceDigest !== input.priceDigest || priorUsage.transactionRef !== begun.result.transaction.transactionRef) {
      return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
    }
    return {
      state: input.state,
      result: {
        kind: 'accepted',
        chargeState: 'paid',
        amount: priorUsage.amount,
        priceDigest: priorUsage.priceDigest,
        usageRef: priorUsage.usageRef,
        observedAt: priorUsage.observedAt,
        ...(priorUsage.transactionRef === undefined ? {} : { transactionRef: priorUsage.transactionRef }),
        providerNet: split.providerNet,
        rake: split.rake,
      },
    }
  }
  if (operator.state !== 'active' || compareExactAmounts(operator.balance, grossAmount) === -1) {
    const usage = createUsage(input, 'insufficient_credit', grossAmount)
    return {
      state: appendUsage(input.state, usage),
      result: refusalResult('insufficient_credit', false, {
        requiredAmount: grossAmount,
        availableAmount: operator.balance,
        nextAction: 'credit_topup_required',
      }),
    }
  }
  if (input.transaction.expectedAccountVersion !== operator.version) {
    return { state: input.state, result: refusalResult('ledger_cas_conflict', true) }
  }
  const transaction = transactionFrom(input.transaction, 'charge', 'applied', grossAmount.exponent)
  const entries = [
    createEntry({ accountRef: operator.accountRef, entryType: 'charge', direction: 'debit', amount: grossAmount, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, principalId: input.principalId, invocationRef: input.invocationRef, attemptRef: input.attemptRef, sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: input.transaction.now }),
    createEntry({ accountRef: provider.accountRef, entryType: 'payout_accrual', direction: 'credit', amount: split.providerNet, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, businessId: input.businessId, invocationRef: input.invocationRef, attemptRef: input.attemptRef, sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: input.transaction.now }),
    createEntry({ accountRef: rake.accountRef, entryType: 'rake', direction: 'credit', amount: split.rake, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, businessId: input.businessId, sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: input.transaction.now }),
  ]
  const nextOperator = updateBalance(operator, grossAmount, 'debit', input.transaction.now)
  const nextProvider = updateBalance(provider, split.providerNet, 'credit', input.transaction.now)
  const nextRake = updateBalance(rake, split.rake, 'credit', input.transaction.now)
  const usage = createUsage(input, 'paid', grossAmount, transaction.transactionRef)
  const nextState = withChanges(input.state, nextOperator, entries, transaction, [nextProvider, nextRake], usage)
  return {
    state: nextState,
    result: {
      kind: 'accepted',
      chargeState: 'paid',
      amount: usage.amount,
      priceDigest: usage.priceDigest,
      usageRef: usage.usageRef,
      observedAt: usage.observedAt,
      transactionRef: transaction.transactionRef,
      providerNet: split.providerNet,
      rake: split.rake,
    },
  }
}

export function appendRefundReversal(input: RefundInput & Readonly<{ state: LedgerState }>): LedgerOperationResult<GenericChargeResult> {
  const original = input.state.transactions.find((transaction) => transaction.transactionRef === input.originalTransactionRef)
  if (original === undefined || original.principalId !== input.principalId || original.kind !== 'charge' || (original.state !== 'applied' && original.state !== 'outcome_unknown')) {
    return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  }
  const priorReversal = input.state.transactions.find((transaction) => transaction.reversalOf === input.originalTransactionRef)
  if (priorReversal !== undefined) {
    return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  }
  const originalEntries = input.state.entries.filter((entry) => entry.transactionRef === original.transactionRef)
  if (originalEntries.length !== 3) return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  const operatorEntry = originalEntries.find((entry) => entry.entryType === 'charge')
  const providerEntry = originalEntries.find((entry) => entry.entryType === 'payout_accrual')
  const rakeEntry = originalEntries.find((entry) => entry.entryType === 'rake')
  if (operatorEntry === undefined || providerEntry === undefined || rakeEntry === undefined) return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  const operator = input.state.accounts.get(operatorEntry.accountRef)
  const provider = input.state.accounts.get(providerEntry.accountRef)
  const rake = input.state.accounts.get(rakeEntry.accountRef)
  if (operator === undefined || provider === undefined || rake === undefined) return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  if (input.transaction.currency !== operatorEntry.amount.currency || provider.balance.currency !== operator.balance.currency || rake.balance.currency !== operator.balance.currency || provider.balance.exponent !== operator.balance.exponent || rake.balance.exponent !== operator.balance.exponent) return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  const operatorAmount = rescaleExactAmount(operatorEntry.amount, operator.balance.exponent)
  const providerAmount = rescaleExactAmount(providerEntry.amount, operator.balance.exponent)
  const rakeAmount = rescaleExactAmount(rakeEntry.amount, operator.balance.exponent)
  if (operatorAmount === undefined || providerAmount === undefined || rakeAmount === undefined) return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  const nextOperatorBalance = addExactAmounts(operator.balance, operatorAmount)
  const nextProviderBalance = subtractExactAmounts(provider.balance, providerAmount)
  const nextRakeBalance = subtractExactAmounts(rake.balance, rakeAmount)
  if (nextOperatorBalance === undefined || nextProviderBalance === undefined || nextRakeBalance === undefined) return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  const transaction = transactionFrom(input.transaction, 'refund', 'reversed', operatorAmount.exponent, original.transactionRef)
  const entries = [
    createEntry({ accountRef: operator.accountRef, entryType: 'refund', direction: 'credit', amount: operatorAmount, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, principalId: input.principalId, sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: input.transaction.now, reversalOf: original.transactionRef }),
    createEntry({ accountRef: provider.accountRef, entryType: 'refund', direction: 'debit', amount: providerAmount, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, ...(provider.businessId === undefined ? {} : { businessId: provider.businessId }), sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: input.transaction.now, reversalOf: original.transactionRef }),
    createEntry({ accountRef: rake.accountRef, entryType: 'refund', direction: 'debit', amount: rakeAmount, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: input.transaction.now, reversalOf: original.transactionRef }),
  ]
  const nextState = withChanges(input.state, updateBalance(operator, operatorAmount, 'credit', input.transaction.now), entries, transaction, [updateBalance(provider, providerAmount, 'debit', input.transaction.now), updateBalance(rake, rakeAmount, 'debit', input.transaction.now)], createUsageFromOriginal(input.state, input, original, 'refunded', transaction.transactionRef))
  return { state: nextState, result: acceptedCharge(zeroAmountLike(operatorAmount), original.inputDigest, transaction.transactionRef) }
}

export function markOutcomeUnknown(input: OutcomeUnknownInput & Readonly<{ state: LedgerState }>): LedgerOperationResult<ChargeAuthorizationResult> {
  const transaction = input.state.transactions.find((entry) => entry.transactionRef === input.transactionRef)
  if (transaction === undefined || transaction.principalId !== input.principalId || transaction.kind !== 'charge') return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  if (transaction.state !== 'applied' && transaction.state !== 'pending') return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  const updated = { ...transaction, state: 'outcome_unknown' as const, updatedAt: input.updatedAt }
  return { state: replaceTransaction(input.state, updated), result: refusalResult('charge_reconciliation_required', false) }
}

export function reconcileCharge(input: ReconcileChargeInput & Readonly<{ state: LedgerState }>): LedgerOperationResult<GenericChargeResult> {
  const transaction = input.state.transactions.find((entry) => entry.transactionRef === input.transactionRef)
  if (transaction === undefined || transaction.principalId !== input.principalId || transaction.kind !== 'charge') return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  if (transaction.state === 'reversed') return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  if (input.evidenceRefs.length === 0) return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  if (input.evidence === 'reconciled_released') {
    const updated = transaction.state === 'outcome_unknown' ? { ...transaction, state: 'applied' as const, updatedAt: input.observedAt } : transaction
    const entry = input.state.entries.find((item) => item.transactionRef === transaction.transactionRef)
    if (entry === undefined) return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
    return { state: replaceTransaction(input.state, updated), result: acceptedCharge(zeroAmountLike(entry.amount), transaction.inputDigest, transaction.transactionRef) }
  }
  const reversal = appendRefundReversal({
    ...input.refund,
    state: input.state,
    originalTransactionRef: input.transactionRef,
    observedAt: input.observedAt,
  })
  if (reversal.result.kind === 'refused') return reversal
  return reversal
}


function refusalResult(code: MoneyRefusal['code'], retryable: boolean, extra: Readonly<{ requiredAmount?: ExactAmount; availableAmount?: ExactAmount; nextAction?: 'credit_topup_required' }> = {}): MoneyRefusal {
  return { kind: 'refused', code, retryable, ...extra }
}

function refusal(code: MoneyRefusal['code'], retryable: boolean): MoneyRefusal {
  return refusalResult(code, retryable)
}

function acceptedCharge(amount: ExactAmount, priceDigest: string, transactionRef: string): MoneyAcceptedCharge {
  return { kind: 'accepted', chargeState: 'paid', amount, priceDigest, transactionRef }
}

function validAmount(amount: ExactAmount): boolean {
  return exactAmountSchema.safeParse(amount).success
}


function zeroAmountLike(amount: ExactAmount): ExactAmount {
  return { currency: amount.currency, units: '0', exponent: amount.exponent }
}

function transactionFrom(input: BeginTransactionInput, kind: EntryType, state: 'applied' | 'reversed', exponent: number, reversalOf?: string): MoneyTransaction {
  return {
    transactionRef: input.transactionRef,
    kind,
    idempotencyKey: input.idempotencyKey,
    inputDigest: input.inputDigest,
    principalId: input.principalId,
    ...(input.accountId === undefined ? {} : { accountId: input.accountId }),
    currency: input.currency,
    exponent,
    state,
    expectedAccountVersion: input.expectedAccountVersion,
    ...(input.externalRef === undefined ? {} : { externalRef: input.externalRef }),
    ...(reversalOf === undefined ? {} : { reversalOf }),
    createdAt: input.now,
    updatedAt: input.now,
  }
}

type EntryInput = Omit<MoneyLedgerEntry, 'entryRef'> & Readonly<{ entryRef?: string }>

function createEntry(input: EntryInput): MoneyLedgerEntry {
  const entryRef = input.entryRef ?? `${input.transactionRef}:${input.accountRef}:${input.entryType}:${input.direction}`
  return { ...input, entryRef }
}

function updateBalance(account: MoneyAccount, amount: ExactAmount, direction: 'credit' | 'debit', now: number): MoneyAccount {
  const balance = direction === 'credit' ? addExactAmounts(account.balance, amount) : subtractExactAmounts(account.balance, amount)
  if (balance === undefined) throw new Error('money_balance_overflow')
  return { ...account, balance, version: account.version + 1, updatedAt: now }
}

function createUsage(input: PaidChargeInput, chargeState: MoneyUsageEvent['chargeState'], amount: ExactAmount, transactionRef?: string): MoneyUsageEvent {
  return {
    usageRef: `${input.invocationRef}:${input.attemptRef}:${input.operationKey}`,
    principalId: input.principalId,
    accountId: input.accountId,
    credentialId: input.credentialId,
    serviceRef: input.serviceRef,
    offeringRef: input.offeringRef,
    businessId: input.businessId,
    invocationRef: input.invocationRef,
    attemptRef: input.attemptRef,
    operationKey: input.operationKey,
    priceDigest: input.priceDigest,
    chargeState,
    amount,
    ...(transactionRef === undefined ? {} : { transactionRef }),
    observedAt: input.observedAt,
  }
}

function createUsageFromOriginal(state: LedgerState, input: RefundInput, original: MoneyTransaction, chargeState: MoneyUsageEvent['chargeState'], transactionRef: string): MoneyUsageEvent | undefined {
  const prior = state.usageEvents.find((usage: MoneyUsageEvent) => usage.transactionRef === original.transactionRef)
  if (prior === undefined) return undefined
  return { ...prior, usageRef: `${prior.usageRef}:refund`, chargeState, transactionRef }
}

function appendUsage(state: LedgerState, usage: MoneyUsageEvent): LedgerState {
  if (state.usageEvents.some((item) => item.usageRef === usage.usageRef)) return state
  const key = usageSummaryKey(usage.principalId, usage.credentialId, usage.amount.currency)
  const prior = state.usageSummaries.get(key)
  const states = prior === undefined || prior.states.includes(usage.chargeState) ? prior?.states ?? [usage.chargeState] : [...prior.states, usage.chargeState]
  const grossSpend = usage.chargeState === 'paid'
    ? prior === undefined ? usage.amount : addExactAmounts(prior.grossSpend, usage.amount)
    : prior?.grossSpend ?? zeroAmountLike(usage.amount)
  if (grossSpend === undefined) return state
  const summary: MoneyCredentialUsageSummary = prior === undefined
    ? { principalId: usage.principalId, credentialId: usage.credentialId, callCount: 1, paidCallCount: usage.chargeState === 'paid' ? 1 : 0, freeCallCount: usage.chargeState === 'free_tier' ? 1 : 0, grossSpend, states }
    : { ...prior, callCount: prior.callCount + 1, paidCallCount: prior.paidCallCount + (usage.chargeState === 'paid' ? 1 : 0), freeCallCount: prior.freeCallCount + (usage.chargeState === 'free_tier' ? 1 : 0), grossSpend, states }
  const usageSummaries = new Map(state.usageSummaries)
  usageSummaries.set(key, summary)
  return { ...state, usageEvents: [...state.usageEvents, usage], usageSummaries }
}

function replaceTransaction(state: LedgerState, transaction: MoneyTransaction): LedgerState {
  return { ...state, transactions: state.transactions.map((item) => item.transactionRef === transaction.transactionRef ? transaction : item) }
}

function withChanges(state: LedgerState, primaryAccount: MoneyAccount, entries: readonly MoneyLedgerEntry[], transaction: MoneyTransaction, extraAccounts: readonly MoneyAccount[] = [], usage?: MoneyUsageEvent): LedgerState {
  const accounts = new Map(state.accounts)
  accounts.set(primaryAccount.accountRef, primaryAccount)
  for (const account of extraAccounts) accounts.set(account.accountRef, account)
  const usageState = usage === undefined ? state : appendUsage(state, usage)
  return {
    ...usageState,
    accounts,
    entries: [...state.entries, ...entries],
    transactions: [...state.transactions, transaction],
  }
}
