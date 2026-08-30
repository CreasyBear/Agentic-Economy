import type {
  EntryType,
  ExactAmount,
  MoneyAccount,
  MoneyAcceptedCharge,
  MoneyLedgerEntry,
  MoneyRefusal,
  MoneyTransaction,
  MoneyUsageEvent,
} from '../../public'
import { accountRefForOwner, accountRefForProvider, accountRefForRake } from '../account-ref'
import {
  sameEvidenceRefs,
  selectChargeEntries,
  validateChargeContract,
  type ChargeContractEntry,
  type SelectedChargeEntries,
  type ValidateChargeContractInput,
} from '../charge-contract'
import {
  addExactAmounts,
  compareExactAmounts,
  exactAmountSchema,
  subtractExactAmounts,
} from '../exact-amount'
import type {
  BeginTransactionInput,
  LedgerOperationResult,
  LedgerState,
  MoneyCredentialUsageSummary,
  PaidChargeInput,
  ProviderAccountCreditApplication,
  RefundInput,
} from './types'

export type HydratedChargeContract = Readonly<{
  original: MoneyTransaction
  usage: MoneyUsageEvent
  entries: SelectedChargeEntries<ChargeContractEntry>
  operator: MoneyAccount
  provider: MoneyAccount
  rake: MoneyAccount
  chargeAmount: ExactAmount
  providerAmount: ExactAmount
  rakeAmount: ExactAmount
}>

type EntryInput = Omit<MoneyLedgerEntry, 'entryRef'> & Readonly<{ entryRef?: string }>
type BeginResult = Readonly<
  | { kind: 'new' }
  | { kind: 'replay'; transaction: MoneyTransaction }
  | { kind: 'refused'; refusal: MoneyRefusal }
>

const emptyAccounts = new Map<string, MoneyAccount>()

export function createLedgerState(accounts: readonly MoneyAccount[] = []): LedgerState {
  const nextAccounts = new Map(emptyAccounts)
  for (const account of accounts) nextAccounts.set(account.accountRef, account)
  return { accounts: nextAccounts, entries: [], transactions: [], usageEvents: [], usageSummaries: new Map() }
}

export function usageSummaryKey(principalId: string, credentialId: string, currency: string): string {
  return `${principalId}\u0000${credentialId}\u0000${currency}`
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
  if (operator === undefined || provider === undefined || rake === undefined) {
    return refusalResult('billing_identity_missing', false)
  }
  if (!accountIdentitiesMatch(input, operator, provider, rake)) {
    return refusalResult('billing_identity_mismatch', false)
  }
  if (!accountCurrenciesMatch(input.currency, operator, provider, rake)) {
    return refusalResult('currency_mismatch', false)
  }
}

function accountIdentitiesMatch(
  input: Readonly<{
    operatorAccountRef: string
    providerAccountRef: string
    rakeAccountRef: string
    accountId: string
    businessId: string
  }>,
  operator: MoneyAccount,
  provider: MoneyAccount,
  rake: MoneyAccount,
): boolean {
  return accountKindsAndOwnersMatch(input, operator, provider, rake)
    && accountRefsMatch(input, operator, provider, rake)
    && accountRefsDistinct(input)
}

function accountKindsAndOwnersMatch(
  input: Readonly<{ accountId: string; businessId: string }>,
  operator: MoneyAccount,
  provider: MoneyAccount,
  rake: MoneyAccount,
): boolean {
  return operator.accountKind === 'operator_credit'
    && provider.accountKind === 'provider_earnings'
    && rake.accountKind === 'ae_rake'
    && operator.accountId === input.accountId
    && operator.businessId === undefined
    && provider.businessId === input.businessId
    && provider.accountId === undefined
    && rake.accountId === undefined
    && rake.businessId === undefined
}

function accountRefsMatch(
  input: Readonly<{ operatorAccountRef: string; providerAccountRef: string; rakeAccountRef: string }>,
  operator: MoneyAccount,
  provider: MoneyAccount,
  rake: MoneyAccount,
): boolean {
  return operator.accountRef === input.operatorAccountRef
    && provider.accountRef === input.providerAccountRef
    && rake.accountRef === input.rakeAccountRef
}

function accountRefsDistinct(input: Readonly<{
  operatorAccountRef: string
  providerAccountRef: string
  rakeAccountRef: string
}>): boolean {
  return input.operatorAccountRef !== input.providerAccountRef
    && input.operatorAccountRef !== input.rakeAccountRef
    && input.providerAccountRef !== input.rakeAccountRef
}

