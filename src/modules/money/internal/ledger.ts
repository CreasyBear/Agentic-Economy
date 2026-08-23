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
  RakeSplit,
} from '../public'
export type { MoneyAccount } from '../public'
import {
  addExactAmounts,
  amountAtScale,
  compareExactAmounts,
  exactAmountSchema,
  rescaleExactAmount,
  subtractExactAmounts,
} from './exact-amount'
import {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
} from './account-ref'
import {
  sameEvidenceRefs,
  selectChargeEntries,
  validateChargeContract,
  type ChargeContractEntry,
  type SelectedChargeEntries,
  type ValidateChargeContractInput,
} from './charge-contract'
import { validatePaymentBinding, type PaymentBinding } from './payment-binding'
import { computeProviderFeeBreakdown, computeRakeSplit } from './pricing-config'

export {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
  accountRefForExternalLoss,
} from './account-ref'
export {
  recoveryExceedsProvider,
  sameEvidenceRefs,
  selectChargeEntries,
  validateChargeContract,
} from './charge-contract'
export type {
  ChargeContractAccount,
  ChargeContractEntry,
  ChargeContractOriginal,
  ChargeContractUsage,
  ChargeEntryLeg,
  SelectedChargeEntries,
  ValidateChargeContractInput,
  ValidatedChargeContract,
} from './charge-contract'

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

type HydratedChargeContract = Readonly<{
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

function loadChargeContract(state: LedgerState, original: MoneyTransaction, usage: MoneyUsageEvent): HydratedChargeContract | undefined {
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
  const operator = state.accounts.get(contract.operator.accountRef)
  const provider = state.accounts.get(contract.provider.accountRef)
  const rake = state.accounts.get(contract.rake.accountRef)
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
      operatorAccountRef: contract.operator.accountRef,
      providerAccountRef: contract.provider.accountRef,
      rakeAccountRef: contract.rake.accountRef,
      accountId,
      businessId: usage.businessId,
      currency: original.currency,
    }) !== undefined
  ) return undefined
  return {
    original,
    usage,
    entries: contract.selected,
    operator,
    provider,
    rake,
    chargeAmount: contract.chargeAmount,
    providerAmount: contract.providerAmount,
    rakeAmount: contract.rakeAmount,
  }
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

function refusedChargePlan(result: MoneyRefusal, usage?: MoneyUsageEvent): ChargePlan {
  return {
    result,
    entries: [],
    ...(usage === undefined ? {} : { usage }),
  }
}

function acceptedChargePlan(
  result: ChargeAuthorizationResult,
  extra: Omit<ChargePlan, 'result' | 'entries'> & Readonly<{ entries?: readonly MoneyLedgerEntry[] }> = {},
): ChargePlan {
  const { entries, ...rest } = extra
  return { result, entries: entries ?? [], ...rest }
}

function beginFromPrior(
  prior: MoneyTransaction | undefined,
  transaction: BeginTransactionInput,
): Readonly<{ kind: 'new' } | { kind: 'replay'; transaction: MoneyTransaction } | { kind: 'refused'; refusal: MoneyRefusal }> {
  if (prior === undefined) return { kind: 'new' }
  if (prior.inputDigest !== transaction.inputDigest || prior.principalId !== transaction.principalId || prior.kind !== transaction.kind) {
    return { kind: 'refused', refusal: refusal('ledger_idempotency_conflict', false) }
  }
  return { kind: 'replay', transaction: prior }
}

function freeTierAccepted(usage: MoneyUsageEvent): ChargeAuthorizationResult {
  return {
    kind: 'accepted',
    chargeState: 'free_tier',
    amount: usage.amount,
    priceDigest: usage.priceDigest,
    usageRef: usage.usageRef,
    observedAt: usage.observedAt,
    ...(usage.transactionRef === undefined ? {} : { transactionRef: usage.transactionRef }),
  }
}

