import type { Doc } from '../../_generated/dataModel'
import type { MutationCtx } from '../../_generated/server'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '../../../src/modules/common/stable-hash'
import {
  AUD_EXPONENT,
  compareExactAmounts,
  type ExactAmount,
  type StripeMoneyWebhookEvent,
} from '../../../src/modules/money/public'
import { enqueueDocumentRender } from '../../moneyDocuments'
import { eventRowFields, eventRowMatches } from '../../moneyStripeEvents'

export type FundingProviderEvidence = Readonly<{
  externalRef: string
  amount: ExactAmount
  status: 'pending' | 'succeeded' | 'failed' | 'outcome_unknown' | 'reversed'
  evidenceRef: string
  requestDigest: string
  metadataDigest: string
  checkoutSessionDigest: string
  paymentIntentDigest?: string
  evidenceDigest: string
  paymentId?: string
  checkoutStatus?: 'open' | 'complete' | 'expired'
  paymentStatus?: 'unpaid' | 'paid' | 'no_payment_required'
  checkoutMode?: 'hosted_page'
  checkoutExpiresAt?: number
}>

export type FundingRefundEvidence = Readonly<{
  refundId: string
  paymentId: string
  chargeId: string
  status: 'pending' | 'succeeded' | 'failed'
  amount: ExactAmount
  refundDigest: string
  evidenceDigest: string
  evidenceRef: string
  observedAt: number
}>

export type FundingBooking = Readonly<{
  commandRef: string
  idempotencyKey: string
  accountRef: string
  processorRef: string
  principalUnits: string
  serviceFeeUnits: string
  taxUnits: string
  totalUnits: string
  policyDigest: string
  externalEvidenceDigest: string
}>

export type PrepareFundingResult =
  | Readonly<{
      kind: 'prepared'
      bookingKind: 'settlement' | 'reversal'
      booking: FundingBooking
    }>
  | Readonly<{
      kind: 'accepted'
      status: 'applied' | 'replayed' | 'ignored'
      appliedRef?: string
    }>
  | Readonly<{ kind: 'refused'; code: string; retryable: boolean }>

export type FinalizeFundingResult =
  | Readonly<{
      kind: 'accepted'
      status: 'applied' | 'replayed'
      appliedRef: string
    }>
  | Readonly<{ kind: 'refused'; code: string; retryable: boolean }>

function refused(code: string, retryable = false): Readonly<{ kind: 'refused'; code: string; retryable: boolean }> {
  return { kind: 'refused', code, retryable }
}

function fundingReversalBooking(
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

export async function recordFundingDocuments(
  ctx: MutationCtx,
  command: Doc<'moneyFundingCommands'>,
  transactionRef: string,
  occurredAt: number,
): Promise<void> {
  const definitions: readonly Readonly<{
    kind: 'funding_receipt' | 'service_fee_document'
    amountUnits: string
    detail: Readonly<Record<string, string>>
  }>[] = [
    {
      kind: 'funding_receipt' as const,
      amountUnits: command.principalUnits,
      detail: {
        principalUnits: command.principalUnits,
        serviceFeeUnits: command.serviceFeeUnits,
        taxUnits: command.taxUnits,
        totalUnits: command.totalUnits,
      },
    },
    {
      kind: 'service_fee_document' as const,
      amountUnits: (BigInt(command.serviceFeeUnits) + BigInt(command.taxUnits)).toString(),
      detail: { serviceFeeUnits: command.serviceFeeUnits, taxUnits: command.taxUnits },
    },
  ]
  for (const definition of definitions) {
    const documentRef = `money-document:${definition.kind}:${transactionRef}`
    const existing = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (query) => query.eq('documentRef', documentRef))
      .unique()
    if (existing !== null) continue
    const renderInput = {
      format: 'ae.money-document-render-input:v1',
      documentRef,
      accountRef: command.accountRef,
      kind: definition.kind,
      currency: 'AUD',
      exponent: AUD_EXPONENT,
      amountUnits: definition.amountUnits,
      detail: definition.detail,
      transactionRef,
      occurredAt,
      policyRefs: command.commercialPolicyRefs,
      policyDigest: command.commercialPolicyDigest,
    } as const satisfies StableHashValue
    const renderInputJson = stableStringify(renderInput)
    const renderInputDigest = canonicalDigest(renderInput)
    const documentId = await ctx.db.insert('moneyDocuments', {
      documentRef,
      accountRef: command.accountRef,
      kind: definition.kind,
      sourceTransactionRefs: [transactionRef],
      amountUnits: definition.amountUnits,
      residualUnits: '0',
      policyRefs: [...command.commercialPolicyRefs],
      policyDigest: command.commercialPolicyDigest,
      templateVersion: 'ae.money-document:html:v1',
      renderInputJson,
      renderInputDigest,
      state: 'rendering',
      environment: command.environment,
      sourceCount: 1,
      snapshotDigest: renderInputDigest,
      createdAt: occurredAt,
    })
    const workId = await enqueueDocumentRender(ctx, documentRef)
    await ctx.db.patch(documentId, { workId })
  }
}

