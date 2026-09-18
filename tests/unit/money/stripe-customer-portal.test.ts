import type Stripe from 'stripe'
import { describe, expect, it, vi } from 'vitest'

import {
  createStripeCustomerPortalSession,
  portalSessionCreateParams,
  projectSavedCardDisplay,
  readStripeCustomerPortalConfig,
  resolveOrProvisionStripeCustomer,
  stripeCustomerCreateParams,
  validatePortalReturnUrl,
} from '../../../src/lib/server/stripe-customer-portal'
import { isMoneyRefusal } from '../../../src/modules/money/public'

const baseUrl = 'https://app.example.test'
const accountRef = 'acc_22222222222222222222222222222222'
const stripeCustomerId = 'cus_test_customer_one'

function cardPaymentMethod(
  overrides: Readonly<Record<string, unknown>> = {},
): Stripe.PaymentMethod {
  return {
    id: 'pm_test_card_one',
    object: 'payment_method',
    type: 'card',
    card: {
      brand: 'visa',
      last4: '4242',
      exp_month: 12,
      exp_year: 2030,
      checks: null,
      country: 'AU',
      display_brand: 'visa',
      funding: 'credit',
      generated_from: null,
      networks: null,
      regulated_status: 'unregulated',
      three_d_secure_usage: null,
      wallet: null,
    },
    billing_details: {
      address: null,
      email: null,
      name: null,
      phone: null,
      tax_id: null,
    },
    created: 1_700_000_000,
    customer: stripeCustomerId,
    livemode: false,
    metadata: {},
    ...overrides,
  } as Stripe.PaymentMethod
}

function portalClient(input: Readonly<{
  portalCreate?: ReturnType<typeof vi.fn>
  customerCreate?: ReturnType<typeof vi.fn>
  customerRetrieve?: ReturnType<typeof vi.fn>
  paymentMethodsList?: ReturnType<typeof vi.fn>
}>): Stripe {
  return {
    billingPortal: {
      sessions: {
        create: input.portalCreate ?? vi.fn(),
      },
    },
    customers: {
      create: input.customerCreate ?? vi.fn(),
      retrieve: input.customerRetrieve ?? vi.fn(),
    },
    paymentMethods: {
      list: input.paymentMethodsList ?? vi.fn(),
    },
  } as unknown as Stripe
}

