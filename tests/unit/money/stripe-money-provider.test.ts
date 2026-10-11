import Stripe from 'stripe'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import {
  createStripeMoneyProvider,
  mapStripeMoneyWebhookEvent,
  readStripeMoneyProviderConfig,
  verifyStripeMoneyWebhook,
  stripeCreditRequestDigest,
} from '../../../src/lib/server/stripe-money-provider'
import { isMoneyRefusal, type ExactAmount } from '../../../src/modules/money/public'
import type { StripeMoneyProviderConfig } from '../../../src/lib/server/stripe-money-provider'
import {
  expectedStripeMoneyModeForDeployment,
  readStripeMoneyReadbackProviderConfig,
  validateStripeMoneyProviderConfig,
} from '../../../src/lib/server/stripe-money-provider-config'

const config: StripeMoneyProviderConfig = {
  secretKey: 'rk_test_adapter',
  webhookSecret: 'whsec_adapter',
  v2WebhookSecret: 'whsec_v2_adapter',
  mode: 'test',
}

const request = {
  commandRef: 'topup-command-1',
  principalId: 'principal-1',
  accountRef: 'account-USD',
  amount: amount('USD', '1050', 2),
  idempotencyKey: 'topup-idempotency-1',
  inputDigest: 'sha256:input-1',
  successReturnRef: 'https://app.example.test/credit/return',
  providerRecoveryDeadlineAt: Number.MAX_SAFE_INTEGER,
} as const

const hostedConfig: StripeMoneyProviderConfig = {
  ...config,
  inclusiveGstTaxRateId: 'txr_au_gst_10_inclusive',
  checkoutHost: 'checkout.stripe.com',
}

const hostedRequest = {
  ...request,
  accountRef: 'account-AUD',
  amount: amount('AUD', '5780000', 6),
  principalAmount: amount('AUD', '5000000', 6),
  serviceFeeAmount: amount('AUD', '250000', 6),
  taxAmount: amount('AUD', '530000', 6),
  cancelReturnRef: 'https://app.example.test/fund/cancelled',
  checkoutExpiresAt: 1_700_003_600_000,
}

