import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import type { StripeMoneyWebhookEvent } from '../../../../src/modules/money/public'
import { eventRowFields } from '../../../moneyStripeEvents'
import { enqueueOperatorAlert } from '../../../operatorDigest'
import { enqueueAccountNotice } from '../../principalAccount/notifications/enqueue'
import { AUD_EXPONENT, compareExactAmounts } from '../../../../src/modules/money/public'
import { finalizeFundingReversal, fundingReversalBooking } from './stripeRefundPipeline'
import { ensureEventConsistency, refused, type FundingProviderEvidence, type FinalizeFundingResult, type FundingRefundEvidence, type PrepareFundingResult } from './stripeEventPipeline'

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

  const caseRef = `money-case:${canonicalDigest({
    format: 'ae.funding-dispute:v1',
    fundingCommandRef: command.commandRef,
  })}`
  const existingCase = await ctx.db.query('moneyReconciliationCases')
    .withIndex('by_caseRef', (builder) => builder.eq('caseRef', caseRef))
    .unique()
  const recordIgnored = async (appliedRef?: string) => {
    if (priorEvent === null) await ctx.db.insert('moneyStripeEvents', {
      ...eventRowFields(event), status: 'ignored', ...(appliedRef === undefined ? {} : { appliedRef }),
    })
    return { kind: 'accepted', status: 'ignored', ...(appliedRef === undefined ? {} : { appliedRef }) } as const
  }

  if (event.eventType === 'charge.dispute.closed') {
    if (event.disputeStatus === 'won' || event.disputeStatus === 'warning_closed') {
      if (existingCase === null) return await recordIgnored()
      if (existingCase.status === 'open') {
        await ctx.db.patch(existingCase._id, {
          status: 'resolved',
          resolutionEvidenceRefs: [event.stripeEventId],
          resolvedAt: event.observedAt,
          updatedAt: event.observedAt,
        })
      }
      return await recordIgnored(caseRef)
    }
    const fullAmount = compareExactAmounts(event.amount, {
      currency: 'AUD', exponent: AUD_EXPONENT, units: command.totalUnits,
    }) === 0
    // Keep the case open (account stays frozen) and tell the operator.
    const holdOpen = async (subject: string, text: string) => {
      await openDisputeCase(ctx, command, event, caseRef, existingCase)
      await enqueueOperatorAlert(ctx, { alertRef: `dispute-closed:${event.disputeId}`, subject, text })
      return await recordIgnored(caseRef)
    }
    if (event.disputeStatus !== 'lost' || !fullAmount) {
      return await holdOpen(
        'Dispute closed, needs review',
        `Dispute ${event.disputeId} closed as ${event.disputeStatus} for ${event.amount.units} on payment ${event.paymentId}. Case ${caseRef} stays open.`,
      )
    }
    if (command.state === 'reversed') {
      return command.reversalRefundId === event.disputeId && command.reversalTransactionRef !== undefined
        ? { kind: 'accepted', status: 'replayed', appliedRef: command.reversalTransactionRef }
        : refused('funding_state_conflict')
    }
    if (command.state !== 'succeeded') return refused('funding_state_conflict')
    const pendingOther = command.reversalRefundId !== undefined && command.reversalRefundId !== event.disputeId
    if (pendingOther) return refused('funding_state_conflict')
    await openDisputeCase(ctx, command, event, caseRef, existingCase)
    await enqueueOperatorAlert(ctx, {
      alertRef: `dispute-lost:${event.disputeId}`,
      subject: 'Dispute lost, reversal needs review',
      text: `Dispute ${event.disputeId} lost on payment ${event.paymentId}. Credit reversal is being posted; case ${caseRef} stays open to review any shortfall.`,
    })
    if (priorEvent === null) await ctx.db.insert('moneyStripeEvents', { ...eventRowFields(event), status: 'received' })
    if (command.reversalRefundId === undefined) {
      await ctx.db.patch(command._id, {
        reversalState: 'pending',
        reversalStripeEventId: event.stripeEventId,
        reversalRefundId: event.disputeId,
        reversalChargeId: event.chargeId,
        reversalEvidenceDigest: event.disputeDigest,
        updatedAt: event.observedAt,
      })
    }
    return {
      kind: 'prepared',
      bookingKind: 'reversal',
      expectedEnvironment: command.environment,
      booking: fundingReversalBooking(command, event.disputeId, command.reversalEvidenceDigest ?? event.disputeDigest),
    }
  }

  await openDisputeCase(ctx, command, event, caseRef, existingCase)
  if (existingCase === null || !existingCase.evidenceRefs.includes(event.disputeId)) {
    await enqueueAccountNotice(ctx, {
      eventKind: 'funding_disputed', accountRef: command.accountRef,
      sourceEventRef: event.disputeId, recipientPrincipalRef: command.actorPrincipalRef,
    })
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

type DisputeEvent = Extract<StripeMoneyWebhookEvent, { kind: 'dispute' }>

async function openDisputeCase(
  ctx: MutationCtx,
  command: Doc<'moneyFundingCommands'>,
  event: DisputeEvent,
  caseRef: string,
  existingCase: Doc<'moneyReconciliationCases'> | null,
): Promise<void> {
  if (existingCase === null) {
    await ctx.db.insert('moneyReconciliationCases', {
      caseRef,
      accountRef: command.accountRef,
      kind: 'processor_difference',
      status: 'open',
      scopeType: 'account',
      scopeRef: command.accountRef,
      ...(command.appliedTransactionRef === undefined ? {} : { transactionRef: command.appliedTransactionRef }),
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
}

export async function finalizeFundingDisputeHandler(
  ctx: MutationCtx,
  args: Readonly<{ event: StripeMoneyWebhookEvent; formanceTransactionRef: string }>,
): Promise<FinalizeFundingResult> {
  if (args.event.kind !== 'dispute'
    || args.event.eventType !== 'charge.dispute.closed'
    || args.event.disputeStatus !== 'lost') return refused('payment_binding_invalid')
  return await finalizeFundingReversal(ctx, {
    event: args.event,
    paymentId: args.event.paymentId,
    providerRefId: args.event.disputeId,
    evidenceDigest: args.event.disputeDigest,
    formanceTransactionRef: args.formanceTransactionRef,
  })
}
