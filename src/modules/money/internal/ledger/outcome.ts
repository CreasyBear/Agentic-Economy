import type { MoneyChargeOutcomeUnknown, MoneyRefusal } from '../../public'
import { acceptedCharge, refusalResult, replaceTransaction, zeroAmountLike } from './shared'
import { appendRefundReversal } from './refund'
import type {
  ChargeOutcomeUnknownDecision,
  GenericChargeResult,
  LedgerOperationResult,
  LedgerState,
  OutcomeUnknownInput,
  ReconcileChargeInput,
} from './types'

export function markOutcomeUnknown(
  input: OutcomeUnknownInput & Readonly<{ state: LedgerState }>,
): LedgerOperationResult<MoneyChargeOutcomeUnknown | MoneyRefusal> {
  const transaction = input.state.transactions.find((entry) => entry.transactionRef === input.transactionRef)
  if (transaction === undefined || transaction.principalId !== input.principalId || transaction.kind !== 'charge') {
    return reconciliationRefusal(input.state)
  }
  if (transaction.state === 'outcome_unknown') {
    return { state: input.state, result: { kind: 'outcome_unknown', transactionRef: transaction.transactionRef } }
  }
  if (transaction.state !== 'applied') return reconciliationRefusal(input.state)
  const updated = { ...transaction, state: 'outcome_unknown' as const, updatedAt: input.updatedAt }
  return {
    state: replaceTransaction(input.state, updated),
    result: { kind: 'outcome_unknown', transactionRef: transaction.transactionRef },
  }
}

export function decideChargeOutcomeUnknown(input: Readonly<{
  transaction: Readonly<{
    transactionRef: string
    principalId: string
    kind: string
    state: string
    budgetState?: 'reserved' | 'settled' | 'released' | 'unknown'
    settledAt?: number
  }> | null
  principalId: string
}>): ChargeOutcomeUnknownDecision {
  const transaction = input.transaction
  if (transaction === null || transaction.principalId !== input.principalId || transaction.kind !== 'charge') {
    return refusedDecision()
  }
  if (transaction.state === 'outcome_unknown') {
    return finalizedBudget(transaction) ? refusedDecision() : {
      kind: 'already_unknown',
      transactionRef: transaction.transactionRef,
    }
  }
  return canMarkUnknown(transaction)
    ? { kind: 'mark_unknown', transactionRef: transaction.transactionRef }
    : refusedDecision()
}

function finalizedBudget(transaction: Readonly<{ budgetState?: string; settledAt?: number }>): boolean {
  return transaction.budgetState === 'released'
    || transaction.budgetState === 'settled'
    || transaction.settledAt !== undefined
}

function canMarkUnknown(transaction: Readonly<{
  state: string
  budgetState?: string
  settledAt?: number
}>): boolean {
  return transaction.state === 'applied'
    && transaction.budgetState === 'reserved'
    && !finalizedBudget(transaction)
}

function refusedDecision(): ChargeOutcomeUnknownDecision {
  return { kind: 'refused', code: 'charge_reconciliation_required' }
}

export function reconcileCharge(
  input: ReconcileChargeInput & Readonly<{ state: LedgerState }>,
): LedgerOperationResult<GenericChargeResult> {
  const transaction = input.state.transactions.find((entry) => entry.transactionRef === input.transactionRef)
  if (!validReconciliationTransaction(transaction, input.principalId) || input.evidenceRefs.length === 0) {
    return reconciliationRefusal(input.state)
  }
  if (input.evidence === 'reconciled_not_released') {
    return appendRefundReversal({
      ...input.refund,
      state: input.state,
      originalTransactionRef: input.transactionRef,
      observedAt: input.observedAt,
    })
  }
  const entry = input.state.entries.find((item) => item.transactionRef === transaction.transactionRef)
  if (entry === undefined) return reconciliationRefusal(input.state)
  const updated = transaction.state === 'outcome_unknown'
    ? { ...transaction, state: 'applied' as const, updatedAt: input.observedAt }
    : transaction
  return {
    state: replaceTransaction(input.state, updated),
    result: acceptedCharge(zeroAmountLike(entry.amount), transaction.inputDigest, transaction.transactionRef),
  }
}

function validReconciliationTransaction(
  transaction: LedgerState['transactions'][number] | undefined,
  principalId: string,
): transaction is LedgerState['transactions'][number] {
  return transaction !== undefined
    && transaction.principalId === principalId
    && transaction.kind === 'charge'
    && transaction.state !== 'reversed'
}

function reconciliationRefusal(state: LedgerState) {
  return { state, result: refusalResult('charge_reconciliation_required', false) }
}
