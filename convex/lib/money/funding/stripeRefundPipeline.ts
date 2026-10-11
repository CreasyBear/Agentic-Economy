import { financialEnvironmentMatches } from '../formance/contracts'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import type { MutationCtx } from '../../../_generated/server'
import { AUD_EXPONENT, compareExactAmounts, type StripeMoneyWebhookEvent } from '../../../../src/modules/money/public'
import { eventRowFields, eventRowMatches } from '../../../moneyStripeEvents'
import { recordFundingReversalDocument } from './stripeEventDocuments'
import { ensureEventConsistency, refused, type FinalizeFundingResult, type FundingBooking, type FundingProviderEvidence, type FundingRefundEvidence, type PrepareFundingResult } from './stripeEventPipeline'

export function fundingReversalBooking(
  command: Readonly<{
    accountRef: string
    externalRef?: string
    paymentId?: string
    principalUnits: string
    serviceFeeUnits: string
    taxUnits: string
    totalUnits: string
    commercialPolicyDigest: string
  }>,
  refundId: string,
  evidenceDigest: string,
): FundingBooking {
  return {
    commandRef: `funding-reversal:${refundId}`,
    accountRef: command.accountRef,
    processorRef: command.externalRef ?? command.paymentId ?? refundId,
    idempotencyKey: `funding-reversal:${refundId}`,
    principalUnits: command.principalUnits,
    serviceFeeUnits: command.serviceFeeUnits,
    taxUnits: command.taxUnits,
    totalUnits: command.totalUnits,
    policyDigest: command.commercialPolicyDigest,
    externalEvidenceDigest: evidenceDigest,
  }
}

