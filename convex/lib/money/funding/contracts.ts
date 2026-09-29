import { v, type Infer } from 'convex/values'

import type { Doc } from '../../../_generated/dataModel'
import { exactAmount, serverFunctionAuth, stripeMoneyWebhookEventArg } from '../../../moneyLedgerValues'
import { agentAccessPrincipalValue } from '../../../agentAccessPrincipals'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'

export const environmentValue = v.union(v.literal('sandbox'), v.literal('production'))
export const fundingProviderStateValue = v.union(
  v.literal('pending'),
  v.literal('succeeded'),
  v.literal('failed'),
  v.literal('outcome_unknown'),
)
export const fundingStateValue = v.union(
  v.literal('pending'),
  v.literal('succeeded'),
  v.literal('failed'),
  v.literal('outcome_unknown'),
  v.literal('reversed'),
)
export const fundingProviderEvidenceArg = v.object({
  externalRef: v.string(),
  amount: exactAmount,
  status: fundingProviderStateValue,
  evidenceRef: v.string(),
  requestDigest: v.string(),
  metadataDigest: v.string(),
  checkoutSessionDigest: v.string(),
  paymentIntentDigest: v.optional(v.string()),
  evidenceDigest: v.string(),
  paymentId: v.optional(v.string()),
  checkoutStatus: v.optional(v.union(v.literal('open'), v.literal('complete'), v.literal('expired'))),
  paymentStatus: v.optional(v.union(v.literal('unpaid'), v.literal('paid'), v.literal('no_payment_required'))),
  checkoutMode: v.optional(v.literal('hosted_page')),
  checkoutExpiresAt: v.optional(v.number()),
})
export const fundingRefundEvidenceArg = v.object({
  refundId: v.string(),
  paymentId: v.string(),
  chargeId: v.string(),
  status: v.union(v.literal('pending'), v.literal('succeeded'), v.literal('failed')),
  amount: exactAmount,
  refundDigest: v.string(),
  evidenceDigest: v.string(),
  evidenceRef: v.string(),
  observedAt: v.number(),
})
export const fundingCommandValue = v.object({
  commandRef: v.string(),
  accountRef: v.string(),
  legalCustomerRef: v.string(),
  actorPrincipalRef: v.string(),
  environment: environmentValue,
  currency: v.literal('AUD'),
  exponent: v.literal(6),
  principalUnits: v.string(),
  serviceFeeUnits: v.string(),
  taxUnits: v.string(),
  totalUnits: v.string(),
  commercialPolicyDigest: v.string(),
  commercialPolicyRefs: v.array(v.string()),
  idempotencyKey: v.string(),
  inputDigest: v.string(),
  successReturnRef: v.string(),
  providerRecoveryDeadlineAt: v.number(),
  initiationKind: v.optional(v.union(v.literal('owner_top_up'), v.literal('agent_handoff'))),
  checkoutMode: v.optional(v.literal('hosted_page')),
  checkoutExpiresAt: v.optional(v.number()),
  cancelReturnRef: v.optional(v.string()),
  requesterDisplayName: v.optional(v.string()),
  providerCheckoutStatus: v.optional(v.union(v.literal('open'), v.literal('complete'), v.literal('expired'))),
  providerPaymentStatus: v.optional(v.union(v.literal('unpaid'), v.literal('paid'), v.literal('no_payment_required'))),
  terminalReason: v.optional(v.union(v.literal('async_payment_failed'), v.literal('expired'))),
  state: fundingStateValue,
  externalRef: v.optional(v.string()),
  providerStatus: v.optional(fundingStateValue),
  providerEvidenceRef: v.optional(v.string()),
  requestDigest: v.optional(v.string()),
  metadataDigest: v.optional(v.string()),
  checkoutSessionDigest: v.optional(v.string()),
  paymentIntentDigest: v.optional(v.string()),
  evidenceDigest: v.optional(v.string()),
  paymentId: v.optional(v.string()),
  appliedStripeEventId: v.optional(v.string()),
  appliedPayloadDigest: v.optional(v.string()),
  appliedTransactionRef: v.optional(v.string()),
  reversalState: v.optional(v.union(
    v.literal('pending'), v.literal('succeeded'), v.literal('outcome_unknown'),
  )),
  reversalStripeEventId: v.optional(v.string()),
  reversalRefundId: v.optional(v.string()),
  reversalChargeId: v.optional(v.string()),
  reversalEvidenceDigest: v.optional(v.string()),
  reversalTransactionRef: v.optional(v.string()),
  reversalStatusRef: v.optional(v.string()),
  reversedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
export const fundingResultValue = v.union(
  v.object({ kind: v.literal('accepted'), command: fundingCommandValue }),
  v.object({ kind: v.literal('refused'), code: v.string(), retryable: v.boolean() }),
)
export const reserveFundingArgsValue = v.object({
  amountUnits: v.string(),
  environment: environmentValue,
  expectedPolicyDigest: v.string(),
  commandRef: v.string(),
  idempotencyKey: v.string(),
  inputDigest: v.string(),
  successReturnRef: v.string(),
  checkoutMode: v.optional(v.literal('hosted_page')),
  checkoutExpiresAt: v.optional(v.number()),
  cancelReturnRef: v.optional(v.string()),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
})
export const bindFundingArgsValue = v.object({
  commandRef: v.string(),
  evidence: fundingProviderEvidenceArg,
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
})
export const applyFundingEventArgsValue = v.object({
  event: stripeMoneyWebhookEventArg,
  readback: v.optional(fundingProviderEvidenceArg),
  refundReadback: v.optional(fundingRefundEvidenceArg),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
})
export const trustedApplyFundingEventArgsValue = applyFundingEventArgsValue.omit(
  'sourceWrite',
  'sourceWriteRequest',
)
export const finalizeFundingEventArgsValue = applyFundingEventArgsValue.extend({
  formanceTransactionRef: v.string(),
})
export const trustedFinalizeFundingEventArgsValue = trustedApplyFundingEventArgsValue.extend({
  formanceTransactionRef: v.string(),
})
export const readFundingArgsValue = v.object({
  commandRef: v.optional(v.string()),
  externalRef: v.optional(v.string()),
  idempotencyKey: v.optional(v.string()),
})
export const reserveAgentHandoffArgsValue = v.object({
  principalAmountUnits: v.string(),
  environment: environmentValue,
  idempotencyKey: v.string(),
  successReturnRef: v.string(),
  cancelReturnRef: v.string(),
  checkoutExpiresAt: v.number(),
  agentPrincipal: agentAccessPrincipalValue,
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
})
export const bindAgentHandoffArgsValue = v.object({
  commandRef: v.string(),
  evidence: fundingProviderEvidenceArg,
  agentPrincipal: agentAccessPrincipalValue,
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
})
export const readAgentHandoffArgsValue = v.object({
  externalRef: v.string(),
  agentPrincipal: agentAccessPrincipalValue,
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
})
export const publicFundingHandoffValue = v.union(
  v.object({
    kind: v.literal('found'),
    funding: v.object({
      state: v.union(
        v.literal('awaiting_payment'),
        v.literal('processing'),
        v.literal('ready'),
        v.literal('expired'),
        v.literal('failed'),
      ),
      agentName: v.string(),
      creditAmount: exactAmount,
    }),
  }),
  v.object({ kind: v.literal('not_found') }),
)
export const markFundingUnknownArgsValue = v.object({
  commandRef: v.string(),
  idempotencyKey: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
})
export const readWebhookFundingArgsValue = v.object({
  commandRef: v.string(),
  externalRef: v.string(),
  serviceAuth: serverFunctionAuth,
})
export const readWebhookRefundFundingArgsValue = v.object({
  paymentId: v.string(),
  refundId: v.string(),
  serviceAuth: serverFunctionAuth,
})
export const applyFundingEventResultValue = v.union(
  v.object({
    kind: v.literal('accepted'),
    status: v.union(v.literal('applied'), v.literal('replayed'), v.literal('ignored')),
    appliedRef: v.optional(v.string()),
  }),
  v.object({ kind: v.literal('refused'), code: v.string(), retryable: v.boolean() }),
)
export const fundingBookingValue = v.object({
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
})
export const prepareFundingEventResultValue = v.union(
  v.object({
    kind: v.literal('prepared'),
    bookingKind: v.union(v.literal('settlement'), v.literal('reversal')),
    booking: fundingBookingValue,
  }),
  applyFundingEventResultValue,
)

export type ReserveFundingArgs = Infer<typeof reserveFundingArgsValue>
export type BindFundingArgs = Infer<typeof bindFundingArgsValue>
export type ApplyFundingEventArgs = Infer<typeof applyFundingEventArgsValue>
export type FundingResult = Infer<typeof fundingResultValue>

export const RECOVERY_WINDOW_MS = 23 * 60 * 60 * 1_000
export const POSITIVE_UNITS = /^[1-9]\d{0,29}$/u
export const SHA256 = /^sha256:[a-f0-9]{64}$/u
export const FUNDING_WEBHOOK_LOOKUP_OPERATION = 'moneyAccountFunding:readWebhookCommand'
export const FUNDING_REFUND_LOOKUP_OPERATION = 'moneyAccountFunding:readWebhookRefundCommand'
export const FUNDING_WEBHOOK_LOOKUP_SCOPE = 'money:funding_webhook_read'

export function fundingCommandView(row: Doc<'moneyFundingCommands'>) {
  const { _id, _creationTime, ...view } = row
  return view
}

export function refused(code: string, retryable = false) {
  return { kind: 'refused' as const, code, retryable }
}