describe('Stripe money provider adapter', () => {
  beforeEach(() => { vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development') })
  afterEach(() => { vi.unstubAllEnvs() })
  it('creates one hosted Checkout handoff with the quoted credit, fee, and added GST', async () => {
    const create = vi.fn().mockResolvedValue({ data: hostedCheckoutSession() })
    const provider = createStripeMoneyProvider({
      config: hostedConfig,
      client: fakeClient({ create }),
    })

    const result = await provider.createOrRecoverCreditPayment(hostedRequest)

    expect(result).toMatchObject({
      kind: 'hosted_redirect',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_hosted',
      expiresAt: 1_700_003_600_000,
      evidence: {
        externalRef: 'cs_test_hosted',
        checkoutMode: 'hosted_page',
        amount: amount('AUD', '578', 2),
        status: 'pending',
      },
    })
    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      mode: 'payment',
      ui_mode: 'hosted_page',
      submit_type: 'pay',
      client_reference_id: hostedRequest.commandRef,
      success_url: hostedRequest.successReturnRef,
      cancel_url: hostedRequest.cancelReturnRef,
      expires_at: 1_700_003_600,
      automatic_tax: { enabled: false },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'aud',
            unit_amount: 500,
            product_data: { name: 'Agentic Economy Account credit' },
          },
        },
        {
          quantity: 1,
          price_data: {
            currency: 'aud',
            unit_amount: 25,
            product_data: { name: 'Account funding service fee' },
          },
        },
        {
          quantity: 1,
          price_data: {
            currency: 'aud',
            unit_amount: 53,
            product_data: { name: 'Australian GST' },
          },
        },
      ],
    })
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('customer')
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('payment_method_types')
    expect(create.mock.calls[0]?.[1]).toEqual({
      idempotencyKey: 'ae:money:credit:topup-idempotency-1',
    })
  })

  it('rejects hosted Checkout when the GST line is not the quoted GST', async () => {
    const session = hostedCheckoutSession()
    const gst = session.line_items?.data[2]
    if (gst === undefined) throw new Error('gst line missing')
    gst.amount_total = 3
    const provider = createStripeMoneyProvider({
      config: hostedConfig,
      client: fakeClient({ create: vi.fn().mockResolvedValue({ data: session }) }),
    })
    await expect(provider.createOrRecoverCreditPayment(hostedRequest)).resolves.toMatchObject({
      kind: 'refused',
      code: 'ledger_idempotency_conflict',
    })
  })

  it('keeps a completed unpaid hosted Session pending for delayed-payment confirmation', async () => {
    const provider = createStripeMoneyProvider({
      config: hostedConfig,
      client: fakeClient({
        retrieve: vi.fn().mockResolvedValue({
          data: hostedCheckoutSession({ status: 'complete', payment_status: 'unpaid', url: null }),
        }),
      }),
    })

    await expect(provider.readCreditPayment({
      ...hostedRequest,
      externalRef: 'cs_test_hosted',
    })).resolves.toMatchObject({
      kind: 'hosted_redirect',
      evidence: { status: 'pending', checkoutStatus: 'complete', paymentStatus: 'unpaid' },
    })
  })

  it('refuses legacy Elements Checkout evidence', async () => {
    const provider = createStripeMoneyProvider({
      config: hostedConfig,
      client: fakeClient({ retrieve: vi.fn().mockResolvedValue({ data: checkoutSession() }) }),
    })

    await expect(provider.readCreditPayment({
      ...hostedRequest,
      externalRef: 'cs_test_1',
    })).resolves.toMatchObject({
      kind: 'refused',
      code: 'stripe_setup_required',
      retryable: false,
    })
  })
  it('reuses the same Checkout idempotency key when recovery spans repeated calls', async () => {
    const session = hostedCheckoutSession()
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('first response lost after provider effect'))
      .mockResolvedValueOnce({ data: session })
    const provider = createStripeMoneyProvider({
      config: hostedConfig,
      client: fakeClient({ create }),
    })

    const first = await provider.createOrRecoverCreditPayment(hostedRequest)
    const recovered = await provider.createOrRecoverCreditPayment(hostedRequest)

    expect(first).toMatchObject({
      kind: 'refused',
      code: 'credit_topup_outcome_unknown',
      retryable: true,
    })
    expect(recovered).toMatchObject({
      kind: 'hosted_redirect',
      evidence: { externalRef: 'cs_test_hosted', amount: amount('AUD', '578', 2) },
    })
    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[0]?.[0]).toEqual(create.mock.calls[1]?.[0])
    expect(create.mock.calls[0]?.[1]).toEqual({
      idempotencyKey: 'ae:money:credit:topup-idempotency-1',
    })
    expect(create.mock.calls[0]?.[1]).toEqual(create.mock.calls[1]?.[1])
  })
  it('retrieves the bound Session and refuses material drift without creating another Session', async () => {
    const retrieve = vi.fn().mockResolvedValue({ data: hostedCheckoutSession({ amount_total: 1100 }) })
    const create = vi.fn()
    const provider = createStripeMoneyProvider({ config: hostedConfig, client: fakeClient({ create, retrieve }) })

    const result = await provider.createOrRecoverCreditPayment({ ...hostedRequest, boundExternalRef: 'cs_test_hosted' })

    expect(isMoneyRefusal(result) && result.code).toBe('ledger_idempotency_conflict')
    expect(retrieve).toHaveBeenCalledWith('cs_test_hosted', { expand: ['payment_intent', 'line_items.data.price'] })
    expect(create).not.toHaveBeenCalled()
  })
  it('reads the exact durable Checkout request material and binds without digest conflict', async () => {
    const retrieve = vi.fn().mockResolvedValue({ data: hostedCheckoutSession() })
    const provider = createStripeMoneyProvider({ config: hostedConfig, client: fakeClient({ retrieve }) })

    const result = await provider.readCreditPayment({ ...hostedRequest, externalRef: 'cs_test_hosted' })
    const requestDigest = stripeCreditRequestDigest(hostedRequest, hostedConfig)
    expect(requestDigest).toBeDefined()

    expect(result).toMatchObject({
      evidence: {
        externalRef: 'cs_test_hosted',
        requestDigest,
        observedAt: 1_700_000_000_000,
      },
    })
    expect(retrieve).toHaveBeenCalledWith('cs_test_hosted', { expand: ['payment_intent', 'line_items.data.price'] })
    expect(requestDigest).not.toBe(hostedRequest.inputDigest)
    expect(stripeCreditRequestDigest({ ...hostedRequest, successReturnRef: 'https://app.example.test/credit/other' }, hostedConfig)).not.toBe(requestDigest)
  })
  it('refuses unsupported, unrepresentable, and unsafe amounts before Stripe I/O', async () => {
    const create = vi.fn()
    const retrieve = vi.fn()
    const provider = createStripeMoneyProvider({ config: hostedConfig, client: fakeClient({ create, retrieve }) })

    await expect(provider.createOrRecoverCreditPayment({
      ...hostedRequest,
      amount: amount('ZZZ', '1', 2),
      boundExternalRef: 'cs_test_1',
    })).resolves.toMatchObject({ kind: 'refused', code: 'credit_topup_amount_invalid' })
    await expect(provider.createOrRecoverCreditPayment({
      ...hostedRequest,
      amount: amount('USD', '1', 19),
    })).resolves.toMatchObject({ kind: 'refused', code: 'credit_topup_amount_invalid' })
    await expect(provider.createOrRecoverCreditPayment({
      ...hostedRequest,
      amount: amount('USD', '9007199254740991', 1),
    })).resolves.toMatchObject({ kind: 'refused', code: 'credit_topup_amount_invalid' })

    expect(create).not.toHaveBeenCalled()
    expect(retrieve).not.toHaveBeenCalled()
  })

  it('does not create again after the bounded Checkout idempotency recovery deadline', async () => {
    const create = vi.fn().mockRejectedValue(new Error('response lost after provider effect'))
    const provider = createStripeMoneyProvider({ config: hostedConfig, client: fakeClient({ create }) })
    const clock = vi.spyOn(Date, 'now').mockReturnValueOnce(10).mockReturnValue(20)
    try {
      const result = await provider.createOrRecoverCreditPayment({ ...hostedRequest, providerRecoveryDeadlineAt: 15 })

      expect(result).toMatchObject({ kind: 'refused', code: 'credit_topup_outcome_unknown', retryable: true })
      expect(create).toHaveBeenCalledTimes(1)
      expect(create.mock.calls[0]?.[1]?.idempotencyKey).toBe('ae:money:credit:topup-idempotency-1')
    } finally {
      clock.mockRestore()
    }
  })
  it('refuses a Checkout recovery response without a provider identifier', async () => {
    const create = vi.fn().mockResolvedValue({ data: hostedCheckoutSession({ id: '' }) })
    const provider = createStripeMoneyProvider({ config: hostedConfig, client: fakeClient({ create }) })

    await expect(provider.createOrRecoverCreditPayment(hostedRequest)).resolves.toMatchObject({
      kind: 'refused',
      code: 'payment_binding_invalid',
    })
    expect(create).toHaveBeenCalledOnce()
  })
  it('fails configuration before provider I/O for missing, partial, or mode-mismatched keys', async () => {
    expect(readStripeMoneyProviderConfig({
      STRIPE_SECRET_KEY: 'not_a_stripe_secret',
      STRIPE_WEBHOOK_SECRET: 'whsec_secret',
    })).toMatchObject({ code: 'stripe_setup_required' })
    expect(readStripeMoneyProviderConfig({ STRIPE_SECRET_KEY: 'sk_test_only' })).toMatchObject({ code: 'stripe_setup_required' })
    expect(readStripeMoneyProviderConfig({
      AE_DEPLOYMENT_ENVIRONMENT: 'development',
      STRIPE_SECRET_KEY: 'rk_test_secret',
      STRIPE_WEBHOOK_SECRET: 'whsec_secret',
    }, 'live')).toMatchObject({ code: 'stripe_setup_required' })

    const create = vi.fn()
    const provider = createStripeMoneyProvider({
      env: {
        AE_DEPLOYMENT_ENVIRONMENT: 'development',
        STRIPE_SECRET_KEY: 'rk_test_secret',
        STRIPE_WEBHOOK_SECRET: 'whsec_secret',
      },
      mode: 'live',
      client: fakeClient({ create }),
    })
    const result = await provider.createOrRecoverCreditPayment(hostedRequest)
    expect(result).toMatchObject({ code: 'stripe_setup_required' })
    expect(create).not.toHaveBeenCalled()
  })

  it.each([
    [{}, undefined],
    [{ AE_DEPLOYMENT_ENVIRONMENT: 'preview' }, undefined],
    [{ AE_DEPLOYMENT_ENVIRONMENT: 'development' }, 'test'],
    [{ AE_DEPLOYMENT_ENVIRONMENT: 'production' }, 'live'],
  ] as const)('derives Stripe mode only from an exact declaration', (env, expected) => {
    expect(expectedStripeMoneyModeForDeployment(env)).toBe(expected)
    expect(expectedStripeMoneyModeForDeployment(env, expected === 'test' ? 'live' : 'test'))
      .toBeUndefined()
  })

  it('refuses missing, invalid, override, and unrestricted keys before provider I/O', async () => {
    const valid = { STRIPE_SECRET_KEY: 'rk_test_secret', STRIPE_WEBHOOK_SECRET: 'whsec_secret' }
    const refusal = { kind: 'refused', code: 'stripe_setup_required', retryable: false }
    expect(readStripeMoneyProviderConfig(valid, 'test')).toEqual(refusal)
    expect(readStripeMoneyProviderConfig({ ...valid, AE_DEPLOYMENT_ENVIRONMENT: 'preview' }, 'test')).toEqual(refusal)
    expect(readStripeMoneyProviderConfig({ ...valid, AE_DEPLOYMENT_ENVIRONMENT: 'development' }, 'live')).toEqual(refusal)
    expect(readStripeMoneyProviderConfig({ ...valid, AE_DEPLOYMENT_ENVIRONMENT: 'production' }, 'test')).toEqual(refusal)
    expect(readStripeMoneyProviderConfig({ ...valid, AE_DEPLOYMENT_ENVIRONMENT: 'development', STRIPE_SECRET_KEY: 'sk_test_secret' })).toEqual(refusal)
    expect(readStripeMoneyProviderConfig({ ...valid, AE_DEPLOYMENT_ENVIRONMENT: 'production', STRIPE_SECRET_KEY: 'sk_live_secret' })).toEqual(refusal)
    expect(readStripeMoneyReadbackProviderConfig({ STRIPE_READBACK_KEY: 'rk_test_secret' }, 'test')).toEqual(refusal)
    expect(readStripeMoneyReadbackProviderConfig({ AE_DEPLOYMENT_ENVIRONMENT: 'production', STRIPE_READBACK_KEY: 'rk_test_secret' })).toEqual(refusal)
    expect(validateStripeMoneyProviderConfig(config)).toEqual(refusal)
    expect(readStripeMoneyProviderConfig({ ...valid, AE_DEPLOYMENT_ENVIRONMENT: 'development' })).toMatchObject({ mode: 'test' })
    expect(readStripeMoneyProviderConfig({ ...valid, AE_DEPLOYMENT_ENVIRONMENT: 'production', STRIPE_SECRET_KEY: 'rk_live_secret' })).toMatchObject({ mode: 'live' })
    expect(readStripeMoneyReadbackProviderConfig({ AE_DEPLOYMENT_ENVIRONMENT: 'development', STRIPE_READBACK_KEY: 'rk_test_secret' })).toMatchObject({ mode: 'test' })
    expect(validateStripeMoneyProviderConfig(config, 'test')).toEqual(config)
    const create = vi.fn()
    const provider = createStripeMoneyProvider({ env: valid, mode: 'test', client: fakeClient({ create }) })
    await expect(provider.createOrRecoverCreditPayment(hostedRequest)).resolves.toEqual(refusal)
    const injectedMissing = createStripeMoneyProvider({ env: valid, mode: 'test', config, client: fakeClient({ create }) })
    await expect(injectedMissing.createOrRecoverCreditPayment(hostedRequest)).resolves.toEqual(refusal)
    const injectedOverride = createStripeMoneyProvider({
      env: { AE_DEPLOYMENT_ENVIRONMENT: 'production' }, mode: 'test', config,
      client: fakeClient({ create }),
    })
    await expect(injectedOverride.createOrRecoverCreditPayment(hostedRequest)).resolves.toEqual(refusal)
    expect(create).not.toHaveBeenCalled()
  })

  it('isolates snapshot and Accounts v2 signatures while mapping the exact allowlists', async () => {
    const signedEvent = (type: string, sessionOverrides: Record<string, unknown> = {}) => {
      const payload = JSON.stringify({
        id: `evt_${type.replaceAll('.', '_')}`,
        object: 'event',
        api_version: Stripe.API_VERSION,
        created: 1_700_000_000,
        livemode: false,
        pending_webhooks: 1,
        request: null,
        type,
        data: { object: hostedCheckoutSession(sessionOverrides) },
      })
      const signature = new Stripe(config.secretKey).webhooks.generateTestHeaderString({ payload, secret: config.webhookSecret!, timestamp: Math.floor(Date.now() / 1000) })
      return { rawBody: payload, signature }
    }

    const paid = signedEvent('checkout.session.completed', { payment_status: 'paid', status: 'complete' })
    const paidResult = await verifyStripeMoneyWebhook({ ...paid, config })
    expect(paidResult).toMatchObject({ kind: 'checkout', status: 'paid', eventType: 'checkout.session.completed', commandRef: request.commandRef })
    expect(JSON.stringify(paidResult)).not.toContain('cs_secret_transient')
    const processing = signedEvent('checkout.session.completed', { payment_status: 'unpaid', status: 'complete' })
    await expect(verifyStripeMoneyWebhook({ ...processing, config })).resolves.toMatchObject({
      kind: 'checkout',
      status: 'processing',
      eventType: 'checkout.session.completed',
    })
    const alteredPayload = JSON.stringify({ ...(JSON.parse(paid.rawBody) as Record<string, unknown>), pending_webhooks: 2 })
    const alteredSignature = new Stripe(config.secretKey).webhooks.generateTestHeaderString({ payload: alteredPayload, secret: config.webhookSecret!, timestamp: Math.floor(Date.now() / 1000) })
    const altered = await verifyStripeMoneyWebhook({ rawBody: alteredPayload, signature: alteredSignature, config })
    if (!('payloadDigest' in paidResult) || !('payloadDigest' in altered)) throw new Error('expected checkout payload digests')
    expect(altered.payloadDigest).not.toBe(paidResult.payloadDigest)
    const reformattedPayload = JSON.stringify(JSON.parse(paid.rawBody), null, 2)
    const reformattedSignature = new Stripe(config.secretKey).webhooks.generateTestHeaderString({
      payload: reformattedPayload,
      secret: config.webhookSecret!,
      timestamp: Math.floor(Date.now() / 1000),
    })
    const reformatted = await verifyStripeMoneyWebhook({
      rawBody: reformattedPayload,
      signature: reformattedSignature,
      config,
    })
    if (!('payloadDigest' in reformatted)) throw new Error('expected checkout payload digest')
    expect(reformatted.payloadDigest).toBe(paidResult.payloadDigest)

    const failed = signedEvent('checkout.session.async_payment_failed', { payment_status: 'unpaid' })
    expect(mapStripeMoneyWebhookEvent({ event: new Stripe(config.secretKey).webhooks.constructEvent(failed.rawBody, failed.signature, config.webhookSecret!), config, rawBody: failed.rawBody })).toMatchObject({ kind: 'checkout', status: 'failed', observedAt: 1_700_000_000_000 })

    const expired = signedEvent('checkout.session.expired', { status: 'expired', payment_status: 'unpaid' })
    expect(mapStripeMoneyWebhookEvent({ event: new Stripe(config.secretKey).webhooks.constructEvent(expired.rawBody, expired.signature, config.webhookSecret!), config, rawBody: expired.rawBody })).toMatchObject({ kind: 'checkout', status: 'failed', eventType: 'checkout.session.expired' })

    const v2AccountPayload = JSON.stringify({
      id: 'evt_v2_account_updated',
      object: 'v2.core.event',
      created: '2026-08-11T00:00:00.000Z',
      livemode: false,
      type: 'v2.core.account[configuration.recipient].capability_status_updated',
      related_object: { id: 'acct_test_1', type: 'v2.core.account', url: '/v2/core/accounts/acct_test_1' },
    })
    const v2AccountSignature = new Stripe(config.secretKey).webhooks.generateTestHeaderString({ payload: v2AccountPayload, secret: config.v2WebhookSecret!, timestamp: Math.floor(Date.now() / 1000) })
    await expect(verifyStripeMoneyWebhook({ rawBody: v2AccountPayload, signature: v2AccountSignature, destination: 'snapshot', config })).resolves.toMatchObject({
      kind: 'refused',
      code: 'payment_binding_invalid',
    })
    await expect(verifyStripeMoneyWebhook({ rawBody: v2AccountPayload, signature: v2AccountSignature, destination: 'accounts_v2', config })).resolves.toMatchObject({
      kind: 'account',
      stripeAccountId: 'acct_test_1',
      eventType: 'v2.core.account[configuration.recipient].capability_status_updated',
      observedAt: Date.parse('2026-08-11T00:00:00.000Z'),
    })
  })
})
type AdapterMock = Mock

