import { v, type Infer } from 'convex/values'
import {
  billingSourceArgs,
  exactAmount,
  identifier,
  moneyRefusalValue,
  serverFunctionAuth,
  stripeMoneyWebhookEventArg,
} from '../moneyLedgerValues'

const topupState = v.union(
  v.literal('pending'),
  v.literal('succeeded'),
  v.literal('failed'),
  v.literal('outcome_unknown'),
)
export const topupCommandValue = v.object({
  commandRef: identifier,
  principalId: identifier,
  accountRef: identifier,
  currency: identifier,
  exponent: v.number(),
  amountUnits: identifier,
  processingFeeUnits: identifier,
  chargeAmountUnits: identifier,
  idempotencyKey: identifier,
  inputDigest: identifier,
  successReturnRef: identifier,
  providerRecoveryDeadlineAt: v.number(),
  state: topupState,
  externalRef: v.optional(identifier),
  providerStatus: v.optional(topupState),
  metadataDigest: v.optional(identifier),
  requestDigest: v.optional(identifier),
  checkoutSessionDigest: v.optional(identifier),
  paymentIntentDigest: v.optional(identifier),
  evidenceDigest: v.optional(identifier),
  providerEvidenceRef: v.optional(identifier),
  appliedStripeEventId: v.optional(identifier),
  appliedPayloadDigest: v.optional(identifier),
  appliedTransactionRef: v.optional(identifier),
  buyerBalanceBefore: v.optional(exactAmount),
  buyerBalanceAfter: v.optional(exactAmount),
  createdAt: v.number(),
  updatedAt: v.number(),
})
export const topupCommandResultValue = v.union(
  v.object({ kind: v.literal('accepted'), command: topupCommandValue }),
  moneyRefusalValue,
)
export const topupWebhookResultValue = v.union(
  v.object({
    kind: v.literal('accepted'),
    status: v.union(
      v.literal('applied'),
      v.literal('replayed'),
      v.literal('ignored'),
    ),
    appliedRef: v.optional(identifier),
  }),
  moneyRefusalValue,
)
export const topupProviderEvidenceArg = v.object({
  externalRef: identifier,
  amount: exactAmount,
  status: topupState,
  evidenceRef: identifier,
  requestDigest: identifier,
  metadataDigest: identifier,
  checkoutSessionDigest: identifier,
  paymentIntentDigest: v.optional(identifier),
  evidenceDigest: identifier,
  paymentId: v.optional(identifier),
})
export const topupReadInputArg = v.object({
  externalRef: v.optional(identifier),
  commandRef: v.optional(identifier),
  idempotencyKey: identifier,
})
export const reserveCreditTopupArgs = v.object({
  principalId: identifier,
  accountRef: identifier,
  amount: exactAmount,
  commandRef: identifier,
  idempotencyKey: identifier,
  inputDigest: identifier,
  successReturnRef: identifier,
  ...billingSourceArgs,
})
export const markCreditTopupOutcomeUnknownArgs = v.object({
  commandRef: identifier,
  principalId: identifier,
  accountRef: identifier,
  amount: exactAmount,
  idempotencyKey: identifier,
  inputDigest: identifier,
  successReturnRef: identifier,
  providerRecoveryDeadlineAt: v.number(),
  externalRef: v.optional(identifier),
  ...billingSourceArgs,
})
export const bindCreditPaymentSessionArgs = v.object({
  commandRef: identifier,
  evidence: topupProviderEvidenceArg,
  ...billingSourceArgs,
})
export const readCreditTopupWebhookCommandArgs = v.object({
  commandRef: identifier,
  externalRef: identifier,
  serviceAuth: serverFunctionAuth,
})
export const applyCreditTopupArgs = v.object({
  event: stripeMoneyWebhookEventArg,
  readback: topupProviderEvidenceArg,
  ...billingSourceArgs,
})
export type TopupProviderEvidence = Infer<typeof topupProviderEvidenceArg>
export type MoneyRefusal = Infer<typeof moneyRefusalValue>
export type TopupWebhookResult = Infer<typeof topupWebhookResultValue>
export type ReserveCreditTopupArgs = Infer<typeof reserveCreditTopupArgs>
export type MarkCreditTopupOutcomeUnknownArgs = Infer<
  typeof markCreditTopupOutcomeUnknownArgs
>
export type BindCreditPaymentSessionArgs = Infer<
  typeof bindCreditPaymentSessionArgs
>
export type ReadCreditTopupCommandArgs = Infer<typeof topupReadInputArg>
export type ReadCreditTopupWebhookCommandArgs = Infer<
  typeof readCreditTopupWebhookCommandArgs
>
export type ApplyCreditTopupArgs = Infer<typeof applyCreditTopupArgs>

export function refusedTopup(code: string, retryable: boolean): MoneyRefusal {
  return { kind: 'refused', code, retryable }
}


