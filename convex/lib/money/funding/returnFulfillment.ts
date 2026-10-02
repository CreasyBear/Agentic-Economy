import { financialEnvironmentMatches } from '../formance/contracts'
import type { Infer } from 'convex/values'

import { api, internal } from '../../../_generated/api'
import type { ActionCtx } from '../../../_generated/server'
import { applyVerifiedEventFromInboxResult } from './formanceEvent'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { AUD_EXPONENT, isMoneyRefusal } from '../../../../src/modules/money/public'
import {
  createStripeMoneyProvider,
  readStripeMoneyReadbackProviderConfig,
  resolveStripeMoneyProviderContext,
} from '../../../../src/lib/server/stripe-money-provider'

export async function fulfillReturnHandler(
  ctx: ActionCtx,
  { externalRef }: Readonly<{ externalRef: string }>,
): Promise<Infer<typeof applyVerifiedEventFromInboxResult>> {
  const durable = await ctx.runQuery(api.moneyAccountFunding.read, { externalRef })
  if (durable.kind === 'refused') return durable
  const command = durable.command
  if (!financialEnvironmentMatches(command.environment)) return { kind: 'refused', code: 'environment_mismatch', retryable: false }
  if (command.externalRef !== externalRef) {
    return { kind: 'refused', code: 'payment_binding_invalid', retryable: false }
  }
  if (command.state === 'succeeded') return { kind: 'accepted', status: 'replayed' }
  const config = readStripeMoneyReadbackProviderConfig(globalThis.process.env)
  if (isMoneyRefusal(config)) return config
  const providerContext = resolveStripeMoneyProviderContext({ config })
  if (isMoneyRefusal(providerContext)) return providerContext
  const payment = await createStripeMoneyProvider({
    config, client: providerContext.client,
  }).readCreditPayment({
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
    externalRef,
  })
  if (isMoneyRefusal(payment)) return payment
  const evidence = payment.evidence
  if (evidence.status !== 'succeeded' || evidence.checkoutStatus !== 'complete'
    || evidence.paymentStatus !== 'paid' || evidence.paymentId === undefined) {
    return { kind: 'refused', code: 'funding_pending', retryable: true }
  }
  // A return is a Stripe API readback, not a signed webhook. Both enter the same
  // command-keyed Formance booking and Convex credit transition.
  const event = {
    kind: 'checkout' as const,
    stripeEventId: `checkout-return:${externalRef}`,
    eventType: 'checkout.session.completed' as const,
    externalRef,
    sessionId: externalRef,
    commandRef: command.commandRef,
    paymentId: evidence.paymentId,
    checkoutSessionDigest: evidence.checkoutSessionDigest,
    ...(evidence.paymentIntentDigest === undefined ? {} : { paymentIntentDigest: evidence.paymentIntentDigest }),
    status: 'paid' as const,
    amount: evidence.amount,
    metadataDigest: evidence.metadataDigest,
    payloadDigest: canonicalDigest({ format: 'stripe-checkout-return:v1', evidenceDigest: evidence.evidenceDigest }),
    observedAt: evidence.observedAt,
  }
  return await ctx.runAction(internal.moneyAccountFundingFormance.applyVerifiedEventFromInbox, {
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
      paymentId: evidence.paymentId,
      ...(evidence.checkoutStatus === undefined ? {} : { checkoutStatus: evidence.checkoutStatus }),
      ...(evidence.paymentStatus === undefined ? {} : { paymentStatus: evidence.paymentStatus }),
      ...(evidence.checkoutMode === undefined ? {} : { checkoutMode: evidence.checkoutMode }),
      ...(evidence.checkoutExpiresAt === undefined ? {} : { checkoutExpiresAt: evidence.checkoutExpiresAt }),
    },
    operationKey: 'moneyStripeWebhookWorker:fulfillReturn',
    correlationId: event.stripeEventId,
  })
}
