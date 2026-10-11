"use node";

import { v, type Infer } from 'convex/values'

import { internal } from './_generated/api'
import { action, internalAction, type ActionCtx } from './_generated/server'
import { applyVerifiedEventFromInboxResult } from './lib/money/funding/formanceEvent'
import { fulfillReturnHandler } from './lib/money/funding/returnFulfillment'
import { stripeWebhookWorkResultValue } from './moneyStripeWebhookValues'
import {
  AUD_EXPONENT,
  isMoneyRefusal,
} from '../src/modules/money/public'
import {
  createStripeMoneyProvider,
  readStripeFundingRefund,
  readStripeMoneyReadbackProviderConfig,
  resolveStripeMoneyProviderContext,
} from '../src/lib/server/stripe-money-provider'

type WorkResult = Infer<typeof stripeWebhookWorkResultValue>

// Same schedule the workpool used when this threw: 13 attempts, 60s doubling.
const RETRY_MAX_ATTEMPTS = 13
const RETRY_INITIAL_BACKOFF_MS = 60_000

/** Retryable refusals are expected state: schedule the next attempt and return it, never throw. */
async function retryOrReconcile(
  ctx: ActionCtx,
  stripeEventId: string,
  attempt: number,
  refusal: Readonly<{ code: string; retryable: boolean }>,
): Promise<WorkResult> {
  if (!refusal.retryable && refusal.code !== 'stripe_setup_required') {
    return { kind: 'reconciliation_required', code: refusal.code }
  }
  if (attempt + 1 >= RETRY_MAX_ATTEMPTS) {
    return { kind: 'reconciliation_required', code: `stripe_webhook_retries_exhausted:${refusal.code}` }
  }
  await ctx.scheduler.runAfter(
    RETRY_INITIAL_BACKOFF_MS * 2 ** attempt,
    internal.moneyStripeWebhookInbox.requeue,
    { stripeEventId, attempt: attempt + 1 },
  )
  return { kind: 'retry_scheduled' }
}

export const fulfillReturn = action({
  args: { externalRef: v.string() },
  returns: applyVerifiedEventFromInboxResult,
  handler: fulfillReturnHandler,
})