export async function recordFundingReversalDocument(
  ctx: MutationCtx,
  command: Doc<'moneyFundingCommands'>,
  transactionRef: string,
  occurredAt: number,
): Promise<void> {
  const documentRef = `money-document:adjustment:${transactionRef}`
  const existing = await ctx.db.query('moneyDocuments')
    .withIndex('by_documentRef', (query) => query.eq('documentRef', documentRef))
    .unique()
  if (existing !== null) return
  const renderInput = {
    format: 'ae.money-document-render-input:v1',
    documentRef,
    accountRef: command.accountRef,
    kind: 'adjustment',
    currency: 'AUD',
    exponent: AUD_EXPONENT,
    amountUnits: command.totalUnits,
    detail: {
      reason: 'processor_full_refund',
      principalUnits: command.principalUnits,
      serviceFeeUnits: command.serviceFeeUnits,
      taxUnits: command.taxUnits,
      totalUnits: command.totalUnits,
    },
    transactionRef,
    occurredAt,
    policyRefs: command.commercialPolicyRefs,
    policyDigest: command.commercialPolicyDigest,
  } as const satisfies StableHashValue
  const renderInputJson = stableStringify(renderInput)
  const renderInputDigest = canonicalDigest(renderInput)
  const documentId = await ctx.db.insert('moneyDocuments', {
    documentRef,
    accountRef: command.accountRef,
    kind: 'adjustment',
    sourceTransactionRefs: [transactionRef],
    amountUnits: command.totalUnits,
    residualUnits: '0',
    policyRefs: [...command.commercialPolicyRefs],
    policyDigest: command.commercialPolicyDigest,
    templateVersion: 'ae.money-document:html:v1',
    renderInputJson,
    renderInputDigest,
    state: 'rendering',
    environment: command.environment,
    sourceCount: 1,
    snapshotDigest: renderInputDigest,
    createdAt: occurredAt,
  })
  const workId = await enqueueDocumentRender(ctx, documentRef)
  await ctx.db.patch(documentId, { workId })
}

type ConsistencyResult =
  | Readonly<{ kind: 'ok'; command: Doc<'moneyFundingCommands'>; priorEvent: Doc<'moneyStripeEvents'> | null }>
  | Readonly<{ kind: 'replay'; appliedRef?: string }>
  | Readonly<{ kind: 'refused'; code: string; retryable: boolean }>

async function ensureEventConsistency(
  ctx: MutationCtx,
  event: StripeMoneyWebhookEvent,
  lookupQuery: Promise<Doc<'moneyFundingCommands'> | null>,
): Promise<ConsistencyResult> {
  const command = await lookupQuery
  if (command === null) return { kind: 'refused', code: 'funding_pending', retryable: true }

  const priorEvent = await ctx.db.query('moneyStripeEvents')
    .withIndex('by_stripeEventId', (builder) => builder.eq('stripeEventId', event.stripeEventId))
    .unique()
  if (priorEvent !== null) {
    if (!eventRowMatches(priorEvent, event)) return { kind: 'refused', code: 'payment_binding_invalid', retryable: false }
    if (priorEvent.status === 'applied') {
      const activeRef = event.kind === 'checkout' ? command.appliedTransactionRef : command.reversalTransactionRef
      if (activeRef !== undefined && priorEvent.appliedRef === activeRef) {
        return { kind: 'replay', appliedRef: priorEvent.appliedRef }
      }
    }
    if (event.kind === 'refund' && priorEvent.status === 'ignored') {
      return priorEvent.appliedRef !== undefined
        ? { kind: 'replay', appliedRef: priorEvent.appliedRef }
        : { kind: 'replay' }
    }
    if (priorEvent.status !== 'received') return { kind: 'refused', code: 'payment_binding_invalid', retryable: false }
  }
  return { kind: 'ok', command, priorEvent }
}

