import type { ExactAmount, MoneyLedgerEntry, MoneyTransaction } from '../../public'
import { addExactAmounts, rescaleExactAmount, subtractExactAmounts } from '../exact-amount'
import {
  acceptedCharge,
  applyProviderAccountDebit,
  beginIdempotentTransaction,
  createEntry,
  createUsageFromOriginal,
  loadChargeContract,
  refusalResult,
  sameEvidenceRefs,
  transactionFrom,
  updateBalance,
  withChanges,
  zeroAmountLike,
  type HydratedChargeContract,
} from './shared'
import type { GenericChargeResult, LedgerOperationResult, LedgerState, RefundInput } from './types'

type SelectedRefundEntries = Readonly<{
  operator: MoneyLedgerEntry
  provider: MoneyLedgerEntry
  rake: MoneyLedgerEntry
}>

type RefundContext = Readonly<{
  original: MoneyTransaction
  contract: HydratedChargeContract
}>

export function appendRefundReversal(
  input: RefundInput & Readonly<{ state: LedgerState }>,
): LedgerOperationResult<GenericChargeResult> {
  const loaded = loadRefundContext(input)
  if (loaded === undefined) return reconciliationRefusal(input.state)
  const begun = beginIdempotentTransaction({ state: input.state, transaction: input.transaction })
  if (begun.result.kind === 'refused') return { state: input.state, result: begun.result.refusal }
  if (begun.result.kind === 'replay') return replayRefund(input, loaded, begun.result.transaction)
  return applyNewRefund(input, loaded)
}

function loadRefundContext(
  input: RefundInput & Readonly<{ state: LedgerState }>,
): RefundContext | undefined {
  const original = input.state.transactions.find((transaction) =>
    transaction.transactionRef === input.originalTransactionRef)
  if (original === undefined || !originalMatchesRefund(input, original)) return undefined
  const usages = input.state.usageEvents.filter((usage) =>
    usage.transactionRef === input.originalTransactionRef && usage.chargeState === 'paid')
  if (usages.length !== 1 || usages[0] === undefined) return undefined
  const contract = loadChargeContract(input.state, original, usages[0])
  return contract === undefined ? undefined : { original, contract }
}

function originalMatchesRefund(input: RefundInput, original: MoneyTransaction): boolean {
  return original.principalId === input.principalId
    && original.kind === 'charge'
    && input.transaction.currency === original.currency
    && input.transaction.principalId === original.principalId
}

function replayRefund(
  input: RefundInput & Readonly<{ state: LedgerState }>,
  context: RefundContext,
  replayTransaction: MoneyTransaction,
): LedgerOperationResult<GenericChargeResult> {
  const replayEntries = input.state.entries.filter((entry) =>
    entry.transactionRef === replayTransaction.transactionRef)
  const selected = selectRefundEntries(replayEntries, replayTransaction.transactionRef)
  const reversals = input.state.transactions.filter((transaction) =>
    transaction.reversalOf === context.original.transactionRef)
  if (!replayRefundMatches(input, context, replayTransaction, replayEntries, selected, reversals)) {
    return { state: input.state, result: refusalResult('ledger_idempotency_conflict', false) }
  }
  return {
    state: input.state,
    result: acceptedCharge(
      zeroAmountLike(context.contract.chargeAmount),
      context.original.inputDigest,
      replayTransaction.transactionRef,
    ),
  }
}

function replayRefundMatches(
  input: RefundInput,
  context: RefundContext,
  transaction: MoneyTransaction,
  entries: readonly MoneyLedgerEntry[],
  selected: SelectedRefundEntries | undefined,
  reversals: readonly MoneyTransaction[],
): selected is SelectedRefundEntries {
  return replayTransactionMatches(input, context.original, transaction)
    && singleReplayReversal(reversals, transaction)
    && selected !== undefined
    && entries.length === 3
    && entries.every((entry) => selectedEntry(entry, selected))
    && refundLegsMatch(context, selected)
    && refundEntryMetadataMatches(input, context.original, transaction, selected)
}

