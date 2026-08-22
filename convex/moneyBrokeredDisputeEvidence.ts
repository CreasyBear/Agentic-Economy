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
    payout.expectedAccountVersion < input.providerVersion &&
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
  observedAt: number
  originalUpdatedAt: number
  operatorVersion: number
  lossAccountVersion: number
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
  return (
    Number.isFinite(input.observedAt) &&
    Number.isSafeInteger(input.operatorVersion) &&
    Number.isSafeInteger(input.lossAccountVersion) &&
    input.originalState === 'reversed' &&
    input.originalBudgetState === 'released' &&
    input.originalUpdatedAt === input.observedAt &&
    input.reversalRows.length === 1 &&
    input.reversalRows[0]?._id === prior._id &&
    input.reversalRows[0]?.transactionRef === input.refundTransactionRef &&
    input.refundRows.length === 2 &&
    operator !== undefined &&
    rake !== undefined &&
    operator !== rake &&
    input.refundRows.every(
      (row) => row === operator || row === rake,
    ) &&
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
    Number.isSafeInteger(prior.expectedAccountVersion) &&
    prior.expectedAccountVersion <= input.operatorVersion &&
    prior.amountUnits === undefined &&
    prior.accountId === undefined &&
    prior.credentialId === undefined &&
    prior.budgetPolicyRef === undefined &&
    prior.budgetGeneration === undefined &&
    prior.budgetEnvironment === undefined &&
    prior.budgetDayStart === undefined &&
    prior.budgetMonthStart === undefined &&
    prior.budgetState === undefined &&
    prior.settledAt === undefined &&
    prior.reversalOf === input.originalTransactionRef &&
    prior.externalRef === input.disputeRef &&
    prior.createdAt === input.observedAt &&
    prior.updatedAt === input.observedAt &&
    operator.accountRef === input.operatorAccountRef &&
    operator.entryType === 'refund' &&
    operator.direction === 'credit' &&
    operator.entryRef === `${input.refundTransactionRef}:operator` &&
    operator.amountUnits === input.operatorAmount.units &&
    operator.currency === input.operatorAmount.currency &&
    operator.exponent === input.operatorAmount.exponent &&
    operator.principalId === input.originalPrincipalId &&
    operator.businessId === undefined &&
    operator.invocationRef === undefined &&
    operator.attemptRef === undefined &&
    operator.payoutRef === undefined &&
    operator.allocationRef === undefined &&
    operator.allocationCorrectionUnits === undefined &&
    operator.transactionRef === input.refundTransactionRef &&
    operator.idempotencyKey === input.refundTransactionRef &&
    operator.sourceDigest === input.sourceDigest &&
    sameEvidenceRefs(operator.evidenceRefs, input.evidenceRefs) &&
    operator.reversalOf === input.originalTransactionRef &&
    operator.createdAt === input.observedAt &&
    rake.accountRef === input.rakeAccountRef &&
    rake.entryType === 'refund' &&
    rake.direction === 'debit' &&
    rake.entryRef === `${input.refundTransactionRef}:rake` &&
    rake.amountUnits === input.rakeAmount.units &&
    rake.currency === input.rakeAmount.currency &&
    rake.exponent === input.rakeAmount.exponent &&
    rake.businessId === input.businessId &&
    rake.principalId === undefined &&
    rake.invocationRef === undefined &&
    rake.attemptRef === undefined &&
    rake.payoutRef === undefined &&
    rake.allocationRef === undefined &&
    rake.allocationCorrectionUnits === undefined &&
    rake.transactionRef === input.refundTransactionRef &&
    rake.idempotencyKey === input.refundTransactionRef &&
    rake.sourceDigest === input.sourceDigest &&
    sameEvidenceRefs(rake.evidenceRefs, input.evidenceRefs) &&
    rake.reversalOf === input.originalTransactionRef &&
    rake.createdAt === input.observedAt &&
    loss.transactionRef === input.lossTransactionRef &&
    loss.kind === 'external_loss' &&
    loss.idempotencyKey === input.lossTransactionRef &&
    loss.inputDigest === input.lossInputDigest &&
    loss.principalId === input.originalPrincipalId &&
    loss.currency === input.providerAmount.currency &&
    loss.amountUnits === input.providerAmount.units &&
    loss.exponent === input.providerAmount.exponent &&
    loss.state === 'applied' &&
    Number.isSafeInteger(loss.expectedAccountVersion) &&
    loss.expectedAccountVersion <= input.lossAccountVersion &&
    loss.externalRef === input.disputeRef &&
    loss.accountId === undefined &&
    loss.credentialId === undefined &&
    loss.budgetPolicyRef === undefined &&
    loss.budgetGeneration === undefined &&
    loss.budgetEnvironment === undefined &&
    loss.budgetDayStart === undefined &&
    loss.budgetMonthStart === undefined &&
    loss.budgetState === undefined &&
    loss.settledAt === undefined &&
    loss.reversalOf === undefined &&
    loss.createdAt === input.observedAt &&
    loss.updatedAt === input.observedAt &&
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
    lossEntry.businessId === undefined &&
    lossEntry.invocationRef === input.invocationRef &&
    lossEntry.attemptRef === input.attemptRef &&
    lossEntry.sourceDigest === input.sourceDigest &&
    sameEvidenceRefs(lossEntry.evidenceRefs, input.evidenceRefs) &&
    lossEntry.payoutRef === undefined &&
    lossEntry.allocationRef === undefined &&
    lossEntry.allocationCorrectionUnits === undefined &&
    lossEntry.reversalOf === undefined &&
    lossEntry.createdAt === input.observedAt
  )
}