export function planPaidCharge(input: PlanPaidChargeInput): ChargePlan {
  if (input.principalId !== input.transaction.principalId) return refusedChargePlan(refusalResult('billing_identity_mismatch', false))
  if (!validAmount(input.grossAmount)) return refusedChargePlan(refusalResult('rake_not_configured', false))
  const hasProviderAmount = input.providerAmount !== undefined
  const hasPlatformFee = input.platformFee !== undefined
  if (hasProviderAmount !== hasPlatformFee) return refusedChargePlan(refusalResult('rake_not_configured', false))
  if (
    (input.providerAmount !== undefined && !validAmount(input.providerAmount))
    || (input.platformFee !== undefined && !validAmount(input.platformFee))
  ) return refusedChargePlan(refusalResult('rake_not_configured', false))
  if (input.paymentBinding !== undefined) {
    const requestedBinding: PaymentBinding = {
      ...input.paymentBinding.requested,
      amount: input.grossAmount,
      providerRef: input.providerAccountRef,
      idempotencyKey: input.transaction.idempotencyKey,
      ...(input.actionVersion === undefined ? {} : { actionVersion: input.actionVersion }),
    }
    const binding = validatePaymentBinding({ approved: input.paymentBinding.approved, requested: requestedBinding, now: input.observedAt })
    if (binding.kind === 'refused') return refusedChargePlan(binding)
  }
  const operator = input.operator
  const provider = input.provider
  const rake = input.rake
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
  if (accountRefusal !== undefined) return refusedChargePlan(accountRefusal)
  if (operator === undefined || provider === undefined || rake === undefined) {
    return refusedChargePlan(refusalResult('billing_identity_missing', false))
  }
  if (input.grossAmount.currency !== input.transaction.currency || provider.balance.exponent !== operator.balance.exponent || rake.balance.exponent !== operator.balance.exponent) {
    return refusedChargePlan(refusalResult('currency_mismatch', false))
  }
  const grossAmount = rescaleExactAmount(input.grossAmount, operator.balance.exponent)
  if (grossAmount === undefined) return refusedChargePlan(refusalResult('currency_mismatch', false))
  const begun = beginFromPrior(input.priorTransaction, input.transaction)
  if (begun.kind === 'refused') return refusedChargePlan(begun.refusal)
  let split: RakeSplit | undefined
  if (hasProviderAmount && hasPlatformFee) {
    if (input.rakeConfig.rakeBps !== 1_000 || input.providerAmount === undefined || input.platformFee === undefined) {
      return refusedChargePlan(refusalResult('rake_not_configured', false))
    }
    const breakdown = computeProviderFeeBreakdown(input.providerAmount)
    if (
      'kind' in breakdown
      || input.providerAmount.currency !== input.grossAmount.currency
      || input.providerAmount.exponent !== input.grossAmount.exponent
      || input.platformFee.currency !== input.grossAmount.currency
      || input.platformFee.exponent !== input.grossAmount.exponent
      || compareExactAmounts(breakdown.totalAmount, input.grossAmount) !== 0
      || compareExactAmounts(breakdown.platformFee, input.platformFee) !== 0
    ) return refusedChargePlan(refusalResult('rake_not_configured', false))
    const providerAmount = rescaleExactAmount(input.providerAmount, operator.balance.exponent)
    const platformFee = rescaleExactAmount(input.platformFee, operator.balance.exponent)
    if (providerAmount === undefined || platformFee === undefined) return refusedChargePlan(refusalResult('currency_mismatch', false))
    split = { grossAmount, rakeBps: 1_000, rake: platformFee, providerNet: providerAmount }
  }
  if (input.freeTier === true || grossAmount.units === '0') {
    const priorUsage = input.priorUsage
    if (priorUsage !== undefined) {
      if (priorUsage.chargeState !== 'free_tier' || compareExactAmounts(priorUsage.amount, zeroAmountLike(grossAmount)) !== 0 || priorUsage.priceDigest !== input.priceDigest) {
        return refusedChargePlan(refusalResult('charge_reconciliation_required', false))
      }
      return acceptedChargePlan(freeTierAccepted(priorUsage))
    }
    const usage = createUsage(input, 'free_tier', zeroAmountLike(grossAmount))
    return acceptedChargePlan(freeTierAccepted(usage), { usage })
  }
  if (split === undefined) {
    const configuredSplit = computeRakeSplit(grossAmount, input.rakeConfig)
    if ('kind' in configuredSplit) return refusedChargePlan(refusalResult(configuredSplit.code, false))
    split = configuredSplit
  }
  if (begun.kind === 'replay') {
    const priorUsage = input.priorUsage
    const priorEntries = input.priorEntries ?? []
    if (
      priorUsage === undefined
      || priorUsage.chargeState !== 'paid'
      || priorUsage.accountId !== input.accountId
      || compareExactAmounts(priorUsage.amount, grossAmount) !== 0
      || priorUsage.priceDigest !== input.priceDigest
      || priorUsage.transactionRef !== begun.transaction.transactionRef
      || begun.transaction.accountId !== input.accountId
      || begun.transaction.currency !== input.transaction.currency
      || begun.transaction.exponent !== priorUsage.amount.exponent
      || priorUsage.serviceRef !== input.serviceRef
      || priorUsage.offeringRef !== input.offeringRef
      || priorUsage.operationKey !== input.operationKey
      || priorUsage.businessId !== input.businessId
    ) {
      return refusedChargePlan(refusalResult('charge_reconciliation_required', false))
    }
    const contract = validateChargeContract(paidChargeContractInput({
      transaction: begun.transaction,
      usage: priorUsage,
      entries: priorEntries,
      operatorAccountRef: input.operatorAccountRef,
      providerAccountRef: input.providerAccountRef,
      rakeAccountRef: input.rakeAccountRef,
    }))
    if (
      contract === undefined
      || split === undefined
      || (hasProviderAmount && compareExactAmounts(contract.providerAmount, split.providerNet) !== 0)
      || (hasPlatformFee && compareExactAmounts(contract.rakeAmount, split.rake) !== 0)
    ) return refusedChargePlan(refusalResult('charge_reconciliation_required', false))
    return acceptedChargePlan({
      kind: 'accepted',
      chargeState: 'paid',
      amount: priorUsage.amount,
      priceDigest: priorUsage.priceDigest,
      usageRef: priorUsage.usageRef,
      observedAt: priorUsage.observedAt,
      ...(priorUsage.transactionRef === undefined ? {} : { transactionRef: priorUsage.transactionRef }),
      providerNet: contract.providerAmount,
      rake: contract.rakeAmount,
    })
  }
  if (input.priorUsage !== undefined) return refusedChargePlan(refusalResult('charge_reconciliation_required', false))
  if (operator.state !== 'active' || compareExactAmounts(operator.balance, grossAmount) === -1) {
    const usage = createUsage(input, 'insufficient_credit', grossAmount)
    return refusedChargePlan(refusalResult('insufficient_credit', false, {
      requiredAmount: grossAmount,
      availableAmount: operator.balance,
      nextAction: 'credit_topup_required',
    }), usage)
  }
  if (input.transaction.expectedAccountVersion !== operator.version) {
    return refusedChargePlan(refusalResult('ledger_cas_conflict', true))
  }
  const transaction = transactionFrom({ ...input.transaction, accountId: input.accountId, now: input.observedAt }, 'charge', 'applied', grossAmount.exponent)
  const nextOperator = updateBalance(operator, grossAmount, 'debit', input.observedAt)
  const providerCredit = applyProviderAccountCredit(provider, split.providerNet, input.observedAt)
  const nextRake = updateBalance(rake, split.rake, 'credit', input.observedAt)
  if (providerCredit === undefined) return refusedChargePlan(refusalResult('charge_reconciliation_required', false))
  const entries = [
    createEntry({ entryRef: `${transaction.transactionRef}:charge`, accountRef: operator.accountRef, entryType: 'charge', direction: 'debit', amount: grossAmount, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, principalId: input.principalId, invocationRef: input.invocationRef, attemptRef: input.attemptRef, sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: transaction.createdAt }),
    createEntry({ entryRef: `${transaction.transactionRef}:provider`, accountRef: provider.accountRef, entryType: 'payout_accrual', direction: 'credit', amount: split.providerNet, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, businessId: input.businessId, invocationRef: input.invocationRef, attemptRef: input.attemptRef, sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: transaction.createdAt }),
    createEntry({ entryRef: `${transaction.transactionRef}:rake`, accountRef: rake.accountRef, entryType: 'rake', direction: 'credit', amount: split.rake, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, businessId: input.businessId, sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: transaction.createdAt }),
    ...(providerCredit.recoveryPayment.units === '0' ? [] : [
      createEntry({ entryRef: `${transaction.transactionRef}:provider-recovery`, accountRef: provider.accountRef, entryType: 'payout_accrual', direction: 'debit', amount: providerCredit.recoveryPayment, transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey, businessId: input.businessId, invocationRef: input.invocationRef, attemptRef: input.attemptRef, sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: transaction.createdAt }),
    ]),
  ]
  const usage = createUsage(input, 'paid', grossAmount, transaction.transactionRef)
  return acceptedChargePlan({
    kind: 'accepted',
    chargeState: 'paid',
    amount: usage.amount,
    priceDigest: usage.priceDigest,
    usageRef: usage.usageRef,
    observedAt: usage.observedAt,
    transactionRef: transaction.transactionRef,
    providerNet: split.providerNet,
    rake: split.rake,
  }, {
    usage,
    transaction,
    entries,
    accounts: { operator: nextOperator, provider: providerCredit.account, rake: nextRake },
  })
}