function replayTransactionMatches(
  input: RefundInput,
  original: MoneyTransaction,
  replay: MoneyTransaction,
): boolean {
  return replay.transactionRef === input.transaction.transactionRef
    && replay.kind === 'refund'
    && replay.reversalOf === original.transactionRef
    && replay.idempotencyKey === input.transaction.idempotencyKey
    && replay.inputDigest === input.transaction.inputDigest
    && replay.principalId === original.principalId
    && replay.externalRef === input.transaction.externalRef
    && replay.state === 'reversed'
    && replay.currency === original.currency
    && replay.exponent === original.exponent
}

function singleReplayReversal(reversals: readonly MoneyTransaction[], replay: MoneyTransaction): boolean {
  return reversals.length === 1 && reversals[0]?.transactionRef === replay.transactionRef
}

function selectedEntry(entry: MoneyLedgerEntry, selected: SelectedRefundEntries): boolean {
  return entry === selected.operator || entry === selected.provider || entry === selected.rake
}

function refundLegsMatch(context: RefundContext, selected: SelectedRefundEntries): boolean {
  return operatorRefundMatches(context, selected.operator)
    && providerRefundMatches(context, selected.provider)
    && rakeRefundMatches(context, selected.rake)
}

function operatorRefundMatches(context: RefundContext, entry: MoneyLedgerEntry): boolean {
  return refundAmountMatches(entry, context.contract.chargeAmount)
    && entry.accountRef === context.contract.entries.charge.accountRef
    && entry.entryType === 'refund'
    && entry.direction === 'credit'
    && entry.principalId === context.original.principalId
    && entry.businessId === undefined
    && entry.invocationRef === undefined
    && entry.attemptRef === undefined
}

function providerRefundMatches(context: RefundContext, entry: MoneyLedgerEntry): boolean {
  return refundAmountMatches(entry, context.contract.providerAmount)
    && entry.accountRef === context.contract.entries.provider.accountRef
    && entry.entryType === 'refund'
    && entry.direction === 'debit'
    && entry.principalId === undefined
    && entry.businessId === context.contract.entries.provider.businessId
    && entry.invocationRef === undefined
    && entry.attemptRef === undefined
}

function rakeRefundMatches(context: RefundContext, entry: MoneyLedgerEntry): boolean {
  return refundAmountMatches(entry, context.contract.rakeAmount)
    && entry.accountRef === context.contract.entries.rake.accountRef
    && entry.entryType === 'refund'
    && entry.direction === 'debit'
    && entry.principalId === undefined
    && entry.businessId === context.contract.entries.rake.businessId
    && entry.invocationRef === undefined
    && entry.attemptRef === undefined
}

function refundAmountMatches(entry: MoneyLedgerEntry, amount: ExactAmount): boolean {
  return entry.amount.units === amount.units
    && entry.amount.currency === amount.currency
    && entry.amount.exponent === amount.exponent
}

function refundEntryMetadataMatches(
  input: RefundInput,
  original: MoneyTransaction,
  transaction: MoneyTransaction,
  selected: SelectedRefundEntries,
): boolean {
  return [selected.operator, selected.provider, selected.rake].every((entry) =>
    entry.transactionRef === transaction.transactionRef
    && entry.idempotencyKey === transaction.idempotencyKey
    && entry.sourceDigest === input.sourceDigest
    && sameEvidenceRefs(entry.evidenceRefs, input.evidenceRefs)
    && entry.reversalOf === original.transactionRef
    && entry.createdAt === transaction.createdAt)
}

function applyNewRefund(
  input: RefundInput & Readonly<{ state: LedgerState }>,
  context: RefundContext,
): LedgerOperationResult<GenericChargeResult> {
  if (!originalCanBeReversed(input.state, context.original)) return reconciliationRefusal(input.state)
  const amounts = refundAmounts(input, context.contract)
  if (amounts === undefined) return reconciliationRefusal(input.state)
  const balances = refundBalances(input, context.contract, amounts)
  if (balances === undefined) return reconciliationRefusal(input.state)
  const transaction = transactionFrom(
    input.transaction,
    'refund',
    'reversed',
    amounts.operator.exponent,
    context.original.transactionRef,
  )
  const entries = createRefundEntries(input, context, transaction, amounts)
  const usage = createUsageFromOriginal(
    input.state,
    input,
    context.original,
    'refunded',
    transaction.transactionRef,
  )
  const nextState = withChanges(
    input.state,
    updateBalance(context.contract.operator, amounts.operator, 'credit', input.transaction.now),
    entries,
    transaction,
    [balances.provider, updateBalance(context.contract.rake, amounts.rake, 'debit', input.transaction.now)],
    usage,
  )
  return {
    state: nextState,
    result: acceptedCharge(zeroAmountLike(amounts.operator), context.original.inputDigest, transaction.transactionRef),
  }
}

