import { describe, expect, it, vi } from 'vitest'

import {
  invokePreparedRouteTransport,
  invokeRegisteredRouteCancellation,
  prepareRegisteredRouteTransportInvocation,
  type RouteTransportCancellationInvocation,
  type RouteTransportFetch,
  type RouteTransportInvocation,
  type RouteTransportRuntime,
  type X402PaymentSignatureRequest,
  type X402RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

const authority = {
  attemptRef: 'route-step-attempt:v1:attempt',
  operationKeyDigest: 'sha256:operation',
  mandateDigest: 'sha256:mandate',
  grantDigest: 'sha256:grant',
  capabilityContractDigest: 'sha256:contract',
  maximumSpend: { currency: 'USD', amountMinor: 125 },
  expiresAt: 2_000_000_000_000,
  callIdentity: {
    keyId: 'route-calls:2026-07',
    signature: 'hmac-sha256:signed-call',
  },
} as const

function invocation(overrides: Partial<RouteTransportInvocation> = {}): RouteTransportInvocation {
  const config = { method: 'POST' as const, requestTimeoutMs: 5_000 }
  return {
    binding: {
      adapterId: 'http-json:v1',
      endpointUrl: 'https://provider.example/run',
      credentialRef: 'env:PROVIDER_KEY',
      configJson: JSON.stringify(config),
      configDigest: canonicalDigest(config),
    },
    authority,
    inputJson: JSON.stringify({ destination: 'PER' }),
    ...overrides,
  }
}

async function invokeRouteTransport(
  routeInvocation: RouteTransportInvocation,
  runtime: RouteTransportRuntime,
) {
  const preparation = prepareRegisteredRouteTransportInvocation(
    routeInvocation,
    runtime.resolveCredential,
    runtime.x402PaymentSigningAvailable,
  )
  return preparation.kind === 'refused'
    ? preparation.observation
    : await invokePreparedRouteTransport(preparation.prepared, runtime)
}

function registeredBinding(
  adapterId: string,
  endpointUrl: string,
  credentialRef: string,
  config: Readonly<Record<string, unknown>>,
) {
  return {
    adapterId, endpointUrl, credentialRef,
    configJson: JSON.stringify(config), configDigest: canonicalDigest(config as StableHashValue),
  }
}
function preparedX402Custody(
  create: (request: X402PaymentSignatureRequest) => Promise<string | undefined>,
): Pick<
  X402RouteTransportRuntime,
  'prepareX402PaymentAuthorization'
  | 'readX402PaymentAuthorization'
  | 'readX402PaymentAuthorizationByDigest'
> {
  const custody = new Map<string, Readonly<{
    authorizationDigest: string
    paymentSignature: string
  }>>()
  return {
    prepareX402PaymentAuthorization: async (request) => {
      const paymentSignature = await create(request)
      if (paymentSignature === undefined || paymentSignature.length === 0) return undefined
      const custodyRef = canonicalDigest({
        kind: 'test-x402-custody:v1',
        paymentIdentifier: request.paymentIdentifier,
        challengeDigest: request.challengeDigest,
        attemptRef: request.attemptRef,
        effectGeneration: request.effectGeneration,
      })
      const authorizationDigest = canonicalDigest(paymentSignature)
      custody.set(custodyRef, { authorizationDigest, paymentSignature })
      return { custodyRef, authorizationDigest }
    },
    readX402PaymentAuthorization: async ({ custodyRef, authorizationDigest }) => {
      const prepared = custody.get(custodyRef)
      return prepared?.authorizationDigest === authorizationDigest
        ? prepared.paymentSignature
        : undefined
    },
    readX402PaymentAuthorizationByDigest: async ({ custodyRef, authorizationDigest }) => {
      const prepared = custody.get(custodyRef)
      return prepared?.authorizationDigest === authorizationDigest
        ? prepared.paymentSignature
        : undefined
    },
  }
}

describe('registered route transport runtime', () => {
  it('sends one generic idempotent cancellation request to the registered same-origin exchange', async () => {
    const fetch: RouteTransportFetch = vi.fn(async (url, init) => {
      expect(url.href).toBe('https://provider.example/ae/cancel')
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer provider-secret',
        'Idempotency-Key': 'route-cancellation:v1:attempt',
        'AE-Call-Key-Id': authority.callIdentity.keyId,
        'AE-Call-Signature': authority.callIdentity.signature,
      })
      expect(JSON.parse(String(init?.body))).toEqual({
        cancellationRequestRef: 'route-cancellation:v1:attempt',
        attemptRef: authority.attemptRef,
        operationKeyDigest: authority.operationKeyDigest,
      })
      return Response.json({
        kind: 'cancellation_accepted',
        providerReference: 'provider-cancel:123',
      })
    })
    const config = {
      method: 'POST' as const,
      requestTimeoutMs: 5_000,
      cancellation: { path: '/ae/cancel', requestTimeoutMs: 3_000 },
    }
    const cancellation: RouteTransportCancellationInvocation = {
      binding: registeredBinding(
        'http-json:v1', 'https://provider.example/run', 'env:PROVIDER_KEY', config,
      ),
      authority,
      cancellationRequestRef: 'route-cancellation:v1:attempt',
    }

    await expect(invokeRegisteredRouteCancellation(cancellation, {
      send: fetch,
      resolveCredential: () => 'provider-secret',
    })).resolves.toEqual({
      disposition: 'accepted',
      providerReference: 'provider-cancel:123',
      requestDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      responseDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps an ambiguous cancellation response unknown and never calls an unregistered exchange', async () => {
    const fetch = vi.fn<RouteTransportFetch>()
    const unsupported = invocation()
    await expect(invokeRegisteredRouteCancellation({
      binding: unsupported.binding,
      authority,
      cancellationRequestRef: 'route-cancellation:v1:attempt',
    }, {
      send: fetch,
      resolveCredential: () => 'provider-secret',
    })).resolves.toMatchObject({
      disposition: 'unsupported',
      failureCode: 'cancellation_not_registered',
    })
    expect(fetch).not.toHaveBeenCalled()

    const config = {
      method: 'POST' as const,
      requestTimeoutMs: 5_000,
      cancellation: { path: '/ae/cancel', requestTimeoutMs: 3_000 },
    }
    fetch.mockResolvedValueOnce(Response.json({ kind: 'maybe_cancelled' }))
    await expect(invokeRegisteredRouteCancellation({
      binding: registeredBinding(
        'http-json:v1', 'https://provider.example/run', 'env:PROVIDER_KEY', config,
      ),
      authority,
      cancellationRequestRef: 'route-cancellation:v1:attempt',
    }, {
      send: fetch,
      resolveCredential: () => 'provider-secret',
    })).resolves.toMatchObject({
      disposition: 'unknown',
      failureCode: 'cancellation_response_invalid',
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('preserves a provider cancellation rejection without claiming the step stopped', async () => {
    const config = {
      method: 'POST' as const,
      requestTimeoutMs: 5_000,
      cancellation: { path: '/ae/cancel', requestTimeoutMs: 3_000 },
    }
    const fetch = vi.fn<RouteTransportFetch>().mockResolvedValueOnce(Response.json({
      kind: 'cancellation_rejected',
      reason: 'work_already_completed',
      providerReference: 'provider-cancel:rejected',
    }))

    await expect(invokeRegisteredRouteCancellation({
      binding: registeredBinding(
        'http-json:v1', 'https://provider.example/run', 'env:PROVIDER_KEY', config,
      ),
      authority,
      cancellationRequestRef: 'route-cancellation:v1:attempt',
    }, {
      send: fetch,
      resolveCredential: () => 'provider-secret',
    })).resolves.toMatchObject({
      disposition: 'rejected',
      reason: 'work_already_completed',
      providerReference: 'provider-cancel:rejected',
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('treats an HTTP cancellation error as unknown because the provider may have received it', async () => {
    const config = {
      method: 'POST' as const,
      requestTimeoutMs: 5_000,
      cancellation: { path: '/ae/cancel', requestTimeoutMs: 3_000 },
    }
    const fetch = vi.fn<RouteTransportFetch>().mockResolvedValueOnce(new Response(null, { status: 503 }))
    await expect(invokeRegisteredRouteCancellation({
      binding: registeredBinding(
        'http-json:v1', 'https://provider.example/run', 'env:PROVIDER_KEY', config,
      ),
      authority,
      cancellationRequestRef: 'route-cancellation:v1:attempt',
    }, {
      send: fetch,
      resolveCredential: () => 'provider-secret',
    })).resolves.toMatchObject({
      disposition: 'unknown',
      failureCode: 'provider_http_503',
    })
  })

  it('carries one signed and idempotent call through a generic HTTP binding', async () => {
    const fetch: RouteTransportFetch = vi.fn(async (_url, init) => {
      expect(init?.redirect).toBe('manual')
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer provider-secret',
        'Idempotency-Key': authority.operationKeyDigest,
        'AE-Call-Key-Id': authority.callIdentity.keyId,
        'AE-Call-Signature': authority.callIdentity.signature,
        'AE-Mandate-Digest': authority.mandateDigest,
        'AE-Grant-Digest': authority.grantDigest,
        'AE-Capability-Digest': authority.capabilityContractDigest,
      })
      return Response.json({ serviceReference: 'service:123' }, {
        headers: { 'Provider-Receipt': 'receipt:http:123' },
      })
    })

    const observed = await invokeRouteTransport(invocation(), {
      send: fetch,
      resolveCredential: () => 'provider-secret',
    })

    expect(observed).toMatchObject({
      transport: 'http', disposition: 'succeeded', releaseStarted: true,
      outputJson: JSON.stringify({ serviceReference: 'service:123' }),
      providerReceipt: 'receipt:http:123',
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('routes a public HTTP binding without resolving or sending a credential', async () => {
    const resolveCredential = vi.fn(() => 'must-not-be-used')
    const fetch: RouteTransportFetch = vi.fn(async (_url, init) => {
      expect(init?.headers).not.toHaveProperty('Authorization')
      expect(init?.headers).toMatchObject({
        'Idempotency-Key': authority.operationKeyDigest,
        'AE-Call-Key-Id': authority.callIdentity.keyId,
      })
      return Response.json({ serviceReference: 'service:public-123' })
    })

    const observed = await invokeRouteTransport(invocation({
      binding: registeredBinding(
        'http-json:v1', 'https://provider.example/run', 'none',
        { method: 'POST', requestTimeoutMs: 5_000 },
      ),
    }), {
      send: fetch,
      resolveCredential,
    })

    expect(observed).toMatchObject({
      transport: 'http', disposition: 'succeeded', releaseStarted: true,
      outputJson: JSON.stringify({ serviceReference: 'service:public-123' }),
    })
    expect(resolveCredential).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('uses only the registered GET query mapping and never accepts caller transport fields', async () => {
    const config = {
      method: 'GET' as const,
      query: [
        { inputPointer: '/symbol', parameter: 'symbol' },
        { inputPointer: '/convert', parameter: 'convert' },
      ],
      requestTimeoutMs: 5_000,
    }
    const fetch: RouteTransportFetch = vi.fn(async (url, init) => {
      expect(url.href).toBe(
        'https://provider.example/x402/v3/cryptocurrency/quotes/latest?symbol=BTC&convert=AUD',
      )
      expect(init?.method).toBe('GET')
      expect(init?.body).toBeUndefined()
      return Response.json({ price: 100_000 })
    })
    const observed = await invokeRouteTransport(invocation({
      binding: registeredBinding(
        'http-json:v1',
        'https://provider.example/x402/v3/cryptocurrency/quotes/latest',
        'env:PROVIDER_KEY',
        config,
      ),
      inputJson: JSON.stringify({
        symbol: 'BTC',
        convert: 'AUD',
        method: 'POST',
        path: 'https://attacker.example',
      }),
    }), {
      send: fetch,
      resolveCredential: () => 'provider-secret',
    })

    expect(observed).toMatchObject({ transport: 'http', disposition: 'succeeded' })
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
    const target = 'https://provider.example/x402/v3/cryptocurrency/quotes/latest?symbol=BTC&convert=USD'
    const challenge = Buffer.from(JSON.stringify({
      x402Version: 2,
      resource: { url: target },
      accepts: [{
        scheme: 'exact', network: 'eip155:8453', amount: '10000',
        asset: '0xasset', payTo: '0xrecipient', maxTimeoutSeconds: 60, extra: {},
      }],
    })).toString('base64')
    const fetch = vi.fn<RouteTransportFetch>()
      .mockResolvedValueOnce(new Response(null, {
        status: 402,
        headers: { 'Payment-Required': challenge },
      }))
      .mockRejectedValueOnce(Object.assign(new Error('lost'), { name: 'MockLostAfterRelease' }))
    const observed = await invokeRouteTransport(invocation({
      binding: registeredBinding(
        'x402-fetch:v2',
        'https://provider.example/x402/v3/cryptocurrency/quotes/latest',
        'env:X402_KEY',
        config,
      ),
      authority: {
        ...authority,
        maximumSpend: { currency: 'USD', amountMinor: 1 },
        expiresAt: Date.now() + 120_000,
      },
      inputJson: JSON.stringify({ symbol: 'BTC', convert: 'USD' }),
    }), {
      send: fetch,
      resolveCredential: () => 'payment-credential',
      ...preparedX402Custody(async () => 'mock-payment-signature'),
    })

    expect(observed).toMatchObject({
      transport: 'x402',
      disposition: 'unknown',
      releaseStarted: true,
      failureCode: 'network_mocklostafterrelease',
    })
    expect(fetch.mock.calls[0]?.[0].href).toBe(target)
    expect(fetch.mock.calls[1]?.[0].href).toBe(target)
    expect(fetch.mock.calls[1]?.[1]?.body).toBeUndefined()
  })

  it('initializes a Streamable HTTP MCP session and normalizes a tool result', async () => {
    const fetch = vi.fn<RouteTransportFetch>()
      .mockResolvedValueOnce(new Response([
        'event: message',
        'data: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}',
        '',
        'event: message',
        'data: {"jsonrpc":"2.0","id":"initialize:sha256:operation","result":{"protocolVersion":"2025-11-25","capabilities":{},"serverInfo":{"name":"provider","version":"1"}}}',
        '',
      ].join('\n'), { headers: { 'Content-Type': 'text/event-stream', 'Mcp-Session-Id': 'session:123' } }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(Response.json({
        jsonrpc: '2.0', id: authority.operationKeyDigest,
        result: { structuredContent: { serviceReference: 'service:mcp' } },
      }))

    const observed = await invokeRouteTransport(invocation({
      binding: registeredBinding(
        'mcp-jsonrpc:v1', 'https://provider.example/mcp', 'env:MCP_KEY', {
          protocolVersion: '2025-11-25', toolName: 'resolve_service', requestTimeoutMs: 5_000,
        },
      ),
      authority: {
        ...authority,
        maximumSpend: { currency: 'USD', amountMinor: 1 },
        expiresAt: Date.now() + 120_000,
      },
    }), {
      send: fetch,
      resolveCredential: () => 'mcp-secret',
    })

    expect(observed).toMatchObject({
      transport: 'mcp', disposition: 'succeeded', releaseStarted: true,
      outputJson: JSON.stringify({ serviceReference: 'service:mcp' }),
    })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(fetch.mock.calls[2]?.[1]?.headers).toMatchObject({
      'Mcp-Session-Id': 'session:123',
      'MCP-Protocol-Version': '2025-11-25',
      'Idempotency-Key': authority.operationKeyDigest,
    })
  })

  it('pays an admitted x402 challenge only within the exact step ceiling', async () => {
    const requirement = {
      x402Version: 2,
      resource: { url: 'https://provider.example/paid', description: 'Resolve service', mimeType: 'application/json' },
      accepts: [{
        scheme: 'exact', network: 'eip155:84532', amount: '1250000',
        asset: '0x0000000000000000000000000000000000000001',
        payTo: '0x0000000000000000000000000000000000000002', maxTimeoutSeconds: 60,
        extra: {},
      }],
    }
    const challenge = Buffer.from(JSON.stringify(requirement)).toString('base64')
    const fetch = vi.fn<RouteTransportFetch>()
      .mockResolvedValueOnce(new Response(null, { status: 402, headers: { 'Payment-Required': challenge } }))
      .mockImplementationOnce(async (_url, init) => {
        expect(init?.headers).toMatchObject({ 'Payment-Signature': 'signed-payment-payload' })
        return Response.json({ serviceReference: 'service:paid' }, {
          headers: { 'Payment-Response': 'settlement-proof', 'Provider-Receipt': 'receipt:x402:1' },
        })
      })
    const createPayment = vi.fn(async () => 'signed-payment-payload')
    const submissionEvents: unknown[] = []
    const observationEvents: unknown[] = []

    const observed = await invokeRouteTransport(invocation({
      binding: registeredBinding(
        'x402-fetch:v2', 'https://provider.example/paid', 'env:EVM_PRIVATE_KEY', {
          method: 'POST', requestTimeoutMs: 5_000, scheme: 'exact', network: 'eip155:84532',
          currency: 'USD', routeAmountExponent: 2, assetAmountExponent: 6,
          asset: '0x0000000000000000000000000000000000000001',
          payTo: '0x0000000000000000000000000000000000000002',
        },
      ),
    }), {
      send: fetch,
      resolveCredential: () => '0xprivate-key',
      ...preparedX402Custody(createPayment),
      markX402PaymentPossiblySubmitted: (event) => { submissionEvents.push(event) },
      observeX402PaymentAttempt: (event) => { observationEvents.push(event) },
    })

    expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({
      challenge: requirement,
      credential: '0xprivate-key',
      paymentIdentifier: authority.operationKeyDigest,
    }))
    expect(observed).toMatchObject({
      transport: 'x402', disposition: 'succeeded', releaseStarted: true,
      outputJson: JSON.stringify({ serviceReference: 'service:paid' }),
      paymentChallengeDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      paymentProof: 'settlement-proof', providerReceipt: 'receipt:x402:1',
      queryReleaseStatus: 'released',
      paymentAuthorizationStatus: 'created',
      paymentSubmissionStatus: 'observed',
      settlementStatus: 'provider_asserted',
      quoteDeliveryStatus: 'delivered',
    })
    expect(submissionEvents).toHaveLength(1)
    expect(observationEvents).toEqual([
      expect.objectContaining({
        state: 'observed',
        custodyRef: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        authorizationDigest: expect.stringMatching(/^sha256:/),
      }),
    ])
    expect(JSON.stringify([...submissionEvents, ...observationEvents])).not.toContain('signed-payment-payload')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('marks a paid request possibly submitted before a lost response and requires reconciliation', async () => {
    const requirement = {
      x402Version: 2 as const,
      resource: { url: 'https://provider.example/paid' },
      accepts: [{
        scheme: 'exact', network: 'eip155:84532' as const, amount: '10000',
        asset: '0x0000000000000000000000000000000000000001',
        payTo: '0x0000000000000000000000000000000000000002',
        maxTimeoutSeconds: 60, extra: {},
      }],
    }
    const challenge = Buffer.from(JSON.stringify(requirement)).toString('base64')
    const states: string[] = []
    const observed = await invokeRouteTransport(invocation({
      binding: registeredBinding(
        'x402-fetch:v2', requirement.resource.url, 'env:EVM_PRIVATE_KEY', {
          method: 'POST', requestTimeoutMs: 5_000, scheme: 'exact', network: 'eip155:84532',
          currency: 'USD', routeAmountExponent: 2, assetAmountExponent: 6,
          asset: requirement.accepts[0]!.asset, payTo: requirement.accepts[0]!.payTo,
        },
      ),
      authority: {
        ...authority,
        maximumSpend: { currency: 'USD', amountMinor: 1 },
        expiresAt: Date.now() + 120_000,
      },
    }), {
      send: vi.fn<RouteTransportFetch>()
        .mockResolvedValueOnce(new Response(null, {
          status: 402, headers: { 'Payment-Required': challenge },
        }))
        .mockRejectedValueOnce(new Error('lost_after_send')),
      resolveCredential: () => 'private-material',
      ...preparedX402Custody(async () => 'must-not-be-persisted'),
      markX402PaymentPossiblySubmitted: () => { states.push('possibly_submitted') },
      observeX402PaymentAttempt: (event) => { states.push(event.state) },
    })
    expect(observed).toMatchObject({
      disposition: 'unknown',
      failureCode: 'network_error',
      paymentSubmissionStatus: 'possibly_submitted',
      settlementStatus: 'unknown',
      quoteDeliveryStatus: 'unknown',
    })
    expect(states).toEqual(['possibly_submitted', 'reconciliation_required'])
  })

  it('does not sign or retry an x402 challenge above the admitted ceiling', async () => {
    const requirement = {
      x402Version: 2,
      resource: { url: 'https://provider.example/paid', description: 'Resolve service', mimeType: 'application/json' },
      accepts: [{
        scheme: 'exact', network: 'eip155:84532', amount: '1250001',
        asset: '0x0000000000000000000000000000000000000001',
        payTo: '0x0000000000000000000000000000000000000002', maxTimeoutSeconds: 60,
        extra: {},
      }],
    }
    const fetch = vi.fn<RouteTransportFetch>().mockResolvedValue(new Response(null, {
      status: 402,
      headers: { 'Payment-Required': Buffer.from(JSON.stringify(requirement)).toString('base64') },
    }))
    const createPayment = vi.fn(async () => 'must-not-be-created')

    const observed = await invokeRouteTransport(invocation({
      binding: registeredBinding(
        'x402-fetch:v2', 'https://provider.example/paid', 'env:EVM_PRIVATE_KEY', {
          method: 'POST', requestTimeoutMs: 5_000, scheme: 'exact', network: 'eip155:84532',
          currency: 'USD', routeAmountExponent: 2, assetAmountExponent: 6,
          asset: '0x0000000000000000000000000000000000000001',
          payTo: '0x0000000000000000000000000000000000000002',
        },
      ),
    }), {
      send: fetch,
      resolveCredential: () => '0xprivate-key',
      ...preparedX402Custody(createPayment),
    })

    expect(observed).toMatchObject({
      transport: 'x402', disposition: 'refused', releaseStarted: true,
      paymentChallengeDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      failureCode: 'payment_exceeds_step_ceiling',
    })
    expect(createPayment).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('accepts exactly one cent and refuses the first representable unit above it before signing', async () => {
    const challengeFor = (amount: string) => Buffer.from(JSON.stringify({
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
    })).toString('base64')
    const binding = registeredBinding(
      'x402-fetch:v2', 'https://provider.example/paid', 'env:EVM_PRIVATE_KEY', {
        method: 'POST', requestTimeoutMs: 5_000, scheme: 'exact', network: 'eip155:84532',
        currency: 'USD', routeAmountExponent: 2, assetAmountExponent: 6,
        asset: '0x0000000000000000000000000000000000000001',
        payTo: '0x0000000000000000000000000000000000000002',
      },
    )
    const exactFetch = vi.fn<RouteTransportFetch>()
      .mockResolvedValueOnce(new Response(null, {
        status: 402, headers: { 'Payment-Required': challengeFor('10000') },
      }))
      .mockResolvedValueOnce(Response.json({ price: 100_000 }))
    const exactSigner = vi.fn(async () => 'one-cent-signature')
    const exact = await invokeRouteTransport(invocation({
      binding,
      authority: {
        ...authority,
        maximumSpend: { currency: 'USD', amountMinor: 1 },
        expiresAt: Date.now() + 120_000,
      },
    }), {
      send: exactFetch,
      resolveCredential: () => 'credential',
      ...preparedX402Custody(exactSigner),
    })
    expect(exact).toMatchObject({ disposition: 'succeeded' })
    expect(exactSigner).toHaveBeenCalledTimes(1)
    expect(exactFetch).toHaveBeenCalledTimes(2)

    const aboveFetch = vi.fn<RouteTransportFetch>().mockResolvedValueOnce(new Response(null, {
      status: 402, headers: { 'Payment-Required': challengeFor('10001') },
    }))
    const aboveSigner = vi.fn(async () => 'must-not-sign')
    const above = await invokeRouteTransport(invocation({
      binding,
      authority: {
        ...authority,
        maximumSpend: { currency: 'USD', amountMinor: 1 },
        expiresAt: Date.now() + 120_000,
      },
    }), {
      send: aboveFetch,
      resolveCredential: () => 'credential',
      ...preparedX402Custody(aboveSigner),
    })
    expect(above).toMatchObject({
      disposition: 'refused',
      failureCode: 'payment_exceeds_step_ceiling',
    })
    expect(aboveSigner).not.toHaveBeenCalled()
    expect(aboveFetch).toHaveBeenCalledTimes(1)
  })
})