export async function prepareFundingRefundEvent(
  ctx: MutationCtx,
  args: Readonly<{
    event: StripeMoneyWebhookEvent
    readback?: FundingProviderEvidence
    refundReadback?: FundingRefundEvidence
  }>,
): Promise<PrepareFundingResult> {
  if (args.event.kind !== 'refund' || args.refundReadback === undefined || args.readback !== undefined) {
    return refused('payment_binding_invalid')
  }
  const event = args.event
  const readback = args.refundReadback
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

  const sameEvidence = event.refundId === readback.refundId
    && event.paymentId === readback.paymentId
    && event.chargeId === readback.chargeId
    && event.refundDigest === readback.refundDigest
    && event.status === readback.status
    && compareExactAmounts(event.amount, readback.amount) === 0
  if (!sameEvidence) return refused('payment_binding_invalid')

  if (event.status !== 'succeeded') {
    if (priorEvent === null) await ctx.db.insert('moneyStripeEvents', {
      ...eventRowFields(event), status: 'ignored',
    })
    return { kind: 'accepted', status: 'ignored' }
  }
  if (command.state === 'reversed') {
    return command.reversalRefundId === event.refundId
      && command.reversalTransactionRef !== undefined
      ? { kind: 'accepted', status: 'replayed', appliedRef: command.reversalTransactionRef }
      : refused('funding_state_conflict')
  }
  if (command.state !== 'succeeded') return refused('funding_state_conflict')
  const fullRefund = compareExactAmounts(event.amount, {
    currency: 'AUD', exponent: AUD_EXPONENT, units: command.totalUnits,
  }) === 0
  if (!fullRefund) {
    const caseRef = `money-case:${canonicalDigest({
      format: 'ae.funding-refund-discrepancy:v1',
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
        reasonCode: 'funding_refund_not_full',
        evidenceRefs: [event.stripeEventId, event.refundId, readback.evidenceRef],
        createdAt: event.observedAt,
        updatedAt: event.observedAt,
      })
    } else {
      await ctx.db.patch(existingCase._id, {
        evidenceRefs: [...new Set([
          ...existingCase.evidenceRefs,
          event.stripeEventId,
          event.refundId,
          readback.evidenceRef,
        ])].slice(-32),
        updatedAt: event.observedAt,
      })
    }
    if (priorEvent === null) await ctx.db.insert('moneyStripeEvents', {
      ...eventRowFields(event), status: 'ignored', appliedRef: caseRef,
    })
    return { kind: 'accepted', status: 'ignored', appliedRef: caseRef }
  }
  if (
    (command.reversalState === 'pending' || command.reversalState === 'outcome_unknown')
    && command.reversalRefundId !== undefined
  ) {
    if (command.reversalRefundId === event.refundId && priorEvent === null) {
      await ctx.db.insert('moneyStripeEvents', {
        ...eventRowFields(event), status: 'received',
      })
    }
    return {
      kind: 'prepared',
      bookingKind: 'reversal',
      expectedEnvironment: command.environment,
      booking: fundingReversalBooking(
        command,
        command.reversalRefundId,
        command.reversalEvidenceDigest ?? readback.evidenceDigest,
      ),
    }
  }
  if (command.reversalState === 'succeeded' && command.reversalTransactionRef !== undefined) {
    return { kind: 'accepted', status: 'replayed', appliedRef: command.reversalTransactionRef }
  }
  if (priorEvent === null) await ctx.db.insert('moneyStripeEvents', {
    ...eventRowFields(event), status: 'received',
  })
  await ctx.db.patch(command._id, {
    reversalState: 'pending',
    reversalStripeEventId: event.stripeEventId,
    reversalRefundId: event.refundId,
    reversalChargeId: event.chargeId,
    reversalEvidenceDigest: readback.evidenceDigest,
    updatedAt: event.observedAt,
  })
  return {
    kind: 'prepared',
    bookingKind: 'reversal',
    expectedEnvironment: command.environment,
    booking: fundingReversalBooking(command, event.refundId, readback.evidenceDigest),
  }
}

type ReversalFinalizeArgs = Readonly<{
  event: StripeMoneyWebhookEvent
  paymentId: string
  providerRefId: string
  evidenceDigest: string
  formanceTransactionRef: string
}>

export async function finalizeFundingReversal(ctx: MutationCtx, args: ReversalFinalizeArgs): Promise<FinalizeFundingResult> {
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_paymentId', (builder) => builder.eq('paymentId', args.paymentId))
    .unique()
  if (command !== null && !financialEnvironmentMatches(command.environment)) return refused('environment_mismatch')
  const event = await ctx.db.query('moneyStripeEvents')
    .withIndex('by_stripeEventId', (builder) => builder.eq('stripeEventId', args.event.stripeEventId))
    .unique()
  if (command === null || event === null || !eventRowMatches(event, args.event)) {
    return refused('payment_binding_invalid')
  }
  if (command.state === 'reversed') {
    return command.reversalRefundId === args.providerRefId
      && command.reversalTransactionRef === args.formanceTransactionRef
      ? { kind: 'accepted', status: 'replayed', appliedRef: args.formanceTransactionRef }
      : refused('funding_idempotency_conflict')
  }
  if (command.state !== 'succeeded'
    || event.status !== 'received'
    || command.reversalRefundId !== args.providerRefId
    || command.reversalEvidenceDigest !== args.evidenceDigest) {
    return refused('funding_state_conflict')
  }
  const observedAt = args.event.observedAt
  await recordFundingReversalDocument(ctx, command, args.formanceTransactionRef, observedAt)
  await ctx.db.patch(command._id, {
    state: 'reversed',
    providerStatus: 'reversed',
    reversalState: 'succeeded',
    reversalTransactionRef: args.formanceTransactionRef,
    reversedAt: observedAt,
    updatedAt: observedAt,
  })
  await ctx.db.patch(event._id, {
    status: 'applied',
    appliedRef: args.formanceTransactionRef,
    appliedAt: observedAt,
  })
  return { kind: 'accepted', status: 'applied', appliedRef: args.formanceTransactionRef }
}

export async function finalizeFundingRefundHandler(
  ctx: MutationCtx,
  args: Readonly<{
    event: StripeMoneyWebhookEvent
    refundReadback?: FundingRefundEvidence
    formanceTransactionRef: string
  }>,
): Promise<FinalizeFundingResult> {
  if (args.event.kind !== 'refund'
    || args.event.status !== 'succeeded'
    || args.refundReadback === undefined) return refused('payment_binding_invalid')
  return await finalizeFundingReversal(ctx, {
    event: args.event,
    paymentId: args.event.paymentId,
    providerRefId: args.event.refundId,
    evidenceDigest: args.refundReadback.evidenceDigest,
    formanceTransactionRef: args.formanceTransactionRef,
  })
}