function originalCanBeReversed(state: LedgerState, original: MoneyTransaction): boolean {
  return (original.state === 'applied' || original.state === 'outcome_unknown')
    && !state.transactions.some((transaction) => transaction.reversalOf === original.transactionRef)
}

type RefundAmounts = Readonly<{ operator: ExactAmount; provider: ExactAmount; rake: ExactAmount }>

function refundAmounts(input: RefundInput, contract: HydratedChargeContract): RefundAmounts | undefined {
  const operator = rescaleExactAmount(contract.chargeAmount, contract.operator.balance.exponent)
  const provider = rescaleExactAmount(contract.providerAmount, contract.provider.balance.exponent)
  const rake = rescaleExactAmount(contract.rakeAmount, contract.rake.balance.exponent)
  return operator === undefined || provider === undefined || rake === undefined || input.transaction.currency !== operator.currency
    ? undefined
    : { operator, provider, rake }
}

function refundBalances(
  input: RefundInput,
  contract: HydratedChargeContract,
  amounts: RefundAmounts,
): Readonly<{ provider: NonNullable<ReturnType<typeof applyProviderAccountDebit>> }> | undefined {
  const operator = addExactAmounts(contract.operator.balance, amounts.operator)
  const provider = applyProviderAccountDebit(contract.provider, amounts.provider, input.transaction.now)
  const rake = subtractExactAmounts(contract.rake.balance, amounts.rake)
  return operator === undefined || provider === undefined || rake === undefined ? undefined : { provider }
}

function createRefundEntries(
  input: RefundInput,
  context: RefundContext,
  transaction: MoneyTransaction,
  amounts: RefundAmounts,
): readonly MoneyLedgerEntry[] {
  const common = { transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey,
    sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: input.transaction.now,
    reversalOf: context.original.transactionRef }
  return [
    createEntry({ ...common, entryRef: `${transaction.transactionRef}:operator`,
      accountRef: context.contract.operator.accountRef, entryType: 'refund', direction: 'credit',
      amount: amounts.operator, principalId: context.original.principalId }),
    createEntry({ ...common, entryRef: `${transaction.transactionRef}:provider`,
      accountRef: context.contract.provider.accountRef, entryType: 'refund', direction: 'debit',
      amount: amounts.provider, ...optionalBusinessId(context.contract.entries.provider.businessId) }),
    createEntry({ ...common, entryRef: `${transaction.transactionRef}:rake`,
      accountRef: context.contract.rake.accountRef, entryType: 'refund', direction: 'debit',
      amount: amounts.rake, ...optionalBusinessId(context.contract.entries.rake.businessId) }),
  ]
}

function optionalBusinessId(businessId: string | undefined) {
  return businessId === undefined ? {} : { businessId }
}

function selectRefundEntries(
  entries: readonly MoneyLedgerEntry[],
  transactionRef: string,
): SelectedRefundEntries | undefined {
  if (entries.length !== 3) return undefined
  const byRef = new Map(entries.map((entry) => [entry.entryRef, entry]))
  const operator = byRef.get(`${transactionRef}:operator`)
  const provider = byRef.get(`${transactionRef}:provider`)
  const rake = byRef.get(`${transactionRef}:rake`)
  return byRef.size !== entries.length || operator === undefined || provider === undefined || rake === undefined
    ? undefined
    : { operator, provider, rake }
}

function reconciliationRefusal(state: LedgerState): LedgerOperationResult<GenericChargeResult> {
  return { state, result: refusalResult('charge_reconciliation_required', false) }
}
