import { v } from 'convex/values'

import { accountHistoryResultValue, managedCallBookingArgs } from '../../../moneyLedgerValues'
import { accountCreditBalanceValue, eligiblePromotionalGrantValue, spendingPeriodAdjustmentValue } from '../../../../src/modules/money/public'

export { accountHistoryResultValue, managedCallBookingArgs, spendingPeriodAdjustmentValue }

export const setupRequired = v.object({ kind: v.literal('setup_required'), code: v.string() })
export const unavailable = v.object({ kind: v.literal('unavailable'), code: v.string() })
export const managedCallSettlementReadResult = v.union(
  v.object({ kind: v.literal('confirmed'), transactionRefs: v.array(v.string()) }),
  v.object({ kind: v.literal('refused'), code: v.string() }),
  unavailable,
)
export const managedCallReservationReadResult = v.union(
  v.object({ kind: v.literal('confirmed'), transactionRefs: v.array(v.string()) }),
  v.object({ kind: v.literal('refused'), code: v.string() }),
  unavailable,
)
export const managedCallReleaseReadResult = v.union(
  v.object({ kind: v.literal('confirmed'), transactionRefs: v.array(v.string()) }),
  v.object({ kind: v.literal('refused'), code: v.string() }),
  unavailable,
)
export const moneyResult = v.union(
  v.object({
    kind: v.literal('completed'),
    transactionRefs: v.array(v.string()),
    replayed: v.boolean(),
  }),
  v.object({ kind: v.literal('refused'), code: v.string(), retryable: v.literal(false) }),
  v.object({
    kind: v.literal('unavailable'),
    code: v.string(),
    submissionProvenAbsent: v.literal(true),
  }),
  v.object({ kind: v.literal('outcome_unknown'), reference: v.string(), statusRef: v.string() }),
)
export const fundingBookingArgs = {
  commandRef: v.string(),
  idempotencyKey: v.string(),
  accountRef: v.string(),
  processorRef: v.string(),
  principalUnits: v.string(),
  serviceFeeUnits: v.string(),
  taxUnits: v.string(),
  totalUnits: v.string(),
  policyDigest: v.string(),
  externalEvidenceDigest: v.string(),
}
export const capacityKind = v.union(
  v.literal('agent_budget'),
  v.literal('legal_customer_exposure'),
  v.literal('treasury_usdc'),
)
export const balanceKind = v.union(v.literal('account_aud'), capacityKind)
export const periodKind = v.union(v.literal('day'), v.literal('month'))
export const spendingPeriodResult = v.union(
  v.object({
    kind: v.literal('available'),
    balanceKind: v.literal('agent_budget'),
    subjectRef: v.string(),
    currency: v.literal('AUD'),
    exponent: v.literal(6),
    units: v.string(),
    observedAt: v.number(),
    source: v.literal('formance_live_read'),
    authoritativeForConsequences: v.literal(false),
  }),
  setupRequired,
  unavailable,
)
export const healthResult = v.union(
  v.object({
    kind: v.literal('ready'),
    gatewayVersion: v.string(),
    ledgerVersion: v.string(),
    schemaVersion: v.string(),
    schemaDigest: v.string(),
  }),
  setupRequired,
  unavailable,
)
export const installationResult = v.union(
  v.object({
    kind: v.literal('completed'),
    ledger: v.string(),
    schemaVersion: v.string(),
    schemaDigest: v.string(),
    replayed: v.boolean(),
  }),
  setupRequired,
  unavailable,
)
export const periodSpendResult = v.union(
  v.object({
    kind: v.literal('available'),
    currency: v.literal('AUD'),
    exponent: v.literal(6),
    spendUnits: v.string(),
    transactionCountUnits: v.string(),
    periodStartAt: v.number(),
    periodEndAt: v.number(),
    observedAt: v.number(),
    source: v.literal('formance_transaction_cursor'),
    authoritativeForConsequences: v.literal(false),
  }),
  v.object({ kind: v.literal('empty') }),
  setupRequired,
  unavailable,
)
export const statementPageResult = v.union(
  v.object({
    kind: v.literal('available'),
    transactionRefs: v.array(v.string()),
    exactAmountUnits: v.string(),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  setupRequired,
  unavailable,
)
export const displayBalanceResult = v.union(
  v.object({
    kind: v.literal('available'),
    balanceKind,
    subjectRef: v.string(),
    generation: v.optional(v.number()),
    currency: v.union(v.literal('AUD'), v.literal('USDC')),
    exponent: v.literal(6),
    units: v.string(),
    observedAt: v.number(),
    source: v.literal('formance_live_read'),
    authoritativeForConsequences: v.literal(false),
  }),
  setupRequired,
  unavailable,
)

export const readPeriodSpendArgs = {
  accountRef: v.string(), periodStartAt: v.number(), periodEndAt: v.number(),
}
export const readAccountHistoryArgs = { accountRef: v.string(), cursor: v.optional(v.string()) }
export const readStatementPageArgs = {
  accountRef: v.string(),
  periodStartAt: v.number(),
  periodEndAt: v.number(),
  snapshotCutoffAt: v.number(),
  cursor: v.optional(v.string()),
}
export const buyerAdjustmentArgs = {
  documentRef: v.string(),
  accountRef: v.string(),
  residualUnits: v.string(),
  policyDigest: v.string(),
  snapshotDigest: v.string(),
}
export const capacitySyncArgs = {
  commandRef: v.string(),
  idempotencyKey: v.string(),
  kind: capacityKind,
  subjectRef: v.string(),
  generation: v.number(),
  targetUnits: v.string(),
  policyDigest: v.string(),
  externalEvidenceDigest: v.string(),
}
export const spendingPeriodArgs = {
  principalRef: v.string(),
  periodKind,
  periodStartAt: v.number(),
  periodEndAt: v.number(),
}
export const displayBalanceArgs = {
  balanceKind, subjectRef: v.string(), generation: v.optional(v.number()),
}
export const releaseManagedCallArgs = {
  booking: v.object(managedCallBookingArgs),
  externalEvidenceDigest: v.string(),
  submissionProvenAbsent: v.literal(true),
}
export const releaseExpiredUnusedCallArgs = {
  booking: v.object(managedCallBookingArgs), externalEvidenceDigest: v.string(),
}
export const finalizeManagedCallArgs = {
  booking: v.object(managedCallBookingArgs), externalEvidenceDigest: v.string(),
}
export const reverseProviderSettlementArgs = {
  booking: v.object(managedCallBookingArgs),
  originalSettlementRef: v.string(),
  correctionEvidenceDigest: v.string(),
}

export const promotionalCreditArgs = {
  grantRef: v.string(), accountRef: v.string(), amountUnits: v.string(),
  expiresAt: v.number(), commandDigest: v.string(), revision: v.optional(v.number()),
}

export { accountCreditBalanceValue }
export const readCreditBalanceArgs = { accountRef: v.string(), grants: v.array(eligiblePromotionalGrantValue) }