export function applyChargePlan(state: LedgerState, plan: ChargePlan): LedgerOperationResult<ChargeAuthorizationResult> {
  switch (plan.result.kind) {
    case 'refused': {
      const next = plan.usage === undefined ? state : appendUsage(state, plan.usage)
      return { state: next, result: plan.result }
    }
    case 'accepted': {
      switch (plan.result.chargeState) {
        case 'free_tier': {
          const next = plan.usage === undefined ? state : appendUsage(state, plan.usage)
          return { state: next, result: plan.result }
        }
        case 'paid': {
          if (plan.transaction === undefined || plan.accounts === undefined) {
            return { state, result: plan.result }
          }
          return {
            state: withChanges(
              state,
              plan.accounts.operator,
              plan.entries,
              plan.transaction,
              [plan.accounts.provider, plan.accounts.rake],
              plan.usage,
            ),
            result: plan.result,
          }
        }
        default: {
          const _exhaustive: never = plan.result.chargeState
          return _exhaustive
        }
      }
    }
    default: {
      const _exhaustive: never = plan.result
      return _exhaustive
    }
  }
}

export function authorizePaidCharge(input: PaidChargeInput & Readonly<{ state: LedgerState }>): LedgerOperationResult<ChargeAuthorizationResult> {
  const operator = input.state.accounts.get(input.operatorAccountRef)
  const provider = input.state.accounts.get(input.providerAccountRef)
  const rake = input.state.accounts.get(input.rakeAccountRef)
  const priorTransaction = input.state.transactions.find((transaction) => transaction.idempotencyKey === input.transaction.idempotencyKey)
  const usageRef = `${input.invocationRef}:${input.attemptRef}:${input.operationKey}`
  const priorUsage = input.state.usageEvents.find((usage) => usage.usageRef === usageRef)
  const priorEntries = priorTransaction === undefined
    ? []
    : input.state.entries.filter((entry) => entry.transactionRef === priorTransaction.transactionRef)
  return applyChargePlan(input.state, planPaidCharge({
    ...input,
    ...(operator === undefined ? {} : { operator }),
    ...(provider === undefined ? {} : { provider }),
    ...(rake === undefined ? {} : { rake }),
    ...(priorTransaction === undefined ? {} : { priorTransaction }),
    ...(priorUsage === undefined ? {} : { priorUsage }),
    priorEntries,
  }))
}

