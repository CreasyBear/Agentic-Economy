import { describe, expect, it, vi } from 'vitest'

import {
  invokeRegisteredRouteCancellation,
  invokeRegisteredRouteTransport,
  type RouteTransportCancellationInvocation,
  type RouteTransportFetch,
  type RouteTransportInvocation,
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
      createX402PaymentSignature: async () => undefined,
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
      createX402PaymentSignature: async () => undefined,
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
      createX402PaymentSignature: async () => undefined,
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
      createX402PaymentSignature: async () => undefined,
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
      createX402PaymentSignature: async () => undefined,
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

    const observed = await invokeRegisteredRouteTransport(invocation(), {
      send: fetch,
      resolveCredential: () => 'provider-secret',
      createX402PaymentSignature: async () => undefined,
    })

    expect(observed).toMatchObject({
      transport: 'http', disposition: 'succeeded', releaseStarted: true,
      outputJson: JSON.stringify({ serviceReference: 'service:123' }),
      providerReceipt: 'receipt:http:123',
    })
    expect(fetch).toHaveBeenCalledTimes(1)
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
    const observed = await invokeRegisteredRouteTransport(invocation({
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
      createX402PaymentSignature: async () => undefined,
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
    const observed = await invokeRegisteredRouteTransport(invocation({
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
      createX402PaymentSignature: async () => 'mock-payment-signature',
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

    const observed = await invokeRegisteredRouteTransport(invocation({
      binding: registeredBinding(
        'mcp-jsonrpc:v1', 'https://provider.example/mcp', 'env:MCP_KEY', {
          protocolVersion: '2025-11-25', toolName: 'resolve_service', requestTimeoutMs: 5_000,
        },
      ),
    }), {
      send: fetch,
      resolveCredential: () => 'mcp-secret',
      createX402PaymentSignature: async () => undefined,
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

    const observed = await invokeRegisteredRouteTransport(invocation({
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
      createX402PaymentSignature: createPayment,
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
    })
    expect(fetch).toHaveBeenCalledTimes(2)
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

    const observed = await invokeRegisteredRouteTransport(invocation({
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
      resolveCredential: () => '0xprivate-key', createX402PaymentSignature: createPayment,
    })

    expect(observed).toMatchObject({
      transport: 'x402', disposition: 'refused', releaseStarted: true,
      paymentChallengeDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      failureCode: 'payment_exceeds_step_ceiling',
    })
    expect(createPayment).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