export const process = internalAction({
  args: { stripeEventId: v.string(), attempt: v.optional(v.number()) },
  returns: stripeWebhookWorkResultValue,
  handler: async (ctx, args): Promise<WorkResult> => {
    const attempt = args.attempt ?? 0
    const retry = (refusal: Readonly<{ code: string; retryable: boolean }>) =>
      retryOrReconcile(ctx, args.stripeEventId, attempt, refusal)
    const work = await ctx.runQuery(internal.moneyStripeWebhookInbox.readForProcessing, { stripeEventId: args.stripeEventId })
    if (work === null) return { kind: 'reconciliation_required', code: 'stripe_webhook_inbox_missing' }
    if (work.state === 'applied' || work.state === 'ignored') {
      return { kind: 'accepted', status: 'replayed' }
    }
    if (work.state !== 'queued') {
      return { kind: 'reconciliation_required', code: 'stripe_webhook_inbox_not_processable' }
    }

    const event = work.event
    if (event.kind === 'account') return { kind: 'accepted', status: 'ignored' }
    // Persisted origin is checked before configuration/readback so old queued
    // work terminates deterministically even while the new provider is unready.
    const durable = event.kind === 'refund' || event.kind === 'dispute'
      ? await ctx.runQuery(internal.moneyAccountFunding.readWebhookRefundCommandForWorker, { paymentId: event.paymentId })
      : await ctx.runQuery(internal.moneyAccountFunding.readWebhookCommandForWorker, {
          commandRef: event.commandRef, externalRef: event.sessionId,
        })
    if (durable.kind === 'refused') return retry(durable)
    // The signature-verified dispute event is the evidence (Stripe dispute webhooks); no readback.
    if (event.kind === 'dispute') {
      const result = await ctx.runAction(internal.moneyAccountFundingFormance.applyVerifiedEventFromInbox, {
        event,
        operationKey: 'moneyStripeWebhookInbox:process',
        correlationId: event.stripeEventId,
      })
      return result.kind === 'refused' ? retry(result) : result
    }
    const config = readStripeMoneyReadbackProviderConfig(globalThis.process.env)
    if (isMoneyRefusal(config)) return retry(config)
    const providerContext = resolveStripeMoneyProviderContext({ config })
    if (isMoneyRefusal(providerContext)) return retry(providerContext)
    const provider = createStripeMoneyProvider({ config, client: providerContext.client })

    if (event.kind === 'refund') {
      const refundReadback = await readStripeFundingRefund(
        providerContext.client,
        config,
        event.refundId,
      )
      if (isMoneyRefusal(refundReadback)) return retry(refundReadback)
      const result = await ctx.runAction(internal.moneyAccountFundingFormance.applyVerifiedEventFromInbox, {
        event,
        refundReadback,
        operationKey: 'moneyStripeWebhookInbox:process',
        correlationId: event.stripeEventId,
      })
      return result.kind === 'refused' ? retry(result) : result
    }

    const command = durable.command
    const payment = await provider.readCreditPayment({
      commandRef: command.commandRef,
      principalId: command.actorPrincipalRef,
      accountRef: command.accountRef,
      amount: { currency: 'AUD', exponent: AUD_EXPONENT, units: command.totalUnits },
      idempotencyKey: command.idempotencyKey,
      inputDigest: command.inputDigest,
      successReturnRef: command.successReturnRef,
      providerRecoveryDeadlineAt: command.providerRecoveryDeadlineAt,
      principalAmount: { currency: 'AUD', exponent: AUD_EXPONENT, units: command.principalUnits },
      serviceFeeAmount: { currency: 'AUD', exponent: AUD_EXPONENT, units: command.serviceFeeUnits },
      taxAmount: { currency: 'AUD', exponent: AUD_EXPONENT, units: command.taxUnits },
      ...(command.cancelReturnRef === undefined ? {} : { cancelReturnRef: command.cancelReturnRef }),
      ...(command.checkoutExpiresAt === undefined ? {} : { checkoutExpiresAt: command.checkoutExpiresAt }),
      externalRef: event.sessionId,
    })
    if (isMoneyRefusal(payment)) return retry(payment)
    const evidence = payment.evidence
    const result = await ctx.runAction(internal.moneyAccountFundingFormance.applyVerifiedEventFromInbox, {
      event,
      readback: {
        externalRef: evidence.externalRef,
        amount: evidence.amount,
        status: evidence.status,
        evidenceRef: evidence.evidenceRef,
        requestDigest: evidence.requestDigest,
        metadataDigest: evidence.metadataDigest,
        checkoutSessionDigest: evidence.checkoutSessionDigest,
        ...(evidence.paymentIntentDigest === undefined ? {} : { paymentIntentDigest: evidence.paymentIntentDigest }),
        evidenceDigest: evidence.evidenceDigest,
        ...(evidence.paymentId === undefined ? {} : { paymentId: evidence.paymentId }),
        ...(evidence.checkoutStatus === undefined ? {} : { checkoutStatus: evidence.checkoutStatus }),
        ...(evidence.paymentStatus === undefined ? {} : { paymentStatus: evidence.paymentStatus }),
        ...(evidence.checkoutMode === undefined ? {} : { checkoutMode: evidence.checkoutMode }),
        ...(evidence.checkoutExpiresAt === undefined ? {} : { checkoutExpiresAt: evidence.checkoutExpiresAt }),
      },
      operationKey: 'moneyStripeWebhookInbox:process',
      correlationId: event.stripeEventId,
    })
    return result.kind === 'refused' ? retry(result) : result
  },
})
