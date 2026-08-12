import Stripe from 'stripe'
import { describe, expect, it, vi, type Mock } from 'vitest'

import {
  createStripeMoneyProvider,
  mapStripeMoneyWebhookEvent,
  mapStripeTransferEvidence,
  readStripeMoneyProviderConfig,
  readStripeTransfersByIdentity,
  verifyStripeMoneyWebhook,
  stripeCreditRequestDigest,
} from '../../../src/lib/server/stripe-money-provider'
import { isMoneyRefusal, type ExactAmount } from '../../../src/modules/money/public'
import type { StripeMoneyProviderConfig } from '../../../src/lib/server/stripe-money-provider'

const config: StripeMoneyProviderConfig = {
  secretKey: 'sk_test_adapter',
  webhookSecret: 'whsec_adapter',
  publishableKey: 'pk_test_adapter',
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

describe('Stripe money provider adapter', () => {
  it('creates and recovers one Elements Checkout Session with the same scoped key and material', async () => {
    const session = checkoutSession()
    const create = vi.fn()
      .mockRejectedValueOnce(new Error('response lost after provider effect'))
      .mockResolvedValueOnce({ data: session })
    const client = fakeClient({ create })
    const provider = createStripeMoneyProvider({ config, client })

    const result = await provider.createOrRecoverCreditPayment(request)

    expect(result).toMatchObject({ clientSecret: 'cs_secret_transient', evidence: { externalRef: 'cs_test_1', amount: request.amount } })
    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[0]?.[0]).toEqual(create.mock.calls[1]?.[0])
    expect(create.mock.calls[0]?.[1]).toEqual({ idempotencyKey: 'ae:money:credit:topup-idempotency-1' })
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      mode: 'payment',
      ui_mode: 'elements',
      client_reference_id: request.commandRef,
      metadata: { ae_command_ref: request.commandRef },
      return_url: request.successReturnRef,
      line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: 1050 } }],
    })
  })
  it('reuses the same Checkout idempotency key when recovery spans repeated calls', async () => {
    const session = checkoutSession()
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('first response lost after provider effect'))
      .mockRejectedValueOnce(new Error('second response lost after provider effect'))
      .mockResolvedValueOnce({ data: session })
    const provider = createStripeMoneyProvider({
      config,
      client: fakeClient({ create }),
    })

    const first = await provider.createOrRecoverCreditPayment(request)
    const recovered = await provider.createOrRecoverCreditPayment(request)

    expect(first).toMatchObject({
      kind: 'refused',
      code: 'credit_topup_outcome_unknown',
      retryable: true,
    })
    expect(recovered).toMatchObject({
      clientSecret: 'cs_secret_transient',
      evidence: { externalRef: 'cs_test_1', amount: request.amount },
    })
    expect(create).toHaveBeenCalledTimes(3)
    expect(create.mock.calls[0]?.[0]).toEqual(create.mock.calls[1]?.[0])
    expect(create.mock.calls[1]?.[0]).toEqual(create.mock.calls[2]?.[0])
    expect(create.mock.calls[0]?.[1]).toEqual({
      idempotencyKey: 'ae:money:credit:topup-idempotency-1',
    })
    expect(create.mock.calls[1]?.[1]).toEqual(create.mock.calls[2]?.[1])
  })
  it('rescales USD exponent-one amounts before Checkout and matches the scaled readback', async () => {
    const exponentOneRequest = { ...request, amount: amount('USD', '10', 1) }
    const create = vi.fn().mockResolvedValue({
      data: checkoutSession({
        amount_total: 100,
        line_items: { data: [{ quantity: 1, amount_total: 100 }] },
      }),
    })
    const provider = createStripeMoneyProvider({ config, client: fakeClient({ create }) })

    const result = await provider.createOrRecoverCreditPayment(exponentOneRequest)

    expect(result).toMatchObject({ evidence: { amount: amount('USD', '100', 2) } })
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      line_items: [{ price_data: { currency: 'usd', unit_amount: 100 } }],
    })
    expect(exponentOneRequest.amount).toEqual(amount('USD', '10', 1))
  })

  it('retrieves the bound Session and refuses material drift without creating another Session', async () => {
    const retrieve = vi.fn().mockResolvedValue({ data: checkoutSession({ amount_total: 1100 }) })
    const create = vi.fn()
    const provider = createStripeMoneyProvider({ config, client: fakeClient({ create, retrieve }) })

    const result = await provider.createOrRecoverCreditPayment({ ...request, boundExternalRef: 'cs_test_1' })

    expect(isMoneyRefusal(result) && result.code).toBe('ledger_idempotency_conflict')
    expect(retrieve).toHaveBeenCalledWith('cs_test_1', { expand: ['payment_intent', 'line_items.data.price'] })
    expect(create).not.toHaveBeenCalled()
  })
  it('reads the exact durable Checkout request material and binds without digest conflict', async () => {
    const retrieve = vi.fn().mockResolvedValue({ data: checkoutSession() })
    const provider = createStripeMoneyProvider({ config, client: fakeClient({ retrieve }) })

    const result = await provider.readCreditPayment({ ...request, externalRef: 'cs_test_1' })
    const requestDigest = stripeCreditRequestDigest(request)
    expect(requestDigest).toBeDefined()

    expect(result).toMatchObject({
      evidence: {
        externalRef: 'cs_test_1',
        requestDigest,
        observedAt: 1_700_000_000_000,
      },
    })
    expect(retrieve).toHaveBeenCalledWith('cs_test_1', { expand: ['payment_intent', 'line_items.data.price'] })
    expect(requestDigest).not.toBe(request.inputDigest)
    expect(stripeCreditRequestDigest({ ...request, successReturnRef: 'https://app.example.test/credit/other' })).not.toBe(requestDigest)
  })
  it('refuses unsupported, unrepresentable, and unsafe amounts before Stripe I/O', async () => {
    const create = vi.fn()
    const retrieve = vi.fn()
    const provider = createStripeMoneyProvider({ config, client: fakeClient({ create, retrieve }) })

    await expect(provider.createOrRecoverCreditPayment({
      ...request,
      amount: amount('ZZZ', '1', 2),
      boundExternalRef: 'cs_test_1',
    })).resolves.toMatchObject({ kind: 'refused', code: 'credit_topup_amount_invalid' })
    await expect(provider.createOrRecoverCreditPayment({
      ...request,
      amount: amount('USD', '1', 19),
    })).resolves.toMatchObject({ kind: 'refused', code: 'credit_topup_amount_invalid' })
    await expect(provider.createOrRecoverCreditPayment({
      ...request,
      amount: amount('USD', '9007199254740991', 1),
    })).resolves.toMatchObject({ kind: 'refused', code: 'credit_topup_amount_invalid' })

    expect(create).not.toHaveBeenCalled()
    expect(retrieve).not.toHaveBeenCalled()
  })

  it('does not create again after the bounded Checkout idempotency recovery deadline', async () => {
    const create = vi.fn().mockRejectedValue(new Error('response lost after provider effect'))
    const provider = createStripeMoneyProvider({ config, client: fakeClient({ create }) })
    const clock = vi.spyOn(Date, 'now').mockReturnValueOnce(10).mockReturnValue(20)
    try {
      const result = await provider.createOrRecoverCreditPayment({ ...request, providerRecoveryDeadlineAt: 15 })

      expect(result).toMatchObject({ kind: 'refused', code: 'credit_topup_outcome_unknown', retryable: true })
      expect(create).toHaveBeenCalledTimes(1)
      expect(create.mock.calls[0]?.[1]?.idempotencyKey).toBe('ae:money:credit:topup-idempotency-1')
    } finally {
      clock.mockRestore()
    }
  })
  it('refuses a Checkout recovery response without a provider identifier', async () => {
    const create = vi.fn().mockResolvedValue({ data: checkoutSession({ id: '' }) })
    const provider = createStripeMoneyProvider({ config, client: fakeClient({ create }) })

    await expect(provider.createOrRecoverCreditPayment(request)).resolves.toMatchObject({
      kind: 'refused',
      code: 'payment_binding_invalid',
    })
    expect(create).toHaveBeenCalledOnce()
  })
  it('creates one Connect Transfer with a scoped key and recovers the same transfer after a lost response', async () => {
    const transfer = stripeTransfer()
    const transferCreate = vi.fn()
      .mockRejectedValueOnce(new Error('response lost after provider effect'))
      .mockResolvedValueOnce({ data: transfer })
    const transferRetrieve = vi.fn().mockResolvedValue({ data: transfer })
    const provider = createStripeMoneyProvider({ config, client: fakeClient({ transferCreate, transferRetrieve }) })

    const result = await provider.createOrRecoverTransfer(payoutRequest())

    expect(result).toMatchObject({
      provider: 'stripe',
      transferId: 'tr_test_1',
      destinationAccountId: 'acct_test_1',
      amount: amount('USD', '1050', 2),
      status: 'succeeded',
    })
    expect(transferCreate).toHaveBeenCalledTimes(2)
    expect(transferCreate.mock.calls[0]?.[0]).toEqual(transferCreate.mock.calls[1]?.[0])
    expect(transferCreate.mock.calls[0]?.[1]).toEqual({ idempotencyKey: 'ae:money:payout:payout-idempotency-1' })
    expect(transferRetrieve).toHaveBeenCalledWith('tr_test_1')
  })
  it('rescales a USD exponent-one payout before creating the transfer', async () => {
    const transfer = stripeTransfer({ amount: 100 })
    const transferCreate = vi.fn().mockResolvedValue({ data: transfer })
    const transferRetrieve = vi.fn().mockResolvedValue({ data: transfer })
    const provider = createStripeMoneyProvider({ config, client: fakeClient({ transferCreate, transferRetrieve }) })

    const result = await provider.createOrRecoverTransfer({
      ...payoutRequest(),
      amount: amount('USD', '10', 1),
    })

    expect(result).toMatchObject({ amount: amount('USD', '100', 2) })
    expect(transferCreate.mock.calls[0]?.[0]).toMatchObject({ amount: 100, currency: 'usd' })
  })
  it('maps Stripe reversed transfer evidence to the explicit reversed status', () => {
    const result = mapStripeTransferEvidence({ transfer: stripeTransfer({ reversed: true }), config, expected: payoutRequest() })

    expect(result).toMatchObject({
      provider: 'stripe',
      transferId: 'tr_test_1',
      status: 'reversed',
      requestDigest: 'sha256:payout-input-1',
    })
  })
  it('recovers Stripe reversed transfer evidence without downgrading it to failed', async () => {
    const transferRetrieve = vi.fn().mockResolvedValue({ data: stripeTransfer({ reversed: true }) })
    const provider = createStripeMoneyProvider({ config, client: fakeClient({ transferRetrieve }) })

    await expect(provider.createOrRecoverTransfer({ ...payoutRequest(), boundExternalRef: 'tr_test_1' })).resolves.toMatchObject({
      transferId: 'tr_test_1',
      status: 'reversed',
    })
  })

  it('refuses transfer material drift on exact recovery without creating another transfer', async () => {
    const transferRetrieve = vi.fn().mockResolvedValue({ data: stripeTransfer({ amount: 1100 }) })
    const transferCreate = vi.fn()
    const provider = createStripeMoneyProvider({ config, client: fakeClient({ transferCreate, transferRetrieve }) })

    const result = await provider.createOrRecoverTransfer({ ...payoutRequest(), boundExternalRef: 'tr_test_1' })

    expect(isMoneyRefusal(result) && result.code).toBe('ledger_idempotency_conflict')
    expect(transferRetrieve).toHaveBeenCalledWith('tr_test_1')
    expect(transferCreate).not.toHaveBeenCalled()
  })

  it('keeps a created transfer outcome unknown when exact retrieval is unavailable without issuing a new key', async () => {
    const transferCreate = vi.fn().mockResolvedValue({ data: stripeTransfer() })
    const transferRetrieve = vi.fn().mockRejectedValue(new Error('read unavailable'))
    const provider = createStripeMoneyProvider({ config, client: fakeClient({ transferCreate, transferRetrieve }) })

    const result = await provider.createOrRecoverTransfer(payoutRequest())

    expect(result).toMatchObject({ provider: 'stripe', transferId: 'tr_test_1', status: 'outcome_unknown' })
    expect(transferCreate).toHaveBeenCalledTimes(1)
    expect(transferCreate.mock.calls[0]?.[1]).toEqual({ idempotencyKey: 'ae:money:payout:payout-idempotency-1' })
    expect(transferRetrieve).toHaveBeenCalledTimes(1)
  })
  it('reads bounded transfer-group provider identity through the Stripe SDK', async () => {
    const transferList = vi.fn().mockResolvedValue({
      data: [stripeTransfer()],
      has_more: false,
    })
    const result = await readStripeTransfersByIdentity({
      config,
      client: fakeClient({ transferList }),
      request: payoutRequest(),
    })

    expect(result).toMatchObject([
      {
        provider: 'stripe',
        transferId: 'tr_test_1',
        destinationAccountId: 'acct_test_1',
        amount: amount('USD', '1050', 2),
        requestDigest: 'sha256:payout-input-1',
      },
    ])
    expect(transferList).toHaveBeenCalledWith({
      transfer_group: 'payout-1',
      limit: 100,
    })
  })


  it('creates, onboards, and reads the same Accounts v2 recipient through the SDK', async () => {
    const account = stripeV2Account()
    const connectCreate = vi.fn().mockResolvedValue({ data: account })
    const accountLinkCreate = vi.fn().mockResolvedValue({ data: {
      id: 'link_1',
      object: 'v2.core.account_link',
      account: 'acct_test_1',
      created: '2026-08-11T00:00:00.000Z',
      expires_at: '2026-08-11T01:00:00.000Z',
      livemode: false,
      url: 'https://connect.stripe.com/setup/test',
    } })
    const connectRetrieve = vi.fn().mockResolvedValue({ data: account })
    const provider = createStripeMoneyProvider({ config, client: fakeClient({ connectCreate, accountLinkCreate, connectRetrieve }) })

    await expect(provider.createOrRecoverConnectAccount({
      businessId: 'business-1',
      currency: 'USD',
      idempotencyKey: 'connect-idempotency-1',
      configuration: 'accounts_v2',
      providerRequestDigest: 'sha256:provider-request-1',
      providerRecoveryDeadlineAt: Number.MAX_SAFE_INTEGER,
      recoveryLeaseOwner: 'connect-lease-1',
      recoveryLeaseGeneration: 1,
    })).resolves.toMatchObject({ provider: 'stripe', stripeAccountId: 'acct_test_1' })
    expect(connectCreate).toHaveBeenCalledWith(expect.objectContaining({
      configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
      metadata: { ae_business_id: 'business-1', ae_currency: 'USD' },
    }), { idempotencyKey: expect.stringMatching(/^ae:money:connect:sha256:[0-9a-f]{64}$/u) })

    await expect(provider.createOnboardingLink({
      businessId: 'business-1',
      currency: 'USD',
      stripeAccountId: 'acct_test_1',
      refreshRef: 'https://app.example.test/owner/supply?connect=refresh',
      returnRef: 'https://app.example.test/owner/supply?connect=return',
      idempotencyKey: 'onboarding-idempotency-1',
    })).resolves.toMatchObject({ provider: 'stripe', url: 'https://connect.stripe.com/setup/test' })
    expect(accountLinkCreate).toHaveBeenCalledWith(expect.objectContaining({
      account: 'acct_test_1',
      use_case: { type: 'account_onboarding', account_onboarding: expect.objectContaining({ configurations: ['recipient'] }) },
    }), { idempotencyKey: expect.stringMatching(/^ae:money:connect:sha256:[0-9a-f]{64}$/u) })
    expect(accountLinkCreate.mock.calls[0]?.[1]?.idempotencyKey).not.toBe(connectCreate.mock.calls[0]?.[1]?.idempotencyKey)

    await expect(provider.readConnectAccount({ businessId: 'business-1', currency: 'USD', stripeAccountId: 'acct_test_1' })).resolves.toMatchObject({
      provider: 'stripe',
      businessId: 'business-1',
      currency: 'USD',
      stripeAccountId: 'acct_test_1',
      detailsSubmitted: true,
      recipientCapabilityActive: true,
      restricted: false,
    })
    expect(connectRetrieve).toHaveBeenCalledWith('acct_test_1', { include: ['configuration.recipient', 'requirements', 'future_requirements'] })
    await expect(provider.createOrRecoverConnectAccount({
      businessId: 'business-1',
      currency: 'USD',
      idempotencyKey: 'connect-idempotency-1',
      configuration: 'accounts_v2',
      providerRequestDigest: 'sha256:provider-request-1',
      providerRecoveryDeadlineAt: Number.MAX_SAFE_INTEGER,
      recoveryLeaseOwner: 'connect-lease-1',
      recoveryLeaseGeneration: 1,
      boundStripeAccountId: 'acct_test_1',
    })).resolves.toMatchObject({ provider: 'stripe', stripeAccountId: 'acct_test_1' })
    expect(connectCreate).toHaveBeenCalledOnce()
    expect(connectRetrieve).toHaveBeenCalledTimes(2)
  })
  it('binds Connect provider keys to operation request identity and refuses account or link drift', async () => {
    const account = stripeV2Account()
    const connectCreate = vi.fn().mockResolvedValue({ data: account })
    const accountLinkCreate = vi.fn().mockResolvedValue({ data: {
      id: 'link_other',
      object: 'v2.core.account_link',
      account: 'acct_other',
      created: '2026-08-11T00:00:00.000Z',
      expires_at: '2026-08-11T01:00:00.000Z',
      livemode: false,
      url: 'https://connect.stripe.com/setup/other',
    } })
    const provider = createStripeMoneyProvider({ config, client: fakeClient({ connectCreate, accountLinkCreate }) })
    const connectInput = {
      businessId: 'business-1',
      currency: 'USD',
      idempotencyKey: 'connect-idempotency-identity',
      configuration: 'accounts_v2' as const,
      providerRequestDigest: 'sha256:provider-request-identity',
      providerRecoveryDeadlineAt: Number.MAX_SAFE_INTEGER,
      recoveryLeaseOwner: 'connect-lease-identity',
      recoveryLeaseGeneration: 1,
    }
    await expect(provider.createOrRecoverConnectAccount(connectInput)).resolves.toMatchObject({ stripeAccountId: 'acct_test_1' })
    await expect(provider.createOrRecoverConnectAccount({ ...connectInput, providerRequestDigest: 'sha256:provider-request-other' })).resolves.toMatchObject({ stripeAccountId: 'acct_test_1' })
    expect(connectCreate.mock.calls[0]?.[1]?.idempotencyKey).not.toBe(connectCreate.mock.calls[1]?.[1]?.idempotencyKey)
    const wrongAccount = { ...account, metadata: { ae_business_id: 'business-other', ae_currency: 'USD' } } as Stripe.V2.Core.Account
    const wrongAccountProvider = createStripeMoneyProvider({ config, client: fakeClient({ connectCreate: vi.fn().mockResolvedValue({ data: wrongAccount }) }) })
    await expect(wrongAccountProvider.createOrRecoverConnectAccount(connectInput)).resolves.toMatchObject({ kind: 'refused', code: 'payment_binding_invalid' })
    const wrongCurrencyAccount = { ...account, defaults: { ...account.defaults, currency: 'eur' } } as Stripe.V2.Core.Account
    const wrongCurrencyProvider = createStripeMoneyProvider({ config, client: fakeClient({ connectCreate: vi.fn().mockResolvedValue({ data: wrongCurrencyAccount }) }) })
    await expect(wrongCurrencyProvider.createOrRecoverConnectAccount(connectInput)).resolves.toMatchObject({ kind: 'refused', code: 'payment_binding_invalid' })
    await expect(provider.createOnboardingLink({
      businessId: 'business-1',
      currency: 'USD',
      stripeAccountId: 'acct_test_1',
      refreshRef: 'https://app.example.test/owner/supply?connect=refresh',
      returnRef: 'https://app.example.test/owner/supply?connect=return',
      idempotencyKey: 'onboarding-idempotency-drift',
    })).resolves.toMatchObject({ kind: 'refused', code: 'payment_binding_invalid' })
    expect(accountLinkCreate).toHaveBeenCalledOnce()
  })

  it('fails configuration before provider I/O for missing, partial, or mode-mismatched keys', async () => {
    expect(readStripeMoneyProviderConfig({ STRIPE_SECRET_KEY: 'sk_test_only' })).toMatchObject({ code: 'stripe_setup_required' })
    expect(readStripeMoneyProviderConfig({
      STRIPE_SECRET_KEY: 'sk_live_secret',
      STRIPE_WEBHOOK_SECRET: 'whsec_secret',
      VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_public',
    })).toMatchObject({ code: 'stripe_setup_required' })

    const create = vi.fn()
    const provider = createStripeMoneyProvider({
      env: {
        STRIPE_SECRET_KEY: 'sk_live_secret',
        STRIPE_WEBHOOK_SECRET: 'whsec_secret',
        VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_public',
      },
      client: fakeClient({ create }),
    })
    const result = await provider.createOrRecoverCreditPayment(request)
    expect(result).toMatchObject({ code: 'stripe_setup_required' })
    expect(create).not.toHaveBeenCalled()
  })

  it('uses the Stripe SDK signature parser and maps paid, failed, expired, and account events without client secrets', async () => {
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
        data: { object: checkoutSession(sessionOverrides) },
      })
      const signature = new Stripe(config.secretKey).webhooks.generateTestHeaderString({ payload, secret: config.webhookSecret, timestamp: Math.floor(Date.now() / 1000) })
      return { rawBody: payload, signature }
    }

    const paid = signedEvent('checkout.session.completed', { payment_status: 'paid', status: 'complete' })
    const paidResult = await verifyStripeMoneyWebhook({ ...paid, config })
    expect(paidResult).toMatchObject({ kind: 'checkout', status: 'paid', eventType: 'checkout.session.completed', commandRef: request.commandRef })
    expect(JSON.stringify(paidResult)).not.toContain('cs_secret_transient')
    const alteredPayload = JSON.stringify({ ...(JSON.parse(paid.rawBody) as Record<string, unknown>), pending_webhooks: 2 })
    const alteredSignature = new Stripe(config.secretKey).webhooks.generateTestHeaderString({ payload: alteredPayload, secret: config.webhookSecret, timestamp: Math.floor(Date.now() / 1000) })
    const altered = await verifyStripeMoneyWebhook({ rawBody: alteredPayload, signature: alteredSignature, config })
    if (!('payloadDigest' in paidResult) || !('payloadDigest' in altered)) throw new Error('expected checkout payload digests')
    expect(altered.payloadDigest).not.toBe(paidResult.payloadDigest)
    const reformattedPayload = JSON.stringify(JSON.parse(paid.rawBody), null, 2)
    const reformattedSignature = new Stripe(config.secretKey).webhooks.generateTestHeaderString({
      payload: reformattedPayload,
      secret: config.webhookSecret,
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
    expect(mapStripeMoneyWebhookEvent({ event: new Stripe(config.secretKey).webhooks.constructEvent(failed.rawBody, failed.signature, config.webhookSecret), config, rawBody: failed.rawBody })).toMatchObject({ kind: 'checkout', status: 'failed', observedAt: 1_700_000_000_000 })

    const expired = signedEvent('checkout.session.expired', { status: 'expired', payment_status: 'unpaid' })
    expect(mapStripeMoneyWebhookEvent({ event: new Stripe(config.secretKey).webhooks.constructEvent(expired.rawBody, expired.signature, config.webhookSecret), config, rawBody: expired.rawBody })).toMatchObject({ kind: 'checkout', status: 'expired', observedAt: 1_700_000_000_000 })

    const accountPayload = JSON.stringify({
      id: 'evt_account_updated',
      object: 'event',
      api_version: Stripe.API_VERSION,
      created: 1_700_000_001,
      livemode: false,
      pending_webhooks: 1,
      request: null,
      type: 'account.updated',
      data: { object: { id: 'acct_test_1', object: 'account', livemode: false, charges_enabled: false, payouts_enabled: false, details_submitted: false, capabilities: {}, requirements: {} } },
    })
    const accountSignature = new Stripe(config.secretKey).webhooks.generateTestHeaderString({ payload: accountPayload, secret: config.webhookSecret, timestamp: Math.floor(Date.now() / 1000) })
    expect(await verifyStripeMoneyWebhook({ rawBody: accountPayload, signature: accountSignature, config })).toMatchObject({ kind: 'account', stripeAccountId: 'acct_test_1', eventType: 'account.updated' })

    const v2AccountPayload = JSON.stringify({
      id: 'evt_v2_account_updated',
      object: 'v2.core.event',
      created: '2026-08-11T00:00:00.000Z',
      livemode: false,
      type: 'v2.core.account[configuration.recipient].capability_status_updated',
      related_object: { id: 'acct_test_1', type: 'v2.core.account', url: '/v2/core/accounts/acct_test_1' },
    })
    const v2AccountSignature = new Stripe(config.secretKey).webhooks.generateTestHeaderString({ payload: v2AccountPayload, secret: config.webhookSecret, timestamp: Math.floor(Date.now() / 1000) })
    await expect(verifyStripeMoneyWebhook({ rawBody: v2AccountPayload, signature: v2AccountSignature, config })).resolves.toMatchObject({
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
function payoutRequest() {
  return {
    payoutRef: 'payout-1',
    commandId: 'payout-command-1',
    destinationAccountId: 'acct_test_1',
    amount: amount('USD', '1050', 2),
    inputDigest: 'sha256:payout-input-1',
    idempotencyKey: 'payout-idempotency-1',
  } as const
}

function stripeTransfer(overrides: Readonly<Record<string, unknown>> = {}): Stripe.Transfer {
  return {
    id: 'tr_test_1',
    object: 'transfer',
    amount: 1050,
    currency: 'usd',
    created: 1_700_000_010,
    destination: 'acct_test_1',
    livemode: false,
    metadata: {
      ae_payout_ref: 'payout-1',
      ae_command_id: 'payout-command-1',
      ae_input_digest: 'sha256:payout-input-1',
      ae_idempotency_key: 'payout-idempotency-1',
    },
    reversed: false,
    transfer_group: 'payout-1',
    ...overrides,
  } as unknown as Stripe.Transfer
}

function stripeV2Account(): Stripe.V2.Core.Account {
  return {
    id: 'acct_test_1',
    object: 'v2.core.account',
    applied_configurations: ['recipient'],
    configuration: {
      recipient: {
        applied: true,
        capabilities: {
          stripe_balance: {
            stripe_transfers: { requested: true, status: 'active' },
          },
        },
      },
    },
    created: '2026-08-11T00:00:00.000Z',
    defaults: { currency: 'usd' },
    future_requirements: { entries: [] },
    livemode: false,
    metadata: { ae_business_id: 'business-1', ae_currency: 'USD' },
    requirements: { entries: [] },
  } as unknown as Stripe.V2.Core.Account
}

function amount(currency: string, units: string, exponent: number): ExactAmount {
  return { currency, units, exponent }
}
