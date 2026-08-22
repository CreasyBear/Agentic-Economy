import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  sameEvidenceRefs,
  type ExactAmount,
} from '@/modules/money/public'
import type { Doc } from './_generated/dataModel'

export type ExternalPayoutIdentity = Readonly<{
  payoutRef: string
  payoutKey: string
  payoutSource: string
  payoutEvidence: string
}>

export function externalPayoutIdentity(input: Readonly<{
  chargeTransactionRef: string
  externalRef: string
}>): ExternalPayoutIdentity {
  const identity = {
    format: 'money-brokered-external-payout:v1',
    chargeTransactionRef: input.chargeTransactionRef,
    externalRef: input.externalRef,
  }
  return {
    payoutRef: canonicalDigest(identity as StableHashValue),
    payoutKey: canonicalDigest({
      ...identity,
      format: 'money-brokered-external-payout-idempotency:v1',
    } as StableHashValue),
    payoutSource: canonicalDigest({
      ...identity,
      format: 'money-brokered-external-payout-source:v1',
    } as StableHashValue),
    payoutEvidence: canonicalDigest({
      ...identity,
      format: 'money-brokered-external-payout-evidence:v1',
    } as StableHashValue),
  }
}

export type BrokeredDisputeIdentity = Readonly<{
  lossTransactionRef: string
  lossInputDigest: string
}>

export function brokeredDisputeIdentity(input: Readonly<{
  qualifiedUseRef: string
  disputeRef: string
  originalTransactionRef: string
  externalRef: string
  providerAmount: ExactAmount
  sourceDigest: string
  evidenceRefs: readonly string[]
}>): BrokeredDisputeIdentity {
  const lossTransactionRef = `qualified-use-dispute-loss:${input.qualifiedUseRef}`
  return {
    lossTransactionRef,
    lossInputDigest: canonicalDigest({
      format: 'qualified-use-brokered-dispute-loss:v1',
      qualifiedUseRef: input.qualifiedUseRef,
      disputeRef: input.disputeRef,
      originalTransactionRef: input.originalTransactionRef,
      externalRef: input.externalRef,
      providerAmount: input.providerAmount,
      sourceDigest: input.sourceDigest,
      evidenceRefs: [...input.evidenceRefs],
    } as StableHashValue),
  }
}

export function validateExternalPayoutEvidence(input: Readonly<{
  identity: ExternalPayoutIdentity
  externalRef: string
  businessId: string
  providerAccountRef: string
  providerVersion: number
  providerAmount: ExactAmount
  settledAt: number
  payoutCount: number
  payoutIdempotencyRows: readonly Doc<'moneyTransactions'>[]
  payoutRows: readonly Doc<'moneyTransactions'>[]
  payoutEntries: readonly Doc<'moneyLedgerEntries'>[]
}>): boolean {
  const payout = input.payoutRows[0]
  const entry = input.payoutEntries[0]
  if (
    !Number.isFinite(input.settledAt) ||
    input.payoutCount !== 1 ||
    input.payoutIdempotencyRows.length !== 1 ||
    input.payoutRows.length !== 1 ||
    input.payoutEntries.length !== 1 ||
    payout === undefined ||
    entry === undefined ||
    input.payoutIdempotencyRows[0]?._id !== payout._id
  )
    return false
  return (
    payout.transactionRef === input.identity.payoutRef &&
    payout.kind === 'payout_accrual' &&
    payout.idempotencyKey === input.identity.payoutKey &&
    payout.inputDigest === input.identity.payoutSource &&
    payout.principalId === `business:${input.businessId}` &&
    payout.currency === input.providerAmount.currency &&
    payout.amountUnits === input.providerAmount.units &&
    payout.exponent === input.providerAmount.exponent &&
    payout.state === 'applied' &&
    payout.expectedAccountVersion === input.providerVersion - 1 &&
    payout.externalRef === input.externalRef &&
    payout.createdAt === input.settledAt &&
    payout.updatedAt === input.settledAt &&
    entry.entryRef === `${input.identity.payoutRef}:external-settlement` &&
    entry.accountRef === input.providerAccountRef &&
    entry.entryType === 'payout_accrual' &&
    entry.direction === 'debit' &&
    entry.amountUnits === input.providerAmount.units &&
    entry.currency === input.providerAmount.currency &&
    entry.exponent === input.providerAmount.exponent &&
    entry.transactionRef === input.identity.payoutRef &&
    entry.idempotencyKey === input.identity.payoutKey &&
    entry.businessId === input.businessId &&
    entry.sourceDigest === input.identity.payoutSource &&
    sameEvidenceRefs(entry.evidenceRefs, [input.identity.payoutEvidence]) &&
    entry.createdAt === input.settledAt
  )
}

