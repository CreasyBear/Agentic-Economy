import { v } from 'convex/values'

import {
  billingSourceArgs,
  exactAmount,
  identifier,
} from './moneyLedgerValues'

export {
  completePayoutTransferHandler,
  type CompletePayoutTransferArgs,
  type PayoutTransferEvidence,
} from './moneyPayoutTransferCompleteApply'
export {
  reconcilePayoutTransferHandler,
  type ReconcilePayoutTransferArgs,
} from './moneyPayoutTransferReconcile'
export {
  readOwnerPayoutTransferHandler,
  type ReadOwnerPayoutTransferArgs,
} from './moneyPayoutTransferRead'

export const payoutTransferEvidenceArg = v.union(
  v.object({
    provider: v.literal('stripe'),
    transferId: identifier,
    destinationAccountId: identifier,
    amount: exactAmount,
    status: v.union(
      v.literal('pending'),
      v.literal('succeeded'),
      v.literal('failed'),
      v.literal('reversed'),
      v.literal('outcome_unknown'),
    ),
    requestDigest: identifier,
    evidenceDigest: identifier,
    observedAt: v.number(),
  }),
  v.object({
    provider: v.literal('stripe'),
    resolution: v.literal('not_released'),
    destinationAccountId: identifier,
    amount: exactAmount,
    status: v.literal('failed'),
    requestDigest: identifier,
    evidenceDigest: identifier,
    observedAt: v.number(),
  }),
)
export const payoutCompleteArgs = {
  authority: v.object({ principalId: identifier }),
  businessId: identifier,
  amount: exactAmount,
  providerAccountRef: identifier,
  destinationAccountId: identifier,
  payoutRef: identifier,
  commandId: identifier,
  inputDigest: identifier,
  idempotencyKey: identifier,
  evidence: payoutTransferEvidenceArg,
  sourceDigest: identifier,
  evidenceRefs: v.array(identifier),
  observedAt: v.number(),
  failureCode: v.optional(identifier),
  ...billingSourceArgs,
}
export const reconcilePayoutTransferArgs = {
  ...payoutCompleteArgs,
  outcome: v.union(v.literal('not_released'), v.literal('failed')),
}
export const readOwnerPayoutTransferArgs = {
  businessId: identifier,
  currency: identifier,
  payoutRef: identifier,
  idempotencyKey: identifier,
}