function accountCurrenciesMatch(
  currency: string,
  operator: MoneyAccount,
  provider: MoneyAccount,
  rake: MoneyAccount,
): boolean {
  return operator.balance.currency === currency
    && provider.balance.currency === currency
    && rake.balance.currency === currency
    && provider.balance.exponent === operator.balance.exponent
    && rake.balance.exponent === operator.balance.exponent
}

export function paidChargeContractInput(input: Readonly<{
  transaction: MoneyTransaction
  usage: MoneyUsageEvent
  entries: readonly MoneyLedgerEntry[]
  operatorAccountRef: string
  providerAccountRef: string
  rakeAccountRef: string
}>): ValidateChargeContractInput<MoneyLedgerEntry> {
  return {
    original: {
      transactionRef: input.transaction.transactionRef,
      kind: input.transaction.kind,
      idempotencyKey: input.transaction.idempotencyKey,
      principalId: input.transaction.principalId,
      ...(input.transaction.accountId === undefined ? {} : { accountId: input.transaction.accountId }),
      credentialId: input.usage.credentialId,
      currency: input.transaction.currency,
      exponent: input.transaction.exponent,
      amount: input.usage.amount,
      createdAt: input.transaction.createdAt,
    },
    usage: {
      principalId: input.usage.principalId,
      credentialId: input.usage.credentialId,
      ...(input.usage.accountId === undefined ? {} : { accountId: input.usage.accountId }),
      businessId: input.usage.businessId,
      ...(input.usage.transactionRef === undefined ? {} : { transactionRef: input.usage.transactionRef }),
      chargeState: input.usage.chargeState,
      amount: input.usage.amount,
      observedAt: input.usage.observedAt,
      invocationRef: input.usage.invocationRef,
      attemptRef: input.usage.attemptRef,
    },
    selected: selectChargeEntries(input.entries),
    operator: { accountRef: input.operatorAccountRef },
    provider: { accountRef: input.providerAccountRef },
    rake: { accountRef: input.rakeAccountRef },
  }
}

export function loadChargeContract(
  state: LedgerState,
  original: MoneyTransaction,
  usage: MoneyUsageEvent,
): HydratedChargeContract | undefined {
  const accountId = original.accountId
  if (accountId === undefined) return undefined
  const contract = validateChargeContract(paidChargeContractInput({
    transaction: original,
    usage,
    entries: state.entries.filter((entry) => entry.transactionRef === original.transactionRef),
    operatorAccountRef: accountRefForOwner(accountId, original.currency),
    providerAccountRef: accountRefForProvider(usage.businessId, original.currency),
    rakeAccountRef: accountRefForRake(original.currency),
  }))
  if (contract === undefined) return undefined
  const accounts = hydrateContractAccounts(state, contract, accountId, usage.businessId, original)
  return accounts === undefined ? undefined : { original, usage, entries: contract.selected, ...accounts,
    chargeAmount: contract.chargeAmount, providerAmount: contract.providerAmount, rakeAmount: contract.rakeAmount }
}

function hydrateContractAccounts(
  state: LedgerState,
  contract: ReturnType<typeof validateChargeContract<MoneyLedgerEntry>> & object,
  accountId: string,
  businessId: string,
  original: MoneyTransaction,
): Readonly<{ operator: MoneyAccount; provider: MoneyAccount; rake: MoneyAccount }> | undefined {
  const operator = state.accounts.get(contract.operator.accountRef)
  const provider = state.accounts.get(contract.provider.accountRef)
  const rake = state.accounts.get(contract.rake.accountRef)
  if (operator === undefined || provider === undefined || rake === undefined) return undefined
  if (!contractAccountScalesMatch(original, operator, provider, rake)) return undefined
  const refusal = validateChargeAccounts({ operator, provider, rake,
    operatorAccountRef: contract.operator.accountRef, providerAccountRef: contract.provider.accountRef,
    rakeAccountRef: contract.rake.accountRef, accountId, businessId, currency: original.currency })
  return refusal === undefined ? { operator, provider, rake } : undefined
}

function contractAccountScalesMatch(
  original: MoneyTransaction,
  operator: MoneyAccount,
  provider: MoneyAccount,
  rake: MoneyAccount,
): boolean {
  return operator.balance.currency === original.currency
    && provider.balance.currency === original.currency
    && rake.balance.currency === original.currency
    && operator.balance.exponent === original.exponent
    && provider.balance.exponent === original.exponent
    && rake.balance.exponent === original.exponent
}

