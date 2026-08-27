import type { MoneyPayout } from '../../public'
import { addExactAmounts, compareExactAmounts } from '../exact-amount'
import type { PayoutActionOf, PayoutPolicyResult, PayoutTransitionInput } from './contracts'

type Result = PayoutPolicyResult<MoneyPayout>

const refused = (code: Extract<Result, { kind: 'refused' }>['code']): Result => ({ kind: 'refused', code, retryable: false })
const accepted = (value: MoneyPayout): Result => ({ kind: 'accepted', value })

function accountIsReady(input: PayoutTransitionInput): boolean {
  return input.account.state === 'ready' && input.account.detailsSubmitted && input.account.recipientCapabilityActive
}

function heldState(input: PayoutTransitionInput): 'held_threshold' | 'held_kyc' {
  return accountIsReady(input) ? 'held_threshold' : 'held_kyc'
}

function transferIdentityMatches(current: MoneyPayout, action: Readonly<{ payoutCommandId: string; idempotencyKey: string }>): boolean {
  return current.payoutCommandId === action.payoutCommandId && current.idempotencyKey === action.idempotencyKey
}

function review(input: PayoutTransitionInput, action: PayoutActionOf<'review'>): Result {
  if (!action.autoApprove || input.current.state !== 'review') return accepted(input.current)
  return accepted({ ...input.current, state: heldState(input), updatedAt: input.now })
}

function beginTransfer(input: PayoutTransitionInput, action: PayoutActionOf<'begin_transfer'>): Result {
  const current = input.current
  if (current.state !== 'held_threshold' && current.state !== 'held_kyc') {
    return refused(current.state === 'outcome_unknown' ? 'payout_reconciliation_required' : 'payout_not_ready')
  }
  if (!accountIsReady(input)) return refused('payout_not_ready')
  if (compareExactAmounts(current.providerNet, current.minimumPayout) === -1) return refused('payout_below_threshold')
  if (action.payoutCommandId.length === 0 || action.requestDigest.length === 0 || action.idempotencyKey.length === 0) return refused('payout_not_ready')
  return accepted({
    ...current,
    state: 'transfer_pending',
    payoutCommandId: action.payoutCommandId,
    transferRequestDigest: action.requestDigest,
    transferStatus: 'pending',
    idempotencyKey: action.idempotencyKey,
    updatedAt: input.now,
  })
}

function transferSucceeded(input: PayoutTransitionInput, action: PayoutActionOf<'transfer_succeeded'>): Result {
  const current = input.current
  if (action.payoutCommandId.length === 0 || action.idempotencyKey.length === 0 || action.stripeTransferId.length === 0 || action.requestDigest.length === 0 || action.evidenceDigest.length === 0 || !transferIdentityMatches(current, action)) return refused('payout_reconciliation_required')
  if (current.state === 'paid') {
    return current.stripeTransferId === action.stripeTransferId && current.transferRequestDigest === action.requestDigest && current.transferEvidenceDigest === action.evidenceDigest
      ? accepted(current)
      : refused('payout_reconciliation_required')
  }
  if (current.state !== 'transfer_pending' && current.state !== 'outcome_unknown') return refused('payout_reconciliation_required')
  if (current.transferRequestDigest !== undefined && current.transferRequestDigest !== action.requestDigest) return refused('payout_reconciliation_required')
  if (current.stripeTransferId !== undefined && current.stripeTransferId !== action.stripeTransferId) return refused('payout_reconciliation_required')
  return accepted({ ...current, state: 'paid', stripeTransferId: action.stripeTransferId, transferRequestDigest: action.requestDigest, transferEvidenceDigest: action.evidenceDigest, transferObservedAt: action.observedAt, transferStatus: 'succeeded', updatedAt: input.now })
}

