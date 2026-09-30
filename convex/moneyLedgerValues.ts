import { v } from 'convex/values'

import { sourceWriteArgs } from './lib/security/sourceWrite/contracts'
import { spendingPeriodsValue, promotionalCreditAllocationValue } from '@/modules/money/public'

export const identifier = v.string()
export const accountHistoryResultValue = v.union(
  v.object({
    kind: v.literal('available'),
    entries: v.array(v.object({
      transactionId: v.string(), transactionRef: v.union(v.string(), v.null()),
      occurredAt: v.number(), recordedAt: v.union(v.number(), v.null()),
      kind: v.union(v.literal('funding'), v.literal('funding_reversal'), v.literal('call_spend'),
        v.literal('document_adjustment'), v.literal('promotional_grant'), v.literal('promotional_use'), v.literal('promotional_expiry'), v.literal('unmapped')),
      accountEffect: v.object({ currency: v.literal('AUD'), units: v.string(), exponent: v.literal(6) }),
      documentEffectUnits: v.string(), reverted: v.boolean(), revertedAt: v.union(v.number(), v.null()),
      sourceRef: v.union(v.string(), v.null()), sourceDigest: v.union(v.string(), v.null()),
    })),
    snapshotAt: v.number(), continueCursor: v.string(), isDone: v.boolean(),
    coverage: v.union(v.literal('complete'), v.literal('partial')),
    sourceLinkCoverage: v.union(v.literal('complete'), v.literal('partial'), v.literal('unavailable')),
    source: v.literal('formance_transaction_cursor'),
    ordering: v.literal('recorded_transaction_sequence_desc'),
  }),
  v.object({ kind: v.literal('setup_required'), code: v.string() }),
  v.object({ kind: v.literal('unavailable'), code: v.string() }),
  v.object({ kind: v.literal('refused'), code: v.string() }),
)
export const serverFunctionAuth = v.object({
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  scopes: v.array(v.string()),
  authorityMode: v.optional(
    v.union(
      v.literal('read_only'),
      v.literal('approval_required'),
      v.literal('spending_policy'),
      v.literal('unrestricted_test_only'),
    ),
  ),
  issuedAt: v.number(),
  signature: v.string(),
})
export const exactAmount = v.object({
  currency: identifier,
  units: identifier,
  exponent: v.number(),
})
export const moneyArgs = {
  principalId: identifier,
  currency: identifier,
}
export const moneyRefusalValue = v.object({
  kind: v.literal('refused'),
  code: v.string(),
  retryable: v.boolean(),
  correlationRef: v.optional(v.string()),
})
export const billingSourceArgs = {
  operationKey: identifier,
  correlationId: identifier,
  ...sourceWriteArgs,
}

/** The same managed Call booking shape is used by every Formance consequence. */
export const managedCallBookingArgs = {
  callRef: v.string(),
  quoteRef: v.string(),
  idempotencyKey: v.string(),
  accountRef: v.string(),
  principalRef: v.string(),
  agentBudgetGeneration: v.number(),
  legalCustomerRef: v.string(),
  legalCustomerGeneration: v.number(),
  treasuryRef: v.string(),
  treasuryGeneration: v.number(),
  toolRef: v.string(),
  providerRef: v.string(),
  authorityGeneration: v.number(),
  policyGeneration: v.number(),
  buyerAmountUnits: v.string(),
  buyerRevenueUnits: v.string(),
  buyerTaxUnits: v.string(),
  providerAmountUnits: v.string(),
  quoteDigest: v.string(),
  inputDigest: v.string(),
  policyDigest: v.string(),
  rateEvidenceDigest: v.string(),
  treasuryEvidenceDigest: v.string(),
  x402RequirementDigest: v.string(),
  spendingPeriods: v.optional(spendingPeriodsValue),
  promotionalCreditAllocation: v.optional(promotionalCreditAllocationValue),
}
export const checkoutEventArg = v.object({
  kind: v.literal('checkout'),
  stripeEventId: identifier,
  eventType: v.union(
    v.literal('checkout.session.completed'),
    v.literal('checkout.session.async_payment_succeeded'),
    v.literal('checkout.session.async_payment_failed'),
  ),
  externalRef: identifier,
  sessionId: identifier,
  commandRef: identifier,
  paymentId: v.optional(identifier),
  checkoutSessionDigest: identifier,
  paymentIntentDigest: v.optional(identifier),
  status: v.union(
    v.literal('paid'),
    v.literal('processing'),
    v.literal('failed'),
  ),
  amount: exactAmount,
  metadataDigest: identifier,
  payloadDigest: identifier,
  observedAt: v.number(),
})
export const accountUpdatedEventArg = v.object({
  kind: v.literal('account'),
  stripeEventId: identifier,
  eventType: v.union(
    v.literal('v2.core.account.created'),
    v.literal('v2.core.account.updated'),
    v.literal('v2.core.account.closed'),
    v.literal('v2.core.account[configuration.recipient].updated'),
    v.literal(
      'v2.core.account[configuration.recipient].capability_status_updated',
    ),
  ),
  externalRef: identifier,
  stripeAccountId: identifier,
  providerObjectDigest: identifier,
  payloadDigest: identifier,
  observedAt: v.number(),
})
export const refundEventArg = v.object({
  kind: v.literal('refund'),
  stripeEventId: identifier,
  eventType: v.union(
    v.literal('refund.created'),
    v.literal('refund.updated'),
    v.literal('refund.failed'),
  ),
  externalRef: identifier,
  refundId: identifier,
  paymentId: identifier,
  chargeId: identifier,
  refundDigest: identifier,
  status: v.union(v.literal('pending'), v.literal('succeeded'), v.literal('failed')),
  amount: exactAmount,
  payloadDigest: identifier,
  observedAt: v.number(),
})
export const stripeMoneyWebhookEventArg = v.union(
  checkoutEventArg,
  refundEventArg,
  accountUpdatedEventArg,
)