describe('stripe-customer-portal (W-22)', () => {
  it('P1: portalSessionCreateParams uses payment_method_update flow only', () => {
    const returnUrl = `${baseUrl}/owner/credit`
    expect(portalSessionCreateParams({
      customer: stripeCustomerId,
      returnUrl,
    })).toEqual({
      customer: stripeCustomerId,
      return_url: returnUrl,
      flow_data: { type: 'payment_method_update' },
    })
  })

  it('P2: validatePortalReturnUrl canonicalizes /owner/credit against base URL', () => {
    const result = validatePortalReturnUrl({
      returnUrl: '/owner/credit',
      baseUrl,
    })
    expect(result).toEqual({
      kind: 'ok',
      returnUrl: `${baseUrl}/owner/credit`,
    })
  })

  it('P3: validatePortalReturnUrl refuses open redirects and foreign paths', () => {
    for (const returnUrl of [
      'https://evil.test/phish',
      '//evil',
      '/owner/settings',
    ]) {
      const result = validatePortalReturnUrl({ returnUrl, baseUrl })
      expect(isMoneyRefusal(result)).toBe(true)
      if (isMoneyRefusal(result)) {
        expect(result.code).toBe('payment_binding_invalid')
      }
    }
  })

  it('P4: stripeCustomerCreateParams sets accountRef metadata only', () => {
    expect(stripeCustomerCreateParams({ accountRef })).toEqual({
      metadata: { accountRef },
    })
  })

  it('P5: projectSavedCardDisplay projects expanded default card', () => {
    const paymentMethod = cardPaymentMethod()
    const result = projectSavedCardDisplay({
      defaultPaymentMethod: paymentMethod,
      cardPaymentMethods: [paymentMethod],
    })

    expect(result).toEqual({
      kind: 'ready',
      hasPaymentMethod: true,
      card: {
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2030,
        isDefault: true,
      },
    })
  })

  it('P6: projectSavedCardDisplay returns missing when default payment method is null', () => {
    expect(projectSavedCardDisplay({
      defaultPaymentMethod: null,
      cardPaymentMethods: [],
    })).toEqual({
      kind: 'missing',
      hasPaymentMethod: false,
    })
  })

  it('P7: projectSavedCardDisplay resolves default id via card list', () => {
    const paymentMethod = cardPaymentMethod({ id: 'pm_default_from_list' })
    const result = projectSavedCardDisplay({
      defaultPaymentMethod: 'pm_default_from_list',
      cardPaymentMethods: [paymentMethod],
    })

    expect(result).toMatchObject({
      kind: 'ready',
      hasPaymentMethod: true,
      card: {
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2030,
        isDefault: true,
      },
    })
  })

  it('P8: projectSavedCardDisplay ignores non-default cards when default is unset', () => {
    expect(projectSavedCardDisplay({
      defaultPaymentMethod: null,
      cardPaymentMethods: [cardPaymentMethod()],
    })).toEqual({
      kind: 'missing',
      hasPaymentMethod: false,
    })
  })

  it('P9: projectSavedCardDisplay never includes number or cvc', () => {
    const paymentMethod = cardPaymentMethod({
      card: {
        ...(cardPaymentMethod().card as Stripe.PaymentMethod.Card),
        number: '4242424242424242',
        cvc: '123',
      },
    })
    const result = projectSavedCardDisplay({
      defaultPaymentMethod: paymentMethod,
      cardPaymentMethods: [paymentMethod],
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toMatch(/"number"/u)
    expect(serialized).not.toMatch(/"cvc"/u)
    expect(result).toMatchObject({ kind: 'ready', hasPaymentMethod: true })
  })

  it('P10: createStripeCustomerPortalSession creates a billing portal session', async () => {
    const portalCreate = vi.fn().mockResolvedValue({
      url: 'https://billing.stripe.com/session/test_portal',
    })
    const client = portalClient({ portalCreate })

    const result = await createStripeCustomerPortalSession({
      config: { secretKey: 'sk_test_portal', mode: 'test' },
      client,
      customerId: stripeCustomerId,
      returnUrl: `${baseUrl}/owner/credit`,
    })

    expect(result).toEqual({
      kind: 'ok',
      portalUrl: 'https://billing.stripe.com/session/test_portal',
    })
    expect(portalCreate).toHaveBeenCalledOnce()
    expect(portalCreate.mock.calls[0]?.[0]).toEqual(
      portalSessionCreateParams({
        customer: stripeCustomerId,
        returnUrl: `${baseUrl}/owner/credit`,
      }),
    )
  })

  it('P11: resolveOrProvisionStripeCustomer creates customer when binding is missing', async () => {
    const customerCreate = vi.fn().mockResolvedValue({ id: 'cus_created_one' })
    const client = portalClient({ customerCreate })
    const saveBinding = vi.fn().mockResolvedValue(undefined)

    const result = await resolveOrProvisionStripeCustomer({
      accountRef,
      config: { secretKey: 'sk_test_portal', mode: 'test' },
      client,
      loadBinding: async () => null,
      saveBinding,
    })

    expect(result).toMatchObject({
      kind: 'ok',
      stripeCustomerId: 'cus_created_one',
      created: true,
    })
    expect(customerCreate).toHaveBeenCalledOnce()
    expect(customerCreate.mock.calls[0]?.[0]).toEqual(
      stripeCustomerCreateParams({ accountRef }),
    )
    expect(customerCreate.mock.calls[0]?.[1]).toEqual({
      idempotencyKey: `ae:money:customer:${accountRef}`,
    })
    expect(saveBinding).toHaveBeenCalledOnce()
  })

  it('P12: resolveOrProvisionStripeCustomer reuses existing stripeCustomerId', async () => {
    const customerCreate = vi.fn()
    const customerRetrieve = vi.fn().mockResolvedValue({ id: stripeCustomerId, deleted: false })
    const client = portalClient({ customerCreate, customerRetrieve })

    const result = await resolveOrProvisionStripeCustomer({
      accountRef,
      config: { secretKey: 'sk_test_portal', mode: 'test' },
      client,
      loadBinding: async () => ({
        stripeCustomerId,
        mandateState: 'missing' as const,
        revision: 1,
      }),
      saveBinding: vi.fn(),
    })

    expect(result).toMatchObject({
      kind: 'ok',
      stripeCustomerId,
      created: false,
    })
    expect(customerCreate).not.toHaveBeenCalled()
    expect(customerRetrieve).toHaveBeenCalledWith(stripeCustomerId)
  })

  it('P13: missing Stripe secret returns stripe_setup_required', () => {
    expect(readStripeCustomerPortalConfig({})).toMatchObject({
      code: 'stripe_setup_required',
    })
    expect(readStripeCustomerPortalConfig({ STRIPE_SECRET_KEY: 'not_a_stripe_secret' })).toMatchObject({
      code: 'stripe_setup_required',
    })
  })

  it('P14: deleted Stripe customer triggers replacement customer creation', async () => {
    const customerCreate = vi.fn().mockResolvedValue({ id: 'cus_replacement_one' })
    const customerRetrieve = vi.fn().mockResolvedValue({ id: stripeCustomerId, deleted: true })
    const client = portalClient({ customerCreate, customerRetrieve })
    const saveBinding = vi.fn().mockResolvedValue(undefined)

    const result = await resolveOrProvisionStripeCustomer({
      accountRef,
      config: { secretKey: 'sk_test_portal', mode: 'test' },
      client,
      loadBinding: async () => ({
        stripeCustomerId,
        mandateState: 'ready' as const,
        revision: 2,
      }),
      saveBinding,
    })

    expect(result).toMatchObject({
      kind: 'ok',
      stripeCustomerId: 'cus_replacement_one',
      created: true,
      mandateState: 'missing',
    })
    expect(customerCreate).toHaveBeenCalledOnce()
    expect(saveBinding).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeCustomerId: 'cus_replacement_one',
        mandateState: 'missing',
      }),
    )
  })
})
