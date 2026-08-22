import { describe, expect, it, vi } from 'vitest'

import {
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
  encodePaymentSignatureHeader,
} from '@x402/core/http'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
import {
  createReceiptEIP712,
  type SignTypedDataFn,
} from '@x402/extensions/offer-receipt'
import { privateKeyToAccount } from 'viem/accounts'

import type { RouteTransportFetch } from '@/modules/capability-supply/route-transport-runtime'
import { x402PaymentCredentialRefFromEnvironment } from '@/modules/capability-supply/internal/server-credential'

import {
  X402_PAYMENT_CREDENTIAL_REF,
  authority,
  invocation,
  invokeRouteTransport,
  preparedX402Custody,
  providerAuthority,
  registeredBinding as registeredBindingFromHarness,
  resolveProviderCredential,
} from './route-transport-test-harness'

function registeredBinding(
  adapterId: string,
  endpointUrl: string,
  bindingAuthority: typeof providerAuthority,
  config: Readonly<Record<string, import('@/modules/common/stable-hash').StableHashValue>>,
) {
  if (adapterId !== 'x402-fetch:v2' || Object.hasOwn(config, 'paymentRequiredJson')) {
    return registeredBindingFromHarness(adapterId, endpointUrl, bindingAuthority, config)
  }
  return registeredBindingFromHarness(adapterId, endpointUrl, bindingAuthority, {
    ...config,
    paymentRequiredJson: stableStringify({
      x402Version: 2,
      resource: { url: endpointUrl },
      accepts: [{
        scheme: 'exact',
        network: config.network,
        amount: endpointUrl.includes('/signed-paid') || endpointUrl.includes('/cryptocurrency/quotes/latest')
          ? '10000'
          : '1250000',
        asset: config.asset,
        payTo: config.payTo,
        maxTimeoutSeconds: 60,
        extra: {},
      }],
    } as StableHashValue),
  })
}

describe('x402 server credential locator', () => {
  it('accepts only an opaque env locator and never resolves its value', () => {
    expect(
      x402PaymentCredentialRefFromEnvironment({
        AE_X402_PAYMENT_CREDENTIAL_REF: ' env:AE_X402_PAYMENT_PRIVATE_KEY ',
        AE_X402_PAYMENT_PRIVATE_KEY: '0xprivate-key',
      }),
    ).toBe('env:AE_X402_PAYMENT_PRIVATE_KEY')
    expect(
      x402PaymentCredentialRefFromEnvironment({
        AE_X402_PAYMENT_CREDENTIAL_REF: '0xprivate-key',
      }),
    ).toBeUndefined()
  })
})