export function appendRefundReversal(input: RefundInput & Readonly<{ state: LedgerState }>): LedgerOperationResult<GenericChargeResult> {
  const original = input.state.transactions.find((transaction) => transaction.transactionRef === input.originalTransactionRef)
  const usages = input.state.usageEvents.filter((usage) => usage.transactionRef === input.originalTransactionRef && usage.chargeState === 'paid')
  if (original === undefined || original.principalId !== input.principalId || original.kind !== 'charge' || usages.length !== 1) {
    return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  }
  const usage = usages[0]
  if (usage === undefined) return { state: input.state, result: refusalResult('charge_reconciliation_required', false) }
  const contract = loadChargeContract(input.state, original, usage)
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

export type ChargeBudgetState = 'reserved' | 'settled' | 'released' | 'unknown'

export type ChargeOutcomeUnknownDecision =
  | Readonly<{ kind: 'already_unknown'; transactionRef: string }>
  | Readonly<{ kind: 'mark_unknown'; transactionRef: string }>
  | Readonly<{ kind: 'refused'; code: 'charge_reconciliation_required' }>

export function decideChargeOutcomeUnknown(input: Readonly<{
  transaction: Readonly<{
    transactionRef: string
    principalId: string
    kind: string
    state: string
    budgetState?: ChargeBudgetState
    settledAt?: number
  }> | null
  principalId: string
}>): ChargeOutcomeUnknownDecision {
  const transaction = input.transaction
  if (
    transaction === null
    || transaction.principalId !== input.principalId
    || transaction.kind !== 'charge'
  ) {
    return { kind: 'refused', code: 'charge_reconciliation_required' }
  }
  if (transaction.state === 'outcome_unknown') {
    if (
      transaction.budgetState === 'released'
      || transaction.budgetState === 'settled'
      || transaction.settledAt !== undefined
    ) {
      return { kind: 'refused', code: 'charge_reconciliation_required' }
    }
    return { kind: 'already_unknown', transactionRef: transaction.transactionRef }
  }
  if (
    transaction.state === 'reversed'
    || transaction.budgetState === 'released'
    || transaction.budgetState === 'settled'
    || transaction.settledAt !== undefined
    || transaction.state !== 'applied'
    || transaction.budgetState !== 'reserved'
  ) {
    return { kind: 'refused', code: 'charge_reconciliation_required' }
  }
  return { kind: 'mark_unknown', transactionRef: transaction.transactionRef }
}

export type PayoutAccrualAmounts = Readonly<{
  transactionRef: string
  businessId: string
  currency: string
  exponent: number
  grossAccrual: ExactAmount
  rake: ExactAmount
  providerNet: ExactAmount
}>

export function payoutAccrualFromChargeAmounts(input: Readonly<{
  transactionRef: string
  businessId: string
  chargeAmount: ExactAmount
  providerAmount: ExactAmount
  rakeAmount: ExactAmount
  recoveryAmount: ExactAmount
  accountCurrency: string
  accountExponent: number
}>): PayoutAccrualAmounts | undefined {
  const fullGross = amountAtScale(input.chargeAmount, input.accountCurrency, input.accountExponent)
  const fullRake = amountAtScale(input.rakeAmount, input.accountCurrency, input.accountExponent)
  const fullProvider = amountAtScale(input.providerAmount, input.accountCurrency, input.accountExponent)
  const recoveryAtScale = amountAtScale(input.recoveryAmount, input.accountCurrency, input.accountExponent)
  if (
    fullGross === undefined
    || fullRake === undefined
    || fullProvider === undefined
    || recoveryAtScale === undefined
  ) {
    return undefined
  }
  const grossAccrual = subtractExactAmounts(fullGross, recoveryAtScale)
  const providerNet = subtractExactAmounts(fullProvider, recoveryAtScale)
  if (grossAccrual === undefined || providerNet === undefined) return undefined
  const expectedGross = addExactAmounts(providerNet, fullRake)
  if (expectedGross === undefined || compareExactAmounts(expectedGross, grossAccrual) !== 0) {
    return undefined
  }
  return {
    transactionRef: input.transactionRef,
    businessId: input.businessId,
    currency: input.accountCurrency,
    exponent: input.accountExponent,
    grossAccrual,
    rake: fullRake,
    providerNet,
  }
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
