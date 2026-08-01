import { canonicalDigest } from '@/modules/common/canonical-digest'
import type {
  ChargeAuthorizationResult,
  EntryType,
  MoneyAccount,
  MoneyAcceptedCharge,
  MoneyLedgerEntry,
  MoneyRefusal,
  MoneyTransaction,
  MoneyUsageEvent,
  RakeConfig,
} from '../public'
export type { MoneyAccount } from '../public'
import { computeRakeSplit } from './pricing-config'

export type LedgerState = Readonly<{
  accounts: ReadonlyMap<string, MoneyAccount>
  entries: readonly MoneyLedgerEntry[]
  transactions: readonly MoneyTransaction[]
  usageEvents: readonly MoneyUsageEvent[]
}>

export type LedgerOperationResult<T> = Readonly<{
  state: LedgerState
  result: T
}>

export type BeginTransactionInput = Readonly<{
  transactionRef: string
  kind: EntryType
  idempotencyKey: string
  inputDigest: string
  principalId: string
  currency: string
  expectedAccountVersion: number
  now: number
  externalRef?: string
  reversalOf?: string
}>

export type TopupInput = Readonly<{
  transaction: BeginTransactionInput
  accountRef: string
  amountMinor: number
  sourceDigest: string
  evidenceRefs: readonly string[]
}>

