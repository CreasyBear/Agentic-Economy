import { withSourceWrite } from './source-write-admission'
import {
  createTestChargeRefundedEvent,
  createTestCheckoutEvent,
  type TestChargeRefundedEventOptions,
  type TestCheckoutEventOptions,
} from './stripe-events'

export {
  createTestChargeRefundedEvent,
  createTestCheckoutEvent,
  type TestChargeRefundedEventOptions,
  type TestCheckoutEventOptions,
}

export type Am10CheckoutEventType =
  | 'checkout.session.completed'
  | 'checkout.session.async_payment_succeeded'

export type Am10BoundFunding = Readonly<{
  commandRef: string
  idempotencyKey: string
  accountRef: string
  evidence: ReturnType<typeof am10BindEvidence>
}>

export type Am12RefundEventType = 'refund.created' | 'refund.updated' | 'refund.failed'

export function am10BindEvidence(metadataDigest: string, slug: string) {
  return {
    externalRef: `cs_am10_${slug}`,
    amount: { currency: 'AUD' as const, units: '5280000', exponent: 6 as const },
    status: 'succeeded' as const,
    evidenceRef: `stripe:checkout:cs_am10_${slug}`,
    requestDigest: `sha256:${'b'.repeat(64)}`,
    metadataDigest,
    checkoutSessionDigest: `sha256:${'c'.repeat(64)}`,
    paymentIntentDigest: `sha256:${'d'.repeat(64)}`,
    evidenceDigest: `sha256:${'e'.repeat(64)}`,
    paymentId: `pi_am10_${slug}`,
  }
}

export function am10PaidCheckoutEvent(input: Readonly<{
  stripeEventId: string
  eventType: Am10CheckoutEventType
  commandRef: string
  evidence: ReturnType<typeof am10BindEvidence>
  payloadDigest: string
}>) {
  return createTestCheckoutEvent({
    stripeEventId: input.stripeEventId,
    eventType: input.eventType,
    sessionId: input.evidence.externalRef,
    commandRef: input.commandRef,
    paymentId: input.evidence.paymentId,
    amount: input.evidence.amount,
    metadataDigest: input.evidence.metadataDigest,
    payloadDigest: input.payloadDigest,
  })
}

export function am10SettlementBooking(bound: Am10BoundFunding) {
  return {
    commandRef: bound.commandRef,
    accountRef: bound.accountRef,
    processorRef: bound.evidence.externalRef,
    idempotencyKey: bound.idempotencyKey,
    principalUnits: '5000000',
    serviceFeeUnits: '250000',
    taxUnits: '30000',
    totalUnits: '5280000',
  }
}

export async function am10VerifiedEventArgs(
  event: ReturnType<typeof am10PaidCheckoutEvent>,
  evidence: ReturnType<typeof am10BindEvidence>,
) {
  return await withSourceWrite('billing', {
    event,
    readback: evidence,
    operationKey: 'moneyAccountFunding:applyVerifiedEvent',
    correlationId: event.stripeEventId,
  })
}

export function refundEvent(input: Readonly<{
  stripeEventId: string
  refundId: string
  paymentId: string
  amountUnits?: string
  observedAt: number
  eventType?: Am12RefundEventType
  status?: 'pending' | 'succeeded' | 'failed'
  payloadDigest?: string
}>) {
  return {
    kind: 'refund' as const,
    stripeEventId: input.stripeEventId,
    eventType: input.eventType ?? 'refund.updated' as const,
    externalRef: input.refundId,
    refundId: input.refundId,
    paymentId: input.paymentId,
    chargeId: `ch_${input.paymentId}`,
    refundDigest: `sha256:${'4'.repeat(64)}`,
    status: input.status ?? 'succeeded' as const,
    amount: {
      currency: 'AUD',
      units: input.amountUnits ?? '528',
      exponent: 2,
    },
    payloadDigest: input.payloadDigest ?? `sha256:${'5'.repeat(64)}`,
    observedAt: input.observedAt,
  }
}

export function refundEvidence(event: ReturnType<typeof refundEvent>) {
  return {
    refundId: event.refundId,
    paymentId: event.paymentId,
    chargeId: event.chargeId,
    status: event.status,
    amount: event.amount,
    refundDigest: event.refundDigest,
    evidenceDigest: `sha256:${'6'.repeat(64)}`,
    evidenceRef: `stripe:refund:${event.refundId}`,
    observedAt: event.observedAt,
  }
}

export async function am12RefundArgs(event: ReturnType<typeof refundEvent>) {
  return await withSourceWrite('billing', {
    event,
    refundReadback: refundEvidence(event),
    operationKey: 'moneyAccountFunding:applyVerifiedEvent',
    correlationId: event.stripeEventId,
  })
}
