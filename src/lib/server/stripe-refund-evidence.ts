import Stripe from 'stripe'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isMoneyRefusal, type ExactAmount, type MoneyRefusal } from '@/modules/money/public'
import {
  exponentForCurrency,
  refusal,
  responseData,
  validIdentifier,
  type StripeMoneyClient,
  type StripeMoneyProviderConfig,
} from './stripe-money-provider-config'

export type StripeFundingRefundEvidence = Readonly<{
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

export async function readStripeFundingRefund(
  client: StripeMoneyClient,
  config: StripeMoneyProviderConfig,
  refundId: string,
): Promise<StripeFundingRefundEvidence | MoneyRefusal> {
  if (!validIdentifier(refundId)) return refusal('payment_binding_invalid', false)
  try {
    const refund = responseData(await client.refunds.retrieve(refundId))
    return mapStripeFundingRefundEvidence({ refund, config })
  } catch (cause) {
    return degradeBackend(cause, refusal('credit_topup_pending', true), {
      site: 'readStripeFundingRefund',
      reason: 'source_unavailable',
    })
  }
}

export function mapStripeFundingRefundEvidence(input: Readonly<{
  refund: Stripe.Refund
  config: StripeMoneyProviderConfig
}>): StripeFundingRefundEvidence | MoneyRefusal {
  const material = refundMaterial(input.refund)
  if (isMoneyRefusal(material)) return material
  const refundDigest = canonicalDigest({
    format: 'stripe-refund:v1',
    refundId: input.refund.id,
    paymentId: material.paymentId,
    chargeId: material.chargeId,
    status: material.status,
    amount: material.amount,
    balanceTransactionId: objectId(input.refund.balance_transaction) ?? null,
    failureBalanceTransactionId: objectId(input.refund.failure_balance_transaction) ?? null,
  })
  return {
    refundId: input.refund.id,
    paymentId: material.paymentId,
    chargeId: material.chargeId,
    status: material.status,
    amount: material.amount,
    refundDigest,
    evidenceDigest: canonicalDigest({
      format: 'stripe-refund-observation:v1',
      mode: input.config.mode,
      refundDigest,
    }),
    evidenceRef: `stripe:refund:${input.refund.id}`,
    observedAt: input.refund.created * 1_000,
  }
}

export function refundMaterial(refund: Stripe.Refund):
  | Readonly<{
      paymentId: string
      chargeId: string
      status: 'pending' | 'succeeded' | 'failed'
      amount: ExactAmount
    }>
  | MoneyRefusal {
  const paymentId = objectId(refund.payment_intent)
  const chargeId = objectId(refund.charge)
  const exponent = exponentForCurrency(refund.currency)
  const status = refundStatus(refund.status)
  if (!validIdentifier(refund.id)
    || paymentId === undefined
    || chargeId === undefined
    || exponent === undefined
    || status === undefined
    || !Number.isSafeInteger(refund.amount)
    || refund.amount <= 0
    || !Number.isSafeInteger(refund.created)
    || refund.created < 0
    || !Number.isSafeInteger(refund.created * 1_000)) {
    return refusal('payment_binding_invalid', false)
  }
  return {
    paymentId,
    chargeId,
    status,
    amount: { currency: refund.currency.toUpperCase(), units: String(refund.amount), exponent },
  }
}

function objectId(value: unknown): string | undefined {
  if (typeof value === 'string') return validIdentifier(value) ? value : undefined
  if (typeof value !== 'object' || value === null || !('id' in value)) return undefined
  return validIdentifier(value.id) ? value.id : undefined
}

function refundStatus(value: string | null): 'pending' | 'succeeded' | 'failed' | undefined {
  if (value === 'succeeded') return 'succeeded'
  if (value === 'pending' || value === 'requires_action') return 'pending'
  if (value === 'failed' || value === 'canceled') return 'failed'
  return undefined
}
