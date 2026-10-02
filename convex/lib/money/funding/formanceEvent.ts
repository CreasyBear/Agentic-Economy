import { v, type Infer } from 'convex/values'
import { internal } from '../../../_generated/api'
import type { ActionCtx } from '../../../_generated/server'
import { exactAmount, stripeMoneyWebhookEventArg } from '../../../moneyLedgerValues'

const fundingStateValue = v.union(
  v.literal('pending'),
  v.literal('succeeded'),
  v.literal('failed'),
  v.literal('outcome_unknown'),
)
const fundingProviderEvidenceArg = v.object({
  externalRef: v.string(),
  amount: exactAmount,
  status: fundingStateValue,
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
const fundingRefundEvidenceArg = v.object({
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
export const applyVerifiedEventFromInboxArgs = v.object({
  event: stripeMoneyWebhookEventArg,
  readback: v.optional(fundingProviderEvidenceArg),
  refundReadback: v.optional(fundingRefundEvidenceArg),
  operationKey: v.string(),
  correlationId: v.string(),
})
export const applyVerifiedEventFromInboxResult = v.union(
  v.object({
    kind: v.literal('accepted'),
    status: v.union(v.literal('applied'), v.literal('replayed'), v.literal('ignored')),
    appliedRef: v.optional(v.string()),
  }),
  v.object({ kind: v.literal('refused'), code: v.string(), retryable: v.boolean() }),
)

type ApplyResult = Infer<typeof applyVerifiedEventFromInboxResult>

const refused = (code: string, retryable = false): ApplyResult => ({
  kind: 'refused', code, retryable,
})

export async function applyVerifiedEventFromInboxHandler(
  ctx: ActionCtx,
  args: Infer<typeof applyVerifiedEventFromInboxArgs>,
): Promise<ApplyResult> {
    const prepared = await ctx.runMutation(
      internal.moneyAccountFunding.prepareVerifiedEventFromInbox,
      args,
    )
    if (prepared.kind !== 'prepared') return prepared
    const booked = prepared.bookingKind === 'settlement'
      ? await ctx.runAction(internal.moneyFormance.bookFundingSettlement, { ...prepared.booking, expectedEnvironment: prepared.expectedEnvironment })
      : await ctx.runAction(internal.moneyFormance.bookFundingReversal, { ...prepared.booking, expectedEnvironment: prepared.expectedEnvironment })
    if (booked.kind === 'completed') {
      const [formanceTransactionRef] = booked.transactionRefs
      if (booked.transactionRefs.length !== 1 || formanceTransactionRef === undefined) {
        return refused('formance_reference_invalid')
      }
      return prepared.bookingKind === 'settlement'
        ? await ctx.runMutation(internal.moneyAccountFunding.finalizeVerifiedEventFromInbox, {
            ...args, formanceTransactionRef,
          })
        : await ctx.runMutation(internal.moneyAccountFunding.finalizeVerifiedRefundFromInbox, {
            ...args, formanceTransactionRef,
          })
    }
    if (booked.kind === 'outcome_unknown') {
      if (args.event.kind === 'checkout') {
        await ctx.runMutation(internal.moneyAccountFunding.markFundingBookingUnknown, {
          commandRef: args.event.commandRef,
          stripeEventId: args.event.stripeEventId,
          observedAt: args.event.observedAt,
        })
      } else if (args.event.kind === 'refund') {
        await ctx.runMutation(internal.moneyAccountFunding.markFundingReversalUnknown, {
          paymentId: args.event.paymentId,
          refundId: args.event.refundId,
          stripeEventId: args.event.stripeEventId,
          statusRef: booked.statusRef,
          observedAt: args.event.observedAt,
        })
      }
    }
    return refused(
      booked.kind === 'refused' ? booked.code : 'credit_topup_pending',
      booked.kind !== 'refused',
    )
}