describe('registered route transport runtime', () => {
  const signedProvider = privateKeyToAccount(`0x${'33'.repeat(32)}`)
  const signedPayer = privateKeyToAccount(`0x${'44'.repeat(32)}`)
  const signedTarget = 'https://provider.example/signed-paid'
  const signedRequirement = {
    scheme: 'exact' as const,
    network: 'eip155:8453' as const,
    amount: '10000',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    payTo: signedProvider.address,
    maxTimeoutSeconds: 60,
    extra: {},
  }
  const providerSigner: SignTypedDataFn = async (input) =>
    await signedProvider.signTypedData(input)
  function payerAuthorization(): string {
    return encodePaymentSignatureHeader({
      x402Version: 2,
      accepted: signedRequirement,
      payload: {
        signature: `0x${'55'.repeat(65)}`,
        authorization: {
          from: signedPayer.address,
          to: signedRequirement.payTo,
          value: signedRequirement.amount,
          validAfter: '0',
          validBefore: String(Math.floor(Date.now() / 1_000) + 60),
          nonce: `0x${'66'.repeat(32)}`,
        },
      },
    })
  }

  function signedInvocation() {
    return invocation({
      binding: registeredBinding(
        'x402-fetch:v2',
        signedTarget,
        providerAuthority,
        {
          method: 'POST',
          requestTimeoutMs: 5_000,
          scheme: 'exact',
          network: signedRequirement.network,
          currency: 'USD',
          routeAmountExponent: 2,
          assetAmountExponent: 6,
          asset: signedRequirement.asset,
          payTo: signedRequirement.payTo,
        },
      ),
      authority: {
        ...authority,
        maximumSpend: { currency: 'USD', units: '1', exponent: 2 },
        leaseRef: 'lease:x402:signed',
        invocationRef: 'invocation:x402:signed',
        operationRef: 'operation:x402:signed',
        grantedScopes: [],
        grantedResources: [],
        readinessValidUntil: Date.now() + 60_000,
      },
    })
  }

  it('sends the first and only origin request with Payment-Signature', async () => {
    const paymentSignature = payerAuthorization()
    const receipt = await createReceiptEIP712(
      {
        resourceUrl: signedTarget,
        payer: signedPayer.address,
        network: signedRequirement.network,
        transaction: '0xsigned-settlement',
      },
      providerSigner,
    )
    const paymentResponse = encodePaymentResponseHeader({
      success: true,
      transaction: '0xsigned-settlement',
      network: signedRequirement.network,
      amount: signedRequirement.amount,
      payer: signedPayer.address,
      extensions: { 'offer-receipt': { info: { receipt } } },
    })
    const fetch = vi.fn<RouteTransportFetch>().mockImplementationOnce(async (_url, init) => {
      expect(init?.headers).toMatchObject({ 'Payment-Signature': paymentSignature })
      return Response.json(
        { serviceReference: 'service:signed' },
        { headers: { 'Payment-Response': paymentResponse } },
      )
    })
    const createPayment = vi.fn(async () => paymentSignature)

    const observed = await invokeRouteTransport(signedInvocation(), {
      send: fetch,
      resolveCredential: resolveProviderCredential('unused'),
      ...preparedX402Custody(createPayment),
      verifyX402Settlement: async () => true,
      markX402PaymentPossiblySubmitted: () => undefined,
      observeX402PaymentAttempt: () => undefined,
    })

    expect(observed).toMatchObject({
      disposition: 'succeeded',
      settlementEvidence: { kind: 'settled' },
      outputJson: JSON.stringify({ serviceReference: 'service:signed' }),
    })
    expect(JSON.stringify(observed)).not.toContain(paymentSignature)
    expect(createPayment).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('reconciles a returned 402 after one signed submit without retrying', async () => {
    const requirement = {
      x402Version: 2 as const,
      resource: { url: 'https://provider.example/paid' },
      accepts: [{
        scheme: 'exact',
        network: 'eip155:84532' as const,
        amount: '1250000',
        asset: '0x0000000000000000000000000000000000000001',
        payTo: '0x0000000000000000000000000000000000000002',
        maxTimeoutSeconds: 60,
        extra: {},
      }],
    }
    const createPayment = vi.fn(async () => 'signed-payment')
    const custody = preparedX402Custody(createPayment)
    const readAuthorization = vi.fn(custody.readX402PaymentAuthorization)
    const markX402PaymentPossiblySubmitted = vi.fn()
    const observeX402PaymentAttempt = vi.fn()
    const fetch = vi.fn<RouteTransportFetch>().mockResolvedValueOnce(
      new Response(null, {
        status: 402,
        headers: { 'Payment-Required': encodePaymentRequiredHeader(requirement) },
      }),
    )
    const observed = await invokeRouteTransport(
      invocation({
        binding: registeredBinding(
          'x402-fetch:v2',
          requirement.resource.url,
          providerAuthority,
          {
            method: 'POST',
            requestTimeoutMs: 5_000,
            scheme: 'exact',
            network: 'eip155:84532',
            currency: 'USD',
            routeAmountExponent: 2,
            assetAmountExponent: 6,
            asset: requirement.accepts[0]!.asset,
            payTo: requirement.accepts[0]!.payTo,
            paymentRequiredJson: stableStringify(requirement as StableHashValue),
          },
        ),
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential('credential'),
        ...custody,
        readX402PaymentAuthorization: readAuthorization,
        markX402PaymentPossiblySubmitted,
        observeX402PaymentAttempt,
      },
    )
    expect(observed).toMatchObject({
      disposition: 'unknown',
      failureCode: 'payment_required_after_submission',
      paymentAuthorizationStatus: 'created',
      paymentSubmissionStatus: 'observed',
      settlementEvidence: {
        kind: 'unknown',
        reason: 'payment_required_after_submission',
      },
    })
    expect(createPayment).toHaveBeenCalledTimes(1)
    expect(readAuthorization).toHaveBeenCalledTimes(1)
    expect(markX402PaymentPossiblySubmitted).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(observeX402PaymentAttempt).toHaveBeenCalledTimes(1)
    expect(observeX402PaymentAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'reconciliation_required' }),
    )
  })

  it('refuses a paid x402 send when the submission marker is missing', async () => {
    const fetch = vi.fn<RouteTransportFetch>()
    const createPayment = vi.fn(async () => payerAuthorization())
    const observed = await invokeRouteTransport(signedInvocation(), {
      send: fetch,
      resolveCredential: resolveProviderCredential('unused'),
      ...preparedX402Custody(createPayment),
      verifyX402Settlement: async () => true,
    })

    expect(observed).toMatchObject({
      disposition: 'refused',
      failureCode: 'payment_submission_fence_unavailable',
      paymentAuthorizationStatus: 'created',
      paymentSubmissionStatus: 'not_submitted',
      settlementEvidence: { kind: 'not_submitted' },
    })
    expect(createPayment).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses a paid x402 send when the submission marker throws', async () => {
    const fetch = vi.fn<RouteTransportFetch>()
    const createPayment = vi.fn(async () => payerAuthorization())
    const markX402PaymentPossiblySubmitted = vi.fn(() => {
      throw new Error('marker unavailable')
    })
    const observed = await invokeRouteTransport(signedInvocation(), {
      send: fetch,
      resolveCredential: resolveProviderCredential('unused'),
      ...preparedX402Custody(createPayment),
      verifyX402Settlement: async () => true,
      markX402PaymentPossiblySubmitted,
    })

    expect(observed).toMatchObject({
      disposition: 'refused',
      failureCode: 'payment_submission_fence_failed',
      paymentAuthorizationStatus: 'created',
      paymentSubmissionStatus: 'not_submitted',
      settlementEvidence: { kind: 'not_submitted' },
    })
    expect(markX402PaymentPossiblySubmitted).toHaveBeenCalledTimes(1)
    expect(createPayment).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses a paid x402 send when the submission marker is unavailable', async () => {
    const fetch = vi.fn<RouteTransportFetch>()
    const createPayment = vi.fn(async () => payerAuthorization())
    const observed = await invokeRouteTransport(signedInvocation(), {
      send: fetch,
      resolveCredential: resolveProviderCredential('unused'),
      ...preparedX402Custody(createPayment),
      verifyX402Settlement: async () => true,
    })
    expect(observed).toMatchObject({
      disposition: 'refused',
      failureCode: 'payment_submission_fence_unavailable',
      paymentAuthorizationStatus: 'created',
      paymentSubmissionStatus: 'not_submitted',
      settlementEvidence: { kind: 'not_submitted' },
    })
    expect(createPayment).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('treats a paid response without an offer receipt as a settled response', async () => {
    const paymentSignature = payerAuthorization()
    const fetch = vi.fn<RouteTransportFetch>().mockResolvedValueOnce(Response.json(
        { serviceReference: 'service:unattested' },
        {
          headers: {
            'Payment-Response': encodePaymentResponseHeader({
              success: true,
              transaction: '0xunattested-settlement',
              network: signedRequirement.network,
              amount: signedRequirement.amount,
              payer: signedPayer.address,
            }),
          },
        },
      ))
    const observed = await invokeRouteTransport(signedInvocation(), {
      send: fetch,
      resolveCredential: resolveProviderCredential('unused'),
      ...preparedX402Custody(async () => paymentSignature),
      verifyX402Settlement: async () => true,
      markX402PaymentPossiblySubmitted: () => undefined,
      observeX402PaymentAttempt: () => undefined,
    })
    expect(observed).toMatchObject({
      disposition: 'succeeded',
      settlementEvidence: { kind: 'settled' },
      quoteDeliveryStatus: 'delivered',
      outputJson: JSON.stringify({ serviceReference: 'service:unattested' }),
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('holds an ambiguous paid GET x402 release as outcome unknown', async () => {
    const config = {
      method: 'GET' as const,
      query: [
        { inputPointer: '/symbol', parameter: 'symbol' },
        { inputPointer: '/convert', parameter: 'convert' },
      ],
      requestTimeoutMs: 5_000,
      scheme: 'exact',
      network: 'eip155:8453',
      currency: 'USD',
      routeAmountExponent: 2,
      assetAmountExponent: 6,
      asset: '0xasset',
      payTo: '0xrecipient',
    }
    const target =
      'https://provider.example/x402/v3/cryptocurrency/quotes/latest?symbol=BTC&convert=USD'
    const fetch = vi
      .fn<RouteTransportFetch>()
      .mockRejectedValueOnce(
        Object.assign(new Error('lost'), { name: 'MockLostAfterRelease' }),
      )
    const observed = await invokeRouteTransport(
      invocation({
        binding: registeredBinding(
          'x402-fetch:v2',
          'https://provider.example/x402/v3/cryptocurrency/quotes/latest',
          providerAuthority,
          config,
        ),
        authority: {
          ...authority,
          maximumSpend: { currency: 'USD', units: '1', exponent: 2 },
        },
        inputJson: JSON.stringify({ symbol: 'BTC', convert: 'USD' }),
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential('payment-credential'),
        ...preparedX402Custody(async () => 'mock-payment-signature'),
        markX402PaymentPossiblySubmitted: () => undefined,
      },
    )

    expect(observed).toMatchObject({
      transport: 'x402',
      disposition: 'unknown',
      releaseStarted: true,
      failureCode: 'network_mocklostafterrelease',
    })
    expect(fetch.mock.calls[0]?.[0].href).toBe(target)
    expect(fetch.mock.calls[0]?.[1]?.body).toBeUndefined()
  })

  it('pays an admitted x402 challenge only within the exact step ceiling', async () => {
    const requirement = {
      x402Version: 2 as const,
      resource: {
        url: 'https://provider.example/paid',
        description: 'Resolve service',
        mimeType: 'application/json',
      },
      accepts: [
        {
          scheme: 'exact',
          network: 'eip155:84532' as const,
          amount: '1250000',
          asset: '0x0000000000000000000000000000000000000001',
          payTo: '0x0000000000000000000000000000000000000002',
          maxTimeoutSeconds: 60,
          extra: {},
        },
      ],
    }
    const settlementProof = encodePaymentResponseHeader({
      success: true,
      transaction: '0xsettled',
      network: 'eip155:84532',
      amount: '1250000',
      payer: 'test:settled-payer',
    })
    const fetch = vi
      .fn<RouteTransportFetch>()
      .mockImplementationOnce(async (_url, init) => {
        lifecycle.push('paid-send')
        expect(init?.headers).toMatchObject({
          'Payment-Signature': 'signed-payment-payload',
        })
        return Response.json(
          { serviceReference: 'service:paid' },
          {
            headers: {
              'Payment-Response': settlementProof,
              'Provider-Receipt': 'receipt:x402:1',
            },
          },
        )
      })
    const createPayment = vi.fn(async () => 'signed-payment-payload')
    const resolveCredential = vi.fn(resolveProviderCredential('0xprivate-key'))
    const submissionEvents: unknown[] = []
    const observationEvents: unknown[] = []
    const lifecycle: string[] = []

    const observed = await invokeRouteTransport(
      invocation({
        binding: registeredBinding(
          'x402-fetch:v2',
          'https://provider.example/paid',
          providerAuthority,
          {
            method: 'POST',
            requestTimeoutMs: 5_000,
            scheme: 'exact',
            network: 'eip155:84532',
            currency: 'USD',
            routeAmountExponent: 2,
            assetAmountExponent: 6,
            asset: '0x0000000000000000000000000000000000000001',
            payTo: '0x0000000000000000000000000000000000000002',
          },
        ),
        authority: {
          ...authority,
          leaseRef: 'lease:x402:valid',
          invocationRef: 'invocation:x402:valid',
          operationRef: 'operation:x402:valid',
          grantedScopes: [],
          grantedResources: [],
          readinessValidUntil: Date.now() + 60_000,
        },
      }),
      {
        send: fetch,
        resolveCredential,
        ...preparedX402Custody(createPayment),
        verifyX402Settlement: async () => true,
        markX402PaymentPossiblySubmitted: (event) => {
          lifecycle.push('marked')
          submissionEvents.push(event)
        },
        observeX402PaymentAttempt: (event) => {
          observationEvents.push(event)
        },
      },
    )

    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        challenge: expect.objectContaining({
          x402Version: requirement.x402Version,
          resource: { url: requirement.resource.url },
          accepts: requirement.accepts,
        }),
        selectedRequirement: requirement.accepts[0],
        credential: X402_PAYMENT_CREDENTIAL_REF,
        paymentIdentifier: authority.operationKeyDigest,
        attemptRef: authority.attemptRef,
        effectGeneration: 0,
        paymentAmount: { currency: 'USD', units: '1250000', exponent: 6 },
      }),
    )
    expect(observed).toMatchObject({
      transport: 'x402',
      disposition: 'succeeded',
      releaseStarted: true,
      outputJson: JSON.stringify({ serviceReference: 'service:paid' }),
      paymentChallengeDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      paymentProof: settlementProof,
      providerReceipt: 'receipt:x402:1',
      queryReleaseStatus: 'released',
      paymentAuthorizationStatus: 'created',
      paymentSubmissionStatus: 'observed',
      settlementEvidence: {
        kind: 'settled',
        response: {
          success: true,
          transaction: '0xsettled',
          network: 'eip155:84532',
          amount: '1250000',
        },
        digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      },
      quoteDeliveryStatus: 'delivered',
    })
    expect(submissionEvents).toEqual([
      expect.objectContaining({
        amount: { currency: 'USD', units: '1250000', exponent: 6 },
      }),
    ])
    expect(lifecycle).toEqual(['marked', 'paid-send'])
    expect(observationEvents).toEqual([
      expect.objectContaining({
        state: 'settled',
        settlementEvidence: {
          kind: 'settled',
          response: {
            success: true,
            transaction: '0xsettled',
            network: 'eip155:84532',
            amount: '1250000',
            payer: 'test:settled-payer',
          },
          digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        },
        amount: { currency: 'USD', units: '1250000', exponent: 6 },
        custodyRef: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        authorizationDigest: expect.stringMatching(/^sha256:/),
      }),
    ])
    expect(resolveCredential).not.toHaveBeenCalled()
    expect(
      JSON.stringify([...submissionEvents, ...observationEvents]),
    ).not.toContain('signed-payment-payload')
    expect(fetch.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
      'Authorization',
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('holds a provider-asserted x402 settlement until a trusted verifier confirms it', async () => {
    const requirement = {
      x402Version: 2 as const,
      resource: { url: 'https://provider.example/paid' },
      accepts: [{
        scheme: 'exact',
        network: 'eip155:84532' as const,
        amount: '1250000',
        asset: '0x0000000000000000000000000000000000000001',
        payTo: '0x0000000000000000000000000000000000000002',
        maxTimeoutSeconds: 60,
        extra: {},
      }],
    }
    const fetch = vi
      .fn<RouteTransportFetch>()
      .mockResolvedValueOnce(Response.json(
        { serviceReference: 'service:unverified' },
        {
          headers: {
            'Payment-Response': encodePaymentResponseHeader({
              success: true,
              transaction: '0xprovider-asserted',
              network: 'eip155:84532',
              amount: '1250000',
              payer: 'test:unverified-payer',
            }),
          },
        },
      ))
    const observed = await invokeRouteTransport(
      invocation({
        binding: registeredBinding(
          'x402-fetch:v2',
          'https://provider.example/paid',
          providerAuthority,
          {
            method: 'POST',
            requestTimeoutMs: 5_000,
            scheme: 'exact',
            network: 'eip155:84532',
            currency: 'USD',
            routeAmountExponent: 2,
            assetAmountExponent: 6,
            asset: requirement.accepts[0]!.asset,
            payTo: requirement.accepts[0]!.payTo,
          },
        ),
        authority: {
          ...authority,
          leaseRef: 'lease:x402:unverified',
          invocationRef: 'invocation:x402:unverified',
          operationRef: 'operation:x402:unverified',
          grantedScopes: [],
          grantedResources: [],
          readinessValidUntil: Date.now() + 60_000,
        },
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential('0xprivate-key'),
        ...preparedX402Custody(async () => 'signed-payment-payload'),
        verifyX402Settlement: async () => false,
        markX402PaymentPossiblySubmitted: () => undefined,
        observeX402PaymentAttempt: () => undefined,
      },
    )

    expect(observed).toMatchObject({
      transport: 'x402',
      disposition: 'unknown',
      releaseStarted: true,
      failureCode: 'payment_settlement_unverified',
      paymentSubmissionStatus: 'observed',
      settlementEvidence: {
        kind: 'unknown',
        reason: 'payment_settlement_unverified',
      },
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('fails closed when a paid x402 response echoes its payment signature', async () => {
    const requirement = {
      x402Version: 2 as const,
      resource: {
        url: 'https://provider.example/paid',
        description: 'Resolve service',
        mimeType: 'application/json',
      },
      accepts: [
        {
          scheme: 'exact',
          network: 'eip155:84532' as const,
          amount: '1250000',
          asset: '0x0000000000000000000000000000000000000001',
          payTo: '0x0000000000000000000000000000000000000002',
          maxTimeoutSeconds: 60,
          extra: {},
        },
      ],
    }
    const challenge = encodePaymentRequiredHeader(requirement)
    const paymentSignature = 'signed-payment-secret'
    const fetch = vi
      .fn<RouteTransportFetch>()
      .mockImplementationOnce(async (_url, init) => {
        expect(init?.headers).toMatchObject({
          'Payment-Signature': paymentSignature,
        })
        return Response.json(
          { nested: { echo: `provider echoed ${paymentSignature}` } },
          {
            headers: {
              'Payment-Response': encodePaymentResponseHeader({
                success: true,
                transaction: '0xecho-settled',
                network: 'eip155:84532',
                amount: '1250000',
                payer: 'test:echo-payer',
              }),
            },
          },
        )
      })

    const observed = await invokeRouteTransport(
      invocation({
        binding: registeredBinding(
          'x402-fetch:v2',
          'https://provider.example/paid',
          providerAuthority,
          {
            method: 'POST',
            requestTimeoutMs: 5_000,
            scheme: 'exact',
            network: 'eip155:84532',
            currency: 'USD',
            routeAmountExponent: 2,
            assetAmountExponent: 6,
            asset: '0x0000000000000000000000000000000000000001',
            payTo: '0x0000000000000000000000000000000000000002',
          },
        ),
        authority: {
          ...authority,
          leaseRef: 'lease:x402:echo',
          invocationRef: 'invocation:x402:echo',
          operationRef: 'operation:x402:echo',
          grantedScopes: [],
          grantedResources: [],
          readinessValidUntil: Date.now() + 60_000,
        },
      }),
      {
        send: fetch,
        resolveCredential: vi.fn(() => 'must-not-be-used'),
        ...preparedX402Custody(async () => paymentSignature),
        markX402PaymentPossiblySubmitted: () => undefined,
      },
    )

    expect(observed).toMatchObject({
      transport: 'x402',
      disposition: 'unknown',
      releaseStarted: true,
      failureCode: 'response_output_invalid',
    })
    expect(JSON.stringify(observed)).not.toContain(paymentSignature)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('refuses missing x402 custody before any provider or paid request', async () => {
    const fetch = vi.fn<RouteTransportFetch>()
    const resolveCredential = vi.fn(() => 'must-not-be-used')
    const observed = await invokeRouteTransport(
      invocation({
        binding: registeredBinding(
          'x402-fetch:v2',
          'https://provider.example/paid',
          providerAuthority,
          {
            method: 'POST',
            requestTimeoutMs: 5_000,
            scheme: 'exact',
            network: 'eip155:84532',
            currency: 'USD',
            routeAmountExponent: 2,
            assetAmountExponent: 6,
            asset: '0x0000000000000000000000000000000000000001',
            payTo: '0x0000000000000000000000000000000000000002',
          },
        ),
      }),
      {
        send: fetch,
        resolveCredential,
        x402PaymentSigningAvailable: () => false,
        readX402PaymentCredentialRef: () => undefined,
      },
    )

    expect(observed).toMatchObject({
      transport: 'x402',
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'payment_signature_unavailable',
    })
    expect(resolveCredential).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([
    ['revoked', 'connection_inactive', 'connection_authority_inactive'],
    [
      'reauthorized',
      'lease_generation_stale',
      'connection_authority_stale_generation',
    ],
    ['expired', 'lease_expired', 'connection_lease_expired'],
    ['invalidated', 'lease_inactive', 'connection_lease_inactive'],
    ['readiness drift', 'readiness_mismatch', 'readiness_stale'],
    [
      'approval drift',
      'lease_digest_stale',
      'connection_authority_stale_digest',
    ],
  ] as const)(
    'refuses provider x402 before challenge when lease is %s',
    async (_label, reason, failureCode) => {
      const fetch = vi.fn<RouteTransportFetch>()
      const signer = vi.fn(async () => 'must-not-sign')
      const observed = await invokeRouteTransport(
        invocation({
          binding: registeredBinding(
            'x402-fetch:v2',
            'https://provider.example/paid',
            providerAuthority,
            {
              method: 'POST',
              requestTimeoutMs: 5_000,
              scheme: 'exact',
              network: 'eip155:84532',
              currency: 'USD',
              routeAmountExponent: 2,
              assetAmountExponent: 6,
              asset: '0x0000000000000000000000000000000000000001',
              payTo: '0x0000000000000000000000000000000000000002',
            },
          ),
          authority: {
            ...authority,
            leaseRef: 'lease:x402',
            invocationRef: 'invocation:x402',
            operationRef: 'operation:x402',
            grantedScopes: [],
            grantedResources: [],
            readinessValidUntil: Date.now() + 60_000,
          },
        }),
        {
          send: fetch,
          resolveCredential: vi.fn(),
          validateProviderConnectionAuthority: () => ({
            kind: 'unavailable' as const,
            reason,
          }),
          ...preparedX402Custody(signer),
        },
      )

      expect(observed).toMatchObject({
        transport: 'x402',
        disposition: 'refused',
        releaseStarted: false,
        failureCode,
      })
      expect(fetch).not.toHaveBeenCalled()
      expect(signer).not.toHaveBeenCalled()
    },
  )

  it('marks a paid request possibly submitted before a lost response and requires reconciliation', async () => {
    const requirement = {
      x402Version: 2 as const,
      resource: { url: 'https://provider.example/paid' },
      accepts: [
        {
          scheme: 'exact',
          network: 'eip155:84532' as const,
          amount: '10000',
          asset: '0x0000000000000000000000000000000000000001',
          payTo: '0x0000000000000000000000000000000000000002',
          maxTimeoutSeconds: 60,
          extra: {},
        },
      ],
    }
    const states: string[] = []
    const observed = await invokeRouteTransport(
      invocation({
        binding: registeredBinding(
          'x402-fetch:v2',
          requirement.resource.url,
          providerAuthority,
          {
            method: 'POST',
            requestTimeoutMs: 5_000,
            scheme: 'exact',
            network: 'eip155:84532',
            currency: 'USD',
            routeAmountExponent: 2,
            assetAmountExponent: 6,
            asset: requirement.accepts[0]!.asset,
            payTo: requirement.accepts[0]!.payTo,
            paymentRequiredJson: stableStringify(requirement as StableHashValue),
          },
        ),
        authority: {
          ...authority,
          maximumSpend: { currency: 'USD', units: '1', exponent: 2 },
        },
      }),
      {
        send: vi
          .fn<RouteTransportFetch>()
          .mockRejectedValueOnce(new Error('lost_after_send')),
        resolveCredential: resolveProviderCredential('private-material'),
        ...preparedX402Custody(async () => 'must-not-be-persisted'),
        markX402PaymentPossiblySubmitted: () => {
          states.push('possibly_submitted')
        },
        observeX402PaymentAttempt: (event) => {
          states.push(event.state)
        },
      },
    )
    expect(observed).toMatchObject({
      disposition: 'unknown',
      failureCode: 'network_error',
      paymentSubmissionStatus: 'possibly_submitted',
      settlementEvidence: {
        kind: 'unknown',
        reason: 'network_error',
      },
      quoteDeliveryStatus: 'unknown',
    })
    expect(states).toEqual(['possibly_submitted', 'reconciliation_required'])
  })

  it('does not sign or retry an x402 challenge above the admitted ceiling', async () => {
    const requirement = {
      x402Version: 2 as const,
      resource: {
        url: 'https://provider.example/paid',
        description: 'Resolve service',
        mimeType: 'application/json',
      },
      accepts: [
        {
          scheme: 'exact',
          network: 'eip155:84532' as const,
          amount: '1250001',
          asset: '0x0000000000000000000000000000000000000001',
          payTo: '0x0000000000000000000000000000000000000002',
          maxTimeoutSeconds: 60,
          extra: {},
        },
      ],
    }
    const fetch = vi.fn<RouteTransportFetch>().mockResolvedValue(
      new Response(null, {
        status: 402,
        headers: {
          'Payment-Required': encodePaymentRequiredHeader(requirement),
        },
      }),
    )
    const createPayment = vi.fn(async () => 'must-not-be-created')

    const observed = await invokeRouteTransport(
      invocation({
        binding: registeredBinding(
          'x402-fetch:v2',
          'https://provider.example/paid',
          providerAuthority,
          {
            method: 'POST',
            requestTimeoutMs: 5_000,
            scheme: 'exact',
            network: 'eip155:84532',
            currency: 'USD',
            routeAmountExponent: 2,
            assetAmountExponent: 6,
            asset: '0x0000000000000000000000000000000000000001',
            payTo: '0x0000000000000000000000000000000000000002',
            paymentRequiredJson: stableStringify(requirement as StableHashValue),
          },
        ),
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential('0xprivate-key'),
        ...preparedX402Custody(createPayment),
      },
    )

    expect(observed).toMatchObject({
      transport: 'x402',
      disposition: 'refused',
      releaseStarted: false,
      paymentChallengeDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      failureCode: 'payment_exceeds_step_ceiling',
    })
    expect(createPayment).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('accepts exactly USD 0.007 as 7000 asset units and refuses the first unit above it before signing', async () => {
    const paymentRequiredFor = (amount: string) => ({
        x402Version: 2,
        resource: { url: 'https://provider.example/paid' },
        accepts: [{
          scheme: 'exact',
          network: 'eip155:84532',
          amount,
          asset: '0x0000000000000000000000000000000000000001',
          payTo: '0x0000000000000000000000000000000000000002',
          maxTimeoutSeconds: 60,
          extra: {},
        }],
      })
    const bindingFor = (amount: string) => registeredBinding(
      'x402-fetch:v2',
      'https://provider.example/paid',
      providerAuthority,
      {
        method: 'POST',
        requestTimeoutMs: 5_000,
        scheme: 'exact',
        network: 'eip155:84532',
        currency: 'USD',
        routeAmountExponent: 3,
        assetAmountExponent: 6,
        asset: '0x0000000000000000000000000000000000000001',
        payTo: '0x0000000000000000000000000000000000000002',
        paymentRequiredJson: stableStringify(paymentRequiredFor(amount) as StableHashValue),
      },
    )
    const exactBinding = bindingFor('7000')
    const exactFetch = vi
      .fn<RouteTransportFetch>()
      .mockResolvedValueOnce(Response.json(
        { price: 100_000 },
        {
          headers: {
            'Payment-Response': encodePaymentResponseHeader({
              success: true,
              transaction: '0xsub-cent-settled',
              network: 'eip155:84532',
              amount: '7000',
              payer: 'test:sub-cent-payer',
            }),
          },
        },
      ))
    const exactSigner = vi.fn(async () => 'sub-cent-signature')
    const exact = await invokeRouteTransport(
      invocation({
        binding: exactBinding,
        authority: {
          ...authority,
          maximumSpend: { currency: 'USD', units: '7', exponent: 3 },
        },
      }),
      {
        send: exactFetch,
        resolveCredential: resolveProviderCredential('credential'),
        ...preparedX402Custody(exactSigner),
        markX402PaymentPossiblySubmitted: () => undefined,
      },
    )
    expect(exact).toMatchObject({ disposition: 'succeeded' })
    expect(exactSigner).toHaveBeenCalledTimes(1)
    expect(exactFetch).toHaveBeenCalledTimes(1)

    const belowBinding = bindingFor('6999')

    const belowFetch = vi.fn<RouteTransportFetch>().mockResolvedValueOnce(
      new Response(null, {
        status: 402,
        headers: {},
      }),
    )
    const belowSigner = vi.fn(async () => 'below-ceiling-signature')
    const below = await invokeRouteTransport(
      invocation({
        binding: belowBinding,
        authority: {
          ...authority,
          maximumSpend: { currency: 'USD', units: '70', exponent: 4 },
        },
      }),
      {
        send: belowFetch,
        resolveCredential: resolveProviderCredential('credential'),
        ...preparedX402Custody(belowSigner),
      },
    )
    expect(below).toMatchObject({
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'payment_amount_mismatch',
    })
    expect(belowSigner).not.toHaveBeenCalled()
    expect(belowFetch).not.toHaveBeenCalled()

    const aboveBinding = bindingFor('7001')

    const aboveFetch = vi.fn<RouteTransportFetch>().mockResolvedValueOnce(
      new Response(null, {
        status: 402,
        headers: {},
      }),
    )
    const aboveSigner = vi.fn(async () => 'must-not-sign')
    const above = await invokeRouteTransport(
      invocation({
        binding: aboveBinding,
        authority: {
          ...authority,
          maximumSpend: { currency: 'USD', units: '7', exponent: 3 },
        },
      }),
      {
        send: aboveFetch,
        resolveCredential: resolveProviderCredential('credential'),
        ...preparedX402Custody(aboveSigner),
      },
    )
    expect(above).toMatchObject({
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'payment_exceeds_step_ceiling',
    })
    expect(aboveSigner).not.toHaveBeenCalled()
    expect(aboveFetch).not.toHaveBeenCalled()
  })
  it.each([
    {
      label: 'explicit failure',
      responseHeader: encodePaymentResponseHeader({
        success: false,
        transaction: '0xfailed',
        network: 'eip155:84532',
        amount: '1250000',
        payer: 'test:failed-payer',
        errorReason: 'insufficient_funds',
      }),
      expected: {
        disposition: 'refused',
        failureCode: 'payment_not_settled',
        settlementEvidence: expect.objectContaining({
          kind: 'not_settled',
        }),
      },
    },
    {
      label: 'missing header',
      responseHeader: undefined,
      expected: {
        disposition: 'unknown',
        failureCode: 'payment_settlement_missing',
        settlementEvidence: {
          kind: 'unknown',
          reason: 'payment_settlement_missing',
        },
      },
    },
    {
      label: 'malformed header',
      responseHeader: 'not-base64',
      expected: {
        disposition: 'unknown',
        failureCode: 'payment_settlement_malformed',
        settlementEvidence: {
          kind: 'unknown',
          reason: 'payment_settlement_malformed',
        },
      },
    },
    {
      label: 'mismatched network',
      responseHeader: encodePaymentResponseHeader({
        success: true,
        transaction: '0xforged',
        network: 'eip155:1',
        amount: '1250000',
        payer: 'test:mismatched-payer',
      }),
      expected: {
        disposition: 'unknown',
        failureCode: 'payment_settlement_mismatch',
        settlementEvidence: expect.objectContaining({
          kind: 'unknown',
          reason: 'payment_settlement_mismatch',
        }),
      },
    },
  ] as const)(
    'keeps $label Payment-Response separate from transport success',
    async ({ responseHeader, expected }) => {
      const requirement = {
        x402Version: 2 as const,
        resource: { url: 'https://provider.example/paid' },
        accepts: [{
          scheme: 'exact',
          network: 'eip155:84532' as const,
          amount: '1250000',
          asset: '0x0000000000000000000000000000000000000001',
          payTo: '0x0000000000000000000000000000000000000002',
          maxTimeoutSeconds: 60,
          extra: {},
        }],
      }
      const fetch = vi
        .fn<RouteTransportFetch>()
        .mockResolvedValueOnce(
          Response.json(
            { serviceReference: 'service:settlement-check' },
            {
              headers:
                responseHeader === undefined
                  ? {}
                  : { 'Payment-Response': responseHeader },
            },
          ),
        )
      const observed = await invokeRouteTransport(
        invocation({
          binding: registeredBinding(
            'x402-fetch:v2',
            'https://provider.example/paid',
            providerAuthority,
            {
              method: 'POST',
              requestTimeoutMs: 5_000,
              scheme: 'exact',
              network: 'eip155:84532',
              currency: 'USD',
              routeAmountExponent: 2,
              assetAmountExponent: 6,
              asset: '0x0000000000000000000000000000000000000001',
              payTo: '0x0000000000000000000000000000000000000002',
            },
          ),
        }),
        {
          send: fetch,
          resolveCredential: resolveProviderCredential('credential'),
          ...preparedX402Custody(async () => 'signed-payment-payload'),
          markX402PaymentPossiblySubmitted: () => undefined,
        },
      )
      expect(observed).toMatchObject(expected)
      expect(fetch).toHaveBeenCalledTimes(1)
    },
  )
})