function fakeClient(input: Readonly<{
  create?: AdapterMock
  retrieve?: AdapterMock
  transferCreate?: AdapterMock
  transferRetrieve?: AdapterMock
  transferList?: AdapterMock
  connectCreate?: AdapterMock
  accountLinkCreate?: AdapterMock
  connectRetrieve?: AdapterMock
}>): Stripe {
  return {
    checkout: { sessions: { create: input.create ?? vi.fn(), retrieve: input.retrieve ?? vi.fn() } },
    transfers: { create: input.transferCreate ?? vi.fn(), retrieve: input.transferRetrieve ?? vi.fn(), list: input.transferList ?? vi.fn() },
    v2: {
      core: {
        accounts: { create: input.connectCreate ?? vi.fn(), retrieve: input.connectRetrieve ?? vi.fn() },
        accountLinks: { create: input.accountLinkCreate ?? vi.fn() },
      },
    },
  } as unknown as Stripe
}

function checkoutSession(overrides: Readonly<Record<string, unknown>> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_test_1',
    object: 'checkout.session',
    amount_total: 1050,
    client_reference_id: request.commandRef,
    client_secret: 'cs_secret_transient',
    created: 1_700_000_000,
    currency: 'usd',
    livemode: false,
    metadata: { ae_command_ref: request.commandRef },
    mode: 'payment',
    payment_intent: 'pi_test_1',
    payment_status: 'unpaid',
    status: 'open',
    ui_mode: 'elements',
    return_url: request.successReturnRef,
    line_items: { object: 'list', data: [{ id: 'li_test_1', object: 'item', amount_subtotal: 1050, amount_total: 1050, currency: 'usd', description: 'AE credit', price: null, quantity: 1, discounts: [], taxes: [] }], has_more: false, url: '/v1/checkout/sessions/cs_test_1/line_items' },
    ...overrides,
  } as unknown as Stripe.Checkout.Session
}

