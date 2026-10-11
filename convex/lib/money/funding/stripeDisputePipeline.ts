import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import type { MutationCtx } from '../../../_generated/server'
import type { StripeMoneyWebhookEvent } from '../../../../src/modules/money/public'
import { eventRowFields } from '../../../moneyStripeEvents'
import { enqueueOperatorAlert } from '../../../operatorDigest'
import { ensureEventConsistency, refused, type FundingProviderEvidence, type FundingRefundEvidence, type PrepareFundingResult } from './stripeEventPipeline'

/**
 * Stripe dispute webhooks (charge.dispute.created/updated/closed): the signed event is the evidence.
 * Created/updated freeze the Account through the existing open account-scope reconciliation case
 * (managedCall booking refuses financial_scope_locked); closed is recorded only.
 */
export async function prepareFundingDisputeEvent(
  ctx: MutationCtx,
  args: Readonly<{
    event: StripeMoneyWebhookEvent
    readback?: FundingProviderEvidence
    refundReadback?: FundingRefundEvidence
  }>,
): Promise<PrepareFundingResult> {
  if (args.event.kind !== 'dispute' || args.readback !== undefined || args.refundReadback !== undefined) {
    return refused('payment_binding_invalid')
  }
  const event = args.event
  const consistency = await ensureEventConsistency(
    ctx,
    event,
    ctx.db.query('moneyFundingCommands')
      .withIndex('by_paymentId', (b) => b.eq('paymentId', event.paymentId))
      .unique(),
  )
  if (consistency.kind === 'refused') return refused(consistency.code, consistency.retryable)
  if (consistency.kind === 'replay') {
    return {
      kind: 'accepted',
      status: 'replayed',
      ...(consistency.appliedRef === undefined ? {} : { appliedRef: consistency.appliedRef }),
    }
  }
  const { command, priorEvent } = consistency
  if (command.appliedTransactionRef === undefined) return refused('funding_pending', true)

  if (event.eventType === 'charge.dispute.closed') {
    if (priorEvent === null) await ctx.db.insert('moneyStripeEvents', { ...eventRowFields(event), status: 'ignored' })
    return { kind: 'accepted', status: 'ignored' }
  }

  const caseRef = `money-case:${canonicalDigest({
    format: 'ae.funding-dispute:v1',
    fundingCommandRef: command.commandRef,
  })}`
  const existingCase = await ctx.db.query('moneyReconciliationCases')
    .withIndex('by_caseRef', (builder) => builder.eq('caseRef', caseRef))
    .unique()
  if (existingCase === null) {
    await ctx.db.insert('moneyReconciliationCases', {
      caseRef,
      accountRef: command.accountRef,
      kind: 'processor_difference',
      status: 'open',
      scopeType: 'account',
      scopeRef: command.accountRef,
      transactionRef: command.appliedTransactionRef,
      reasonCode: 'funding_dispute_open',
      evidenceRefs: [event.stripeEventId, event.disputeId],
      createdAt: event.observedAt,
      updatedAt: event.observedAt,
    })
  } else {
    await ctx.db.patch(existingCase._id, {
      evidenceRefs: [...new Set([...existingCase.evidenceRefs, event.stripeEventId, event.disputeId])].slice(-32),
      updatedAt: event.observedAt,
    })
  }
  if (existingCase === null || !existingCase.evidenceRefs.includes(event.disputeId)) {
    await enqueueOperatorAlert(ctx, {
      alertRef: `dispute:${event.disputeId}`,
      subject: 'Dispute opened',
      text: [
        `Dispute ${event.disputeId} (${event.disputeStatus}, ${event.reason}) on payment ${event.paymentId}.`,
        event.evidenceDueBy === undefined
          ? 'Evidence due date: not provided.'
          : `Evidence due by ${new Date(event.evidenceDueBy).toISOString()}.`,
        `Account frozen via case ${caseRef}. Event ${event.stripeEventId}.`,
      ].join('\n'),
    })
  }
  if (priorEvent === null) await ctx.db.insert('moneyStripeEvents', {
    ...eventRowFields(event), status: 'ignored', appliedRef: caseRef,
  })
  return { kind: 'accepted', status: 'ignored', appliedRef: caseRef }
}