export type PaidChargeInput = Readonly<{
  transaction: BeginTransactionInput
  operatorAccountRef: string
  providerAccountRef: string
  rakeAccountRef: string
  grossAmountMinor: number
  rakeConfig: RakeConfig
  priceDigest: string
  principalId: string
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

export type ReleasePayoutInput = Readonly<{
  transaction: BeginTransactionInput
  providerAccountRef: string
  amountMinor: number
  currency: string
  payoutRef: string
  businessId: string
  sourceDigest: string
  evidenceRefs: readonly string[]
  observedAt: number
}>

const emptyAccounts = new Map<string, MoneyAccount>()

export function createLedgerState(accounts: readonly MoneyAccount[] = []): LedgerState {
  const nextAccounts = new Map(emptyAccounts)
  for (const account of accounts) nextAccounts.set(account.accountRef, account)
  return { accounts: nextAccounts, entries: [], transactions: [], usageEvents: [] }
}

export function accountRefForOperator(principalId: string, currency: string): string {
  return `clerk_api_key:${principalId.replace(/^clerk_api_key:/, '')}:${currency}`
}

export function accountRefForProvider(businessId: string, currency: string): string {
  return `business:${businessId}:${currency}`
}

export function accountRefForRake(currency: string): string {
  return `ae:rake:${currency}`
}

export function buildChargeIdempotencyKey(input: Readonly<{ principalId: string; operationKey: string; attemptRef: string; effectGeneration: number }>): string {
  return canonicalDigest({
    principalId: input.principalId,
    operationKey: input.operationKey,
    attemptRef: input.attemptRef,
    effectGeneration: input.effectGeneration,
  })
}

export function beginIdempotentTransaction(input: Readonly<{ state: LedgerState; transaction: BeginTransactionInput }>): LedgerOperationResult<Readonly<{ kind: 'new' } | { kind: 'replay'; transaction: MoneyTransaction } | { kind: 'refused'; refusal: MoneyRefusal }>> {
  const prior = input.state.transactions.find((transaction) => transaction.idempotencyKey === input.transaction.idempotencyKey)
  if (prior !== undefined) {
    if (prior.inputDigest !== input.transaction.inputDigest || prior.principalId !== input.transaction.principalId) {
      return { state: input.state, result: { kind: 'refused', refusal: refusal('ledger_idempotency_conflict', false) } }
    }
    return { state: input.state, result: { kind: 'replay', transaction: prior } }
  }
  return { state: input.state, result: { kind: 'new' } }
}

export function applyTopup(input: TopupInput & Readonly<{ state: LedgerState }>): LedgerOperationResult<ChargeAuthorizationResult> {
  if (!validAmount(input.amountMinor) || input.evidenceRefs.length === 0) {
    return { state: input.state, result: refusalResult('credit_topup_amount_invalid', false) }
  }
  const account = input.state.accounts.get(input.accountRef)
  if (account === undefined || account.accountKind !== 'operator_credit' || account.currency !== input.transaction.currency) {
    return { state: input.state, result: refusalResult('currency_mismatch', false) }
  }
  const begun = beginIdempotentTransaction({ state: input.state, transaction: input.transaction })
  if (begun.result.kind === 'refused') return { state: input.state, result: begun.result.refusal }
  if (begun.result.kind === 'replay') return { state: input.state, result: acceptedTopup(input.transaction.currency, input.amountMinor, input.transaction.inputDigest, input.transaction.transactionRef) }
  const nextTransaction = transactionFrom(input.transaction, 'topup', 'applied')
  const nextEntry = createEntry({
    accountRef: account.accountRef,
    entryType: 'topup',
    direction: 'credit',
    amountMinor: input.amountMinor,
    currency: account.currency,
    transactionRef: input.transaction.transactionRef,
    idempotencyKey: input.transaction.idempotencyKey,
    sourceDigest: input.sourceDigest,
    evidenceRefs: input.evidenceRefs,
    createdAt: input.transaction.now,
    principalId: input.transaction.principalId,
  })
  const nextAccount = updateBalance(account, input.amountMinor, input.transaction.now)
  const nextState = withChanges(input.state, nextAccount, [nextEntry], nextTransaction)
  return { state: nextState, result: acceptedTopup(account.currency, input.amountMinor, input.transaction.inputDigest, input.transaction.transactionRef) }
}

export function authorizePaidCharge(input: PaidChargeInput & Readonly<{ state: LedgerState }>): LedgerOperationResult<ChargeAuthorizationResult> {
  if (input.freeTier === true || input.grossAmountMinor === 0) {
    const usage = createUsage(input, 'free_tier', 0)
    return { state: appendUsage(input.state, usage), result: { kind: 'accepted', chargeState: 'free_tier', currency: input.transaction.currency, amountMinor: 0, priceDigest: input.priceDigest } }
  }
  if (!validAmount(input.grossAmountMinor)) return { state: input.state, result: refusalResult('price_unavailable', false) }
  const split = computeRakeSplit(input.grossAmountMinor, input.rakeConfig)
  if ('kind' in split) return { state: input.state, result: refusalResult(split.code, false) }
  const operator = input.state.accounts.get(input.operatorAccountRef)
  const provider = input.state.accounts.get(input.providerAccountRef)
  const rake = input.state.accounts.get(input.rakeAccountRef)
  if (operator === undefined || provider === undefined || rake === undefined) return { state: input.state, result: refusalResult('billing_identity_missing', false) }
  if (operator.currency !== input.transaction.currency || provider.currency !== input.transaction.currency || rake.currency !== input.transaction.currency) {
    return { state: input.state, result: refusalResult('currency_mismatch', false) }
  }
  const begun = beginIdempotentTransaction({ state: input.state, transaction: input.transaction })
  if (begun.result.kind === 'refused') return { state: input.state, result: begun.result.refusal }
  if (begun.result.kind === 'replay') {
    return {
      state: input.state,
      result: {
        kind: 'accepted',
        chargeState: 'paid',
        currency: input.transaction.currency,
        amountMinor: input.grossAmountMinor,
        priceDigest: input.priceDigest,
        transactionRef: begun.result.transaction.transactionRef,
        providerNetMinor: split.providerNetMinor,
        rakeMinor: split.rakeMinor,
      },
    }
  }
  if (operator.state !== 'active' || operator.balanceMinor < input.grossAmountMinor) {
    const usage = createUsage(input, 'insufficient_credit', input.grossAmountMinor)
    return {
      state: appendUsage(input.state, usage),
      result: refusalResult('insufficient_credit', false, {
        currency: operator.currency,
        requiredAmountMinor: input.grossAmountMinor,
        availableAmountMinor: operator.balanceMinor,
        nextAction: 'credit_topup_required',
      }),
    }
  }
  if (input.transaction.expectedAccountVersion !== operator.version) {
    return { state: input.state, result: refusalResult('ledger_cas_conflict', true) }
  }
  const transaction = transactionFrom(input.transaction, 'charge', 'applied')
  const entries = [
    createEntry({ accountRef: operator.accountRef, entryType: 'charge', direction: 'debit', amountMinor: input.grossAmountMinor, currency: operator.currency, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, principalId: input.principalId, invocationRef: input.invocationRef, attemptRef: input.attemptRef, sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: input.transaction.now }),
    createEntry({ accountRef: provider.accountRef, entryType: 'payout_accrual', direction: 'credit', amountMinor: split.providerNetMinor, currency: provider.currency, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, businessId: input.businessId, invocationRef: input.invocationRef, attemptRef: input.attemptRef, sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: input.transaction.now }),
    createEntry({ accountRef: rake.accountRef, entryType: 'rake', direction: 'credit', amountMinor: split.rakeMinor, currency: rake.currency, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, businessId: input.businessId, sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: input.transaction.now }),
  ]
  const nextOperator = updateBalance(operator, -input.grossAmountMinor, input.transaction.now)
  const nextProvider = updateBalance(provider, split.providerNetMinor, input.transaction.now)
  const nextRake = updateBalance(rake, split.rakeMinor, input.transaction.now)
  const usage = createUsage(input, 'paid', input.grossAmountMinor, transaction.transactionRef)
  const nextState = withChanges(input.state, nextOperator, entries, transaction, [nextProvider, nextRake], usage)
  return {
    state: nextState,
    result: {
      kind: 'accepted',
      chargeState: 'paid',
      currency: input.transaction.currency,
      amountMinor: input.grossAmountMinor,
      priceDigest: input.priceDigest,
      transactionRef: transaction.transactionRef,
      providerNetMinor: split.providerNetMinor,
      rakeMinor: split.rakeMinor,
    },
  }
}

export function appendRefundReversal(input: RefundInput & Readonly<{ state: LedgerState }>): LedgerOperationResult<ChargeAuthorizationResult> {
  const original = input.state.transactions.find((transaction) => transaction.transactionRef === input.originalTransactionRef)
  if (original === undefined || original.principalId !== input.principalId || original.kind !== 'charge') {
    return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  }
  const priorReversal = input.state.transactions.find((transaction) => transaction.reversalOf === input.originalTransactionRef)
  if (priorReversal !== undefined) {
    return { state: input.state, result: acceptedTopup(original.currency, 0, original.inputDigest, priorReversal.transactionRef) }
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
  if (provider.balanceMinor < providerEntry.amountMinor || rake.balanceMinor < rakeEntry.amountMinor) return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  const transaction = transactionFrom(input.transaction, 'refund', 'reversed', original.transactionRef)
  const entries = [
    createEntry({ accountRef: operator.accountRef, entryType: 'refund', direction: 'credit', amountMinor: operatorEntry.amountMinor, currency: operator.currency, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, principalId: input.principalId, sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: input.transaction.now, reversalOf: original.transactionRef }),
    createEntry({ accountRef: provider.accountRef, entryType: 'refund', direction: 'debit', amountMinor: providerEntry.amountMinor, currency: provider.currency, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, ...(provider.businessId === undefined ? {} : { businessId: provider.businessId }), sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: input.transaction.now, reversalOf: original.transactionRef }),
    createEntry({ accountRef: rake.accountRef, entryType: 'refund', direction: 'debit', amountMinor: rakeEntry.amountMinor, currency: rake.currency, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: input.transaction.now, reversalOf: original.transactionRef }),
  ]
  const nextState = withChanges(input.state, updateBalance(operator, operatorEntry.amountMinor, input.transaction.now), entries, transaction, [updateBalance(provider, -providerEntry.amountMinor, input.transaction.now), updateBalance(rake, -rakeEntry.amountMinor, input.transaction.now)], createUsageFromOriginal(input.state, input, original, 'refunded', transaction.transactionRef))
  return { state: nextState, result: acceptedTopup(original.currency, 0, original.inputDigest, transaction.transactionRef) }
}

export function markOutcomeUnknown(input: OutcomeUnknownInput & Readonly<{ state: LedgerState }>): LedgerOperationResult<ChargeAuthorizationResult> {
  const transaction = input.state.transactions.find((entry) => entry.transactionRef === input.transactionRef)
  if (transaction === undefined || transaction.principalId !== input.principalId || transaction.kind !== 'charge') return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  if (transaction.state === 'outcome_unknown') return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  const updated = { ...transaction, state: 'outcome_unknown' as const, updatedAt: input.updatedAt }
  return { state: replaceTransaction(input.state, updated), result: refusalResult('charge_reconciliation_required', false) }
}

export function reconcileCharge(input: ReconcileChargeInput & Readonly<{ state: LedgerState }>): LedgerOperationResult<ChargeAuthorizationResult> {
  const transaction = input.state.transactions.find((entry) => entry.transactionRef === input.transactionRef)
  if (transaction === undefined || transaction.principalId !== input.principalId || transaction.kind !== 'charge') return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  if (input.evidenceRefs.length === 0) return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  if (input.evidence === 'reconciled_released') {
    const updated = transaction.state === 'outcome_unknown' ? { ...transaction, state: 'applied' as const, updatedAt: input.observedAt } : transaction
    return { state: replaceTransaction(input.state, updated), result: { kind: 'accepted', chargeState: 'paid', currency: transaction.currency, amountMinor: 0, priceDigest: transaction.inputDigest, transactionRef: transaction.transactionRef } }
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

export function releasePayoutAccrual(input: ReleasePayoutInput & Readonly<{ state: LedgerState }>): LedgerOperationResult<ChargeAuthorizationResult> {
  if (!validAmount(input.amountMinor) || input.amountMinor === 0) return { state: input.state, result: refusalResult('payout_not_ready', false) }
  const provider = input.state.accounts.get(input.providerAccountRef)
  if (provider === undefined || provider.currency !== input.currency || provider.accountKind !== 'provider_earnings' || provider.businessId !== input.businessId) return { state: input.state, result: refusalResult('currency_mismatch', false) }
  if (provider.balanceMinor < input.amountMinor) return { state: input.state, result: refusalResult('payout_below_threshold', false) }
  const begun = beginIdempotentTransaction({ state: input.state, transaction: input.transaction })
  if (begun.result.kind === 'refused') return { state: input.state, result: begun.result.refusal }
  if (begun.result.kind === 'replay') return { state: input.state, result: acceptedTopup(input.currency, input.amountMinor, input.transaction.inputDigest, begun.result.transaction.transactionRef) }
  const transaction = transactionFrom(input.transaction, 'payout_accrual', 'applied')
  const entry = createEntry({ accountRef: provider.accountRef, entryType: 'payout_accrual', direction: 'debit', amountMinor: input.amountMinor, currency: input.currency, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, businessId: input.businessId, sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: input.observedAt })
  const nextState = withChanges(input.state, updateBalance(provider, -input.amountMinor, input.observedAt), [entry], transaction)
  return { state: nextState, result: acceptedTopup(input.currency, input.amountMinor, input.transaction.inputDigest, transaction.transactionRef) }
}

function refusalResult(code: MoneyRefusal['code'], retryable: boolean, extra: Readonly<{ currency?: string; requiredAmountMinor?: number; availableAmountMinor?: number; nextAction?: 'credit_topup_required' }> = {}): MoneyRefusal {
  return { kind: 'refused', code, retryable, ...extra }
}

function refusal(code: MoneyRefusal['code'], retryable: boolean): MoneyRefusal {
  return refusalResult(code, retryable)
}

function acceptedTopup(currency: string, amountMinor: number, priceDigest: string, transactionRef: string): MoneyAcceptedCharge {
  return { kind: 'accepted', chargeState: 'paid', currency, amountMinor, priceDigest, transactionRef }
}

function validAmount(amountMinor: number): boolean {
  return Number.isSafeInteger(amountMinor) && amountMinor >= 0
}

function transactionFrom(input: BeginTransactionInput, kind: EntryType, state: 'applied' | 'reversed', reversalOf?: string): MoneyTransaction {
  return {
    transactionRef: input.transactionRef,
    kind,
    idempotencyKey: input.idempotencyKey,
    inputDigest: input.inputDigest,
    principalId: input.principalId,
    currency: input.currency,
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

function updateBalance(account: MoneyAccount, delta: number, now: number): MoneyAccount {
  const balanceMinor = account.balanceMinor + delta
  if (!Number.isSafeInteger(balanceMinor) || balanceMinor < 0) throw new Error('money_balance_overflow')
  return { ...account, balanceMinor, version: account.version + 1, updatedAt: now }
}

function createUsage(input: PaidChargeInput, chargeState: MoneyUsageEvent['chargeState'], amountMinor: number, transactionRef?: string): MoneyUsageEvent {
  return {
    usageRef: `${input.invocationRef}:${input.attemptRef}:${input.operationKey}`,
    principalId: input.principalId,
    credentialId: input.credentialId,
    currency: input.transaction.currency,
    serviceRef: input.serviceRef,
    offeringRef: input.offeringRef,
    businessId: input.businessId,
    invocationRef: input.invocationRef,
    attemptRef: input.attemptRef,
    operationKey: input.operationKey,
    priceDigest: input.priceDigest,
    chargeState,
    amountMinor,
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
  return { ...state, usageEvents: [...state.usageEvents, usage] }
}

function replaceTransaction(state: LedgerState, transaction: MoneyTransaction): LedgerState {
  return { ...state, transactions: state.transactions.map((item) => item.transactionRef === transaction.transactionRef ? transaction : item) }
}

function withChanges(state: LedgerState, primaryAccount: MoneyAccount, entries: readonly MoneyLedgerEntry[], transaction: MoneyTransaction, extraAccounts: readonly MoneyAccount[] = [], usage?: MoneyUsageEvent): LedgerState {
  const accounts = new Map(state.accounts)
  accounts.set(primaryAccount.accountRef, primaryAccount)
  for (const account of extraAccounts) accounts.set(account.accountRef, account)
  return {
    accounts,
    entries: [...state.entries, ...entries],
    transactions: [...state.transactions, transaction],
    usageEvents: usage === undefined ? state.usageEvents : appendUsage(state, usage).usageEvents,
  }
}