export async function prepareFundingSettlementEvent(
  ctx: MutationCtx,
  args: Readonly<{
    event: StripeMoneyWebhookEvent
    readback?: FundingProviderEvidence
    refundReadback?: FundingRefundEvidence
  }>,
): Promise<PrepareFundingResult> {
  if (args.event.kind !== 'checkout' || args.readback === undefined || args.refundReadback !== undefined) {
    return refused('payment_binding_invalid')
  }
  const event = args.event
  const consistency = await ensureEventConsistency(
    ctx,
    event,
    ctx.db.query('moneyFundingCommands')
      .withIndex('by_commandRef', (b) => b.eq('commandRef', event.commandRef))
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
  const bound = event.externalRef === args.readback.externalRef
    && compareExactAmounts(event.amount, {
      currency: 'AUD', exponent: AUD_EXPONENT, units: command.totalUnits,
    }) === 0
    && compareExactAmounts(args.readback.amount, {
      currency: 'AUD', exponent: AUD_EXPONENT, units: command.totalUnits,
    }) === 0
    && event.metadataDigest === command.metadataDigest
    && args.readback.metadataDigest === command.metadataDigest
    && event.checkoutSessionDigest === args.readback.checkoutSessionDigest
    && event.paymentIntentDigest === args.readback.paymentIntentDigest
    && event.paymentId === args.readback.paymentId
  if (!bound) return refused('payment_binding_invalid')

  if (event.status !== 'paid') {
    if (command.state === 'succeeded') {
      await ctx.db.insert('moneyStripeEvents', {
        ...eventRowFields(event),
        status: 'ignored',
      })
      return { kind: 'accepted', status: 'ignored' }
    }
    if (event.status === 'processing') {
      await ctx.db.patch(command._id, {
        providerStatus: 'pending',
        ...(args.readback.checkoutStatus === undefined ? {} : {
          providerCheckoutStatus: args.readback.checkoutStatus,
        }),
        ...(args.readback.paymentStatus === undefined ? {} : {
          providerPaymentStatus: args.readback.paymentStatus,
        }),
        updatedAt: event.observedAt,
      })
    } else {
      await ctx.db.patch(command._id, {
        state: 'failed',
        providerStatus: 'failed',
        ...(args.readback.checkoutStatus === undefined ? {} : {
          providerCheckoutStatus: args.readback.checkoutStatus,
        }),
        ...(args.readback.paymentStatus === undefined ? {} : {
          providerPaymentStatus: args.readback.paymentStatus,
        }),
        terminalReason: 'async_payment_failed',
        updatedAt: event.observedAt,
      })
    }
    if (priorEvent === null) await ctx.db.insert('moneyStripeEvents', {
      ...eventRowFields(event), status: 'ignored',
    })
    return { kind: 'accepted', status: 'ignored' }
  }
  if (args.readback.status !== 'succeeded') return refused('funding_pending', true)
  if (command.state === 'failed') return refused('funding_state_conflict')
  if (command.state === 'succeeded') {
    return command.appliedTransactionRef === undefined
      ? refused('funding_state_conflict')
      : { kind: 'accepted', status: 'replayed', appliedRef: command.appliedTransactionRef }
  }
  if (priorEvent === null) await ctx.db.insert('moneyStripeEvents', {
    ...eventRowFields(event), status: 'received',
  })
  return {
    kind: 'prepared',
    bookingKind: 'settlement',
    booking: {
      commandRef: command.commandRef,
      accountRef: command.accountRef,
      processorRef: event.externalRef,
      idempotencyKey: command.idempotencyKey,
      principalUnits: command.principalUnits,
      serviceFeeUnits: command.serviceFeeUnits,
      taxUnits: command.taxUnits,
      totalUnits: command.totalUnits,
      policyDigest: command.commercialPolicyDigest,
      externalEvidenceDigest: args.readback.evidenceDigest,
    },
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
    booking: fundingReversalBooking(command, event.refundId, readback.evidenceDigest),
  }
}

export async function finalizeFundingEventHandler(
  ctx: MutationCtx,
  args: Readonly<{
    event: StripeMoneyWebhookEvent
    readback?: FundingProviderEvidence
    formanceTransactionRef: string
  }>,
): Promise<FinalizeFundingResult> {
  if (args.event.kind !== 'checkout' || args.event.status !== 'paid' || args.readback === undefined) {
    return refused('payment_binding_invalid')
  }
  const fundingEvent = args.event
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_commandRef', (builder) => builder.eq('commandRef', fundingEvent.commandRef))
    .unique()
  const event = await ctx.db.query('moneyStripeEvents')
    .withIndex('by_stripeEventId', (builder) => builder.eq('stripeEventId', fundingEvent.stripeEventId))
    .unique()
  if (command === null || event === null || !eventRowMatches(event, args.event)) {
    return refused('payment_binding_invalid')
  }
  if (command.state === 'succeeded') {
    return command.appliedTransactionRef === args.formanceTransactionRef
      ? { kind: 'accepted', status: 'replayed', appliedRef: args.formanceTransactionRef }
      : refused('funding_idempotency_conflict')
  }
  if (event.status !== 'received') return refused('payment_binding_invalid')
  await recordFundingDocuments(ctx, command, args.formanceTransactionRef, args.event.observedAt)
  await ctx.db.patch(command._id, {
    state: 'succeeded',
    providerStatus: 'succeeded',
    externalRef: args.event.externalRef,
    providerEvidenceRef: args.readback.evidenceRef,
    requestDigest: args.readback.requestDigest,
    checkoutSessionDigest: args.readback.checkoutSessionDigest,
    paymentIntentDigest: args.readback.paymentIntentDigest,
    evidenceDigest: args.readback.evidenceDigest,
    paymentId: args.readback.paymentId,
    ...(args.readback.checkoutStatus === undefined ? {} : {
      providerCheckoutStatus: args.readback.checkoutStatus,
    }),
    ...(args.readback.paymentStatus === undefined ? {} : {
      providerPaymentStatus: args.readback.paymentStatus,
    }),
    appliedStripeEventId: args.event.stripeEventId,
    appliedPayloadDigest: args.event.payloadDigest,
    appliedTransactionRef: args.formanceTransactionRef,
    updatedAt: args.event.observedAt,
  })
  await ctx.db.patch(event._id, {
    status: 'applied',
    appliedRef: args.formanceTransactionRef,
    appliedAt: args.event.observedAt,
  })
  return {
    kind: 'accepted',
    status: 'applied',
    appliedRef: args.formanceTransactionRef,
  }
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
  const refundEvent = args.event
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_paymentId', (builder) => builder.eq('paymentId', refundEvent.paymentId))
    .unique()
  const event = await ctx.db.query('moneyStripeEvents')
    .withIndex('by_stripeEventId', (builder) => builder.eq('stripeEventId', args.event.stripeEventId))
    .unique()
  if (command === null || event === null || !eventRowMatches(event, refundEvent)) {
    return refused('payment_binding_invalid')
  }
  if (command.state === 'reversed') {
    return command.reversalRefundId === refundEvent.refundId
      && command.reversalTransactionRef === args.formanceTransactionRef
      ? { kind: 'accepted', status: 'replayed', appliedRef: args.formanceTransactionRef }
      : refused('funding_idempotency_conflict')
  }
  if (command.state !== 'succeeded'
    || event.status !== 'received'
    || command.reversalRefundId !== refundEvent.refundId
    || command.reversalEvidenceDigest !== args.refundReadback.evidenceDigest) {
    return refused('funding_state_conflict')
  }
  await recordFundingReversalDocument(ctx, command, args.formanceTransactionRef, refundEvent.observedAt)
  await ctx.db.patch(command._id, {
    state: 'reversed',
    providerStatus: 'reversed',
    reversalState: 'succeeded',
    reversalTransactionRef: args.formanceTransactionRef,
    reversedAt: refundEvent.observedAt,
    updatedAt: refundEvent.observedAt,
  })
  await ctx.db.patch(event._id, {
    status: 'applied',
    appliedRef: args.formanceTransactionRef,
    appliedAt: refundEvent.observedAt,
  })
  return { kind: 'accepted', status: 'applied', appliedRef: args.formanceTransactionRef }
}

export async function markFundingBookingUnknownHandler(
  ctx: MutationCtx,
  args: Readonly<{ commandRef: string; stripeEventId: string; observedAt: number }>,
): Promise<void> {
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_commandRef', (builder) => builder.eq('commandRef', args.commandRef))
    .unique()
  if (command !== null && command.state !== 'succeeded' && command.state !== 'failed') {
    await ctx.db.patch(command._id, {
      state: 'outcome_unknown', providerStatus: 'outcome_unknown', updatedAt: args.observedAt,
    })
  }
}

export async function markFundingReversalUnknownHandler(
  ctx: MutationCtx,
  args: Readonly<{
    paymentId: string
    refundId: string
    stripeEventId: string
    statusRef: string
    observedAt: number
  }>,
): Promise<void> {
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_paymentId', (builder) => builder.eq('paymentId', args.paymentId))
    .unique()
  if (command !== null
    && command.state === 'succeeded'
    && command.reversalRefundId === args.refundId
    && command.reversalStripeEventId === args.stripeEventId) {
    await ctx.db.patch(command._id, {
      reversalState: 'outcome_unknown',
      reversalStatusRef: args.statusRef,
      updatedAt: args.observedAt,
    })
  }
}
