"use node";

import { v, type Infer } from 'convex/values'

import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
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

function retryOrReconcile(refusal: Readonly<{ code: string; retryable: boolean }>): WorkResult {
  if (refusal.retryable || refusal.code === 'stripe_setup_required') {
    throw new Error(`stripe_webhook_retryable:${refusal.code}`)
  }
  return { kind: 'reconciliation_required', code: refusal.code }
}

export const process = internalAction({
  args: { stripeEventId: v.string() },
  returns: stripeWebhookWorkResultValue,
  handler: async (ctx, args): Promise<WorkResult> => {
    const work = await ctx.runQuery(internal.moneyStripeWebhookInbox.readForProcessing, args)
    if (work === null) return { kind: 'reconciliation_required', code: 'stripe_webhook_inbox_missing' }
    if (work.state === 'applied' || work.state === 'ignored') {
      return { kind: 'accepted', status: 'replayed' }
    }
    if (work.state !== 'queued') {
      return { kind: 'reconciliation_required', code: 'stripe_webhook_inbox_not_processable' }
    }

    const config = readStripeMoneyReadbackProviderConfig(globalThis.process.env)
    if (isMoneyRefusal(config)) return retryOrReconcile(config)
    const providerContext = resolveStripeMoneyProviderContext({ config })
    if (isMoneyRefusal(providerContext)) return retryOrReconcile(providerContext)
    const provider = createStripeMoneyProvider({ config, client: providerContext.client })
    const event = work.event

    if (event.kind === 'account') {
      const bindings = await ctx.runQuery(internal.moneyLedger.readPayoutAccountByStripeIdForWorker, {
        stripeAccountId: event.stripeAccountId,
      })
      if (bindings.length !== 1 || bindings[0] === undefined) {
        throw new Error('stripe_webhook_retryable:payout_not_ready')
      }
      const binding = bindings[0]
      const evidence = await provider.readConnectAccount({
        businessId: binding.businessId,
        currency: binding.currency,
        stripeAccountId: binding.stripeAccountId,
      })
      if (isMoneyRefusal(evidence)) return retryOrReconcile(evidence)
      const result = await ctx.runMutation(internal.moneyLedger.recordConnectAccountEventFromInbox, {
        businessId: binding.businessId,
        currency: binding.currency,
        exponent: binding.exponent,
        event,
        readback: {
          detailsSubmitted: evidence.detailsSubmitted,
          recipientCapabilityActive: evidence.recipientCapabilityActive,
          restricted: evidence.restricted,
          requirementsDigest: evidence.requirementsDigest,
          providerObjectDigest: evidence.providerObjectDigest,
          ...(evidence.providerObjectVersion === undefined ? {} : {
            providerObjectVersion: evidence.providerObjectVersion,
          }),
          observedAt: evidence.observedAt,
        },
        ...(binding.version === undefined ? {} : { expectedVersion: binding.version }),
      })
      if (result.kind === 'refused') return retryOrReconcile(result)
      return {
        kind: 'accepted',
        status: binding.lastStripeEventId === event.stripeEventId ? 'replayed' : 'applied',
        appliedRef: `stripe:account:${event.stripeAccountId}`,
      }
    }

    if (event.kind === 'refund') {
      const durable = await ctx.runQuery(internal.moneyAccountFunding.readWebhookRefundCommandForWorker, {
        paymentId: event.paymentId,
      })
      if (isMoneyRefusal(durable)) return retryOrReconcile(durable)
      const refundReadback = await readStripeFundingRefund(
        providerContext.client,
        config,
        event.refundId,
      )
      if (isMoneyRefusal(refundReadback)) return retryOrReconcile(refundReadback)
      const result = await ctx.runAction(internal.moneyAccountFundingFormance.applyVerifiedEventFromInbox, {
        event,
        refundReadback,
        operationKey: 'moneyStripeWebhookInbox:process',
        correlationId: event.stripeEventId,
      })
      return result.kind === 'refused' ? retryOrReconcile(result) : result
    }

    const durable = await ctx.runQuery(internal.moneyAccountFunding.readWebhookCommandForWorker, {
      commandRef: event.commandRef,
      externalRef: event.sessionId,
    })
    if (durable.kind === 'refused') return retryOrReconcile(durable)
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
    if (isMoneyRefusal(payment)) return retryOrReconcile(payment)
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
    return result.kind === 'refused' ? retryOrReconcile(result) : result
  },
})
