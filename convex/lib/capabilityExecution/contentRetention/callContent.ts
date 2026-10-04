import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'

export const CALL_CONTENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000
export const UNUSED_QUOTE_CONTENT_RETENTION_MS = 24 * 60 * 60 * 1_000

/** Requires final delivery/payment evidence and the full retention period.
 * Ensures unresolved purchases, reports and Provider obligations retain evidence.
 * Unknown state fails closed; this predicate never changes purchase authority. */
export async function callContentMayExpire(
  ctx: Pick<QueryCtx, 'db'>,
  call: Doc<'capabilityCalls'>,
  now: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(now) || now < 0
    || !['completed', 'refused', 'cancelled'].includes(call.state)
    || (call.state === 'completed' && call.result?.kind !== 'completed')
    || call.usage?.chargeState === 'outcome_unknown'
    || (call.result?.kind === 'completed' && call.result.usage?.chargeState === 'outcome_unknown')
    || call.reconciliation !== undefined
    || (call.dispatchState !== undefined && !['completed', 'failed'].includes(call.dispatchState))) return false
  if (call.formanceFinancialState !== undefined
    && !['settled', 'released'].includes(call.formanceFinancialState)) return false
  const report = await ctx.db.query('paidCallReports')
    .withIndex('by_callRef', q => q.eq('callRef', call.callRef)).unique()
  if (report?.state === 'pending') return false
  const obligation = await ctx.db.query('moneyProviderObligations')
    .withIndex('by_callRef', q => q.eq('callRef', call.callRef)).unique()
  if (obligation !== null && (!['settled', 'reversed'].includes(obligation.state)
    || obligation.reversalState === 'pending' || obligation.reversalState === 'outcome_unknown')) return false
  const resolution = await ctx.db.query('purchaseResolutionRecords')
    .withIndex('by_callRef', q => q.eq('callRef', call.callRef)).unique()
  if (resolution !== null) {
    return resolution.accountRef === call.ownerId && resolution.terminalState !== 'disputed'
      && (report?.state !== 'posted' || resolution.terminalState === 'refunded')
      && resolution.deliveryState !== 'unknown' && resolution.paymentState !== 'unknown'
      && Number.isSafeInteger(resolution.resolvedAt) && resolution.resolvedAt >= call.createdAt
      && Math.max(resolution.resolvedAt, report?.updatedAt ?? 0, obligation?.updatedAt ?? 0) <= now - CALL_CONTENT_RETENTION_MS
  }
  // Calls that never incurred a financial effect have no Purchase resolution
  // record. Unknown money or dispatch identity never qualifies for this path.
  const unpaid = call.formanceFinancialState === undefined && call.attemptRef === undefined
    && obligation === null && report === null
    && (call.usage === undefined || call.usage.chargeState === 'free_tier' || call.usage.chargeState === 'insufficient_credit')
    && (call.result?.kind !== 'completed'
      || (call.result.usage?.chargeState === 'free_tier' || call.result.usage?.chargeState === 'insufficient_credit'))
  return unpaid && call.updatedAt <= now - CALL_CONTENT_RETENTION_MS
    && (call.state !== 'refused' || (call.result?.kind === 'refused' && !call.result.retryable))
}

/** The transaction removes the primary content and its Quote copy together.
 * Permanent identities, monetary timestamps and original digests do not change. */
export async function expireCallContent(ctx: MutationCtx, call: Doc<'capabilityCalls'>, now: number): Promise<boolean> {
  if (call.contentExpiredAt !== undefined || !await callContentMayExpire(ctx, call, now)) return false
  const quoteRef = call.quoteRef
  const quote = quoteRef === undefined ? null : await ctx.db.query('capabilityQuotes')
    .withIndex('by_quoteRef', q => q.eq('quoteRef', quoteRef)).unique()
  if (quoteRef !== undefined && quote === null) return false
  if (quote !== null && (quote.state !== 'consumed' || quote.consumedCallRef !== call.callRef
    || quote.accountRef !== call.ownerId)) return false
  const result = call.result
  if (result?.kind === 'completed' && 'output' in result) {
    const { output: _output, ...purchase } = result
    await ctx.db.patch(call._id, { inputJson: undefined, contentExpiredAt: now, result: { ...purchase, contentExpiredAt: now } })
  } else {
    await ctx.db.patch(call._id, { inputJson: undefined, contentExpiredAt: now })
  }
  if (quote !== null) await expireQuoteContent(ctx, quote, now)
  return true
}

export async function expireQuoteContent(ctx: MutationCtx, quote: Doc<'capabilityQuotes'>, now: number): Promise<void> {
  await ctx.db.patch(quote._id, {
    normalizedInputJson: undefined, x402RequirementJson: undefined, x402PaymentRequiredJson: undefined,
    contentExpiredAt: now,
  })
}

export async function expiredCallForCopy(ctx: Pick<QueryCtx, 'db'>, callRef: string, now: number): Promise<boolean> {
  const call = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', callRef)).unique()
  return call !== null && call.contentExpiredAt !== undefined && await callContentMayExpire(ctx, call, now)
}
