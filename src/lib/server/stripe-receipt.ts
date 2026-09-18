import type Stripe from 'stripe'

export type StripeReceiptRefusalCode = 'payment_binding_invalid' | 'receipt_unavailable' | 'stripe_request_failed'

export type ResolveStripeReceiptUrlResult =
  | Readonly<{ kind: 'ok'; receiptUrl: string }>
  | Readonly<{ kind: 'refused'; code: StripeReceiptRefusalCode }>

function isStripePaymentId(paymentId: string): boolean {
  return paymentId.startsWith('pi_') || paymentId.startsWith('ch_')
}

function receiptUrlFromCharge(charge: Stripe.Charge | null | undefined): string | undefined {
  const receiptUrl = charge?.receipt_url
  return typeof receiptUrl === 'string' && receiptUrl.length > 0 ? receiptUrl : undefined
}

export async function resolveStripeReceiptUrl(input: Readonly<{
  client: Stripe
  paymentId: string
}>): Promise<ResolveStripeReceiptUrlResult> {
  const paymentId = input.paymentId
  if (!paymentId || !isStripePaymentId(paymentId)) {
    return { kind: 'refused', code: 'payment_binding_invalid' }
  }

  try {
    if (paymentId.startsWith('pi_')) {
      const paymentIntent = await input.client.paymentIntents.retrieve(paymentId, {
        expand: ['latest_charge'],
      })
      const latestCharge = paymentIntent.latest_charge
      const charge = typeof latestCharge === 'string'
        ? await input.client.charges.retrieve(latestCharge)
        : latestCharge
      const receiptUrl = receiptUrlFromCharge(charge)
      if (receiptUrl === undefined) {
        return { kind: 'refused', code: 'receipt_unavailable' }
      }
      return { kind: 'ok', receiptUrl }
    }

    const charge = await input.client.charges.retrieve(paymentId)
    const receiptUrl = receiptUrlFromCharge(charge)
    if (receiptUrl === undefined) {
      return { kind: 'refused', code: 'receipt_unavailable' }
    }
    return { kind: 'ok', receiptUrl }
  } catch (cause) {
    void cause;
    return { kind: 'refused', code: 'receipt_unavailable' }
  }
}
