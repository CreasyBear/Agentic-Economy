import { financialEnvironmentMatches } from '../formance/contracts'
import type { Doc } from '../../../_generated/dataModel'
import { recordFundingTerminal } from '@/lib/observability/journey'
import { emitFundingJourneyEvent } from '../../journey/events'
import type { MutationCtx } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import { enqueueOperatorAlert } from '../../../operatorDigest'
import { enqueueAccountNotice } from '../../principalAccount/notifications/enqueue'
import { enqueueMoneyAlertEvaluation } from '../../principalAccount/notifications/usageAlerts'
import {
  AUD_EXPONENT,
  compareExactAmounts,
  type ExactAmount,
  type StripeMoneyWebhookEvent,
} from '../../../../src/modules/money/public'
import { eventRowFields, eventRowMatches } from '../../../moneyStripeEvents'
import { recordFundingDocuments } from './stripeEventDocuments'

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
      expectedEnvironment: 'sandbox' | 'production'
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

export function refused(code: string, retryable = false): Readonly<{ kind: 'refused'; code: string; retryable: boolean }> {
  return { kind: 'refused', code, retryable }
}

type ConsistencyResult =
  | Readonly<{ kind: 'ok'; command: Doc<'moneyFundingCommands'>; priorEvent: Doc<'moneyStripeEvents'> | null }>
  | Readonly<{ kind: 'replay'; appliedRef?: string }>
  | Readonly<{ kind: 'refused'; code: string; retryable: boolean }>

export async function ensureEventConsistency(
  ctx: MutationCtx,
  event: StripeMoneyWebhookEvent,
  lookupQuery: Promise<Doc<'moneyFundingCommands'> | null>,
): Promise<ConsistencyResult> {
  const command = await lookupQuery
  if (command !== null && !financialEnvironmentMatches(command.environment)) return refused('environment_mismatch')
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
    if ((event.kind === 'refund' || event.kind === 'dispute') && priorEvent.status === 'ignored') {
      return priorEvent.appliedRef !== undefined
        ? { kind: 'replay', appliedRef: priorEvent.appliedRef }
        : { kind: 'replay' }
    }
    if (priorEvent.status !== 'received') return { kind: 'refused', code: 'payment_binding_invalid', retryable: false }
  }
  return { kind: 'ok', command, priorEvent }
}

const PAYMENT_STUCK_AFTER_MS = 15 * 60 * 1000

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
      // Still unconfirmed after the wait: enqueuePaymentStuck skips it if the command settled meanwhile.
      if (command.providerStatus !== 'pending') {
        await ctx.scheduler.runAfter(PAYMENT_STUCK_AFTER_MS, internal.notifications.enqueuePaymentStuck, { commandRef: command.commandRef })
      }
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
      const expired = event.eventType === 'checkout.session.expired'
      recordFundingTerminal(command.state, 'failed')
      await ctx.db.patch(command._id, {
        state: 'failed',
        providerStatus: 'failed',
        ...(args.readback.checkoutStatus === undefined ? {} : {
          providerCheckoutStatus: args.readback.checkoutStatus,
        }),
        ...(args.readback.paymentStatus === undefined ? {} : {
          providerPaymentStatus: args.readback.paymentStatus,
        }),
        terminalReason: expired ? 'expired' : 'async_payment_failed',
        updatedAt: event.observedAt,
      })
      // Expiry is not a failure the owner needs mail about.
      if (!expired) {
        await enqueueAccountNotice(ctx, {
          eventKind: 'funding_failed', accountRef: command.accountRef,
          sourceEventRef: command.commandRef, recipientPrincipalRef: command.actorPrincipalRef,
        })
        await enqueueOperatorAlert(ctx, {
          alertRef: `funding-failed:${command.commandRef}`,
          subject: 'Payment failed',
          text: `Funding command ${command.commandRef} failed (${command.accountRef}).`,
        })
      }
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
    expectedEnvironment: command.environment,
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
  if (command !== null && !financialEnvironmentMatches(command.environment)) return refused('environment_mismatch')
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
  recordFundingTerminal(command.state, 'succeeded')
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
  await emitFundingJourneyEvent(ctx, command.accountRef, command.commandRef, 'stripe')
  // Re-evaluate balance after top-up; consent gate and sourceEventRef dedupe live in usageAlerts.
  await enqueueMoneyAlertEvaluation(ctx, command.accountRef)
  return {
    kind: 'accepted',
    status: 'applied',
    appliedRef: args.formanceTransactionRef,
  }
}