function hostedCheckoutSession(
  overrides: Readonly<Record<string, unknown>> = {},
): Stripe.Checkout.Session {
  return {
    id: 'cs_test_hosted',
    object: 'checkout.session',
    amount_total: 578,
    automatic_tax: { enabled: false, status: null },
    client_reference_id: hostedRequest.commandRef,
    client_secret: null,
    created: 1_700_000_000,
    currency: 'aud',
    livemode: false,
    metadata: { ae_command_ref: hostedRequest.commandRef, ae_contract: 'account_funding_v2' },
    mode: 'payment',
    payment_intent: 'pi_test_hosted',
    payment_status: 'unpaid',
    status: 'open',
    ui_mode: 'hosted_page',
    success_url: hostedRequest.successReturnRef,
    cancel_url: hostedRequest.cancelReturnRef,
    expires_at: 1_700_003_600,
    url: 'https://checkout.stripe.com/c/pay/cs_test_hosted',
    total_details: {
      amount_discount: 0,
      amount_shipping: 0,
      amount_tax: 0,
    },
    line_items: {
      object: 'list',
      data: [
        {
          id: 'li_credit', object: 'item', amount_discount: 0, amount_subtotal: 500,
          amount_tax: 0, amount_total: 500, currency: 'aud', description: 'Agentic Economy Account credit',
          metadata: {}, price: null, quantity: 1, discounts: [], taxes: [],
        },
        {
          id: 'li_fee', object: 'item', amount_discount: 0, amount_subtotal: 25,
          amount_tax: 0, amount_total: 25, currency: 'aud', description: 'Account funding service fee',
          metadata: {}, price: null, quantity: 1, discounts: [], taxes: [],
        },
        {
          id: 'li_gst', object: 'item', amount_discount: 0, amount_subtotal: 53,
          amount_tax: 0, amount_total: 53, currency: 'aud', description: 'Australian GST',
          metadata: {}, price: null, quantity: 1, discounts: [], taxes: [],
        },
      ],
      has_more: false,
      url: '/v1/checkout/sessions/cs_test_hosted/line_items',
    },
    ...overrides,
  } as unknown as Stripe.Checkout.Session
}
function amount(currency: string, units: string, exponent: number): ExactAmount {
  return { currency, units, exponent }
}