function transferReversed(input: PayoutTransitionInput, action: PayoutActionOf<'transfer_reversed'>): Result {
  const current = input.current
  if (action.payoutCommandId.length === 0 || action.idempotencyKey.length === 0 || action.stripeTransferId.length === 0 || action.requestDigest.length === 0 || action.evidenceDigest.length === 0 || !transferIdentityMatches(current, action)) return refused('payout_reconciliation_required')
  if (current.state === 'reversed') {
    return current.transferStatus === 'reversed' && current.stripeTransferId === action.stripeTransferId && current.transferRequestDigest === action.requestDigest && current.transferEvidenceDigest !== undefined && current.transferReversalEvidenceDigest === action.evidenceDigest
      ? accepted(current)
      : refused('payout_reconciliation_required')
  }
  if (current.state !== 'paid' || current.transferStatus !== 'succeeded' || current.stripeTransferId !== action.stripeTransferId || current.transferRequestDigest !== action.requestDigest || current.transferEvidenceDigest === undefined) return refused('payout_reconciliation_required')
  return accepted({ ...current, state: 'reversed', transferStatus: 'reversed', transferReversalEvidenceDigest: action.evidenceDigest, transferObservedAt: action.observedAt, updatedAt: input.now })
}

function transferFailed(input: PayoutTransitionInput, action: PayoutActionOf<'transfer_failed'>): Result {
  const current = input.current
  if (current.state !== 'transfer_pending' && current.state !== 'outcome_unknown') return refused('payout_not_ready')
  if (action.payoutCommandId.length === 0 || action.idempotencyKey.length === 0 || action.failureCode.length === 0 || !transferIdentityMatches(current, action)) return refused('payout_reconciliation_required')
  if (action.requestDigest !== undefined && current.transferRequestDigest !== undefined && action.requestDigest !== current.transferRequestDigest) return refused('payout_reconciliation_required')
  if (action.stripeTransferId !== undefined && current.stripeTransferId !== undefined && action.stripeTransferId !== current.stripeTransferId) return refused('payout_reconciliation_required')
  return accepted({ ...current, state: heldState(input), ...(action.stripeTransferId === undefined ? {} : { stripeTransferId: action.stripeTransferId }), ...(action.requestDigest === undefined ? {} : { transferRequestDigest: action.requestDigest }), ...(action.evidenceDigest === undefined ? {} : { transferEvidenceDigest: action.evidenceDigest }), transferStatus: 'failed', failureCode: action.failureCode, updatedAt: input.now })
}

function transferUnknown(input: PayoutTransitionInput, action: PayoutActionOf<'transfer_unknown'>): Result {
  const current = input.current
  if (action.payoutCommandId.length === 0 || action.idempotencyKey.length === 0 || !transferIdentityMatches(current, action)) return refused('payout_reconciliation_required')
  if (current.state === 'outcome_unknown') return current.stripeTransferId === action.stripeTransferId ? accepted(current) : refused('payout_reconciliation_required')
  if (current.state !== 'transfer_pending') return refused('payout_not_ready')
  return accepted({ ...current, state: 'outcome_unknown', ...(action.stripeTransferId === undefined ? {} : { stripeTransferId: action.stripeTransferId }), transferStatus: 'outcome_unknown', updatedAt: input.now })
}

function reconcile(input: PayoutTransitionInput, action: PayoutActionOf<'reconcile'>): Result {
  const current = input.current
  if ((current.state !== 'transfer_pending' && current.state !== 'outcome_unknown') || action.payoutCommandId.length === 0 || action.idempotencyKey.length === 0 || !transferIdentityMatches(current, action)) return refused('payout_reconciliation_required')
  return accepted({ ...current, state: heldState(input), ...(action.stripeTransferId === undefined ? {} : { stripeTransferId: action.stripeTransferId }), ...(action.evidenceDigest === undefined ? {} : { transferEvidenceDigest: action.evidenceDigest }), transferStatus: 'failed', updatedAt: input.now })
}

export function transitionPayout(input: PayoutTransitionInput): Result {
  const expectedGross = addExactAmounts(input.current.providerNet, input.current.rake)
  if (expectedGross === undefined || compareExactAmounts(expectedGross, input.current.grossAccrual) !== 0 || compareExactAmounts(input.current.providerNet, input.current.minimumPayout) === undefined) return refused('payout_not_ready')
  switch (input.action.kind) {
    case 'review': return review(input, input.action)
    case 'begin_transfer': return beginTransfer(input, input.action)
    case 'transfer_succeeded': return transferSucceeded(input, input.action)
    case 'transfer_reversed': return transferReversed(input, input.action)
    case 'transfer_failed': return transferFailed(input, input.action)
    case 'transfer_unknown': return transferUnknown(input, input.action)
    case 'reconcile': return reconcile(input, input.action)
  }
}
