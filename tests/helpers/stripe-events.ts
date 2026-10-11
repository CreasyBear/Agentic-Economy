import { canonicalDigest } from '@/modules/common/canonical-digest'

export type TestCheckoutEventOptions = Readonly<{
  stripeEventId?: string
  eventType?:
    | 'checkout.session.completed'
    | 'checkout.session.async_payment_succeeded'
    | 'checkout.session.async_payment_failed'
  externalRef?: string
  sessionId?: string
  commandRef?: string
  paymentId?: string
  status?: 'paid' | 'failed'
  amount?: { currency: string; units: string; exponent: number }
  payloadDigest?: string
  metadataDigest?: string
  observedAt?: number
}>

export function createTestCheckoutEvent(options: TestCheckoutEventOptions = {}) {
  const stripeEventId = options.stripeEventId ?? 'evt_test_checkout'
  const sessionId = options.sessionId ?? options.externalRef ?? 'cs_test_session'
  const commandRef = options.commandRef ?? `sha256:${'b'.repeat(64)}`
  const paymentId = options.paymentId ?? 'pi_test_payment'
  const payloadDigest = options.payloadDigest ?? canonicalDigest({ stripeEventId, sessionId })
  const metadataDigest = options.metadataDigest ?? `sha256:${'e'.repeat(64)}`

  return {
    kind: 'checkout' as const,
    stripeEventId,
    eventType: options.eventType ?? ('checkout.session.completed' as const),
    externalRef: sessionId,
    sessionId,
    commandRef,
    paymentId,
    checkoutSessionDigest: `sha256:${'c'.repeat(64)}`,
    paymentIntentDigest: `sha256:${'d'.repeat(64)}`,
    status: options.status ?? ('paid' as const),
    amount: options.amount ?? { currency: 'AUD', units: '5780000', exponent: 6 },
    metadataDigest,
    payloadDigest,
    observedAt: options.observedAt ?? 1_800_000_000_000,
  }
}

export type TestChargeRefundedEventOptions = Readonly<{
  stripeEventId?: string
  chargeId?: string
  paymentIntentId?: string
  amountRefunded?: { currency: string; units: string; exponent: number }
  payloadDigest?: string
  observedAt?: number
}>

export function createTestChargeRefundedEvent(options: TestChargeRefundedEventOptions = {}) {
  const stripeEventId = options.stripeEventId ?? 'evt_test_refund'
  const chargeId = options.chargeId ?? 'ch_test_charge'
  const paymentIntentId = options.paymentIntentId ?? 'pi_test_payment'
  const payloadDigest = options.payloadDigest ?? canonicalDigest({ stripeEventId, chargeId })

  return {
    kind: 'refund' as const,
    stripeEventId,
    eventType: 'charge.refunded' as const,
    chargeId,
    paymentIntentId,
    amountRefunded: options.amountRefunded ?? { currency: 'AUD', units: '5780000', exponent: 6 },
    payloadDigest,
    observedAt: options.observedAt ?? 1_800_000_000_000,
  }
}

export function createTestDisputeEvent(options: Readonly<{
  stripeEventId?: string
  disputeId?: string
  paymentId?: string
  eventType?: 'charge.dispute.created' | 'charge.dispute.updated' | 'charge.dispute.closed'
  observedAt?: number
}> = {}) {
  const paymentId = options.paymentId ?? 'pi_test_payment'
  return {
    kind: 'dispute' as const,
    stripeEventId: options.stripeEventId ?? 'evt_test_dispute',
    eventType: options.eventType ?? ('charge.dispute.created' as const),
    externalRef: options.disputeId ?? 'dp_test_dispute',
    disputeId: options.disputeId ?? 'dp_test_dispute',
    paymentId,
    chargeId: `ch_${paymentId}`,
    disputeStatus: 'needs_response',
    reason: 'fraudulent',
    amount: { currency: 'AUD', units: '578', exponent: 2 },
    evidenceDueBy: 1_800_600_000_000,
    disputeDigest: `sha256:${'7'.repeat(64)}`,
    payloadDigest: `sha256:${'8'.repeat(64)}`,
    observedAt: options.observedAt ?? 1_800_000_000_000,
  }
}
