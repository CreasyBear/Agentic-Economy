import type { MoneyAccount } from '../../public'
import { rescaleExactAmount } from '../exact-amount'
import {
  acceptedCharge,
  beginIdempotentTransaction,
  createEntry,
  refusalResult,
  transactionFrom,
  updateBalance,
  validAmount,
  withChanges,
} from './shared'
import type { GenericChargeResult, LedgerOperationResult, LedgerState, TopupInput } from './types'

export function applyTopup(
  input: TopupInput & Readonly<{ state: LedgerState }>,
): LedgerOperationResult<GenericChargeResult> {
  const refusal = validateTopup(input)
  if (refusal !== undefined) return { state: input.state, result: refusal }
  const account = input.state.accounts.get(input.accountRef)
  if (account === undefined) return { state: input.state, result: refusalResult('currency_mismatch', false) }
  const amount = rescaleExactAmount(input.amount, account.balance.exponent)
  if (amount === undefined) return { state: input.state, result: refusalResult('currency_mismatch', false) }
  const begun = beginIdempotentTransaction({ state: input.state, transaction: input.transaction })
  if (begun.result.kind === 'refused') return { state: input.state, result: begun.result.refusal }
  if (begun.result.kind === 'replay') {
    return { state: input.state, result: acceptedCharge(amount, input.transaction.inputDigest, input.transaction.transactionRef) }
  }
  const nextTransaction = transactionFrom(input.transaction, 'topup', 'applied', amount.exponent)
  const nextEntry = createEntry({
    accountRef: account.accountRef, entryType: 'topup', direction: 'credit', amount,
    transactionRef: input.transaction.transactionRef, idempotencyKey: input.transaction.idempotencyKey,
    sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: input.transaction.now,
    principalId: input.transaction.principalId,
  })
  const nextAccount = updateBalance(account, amount, 'credit', input.transaction.now)
  const nextState = withChanges(input.state, nextAccount, [nextEntry], nextTransaction)
  return { state: nextState, result: acceptedCharge(amount, input.transaction.inputDigest, input.transaction.transactionRef) }
}

function validateTopup(
  input: TopupInput & Readonly<{ state: LedgerState }>,
) {
  if (!validAmount(input.amount) || input.evidenceRefs.length === 0 || input.amount.currency !== input.transaction.currency) {
    return refusalResult('credit_topup_amount_invalid', false)
  }
  const account = input.state.accounts.get(input.accountRef)
  if (!validTopupAccount(account, input.amount.currency)) return refusalResult('currency_mismatch', false)
  return account.accountId === input.accountId
    ? undefined
    : refusalResult('billing_identity_mismatch', false)
}

function validTopupAccount(account: MoneyAccount | undefined, currency: string): account is MoneyAccount {
  return account !== undefined
    && account.accountKind === 'operator_credit'
    && account.balance.currency === currency
}