export function validateBrokeredDisputeReplay(input: Readonly<{
  originalTransactionRef: string
  originalPrincipalId: string
  originalCurrency: string
  originalExponent: number
  originalState: string
  originalBudgetState: string | undefined
  businessId: string
  disputeRef: string
  sourceDigest: string
  evidenceRefs: readonly string[]
  refundTransactionRef: string
  refundInputDigest: string
  lossTransactionRef: string
  lossInputDigest: string
  operatorAccountRef: string
  rakeAccountRef: string
  lossAccountRef: string
  operatorAmount: ExactAmount
  rakeAmount: ExactAmount
  providerAmount: ExactAmount
  invocationRef: string
  attemptRef: string
  prior: Doc<'moneyTransactions'>
  reversalRows: readonly Doc<'moneyTransactions'>[]
  refundRows: readonly Doc<'moneyLedgerEntries'>[]
  lossRows: readonly Doc<'moneyTransactions'>[]
  lossEntries: readonly Doc<'moneyLedgerEntries'>[]
}>): boolean {
  const operator = input.refundRows.find(
    (row) => row.entryRef === `${input.refundTransactionRef}:operator`,
  )
  const rake = input.refundRows.find(
    (row) => row.entryRef === `${input.refundTransactionRef}:rake`,
  )
  const loss = input.lossRows[0]
  const lossEntry = input.lossEntries[0]
  const prior = input.prior
  const common = (row: Doc<'moneyLedgerEntries'>): boolean =>
    row.transactionRef === input.refundTransactionRef &&
    row.idempotencyKey === input.refundTransactionRef &&
    row.sourceDigest === input.sourceDigest &&
    sameEvidenceRefs(row.evidenceRefs, input.evidenceRefs) &&
    row.reversalOf === input.originalTransactionRef &&
    row.createdAt === prior.createdAt
  return (
    input.originalState === 'reversed' &&
    input.originalBudgetState === 'released' &&
    input.reversalRows.length === 1 &&
    input.reversalRows[0]?._id === prior._id &&
    input.refundRows.length === 2 &&
    operator !== undefined &&
    rake !== undefined &&
    operator !== rake &&
    input.lossRows.length === 1 &&
    input.lossEntries.length === 1 &&
    loss !== undefined &&
    lossEntry !== undefined &&
    prior.transactionRef === input.refundTransactionRef &&
    prior.idempotencyKey === input.refundTransactionRef &&
    prior.inputDigest === input.refundInputDigest &&
    prior.kind === 'refund' &&
    prior.principalId === input.originalPrincipalId &&
    prior.currency === input.originalCurrency &&
    prior.exponent === input.originalExponent &&
    prior.state === 'reversed' &&
    prior.reversalOf === input.originalTransactionRef &&
    prior.externalRef === input.disputeRef &&
    operator.accountRef === input.operatorAccountRef &&
    operator.entryType === 'refund' &&
    operator.direction === 'credit' &&
    operator.amountUnits === input.operatorAmount.units &&
    operator.currency === input.operatorAmount.currency &&
    operator.exponent === input.operatorAmount.exponent &&
    operator.principalId === input.originalPrincipalId &&
    common(operator) &&
    rake.accountRef === input.rakeAccountRef &&
    rake.entryType === 'refund' &&
    rake.direction === 'debit' &&
    rake.amountUnits === input.rakeAmount.units &&
    rake.currency === input.rakeAmount.currency &&
    rake.exponent === input.rakeAmount.exponent &&
    rake.businessId === input.businessId &&
    common(rake) &&
    loss.transactionRef === input.lossTransactionRef &&
    loss.kind === 'external_loss' &&
    loss.idempotencyKey === input.lossTransactionRef &&
    loss.inputDigest === input.lossInputDigest &&
    loss.principalId === input.originalPrincipalId &&
    loss.currency === input.providerAmount.currency &&
    loss.amountUnits === input.providerAmount.units &&
    loss.exponent === input.providerAmount.exponent &&
    loss.state === 'applied' &&
    loss.externalRef === input.disputeRef &&
    lossEntry.entryRef === `${input.lossTransactionRef}:external-loss` &&
    lossEntry.accountRef === input.lossAccountRef &&
    lossEntry.entryType === 'external_loss' &&
    lossEntry.direction === 'credit' &&
    lossEntry.amountUnits === input.providerAmount.units &&
    lossEntry.currency === input.providerAmount.currency &&
    lossEntry.exponent === input.providerAmount.exponent &&
    lossEntry.transactionRef === input.lossTransactionRef &&
    lossEntry.idempotencyKey === input.lossTransactionRef &&
    lossEntry.principalId === input.originalPrincipalId &&
    lossEntry.invocationRef === input.invocationRef &&
    lossEntry.attemptRef === input.attemptRef &&
    lossEntry.sourceDigest === input.sourceDigest &&
    sameEvidenceRefs(lossEntry.evidenceRefs, input.evidenceRefs)
  )
}
