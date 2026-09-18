import type Stripe from 'stripe'
import { describe, expect, it, vi } from 'vitest'

import { resolveStripeReceiptUrl } from '../../../src/lib/server/stripe-receipt'

const receiptUrl = 'https://pay.stripe.com/receipts/payment/test_receipt_one'

function stripeClient(input: Readonly<{
  paymentIntentsRetrieve?: ReturnType<typeof vi.fn>
  chargesRetrieve?: ReturnType<typeof vi.fn>
}>): Stripe {
  return {
    paymentIntents: {
      retrieve: input.paymentIntentsRetrieve ?? vi.fn(),
    },
    charges: {
      retrieve: input.chargesRetrieve ?? vi.fn(),
    },
  } as unknown as Stripe
}

describe('stripe-receipt (W-24)', () => {
  it('R1: resolveStripeReceiptUrl with pi_... and expanded latest_charge.receipt_url returns ok', async () => {
    const paymentIntentsRetrieve = vi.fn().mockResolvedValue({
      id: 'pi_test_payment_one',
      latest_charge: {
        id: 'ch_from_pi',
        receipt_url: receiptUrl,
      },
    })
    const chargesRetrieve = vi.fn()
    const client = stripeClient({ paymentIntentsRetrieve, chargesRetrieve })

    const result = await resolveStripeReceiptUrl({
      paymentId: 'pi_test_payment_one',
      client,
    })

    expect(result).toEqual({ kind: 'ok', receiptUrl })
    expect(paymentIntentsRetrieve).toHaveBeenCalledOnce()
    expect(paymentIntentsRetrieve.mock.calls[0]?.[0]).toBe('pi_test_payment_one')
    expect(paymentIntentsRetrieve.mock.calls[0]?.[1]).toEqual({
      expand: ['latest_charge'],
    })
    expect(chargesRetrieve).not.toHaveBeenCalled()
  })

  it('R2: resolveStripeReceiptUrl with ch_... calls charges.retrieve and returns ok', async () => {
    const chargesRetrieve = vi.fn().mockResolvedValue({
      id: 'ch_test_charge_one',
      receipt_url: receiptUrl,
    })
    const paymentIntentsRetrieve = vi.fn()
    const client = stripeClient({ paymentIntentsRetrieve, chargesRetrieve })

    const result = await resolveStripeReceiptUrl({
      paymentId: 'ch_test_charge_one',
      client,
    })

    expect(result).toEqual({ kind: 'ok', receiptUrl })
    expect(chargesRetrieve).toHaveBeenCalledOnce()
    expect(chargesRetrieve.mock.calls[0]?.[0]).toBe('ch_test_charge_one')
    expect(paymentIntentsRetrieve).not.toHaveBeenCalled()
  })

  it('R3: resolveStripeReceiptUrl with PI having null latest_charge or null receipt_url returns receipt_unavailable', async () => {
    const paymentIntentsRetrieve = vi.fn()
      .mockResolvedValueOnce({ id: 'pi_missing_charge', latest_charge: null })
      .mockResolvedValueOnce({
        id: 'pi_missing_receipt',
        latest_charge: { id: 'ch_no_receipt', receipt_url: null },
      })
    const client = stripeClient({ paymentIntentsRetrieve })

    await expect(resolveStripeReceiptUrl({
      paymentId: 'pi_missing_charge',
      client,
    })).resolves.toEqual({ kind: 'refused', code: 'receipt_unavailable' })

    await expect(resolveStripeReceiptUrl({
      paymentId: 'pi_missing_receipt',
      client,
    })).resolves.toEqual({ kind: 'refused', code: 'receipt_unavailable' })
  })

  it('R4: resolveStripeReceiptUrl with invalid or empty paymentId returns payment_binding_invalid', async () => {
    const paymentIntentsRetrieve = vi.fn()
    const chargesRetrieve = vi.fn()
    const client = stripeClient({ paymentIntentsRetrieve, chargesRetrieve })

    for (const paymentId of ['', '   ', 'cs_test_session', 'not_a_stripe_id']) {
      await expect(resolveStripeReceiptUrl({ paymentId, client })).resolves.toEqual({
        kind: 'refused',
        code: 'payment_binding_invalid',
      })
    }

    expect(paymentIntentsRetrieve).not.toHaveBeenCalled()
    expect(chargesRetrieve).not.toHaveBeenCalled()
  })

  it('R5: resolveStripeReceiptUrl handles Stripe errors gracefully with a typed refusal', async () => {
    const paymentIntentsRetrieve = vi.fn().mockRejectedValue(new Error('Stripe API unavailable'))
    const client = stripeClient({ paymentIntentsRetrieve })

    await expect(resolveStripeReceiptUrl({
      paymentId: 'pi_stripe_error',
      client,
    })).resolves.toMatchObject({
      kind: 'refused',
      code: expect.stringMatching(/^(receipt_unavailable|stripe_request_failed)$/u),
    })
  })
})