export function applyProviderAccountCredit(
  account: MoneyAccount,
  amount: ExactAmount,
  now: number,
): ProviderAccountCreditApplication | undefined {
  if (account.accountKind !== 'provider_earnings' || !validAmount(amount) || !validAmount(account.recoveryDue)) return undefined
  const recovered = compareExactAmounts(amount, account.recoveryDue) === 1 ? account.recoveryDue : amount
  const recoveryDue = subtractExactAmounts(account.recoveryDue, recovered)
  const available = subtractExactAmounts(amount, recovered)
  const balance = available === undefined ? undefined : addExactAmounts(account.balance, available)
  if (recoveryDue === undefined || balance === undefined || available === undefined) return undefined
  return { account: { ...account, balance, recoveryDue, version: account.version + 1, updatedAt: now }, heldCredit: available, recoveryPayment: recovered }
}

export function applyProviderAccountDebit(account: MoneyAccount, amount: ExactAmount, now: number): MoneyAccount | undefined {
  if (account.accountKind !== 'provider_earnings' || !validAmount(amount) || !validAmount(account.recoveryDue)) return undefined
  const heldDebit = compareExactAmounts(amount, account.balance) === 1 ? account.balance : amount
  const balance = subtractExactAmounts(account.balance, heldDebit)
  const shortfall = subtractExactAmounts(amount, heldDebit)
  const recoveryDue = shortfall === undefined ? undefined : addExactAmounts(account.recoveryDue, shortfall)
  return balance === undefined || recoveryDue === undefined
    ? undefined
    : { ...account, balance, recoveryDue, version: account.version + 1, updatedAt: now }
}

export function beginIdempotentTransaction(input: Readonly<{
  state: LedgerState
  transaction: BeginTransactionInput
}>): LedgerOperationResult<BeginResult> {
  const prior = input.state.transactions.find((transaction) => transaction.idempotencyKey === input.transaction.idempotencyKey)
  const result = beginFromPrior(prior, input.transaction)
  return { state: input.state, result }
}

export function beginFromPrior(prior: MoneyTransaction | undefined, transaction: BeginTransactionInput): BeginResult {
  if (prior === undefined) return { kind: 'new' }
  if (prior.inputDigest !== transaction.inputDigest || prior.principalId !== transaction.principalId || prior.kind !== transaction.kind) {
    return { kind: 'refused', refusal: refusalResult('ledger_idempotency_conflict', false) }
  }
  return { kind: 'replay', transaction: prior }
}

export function refusalResult(
  code: MoneyRefusal['code'],
  retryable: boolean,
  extra: Readonly<{
    requiredAmount?: ExactAmount
    availableAmount?: ExactAmount
    nextAction?: 'credit_topup_required'
  }> = {},
): MoneyRefusal {
  return { kind: 'refused', code, retryable, ...extra }
}

export function acceptedCharge(amount: ExactAmount, priceDigest: string, transactionRef: string): MoneyAcceptedCharge {
  return { kind: 'accepted', chargeState: 'paid', amount, priceDigest, transactionRef }
}

export function validAmount(amount: ExactAmount): boolean {
  return exactAmountSchema.safeParse(amount).success
}

export function zeroAmountLike(amount: ExactAmount): ExactAmount {
  return { currency: amount.currency, units: '0', exponent: amount.exponent }
}

export function transactionFrom(
  input: BeginTransactionInput,
  kind: EntryType,
  state: 'applied' | 'reversed',
  exponent: number,
  reversalOf?: string,
): MoneyTransaction {
  return {
    transactionRef: input.transactionRef, kind, idempotencyKey: input.idempotencyKey,
    inputDigest: input.inputDigest, principalId: input.principalId,
    ...(input.accountId === undefined ? {} : { accountId: input.accountId }),
    currency: input.currency, exponent, state, expectedAccountVersion: input.expectedAccountVersion,
    ...(input.externalRef === undefined ? {} : { externalRef: input.externalRef }),
    ...(reversalOf === undefined ? {} : { reversalOf }), createdAt: input.now, updatedAt: input.now,
  }
}

export function createEntry(input: EntryInput): MoneyLedgerEntry {
  const entryRef = input.entryRef ?? `${input.transactionRef}:${input.accountRef}:${input.entryType}:${input.direction}`
  return { ...input, entryRef }
}

