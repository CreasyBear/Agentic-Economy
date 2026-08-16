import type {
  ChargeAuthorizationResult,
  EntryType,
  ExactAmount,
  KeyUsageView,
  MoneyAccount,
  MoneyAcceptedCharge,
  MoneyChargeOutcomeUnknown,
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
export type ProviderAccountCreditApplication = Readonly<{
  account: MoneyAccount
  heldCredit: ExactAmount
  recoveryPayment: ExactAmount
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
function sameEvidenceRefs(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((ref, index) => ref === right[index])
}
type SelectedRefundEntries = Readonly<{
  operator: MoneyLedgerEntry
  provider: MoneyLedgerEntry
  rake: MoneyLedgerEntry
}>

function selectRefundEntries(entries: readonly MoneyLedgerEntry[], transactionRef: string): SelectedRefundEntries | undefined {
  if (entries.length !== 3) return undefined
  const byRef = new Map<string, MoneyLedgerEntry>()
  for (const entry of entries) byRef.set(entry.entryRef, entry)
  const operator = byRef.get(`${transactionRef}:operator`)
  const provider = byRef.get(`${transactionRef}:provider`)
  const rake = byRef.get(`${transactionRef}:rake`)
  if (byRef.size !== entries.length || operator === undefined || provider === undefined || rake === undefined) return undefined
  return { operator, provider, rake }
}


type SelectedChargeEntries = Readonly<{
  charge: MoneyLedgerEntry
  provider: MoneyLedgerEntry
  rake: MoneyLedgerEntry
  recovery?: MoneyLedgerEntry
}>

function selectChargeEntries(entries: readonly MoneyLedgerEntry[]): SelectedChargeEntries | undefined {
  if (entries.length !== 3 && entries.length !== 4) return undefined
  const charges = entries.filter((entry) => entry.entryType === 'charge' && entry.direction === 'debit')
  const providers = entries.filter((entry) => entry.entryType === 'payout_accrual' && entry.direction === 'credit')
  const rakes = entries.filter((entry) => entry.entryType === 'rake' && entry.direction === 'credit')
  const recoveries = entries.filter((entry) => entry.entryType === 'payout_accrual' && entry.direction === 'debit')
  if (charges.length !== 1 || providers.length !== 1 || rakes.length !== 1 || recoveries.length > 1 || entries.length !== 3 + recoveries.length) return undefined
  const charge = charges[0]
  const provider = providers[0]
  const rake = rakes[0]
  if (charge === undefined || provider === undefined || rake === undefined) return undefined
  return { charge, provider, rake, ...(recoveries[0] === undefined ? {} : { recovery: recoveries[0] }) }
}

type ValidatedChargeContract = Readonly<{
  original: MoneyTransaction
  usage: MoneyUsageEvent
  entries: SelectedChargeEntries
  operator: MoneyAccount
  provider: MoneyAccount
  rake: MoneyAccount
  chargeAmount: ExactAmount
  providerAmount: ExactAmount
  rakeAmount: ExactAmount
}>

function validateChargeContract(state: LedgerState, original: MoneyTransaction, usage: MoneyUsageEvent): ValidatedChargeContract | undefined {
  if (
    original.kind !== 'charge'
    || original.idempotencyKey !== original.transactionRef
    || usage.chargeState !== 'paid'
    || original.currency !== usage.amount.currency
    || original.accountId === undefined
    || usage.accountId === undefined
    || original.accountId !== usage.accountId
    || original.principalId !== usage.principalId
    || original.exponent !== usage.amount.exponent
    || usage.observedAt !== original.createdAt
    || !validAmount(usage.amount)
  ) return undefined
  const selected = selectChargeEntries(state.entries.filter((entry) => entry.transactionRef === original.transactionRef))
  if (selected === undefined) return undefined
  const chargeAmount = selected.charge.amount
  const providerAmount = selected.provider.amount
  const rakeAmount = selected.rake.amount
  if (
    selected.charge.entryRef !== `${original.transactionRef}:charge`
    || selected.provider.entryRef !== `${original.transactionRef}:provider`
    || selected.rake.entryRef !== `${original.transactionRef}:rake`
    || selected.charge.accountRef !== accountRefForOwner(original.accountId, original.currency)
    || selected.provider.accountRef !== accountRefForProvider(usage.businessId, original.currency)
    || selected.rake.accountRef !== accountRefForRake(original.currency)
    || selected.charge.transactionRef !== original.transactionRef
    || selected.provider.transactionRef !== original.transactionRef
    || selected.rake.transactionRef !== original.transactionRef
    || selected.charge.idempotencyKey !== original.idempotencyKey
    || selected.provider.idempotencyKey !== original.idempotencyKey
    || selected.rake.idempotencyKey !== original.idempotencyKey
    || selected.charge.sourceDigest !== selected.provider.sourceDigest
    || selected.charge.sourceDigest !== selected.rake.sourceDigest
    || !sameEvidenceRefs(selected.charge.evidenceRefs, selected.provider.evidenceRefs)
    || !sameEvidenceRefs(selected.charge.evidenceRefs, selected.rake.evidenceRefs)
    || selected.charge.createdAt !== original.createdAt
    || selected.provider.createdAt !== original.createdAt
    || selected.rake.createdAt !== original.createdAt
    || selected.charge.principalId !== original.principalId
    || selected.charge.businessId !== undefined
    || selected.charge.reversalOf !== undefined
    || selected.charge.invocationRef !== usage.invocationRef
    || selected.charge.attemptRef !== usage.attemptRef
    || selected.provider.businessId !== usage.businessId
    || selected.provider.principalId !== undefined
    || selected.provider.reversalOf !== undefined
    || selected.provider.invocationRef !== usage.invocationRef
    || selected.provider.attemptRef !== usage.attemptRef
    || selected.rake.businessId !== usage.businessId
    || selected.rake.principalId !== undefined
    || selected.rake.invocationRef !== undefined
    || selected.rake.attemptRef !== undefined
    || selected.rake.reversalOf !== undefined
    || compareExactAmounts(chargeAmount, usage.amount) !== 0
    || chargeAmount.currency !== original.currency
    || providerAmount.currency !== original.currency
    || rakeAmount.currency !== original.currency
    || chargeAmount.exponent !== original.exponent
    || providerAmount.exponent !== original.exponent
    || rakeAmount.exponent !== original.exponent
    || compareExactAmounts(providerAmount, rakeAmount) === undefined
    || compareExactAmounts(addExactAmounts(providerAmount, rakeAmount), chargeAmount) !== 0
  ) return undefined
  if (selected.recovery !== undefined) {
    if (
      selected.recovery.entryRef !== `${original.transactionRef}:provider-recovery`
      || selected.recovery.accountRef !== selected.provider.accountRef
      || selected.recovery.entryType !== 'payout_accrual'
      || selected.recovery.direction !== 'debit'
      || selected.recovery.businessId !== usage.businessId
      || selected.recovery.principalId !== undefined
      || selected.recovery.invocationRef !== usage.invocationRef
      || selected.recovery.attemptRef !== usage.attemptRef
      || selected.recovery.reversalOf !== undefined
      || selected.recovery.transactionRef !== original.transactionRef
      || selected.recovery.idempotencyKey !== original.idempotencyKey
      || selected.recovery.sourceDigest !== selected.charge.sourceDigest
      || !sameEvidenceRefs(selected.recovery.evidenceRefs, selected.charge.evidenceRefs)
      || selected.recovery.createdAt !== original.createdAt
      || selected.recovery.amount.currency !== providerAmount.currency
      || selected.recovery.amount.exponent !== providerAmount.exponent
      || compareExactAmounts(selected.recovery.amount, providerAmount) === 1
    ) return undefined
  }
  const operator = state.accounts.get(selected.charge.accountRef)
  const provider = state.accounts.get(selected.provider.accountRef)
  const rake = state.accounts.get(selected.rake.accountRef)
  if (
    operator === undefined
    || provider === undefined
    || rake === undefined
    || operator.balance.currency !== original.currency
    || provider.balance.currency !== original.currency
    || rake.balance.currency !== original.currency
    || operator.balance.exponent !== original.exponent
    || provider.balance.exponent !== original.exponent
    || rake.balance.exponent !== original.exponent
    || validateChargeAccounts({
      operator,
      provider,
      rake,
      operatorAccountRef: accountRefForOwner(original.accountId, original.currency),
      providerAccountRef: accountRefForProvider(usage.businessId, original.currency),
      rakeAccountRef: accountRefForRake(original.currency),
      accountId: original.accountId,
      businessId: usage.businessId,
      currency: original.currency,
    }) !== undefined
  ) return undefined
  return { original, usage, entries: selected, operator, provider, rake, chargeAmount, providerAmount, rakeAmount }
}

export function applyProviderAccountCredit(account: MoneyAccount, amount: ExactAmount, now: number): ProviderAccountCreditApplication | undefined {
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
  return balance === undefined || recoveryDue === undefined ? undefined : { ...account, balance, recoveryDue, version: account.version + 1, updatedAt: now }
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
    if (
      priorUsage === undefined
      || priorUsage.chargeState !== 'paid'
      || priorUsage.accountId !== input.accountId
      || compareExactAmounts(priorUsage.amount, grossAmount) !== 0
      || priorUsage.priceDigest !== input.priceDigest
      || priorUsage.transactionRef !== begun.result.transaction.transactionRef
      || begun.result.transaction.accountId !== input.accountId
      || begun.result.transaction.currency !== input.transaction.currency
      || begun.result.transaction.exponent !== priorUsage.amount.exponent
    ) {
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
  const transaction = transactionFrom({ ...input.transaction, accountId: input.accountId, now: input.observedAt }, 'charge', 'applied', grossAmount.exponent)
  const nextOperator = updateBalance(operator, grossAmount, 'debit', input.observedAt)
  const providerCredit = applyProviderAccountCredit(provider, split.providerNet, input.observedAt)
  const nextRake = updateBalance(rake, split.rake, 'credit', input.observedAt)
  if (providerCredit === undefined) return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  const entries = [
    createEntry({ entryRef: `${transaction.transactionRef}:charge`, accountRef: operator.accountRef, entryType: 'charge', direction: 'debit', amount: grossAmount, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, principalId: input.principalId, invocationRef: input.invocationRef, attemptRef: input.attemptRef, sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: transaction.createdAt }),
    createEntry({ entryRef: `${transaction.transactionRef}:provider`, accountRef: provider.accountRef, entryType: 'payout_accrual', direction: 'credit', amount: split.providerNet, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, businessId: input.businessId, invocationRef: input.invocationRef, attemptRef: input.attemptRef, sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: transaction.createdAt }),
    createEntry({ entryRef: `${transaction.transactionRef}:rake`, accountRef: rake.accountRef, entryType: 'rake', direction: 'credit', amount: split.rake, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, businessId: input.businessId, sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: transaction.createdAt }),
    ...(providerCredit.recoveryPayment.units === '0' ? [] : [
      createEntry({ entryRef: `${transaction.transactionRef}:provider-recovery`, accountRef: provider.accountRef, entryType: 'payout_accrual', direction: 'debit', amount: providerCredit.recoveryPayment, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, businessId: input.businessId, invocationRef: input.invocationRef, attemptRef: input.attemptRef, sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: transaction.createdAt }),
    ]),
  ]
  const usage = createUsage(input, 'paid', grossAmount, transaction.transactionRef)
  const nextState = withChanges(input.state, nextOperator, entries, transaction, [providerCredit.account, nextRake], usage)
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
  const usages = input.state.usageEvents.filter((usage) => usage.transactionRef === input.originalTransactionRef && usage.chargeState === 'paid')
  if (original === undefined || original.principalId !== input.principalId || original.kind !== 'charge' || usages.length !== 1) {
    return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  }
  const usage = usages[0]
  if (usage === undefined) return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  const contract = validateChargeContract(input.state, original, usage)
  if (contract === undefined || input.transaction.currency !== original.currency || input.transaction.principalId !== original.principalId) {
    return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  }
  const begun = beginIdempotentTransaction({ state: input.state, transaction: input.transaction })
  if (begun.result.kind === 'refused') return { state: input.state, result: begun.result.refusal }
  if (begun.result.kind === 'replay') {
    const replayTransaction = begun.result.transaction
    const currentReversals = input.state.transactions.filter((transaction) => transaction.reversalOf === original.transactionRef)
    const replayEntries = input.state.entries.filter((entry) => entry.transactionRef === replayTransaction.transactionRef)
    const selectedRefunds = selectRefundEntries(replayEntries, replayTransaction.transactionRef)
    const operatorRefund = selectedRefunds?.operator
    const providerRefund = selectedRefunds?.provider
    const rakeRefund = selectedRefunds?.rake
    if (
      replayTransaction.transactionRef !== input.transaction.transactionRef
      || replayTransaction.kind !== 'refund'
      || replayTransaction.reversalOf !== original.transactionRef
      || replayTransaction.idempotencyKey !== input.transaction.idempotencyKey
      || replayTransaction.inputDigest !== input.transaction.inputDigest
      || replayTransaction.principalId !== original.principalId
      || replayTransaction.externalRef !== input.transaction.externalRef
      || replayTransaction.state !== 'reversed'
      || replayTransaction.currency !== original.currency
      || replayTransaction.exponent !== original.exponent
      || currentReversals.length !== 1
      || currentReversals[0]?.transactionRef !== replayTransaction.transactionRef
      || replayEntries.length !== 3
      || operatorRefund === undefined
      || providerRefund === undefined
      || rakeRefund === undefined
      || replayEntries.some((entry) => entry !== operatorRefund && entry !== providerRefund && entry !== rakeRefund)
      || operatorRefund.accountRef !== contract.entries.charge.accountRef
      || operatorRefund.entryType !== 'refund'
      || operatorRefund.direction !== 'credit'
      || operatorRefund.amount.units !== contract.chargeAmount.units
      || operatorRefund.amount.currency !== contract.chargeAmount.currency
      || operatorRefund.amount.exponent !== contract.chargeAmount.exponent
      || operatorRefund.principalId !== original.principalId
      || operatorRefund.businessId !== undefined
      || operatorRefund.invocationRef !== undefined
      || operatorRefund.attemptRef !== undefined
      || providerRefund.accountRef !== contract.entries.provider.accountRef
      || providerRefund.entryType !== 'refund'
      || providerRefund.direction !== 'debit'
      || providerRefund.amount.units !== contract.providerAmount.units
      || providerRefund.amount.currency !== contract.providerAmount.currency
      || providerRefund.amount.exponent !== contract.providerAmount.exponent
      || providerRefund.principalId !== undefined
      || providerRefund.businessId !== contract.entries.provider.businessId
      || providerRefund.invocationRef !== undefined
      || providerRefund.attemptRef !== undefined
      || rakeRefund.accountRef !== contract.entries.rake.accountRef
      || rakeRefund.entryType !== 'refund'
      || rakeRefund.direction !== 'debit'
      || rakeRefund.amount.units !== contract.rakeAmount.units
      || rakeRefund.amount.currency !== contract.rakeAmount.currency
      || rakeRefund.amount.exponent !== contract.rakeAmount.exponent
      || rakeRefund.principalId !== undefined
      || rakeRefund.businessId !== contract.entries.rake.businessId
      || rakeRefund.invocationRef !== undefined
      || rakeRefund.attemptRef !== undefined
      || [operatorRefund, providerRefund, rakeRefund].some((entry) =>
        entry.transactionRef !== replayTransaction.transactionRef
        || entry.idempotencyKey !== replayTransaction.idempotencyKey
        || entry.sourceDigest !== input.sourceDigest
        || !sameEvidenceRefs(entry.evidenceRefs, input.evidenceRefs)
        || entry.reversalOf !== original.transactionRef
        || entry.createdAt !== replayTransaction.createdAt
      )
    ) return { state: input.state, result: refusalResult('ledger_idempotency_conflict', false) }
    return { state: input.state, result: acceptedCharge(zeroAmountLike(contract.chargeAmount), original.inputDigest, replayTransaction.transactionRef) }
  }
  if (original.state !== 'applied' && original.state !== 'outcome_unknown') {
    return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  }
  if (input.state.transactions.some((transaction) => transaction.reversalOf === original.transactionRef)) {
    return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  }
  const operatorAmount = rescaleExactAmount(contract.chargeAmount, contract.operator.balance.exponent)
  const providerAmount = rescaleExactAmount(contract.providerAmount, contract.provider.balance.exponent)
  const rakeAmount = rescaleExactAmount(contract.rakeAmount, contract.rake.balance.exponent)
  if (operatorAmount === undefined || providerAmount === undefined || rakeAmount === undefined || input.transaction.currency !== operatorAmount.currency) {
    return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  }
  const nextOperatorBalance = addExactAmounts(contract.operator.balance, operatorAmount)
  const nextProvider = applyProviderAccountDebit(contract.provider, providerAmount, input.transaction.now)
  const nextRakeBalance = subtractExactAmounts(contract.rake.balance, rakeAmount)
  if (nextOperatorBalance === undefined || nextProvider === undefined || nextRakeBalance === undefined) {
    return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  }
  const transaction = transactionFrom(input.transaction, 'refund', 'reversed', operatorAmount.exponent, original.transactionRef)
  const entries = [
    createEntry({ entryRef: `${transaction.transactionRef}:operator`, accountRef: contract.operator.accountRef, entryType: 'refund', direction: 'credit', amount: operatorAmount, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, principalId: original.principalId, sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: input.transaction.now, reversalOf: original.transactionRef }),
    createEntry({ entryRef: `${transaction.transactionRef}:provider`, accountRef: contract.provider.accountRef, entryType: 'refund', direction: 'debit', amount: providerAmount, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, ...(contract.entries.provider.businessId === undefined ? {} : { businessId: contract.entries.provider.businessId }), sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: input.transaction.now, reversalOf: original.transactionRef }),
    createEntry({ entryRef: `${transaction.transactionRef}:rake`, accountRef: contract.rake.accountRef, entryType: 'refund', direction: 'debit', amount: rakeAmount, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, ...(contract.entries.rake.businessId === undefined ? {} : { businessId: contract.entries.rake.businessId }), sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: input.transaction.now, reversalOf: original.transactionRef }),
  ]
  const nextState = withChanges(input.state, updateBalance(contract.operator, operatorAmount, 'credit', input.transaction.now), entries, transaction, [nextProvider, updateBalance(contract.rake, rakeAmount, 'debit', input.transaction.now)], createUsageFromOriginal(input.state, input, original, 'refunded', transaction.transactionRef))
  return { state: nextState, result: acceptedCharge(zeroAmountLike(operatorAmount), original.inputDigest, transaction.transactionRef) }
}
export function markOutcomeUnknown(input: OutcomeUnknownInput & Readonly<{ state: LedgerState }>): LedgerOperationResult<MoneyChargeOutcomeUnknown | MoneyRefusal> {
  const transaction = input.state.transactions.find((entry) => entry.transactionRef === input.transactionRef)
  if (transaction === undefined || transaction.principalId !== input.principalId || transaction.kind !== 'charge') return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  if (transaction.state === 'outcome_unknown') return { state: input.state, result: { kind: 'outcome_unknown', transactionRef: transaction.transactionRef } }
  if (transaction.state !== 'applied') return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  const updated = { ...transaction, state: 'outcome_unknown' as const, updatedAt: input.updatedAt }
  return { state: replaceTransaction(input.state, updated), result: { kind: 'outcome_unknown', transactionRef: transaction.transactionRef } }
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
