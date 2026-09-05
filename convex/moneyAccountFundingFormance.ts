import { v, type Infer } from 'convex/values'

import { internal } from './_generated/api'
import { action, internalAction, type ActionCtx } from './_generated/server'
import { exactAmount, stripeMoneyWebhookEventArg } from './moneyLedgerValues'

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
const applyArgs = v.object({
  event: stripeMoneyWebhookEventArg,
  readback: v.optional(fundingProviderEvidenceArg),
  refundReadback: v.optional(fundingRefundEvidenceArg),
  operationKey: v.string(),
  correlationId: v.string(),
})
const applyResult = v.union(
  v.object({
    kind: v.literal('accepted'),
    status: v.union(v.literal('applied'), v.literal('replayed'), v.literal('ignored')),
    appliedRef: v.optional(v.string()),
  }),
  v.object({ kind: v.literal('refused'), code: v.string(), retryable: v.boolean() }),
)
const balanceResult = v.union(
  v.object({
    kind: v.literal('available'),
    accountRef: v.string(),
    balance: v.object({ currency: v.literal('AUD'), units: v.string(), exponent: v.literal(6) }),
    locked: v.boolean(),
    version: v.number(),
    updatedAt: v.optional(v.number()),
    lastTransactionRef: v.optional(v.string()),
  }),
  v.object({ kind: v.literal('refused'), code: v.string(), retryable: v.boolean() }),
)

type ApplyResult = Infer<typeof applyResult>
type BalanceResult = Infer<typeof balanceResult>

const refused = (code: string, retryable = false): ApplyResult => ({
  kind: 'refused', code, retryable,
})

async function applyVerifiedEventCore(
  ctx: ActionCtx,
  args: Infer<typeof applyArgs>,
): Promise<ApplyResult> {
    const prepared = await ctx.runMutation(
      internal.moneyAccountFunding.prepareVerifiedEventFromInbox,
      args,
    )
    if (prepared.kind !== 'prepared') return prepared
    const booked = prepared.bookingKind === 'settlement'
      ? await ctx.runAction(internal.moneyFormance.bookFundingSettlement, prepared.booking)
      : await ctx.runAction(internal.moneyFormance.bookFundingReversal, prepared.booking)
    if (booked.kind === 'completed') {
      if (booked.transactionRefs.length !== 1) return refused('formance_reference_invalid')
      return prepared.bookingKind === 'settlement'
        ? await ctx.runMutation(internal.moneyAccountFunding.finalizeVerifiedEventFromInbox, {
            ...args, formanceTransactionRef: booked.transactionRefs[0]!,
          })
        : await ctx.runMutation(internal.moneyAccountFunding.finalizeVerifiedRefundFromInbox, {
            ...args, formanceTransactionRef: booked.transactionRefs[0]!,
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

export const applyVerifiedEventFromInbox = internalAction({
  args: applyArgs.fields,
  returns: applyResult,
  handler: applyVerifiedEventCore,
})

export const readBalance = action({
  args: {},
  returns: balanceResult,
  handler: async (ctx): Promise<BalanceResult> => {
    const subject: Readonly<
      | { kind: 'resolved'; accountRef: string; locked: boolean }
      | { kind: 'refused'; code: string; retryable: boolean }
    > = await ctx.runQuery(internal.moneyAccountFunding.readBalanceSubject, {})
    if (subject.kind === 'refused') return subject
    const balance: Readonly<
      | { kind: 'available'; units: string; observedAt: number }
      | { kind: 'setup_required' | 'unavailable'; code: string }
    > = await ctx.runAction(internal.moneyFormance.readDisplayBalance, {
      balanceKind: 'account_aud', subjectRef: subject.accountRef,
    })
    if (balance.kind !== 'available') {
      return { kind: 'refused' as const, code: balance.code, retryable: true }
    }
    return {
      kind: 'available' as const,
      accountRef: subject.accountRef,
      balance: { currency: 'AUD' as const, units: balance.units, exponent: 6 as const },
      locked: subject.locked,
      version: balance.observedAt,
      updatedAt: balance.observedAt,
    }
  },
})