export function updateBalance(
  account: MoneyAccount,
  amount: ExactAmount,
  direction: 'credit' | 'debit',
  now: number,
): MoneyAccount {
  const balance = direction === 'credit'
    ? addExactAmounts(account.balance, amount)
    : subtractExactAmounts(account.balance, amount)
  if (balance === undefined) throw new Error('money_balance_overflow')
  return { ...account, balance, version: account.version + 1, updatedAt: now }
}

export function createUsage(
  input: PaidChargeInput,
  chargeState: MoneyUsageEvent['chargeState'],
  amount: ExactAmount,
  transactionRef?: string,
): MoneyUsageEvent {
  return {
    usageRef: `${input.invocationRef}:${input.attemptRef}:${input.operationKey}`,
    principalId: input.principalId, accountId: input.accountId, credentialId: input.credentialId,
    serviceRef: input.serviceRef, offeringRef: input.offeringRef, businessId: input.businessId,
    invocationRef: input.invocationRef, attemptRef: input.attemptRef, operationKey: input.operationKey,
    priceDigest: input.priceDigest, chargeState, amount,
    ...(transactionRef === undefined ? {} : { transactionRef }), observedAt: input.observedAt,
  }
}

export function createUsageFromOriginal(
  state: LedgerState,
  input: RefundInput,
  original: MoneyTransaction,
  chargeState: MoneyUsageEvent['chargeState'],
  transactionRef: string,
): MoneyUsageEvent | undefined {
  const prior = state.usageEvents.find((usage) => usage.transactionRef === original.transactionRef)
  return prior === undefined
    ? undefined
    : { ...prior, usageRef: `${prior.usageRef}:refund`, chargeState, transactionRef }
}

export function appendUsage(state: LedgerState, usage: MoneyUsageEvent): LedgerState {
  if (state.usageEvents.some((item) => item.usageRef === usage.usageRef)) return state
  const key = usageSummaryKey(usage.principalId, usage.credentialId, usage.amount.currency)
  const prior = state.usageSummaries.get(key)
  const grossSpend = nextGrossSpend(prior, usage)
  if (grossSpend === undefined) return state
  const summary = nextUsageSummary(prior, usage, grossSpend)
  const usageSummaries = new Map(state.usageSummaries)
  usageSummaries.set(key, summary)
  return { ...state, usageEvents: [...state.usageEvents, usage], usageSummaries }
}

function nextGrossSpend(
  prior: MoneyCredentialUsageSummary | undefined,
  usage: MoneyUsageEvent,
): ExactAmount | undefined {
  if (usage.chargeState === 'paid') {
    return prior === undefined ? usage.amount : addExactAmounts(prior.grossSpend, usage.amount)
  }
  return prior?.grossSpend ?? zeroAmountLike(usage.amount)
}

function nextUsageSummary(
  prior: MoneyCredentialUsageSummary | undefined,
  usage: MoneyUsageEvent,
  grossSpend: ExactAmount,
): MoneyCredentialUsageSummary {
  const states = prior === undefined || prior.states.includes(usage.chargeState)
    ? prior?.states ?? [usage.chargeState]
    : [...prior.states, usage.chargeState]
  if (prior === undefined) {
    return { principalId: usage.principalId, credentialId: usage.credentialId, callCount: 1,
      paidCallCount: usage.chargeState === 'paid' ? 1 : 0,
      freeCallCount: usage.chargeState === 'free_tier' ? 1 : 0, grossSpend, states }
  }
  return { ...prior, callCount: prior.callCount + 1,
    paidCallCount: prior.paidCallCount + (usage.chargeState === 'paid' ? 1 : 0),
    freeCallCount: prior.freeCallCount + (usage.chargeState === 'free_tier' ? 1 : 0), grossSpend, states }
}

export function replaceTransaction(state: LedgerState, transaction: MoneyTransaction): LedgerState {
  return { ...state, transactions: state.transactions.map((item) =>
    item.transactionRef === transaction.transactionRef ? transaction : item) }
}

export function withChanges(
  state: LedgerState,
  primaryAccount: MoneyAccount,
  entries: readonly MoneyLedgerEntry[],
  transaction: MoneyTransaction,
  extraAccounts: readonly MoneyAccount[] = [],
  usage?: MoneyUsageEvent,
): LedgerState {
  const accounts = new Map(state.accounts)
  accounts.set(primaryAccount.accountRef, primaryAccount)
  for (const account of extraAccounts) accounts.set(account.accountRef, account)
  const usageState = usage === undefined ? state : appendUsage(state, usage)
  return { ...usageState, accounts, entries: [...state.entries, ...entries], transactions: [...state.transactions, transaction] }
}

export { sameEvidenceRefs }
