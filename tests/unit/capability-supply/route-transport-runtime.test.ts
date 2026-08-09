import { describe, expect, it, vi } from 'vitest'

import {
  invokePreparedRouteTransport,
  invokeRegisteredRouteCancellation,
  prepareRegisteredRouteTransportInvocation,
  type ProviderConnectionAuthorityLookup,
  type RouteTransportCancellationInvocation,
  type RouteTransportFetch,
  type RouteTransportInvocation,
  type RouteTransportRuntime,
  type X402PaymentSignatureRequest,
  type X402RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

const authorityCommon = {
  attemptRef: 'route-step-attempt:v1:attempt',
  operationKeyDigest: 'sha256:operation',
  mandateDigest: 'sha256:mandate',
  grantDigest: 'sha256:grant',
  capabilityContractDigest: 'sha256:contract',
  maximumSpend: { currency: 'USD', units: '125', exponent: 2 },
  expiresAt: Date.now() + 60 * 60 * 1_000,
  callIdentity: {
    keyId: 'route-calls:2026-07',
    signature: 'hmac-sha256:signed-call',
  },
} as const
const providerAuthority = {
  kind: 'provider_connection',
  connectionRef: 'connection:test-provider',
  providerRef: 'provider:test',
} as const
const authority = {
  ...authorityCommon,
  authorityGeneration: 1,
  authorityDigest: canonicalDigest({
    connectionRef: providerAuthority.connectionRef,
    providerRef: providerAuthority.providerRef,
    authorityGeneration: 1,
  }),
} as const
const keylessAuthority = { kind: 'keyless' } as const

type ProviderInvocation = Extract<
  RouteTransportInvocation,
  { readonly binding: { readonly authority: { readonly kind: 'provider_connection' } } }
>
type KeylessInvocation = Extract<
  RouteTransportInvocation,
  { readonly binding: { readonly authority: { readonly kind: 'keyless' } } }
>
type ProviderInvocationOverrides = Readonly<{
  binding?: ProviderInvocation['binding']
  authority?: ProviderInvocation['authority']
  inputJson?: string
}>
type KeylessInvocationOverrides = Readonly<{
  binding?: KeylessInvocation['binding']
  authority?: KeylessInvocation['authority']
  inputJson?: string
}>

function invocation(overrides: ProviderInvocationOverrides = {}): ProviderInvocation {
  const config = {
    method: 'POST' as const,
    requestTimeoutMs: 5_000,
    credential: { kind: 'bearer' as const },
  }
  return {
    binding: overrides.binding ?? {
      adapterId: 'http-json:v1',
      endpointUrl: 'https://provider.example/run',
      authority: providerAuthority,
      configJson: JSON.stringify(config),
      configDigest: canonicalDigest(config),
    },
    authority: overrides.authority ?? authority,
    inputJson: overrides.inputJson ?? JSON.stringify({ destination: 'PER' }),
  }
}

function keylessInvocation(overrides: KeylessInvocationOverrides = {}): KeylessInvocation {
  const config = { method: 'POST' as const, requestTimeoutMs: 5_000 }
  return {
    binding: overrides.binding ?? {
      adapterId: 'http-json:v1',
      endpointUrl: 'https://provider.example/run',
      authority: keylessAuthority,
      configJson: JSON.stringify(config),
      configDigest: canonicalDigest(config),
    },
    authority: overrides.authority ?? authorityCommon,
    inputJson: overrides.inputJson ?? JSON.stringify({ destination: 'PER' }),
  }
}

const PROVIDER_CREDENTIAL_REF = 'env:PROVIDER_SECRET'

function providerCredentialReader(
  input: ProviderConnectionAuthorityLookup,
  expectedAdapterId = 'http-json:v1',
) {
  return input.connectionRef === providerAuthority.connectionRef
    && input.providerRef === providerAuthority.providerRef
    && input.adapterId === expectedAdapterId
    && input.authorityGeneration === authority.authorityGeneration
    && input.authorityDigest === authority.authorityDigest
    ? { kind: 'resolved' as const, credentialRef: PROVIDER_CREDENTIAL_REF }
    : { kind: 'unavailable' as const, reason: 'stale_generation' as const }
}

async function invokeRouteTransport(
  routeInvocation: RouteTransportInvocation,
  runtime: RouteTransportRuntime,
) {
  const preparation = prepareRegisteredRouteTransportInvocation(
    routeInvocation,
    runtime.x402PaymentSigningAvailable,
  )
  if (preparation.kind === 'refused') return preparation.observation
  if (routeInvocation.binding.authority.kind === 'keyless') {
    return invokePreparedRouteTransport(preparation.prepared, runtime)
  }
  return invokePreparedRouteTransport(preparation.prepared, {
    ...runtime,
    readProviderConnectionCredentialRef: (input) =>
      providerCredentialReader(input, routeInvocation.binding.adapterId),
  })
}

type RegisteredBinding = ProviderInvocation['binding'] | KeylessInvocation['binding']

function registeredBinding(
  adapterId: string,
  endpointUrl: string,
  bindingAuthority: typeof providerAuthority,
  config: Readonly<Record<string, StableHashValue>>,
): ProviderInvocation['binding']
function registeredBinding(
  adapterId: string,
  endpointUrl: string,
  bindingAuthority: typeof keylessAuthority,
  config: Readonly<Record<string, StableHashValue>>,
): KeylessInvocation['binding']
function registeredBinding(
  adapterId: string,
  endpointUrl: string,
  bindingAuthority: typeof providerAuthority | typeof keylessAuthority,
  config: Readonly<Record<string, StableHashValue>>,
): RegisteredBinding {
  if (bindingAuthority.kind === 'provider_connection') {
    return {
      adapterId, endpointUrl, authority: bindingAuthority,
      configJson: JSON.stringify(config), configDigest: canonicalDigest(config),
    }
  }
  return {
    adapterId, endpointUrl, authority: bindingAuthority,
    configJson: JSON.stringify(config), configDigest: canonicalDigest(config),
  }
}

function resolveProviderCredential(credential: string) {
  return (reference: string) =>
    reference === PROVIDER_CREDENTIAL_REF ? credential : undefined
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
      credential: { kind: 'bearer' as const },
      cancellation: { path: '/ae/cancel', requestTimeoutMs: 3_000 },
    }
    const cancellation: RouteTransportCancellationInvocation = {
      binding: registeredBinding(
        'http-json:v1', 'https://provider.example/run', providerAuthority, config,
      ),
      authority,
      cancellationRequestRef: 'route-cancellation:v1:attempt',
    }

    await expect(invokeRegisteredRouteCancellation(cancellation, {
      send: fetch,
      resolveCredential: resolveProviderCredential('provider-secret'),
      readProviderConnectionCredentialRef: providerCredentialReader,
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
      resolveCredential: resolveProviderCredential('provider-secret'),
      readProviderConnectionCredentialRef: providerCredentialReader,
    })).resolves.toMatchObject({
      disposition: 'unsupported',
      failureCode: 'cancellation_not_registered',
    })
    expect(fetch).not.toHaveBeenCalled()

    const config = {
      method: 'POST' as const,
      requestTimeoutMs: 5_000,
      credential: { kind: 'bearer' as const },
      cancellation: { path: '/ae/cancel', requestTimeoutMs: 3_000 },
    }
    fetch.mockResolvedValueOnce(Response.json({ kind: 'maybe_cancelled' }))
    await expect(invokeRegisteredRouteCancellation({
      binding: registeredBinding(
        'http-json:v1', 'https://provider.example/run', providerAuthority, config,
      ),
      authority,
      cancellationRequestRef: 'route-cancellation:v1:attempt',
    }, {
      send: fetch,
      resolveCredential: resolveProviderCredential('provider-secret'),
      readProviderConnectionCredentialRef: providerCredentialReader,
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
      credential: { kind: 'bearer' as const },
      cancellation: { path: '/ae/cancel', requestTimeoutMs: 3_000 },
    }
    const fetch = vi.fn<RouteTransportFetch>().mockResolvedValueOnce(Response.json({
      kind: 'cancellation_rejected',
      reason: 'work_already_completed',
      providerReference: 'provider-cancel:rejected',
    }))

    await expect(invokeRegisteredRouteCancellation({
      binding: registeredBinding(
        'http-json:v1', 'https://provider.example/run', providerAuthority, config,
      ),
      authority,
      cancellationRequestRef: 'route-cancellation:v1:attempt',
    }, {
      send: fetch,
      resolveCredential: resolveProviderCredential('provider-secret'),
      readProviderConnectionCredentialRef: providerCredentialReader,
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
      credential: { kind: 'bearer' as const },
      cancellation: { path: '/ae/cancel', requestTimeoutMs: 3_000 },
    }
    const fetch = vi.fn<RouteTransportFetch>().mockResolvedValueOnce(new Response(null, { status: 503 }))
    await expect(invokeRegisteredRouteCancellation({
      binding: registeredBinding(
        'http-json:v1', 'https://provider.example/run', providerAuthority, config,
      ),
      authority,
      cancellationRequestRef: 'route-cancellation:v1:attempt',
    }, {
      send: fetch,
      resolveCredential: resolveProviderCredential('provider-secret'),
      readProviderConnectionCredentialRef: providerCredentialReader,
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
      expect(JSON.stringify(init?.headers)).not.toContain(PROVIDER_CREDENTIAL_REF)
      return Response.json({ serviceReference: 'service:123' }, {
        headers: { 'Provider-Receipt': 'receipt:http:123' },
      })
    })

    const observed = await invokeRouteTransport(invocation(), {
      send: fetch,
      resolveCredential: resolveProviderCredential('provider-secret'),
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

    const observed = await invokeRouteTransport(keylessInvocation({
      binding: registeredBinding(
        'http-json:v1', 'https://provider.example/run', keylessAuthority,
        { method: 'POST', requestTimeoutMs: 5_000 },
      ),
      authority: authorityCommon,
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

  it('refuses missing or mismatched credential placement before provider I/O', async () => {
    const missingPlacementSend = vi.fn<RouteTransportFetch>()
    const missingPlacementResolve = vi.fn(() => 'must-not-be-used')
    const missingPlacement = await invokeRouteTransport(keylessInvocation({
      binding: registeredBinding(
        'http-json:v1', 'https://provider.example/run', keylessAuthority,
        { method: 'POST', requestTimeoutMs: 5_000, credential: { kind: 'bearer' } },
      ),
      authority: authorityCommon,
    }), {
      send: missingPlacementSend,
      resolveCredential: missingPlacementResolve,
    })
    expect(missingPlacement).toMatchObject({ disposition: 'refused', failureCode: 'credential_unavailable' })
    expect(missingPlacementResolve).not.toHaveBeenCalled()
    expect(missingPlacementSend).not.toHaveBeenCalled()

    const mismatchedPlacementSend = vi.fn<RouteTransportFetch>()
    const mismatchedPlacementResolve = vi.fn(() => 'provider-secret')
    const mismatchedPlacement = await invokeRouteTransport(invocation({
      binding: registeredBinding(
        'http-json:v1', 'https://provider.example/run', providerAuthority,
        { method: 'POST', requestTimeoutMs: 5_000, credential: { kind: 'none' } },
      ),
    }), {
      send: mismatchedPlacementSend,
      resolveCredential: mismatchedPlacementResolve,
    })
    expect(mismatchedPlacement).toMatchObject({ disposition: 'refused', failureCode: 'credential_unavailable' })
    expect(mismatchedPlacementResolve).toHaveBeenCalledOnce()
    expect(mismatchedPlacementSend).not.toHaveBeenCalled()
  })

  it('refuses a provider invocation missing its authority generation/digest', async () => {
    const malformed = invocation({ authority: { ...authority } })
    Reflect.deleteProperty(malformed.authority, 'authorityGeneration')
    Reflect.deleteProperty(malformed.authority, 'authorityDigest')
    const prepared = prepareRegisteredRouteTransportInvocation(malformed, undefined)
    if (prepared.kind !== 'prepared') throw new Error('route_preparation_refused')
    const readAuthority = vi.fn(providerCredentialReader)
    const resolveCredential = vi.fn(() => 'must-not-be-used')
    const send = vi.fn<RouteTransportFetch>()
    const observed = await invokePreparedRouteTransport(prepared.prepared, {
      send,
      resolveCredential,
      readProviderConnectionCredentialRef: readAuthority,
    })
    expect(observed).toMatchObject({ disposition: 'refused', failureCode: 'connection_authority_snapshot_invalid' })
    expect(readAuthority).not.toHaveBeenCalled()
    expect(resolveCredential).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('does not resolve or send after a prepared authority is stale or revoked', async () => {
    for (const reason of ['stale_generation', 'inactive'] as const) {
      const prepared = prepareRegisteredRouteTransportInvocation(invocation(), undefined)
      if (prepared.kind !== 'prepared') throw new Error('route_preparation_refused')
      const resolveCredential = vi.fn(() => 'must-not-be-used')
      const send = vi.fn<RouteTransportFetch>()
      const observed = await invokePreparedRouteTransport(prepared.prepared, {
        send,
        resolveCredential,
        readProviderConnectionCredentialRef: vi.fn(() => ({
          kind: 'unavailable' as const,
          reason,
        })),
      })
      expect(observed).toMatchObject({ disposition: 'refused', failureCode: `connection_authority_${reason}` })
      expect(resolveCredential).not.toHaveBeenCalled()
      expect(send).not.toHaveBeenCalled()
    }
  })

  it('refuses resolver output that is still an opaque locator', async () => {
    const prepared = prepareRegisteredRouteTransportInvocation(invocation(), undefined)
    if (prepared.kind !== 'prepared') throw new Error('route_preparation_refused')
    const resolveCredential = vi.fn(() => PROVIDER_CREDENTIAL_REF)
    const send = vi.fn<RouteTransportFetch>()
    const observed = await invokePreparedRouteTransport(prepared.prepared, {
      send,
      resolveCredential,
      readProviderConnectionCredentialRef: providerCredentialReader,
    })
    expect(observed).toMatchObject({ disposition: 'refused', failureCode: 'credential_unavailable' })
    expect(resolveCredential).toHaveBeenCalledOnce()
    expect(send).not.toHaveBeenCalled()
  })


  it('uses only the registered GET query mapping and never accepts caller transport fields', async () => {
    const config = {
      method: 'GET' as const,
      query: [
        { inputPointer: '/symbol', parameter: 'symbol' },
        { inputPointer: '/convert', parameter: 'convert' },
      ],
      requestTimeoutMs: 5_000,
      credential: { kind: 'bearer' as const },
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
        providerAuthority,
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
      resolveCredential: resolveProviderCredential('provider-secret'),
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
        providerAuthority,
        config,
      ),
      authority: {
        ...authority,
        maximumSpend: { currency: 'USD', units: '1', exponent: 2 },
      },
      inputJson: JSON.stringify({ symbol: 'BTC', convert: 'USD' }),
    }), {
      send: fetch,
      resolveCredential: resolveProviderCredential('payment-credential'),
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
        'mcp-jsonrpc:v1', 'https://provider.example/mcp', providerAuthority, {
          protocolVersion: '2025-11-25', toolName: 'resolve_service', requestTimeoutMs: 5_000,
        },
      ),
      authority: {
        ...authority,
        maximumSpend: { currency: 'USD', units: '1', exponent: 2 },
      },
    }), {
      send: fetch,
      resolveCredential: resolveProviderCredential('mcp-secret'),
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
        'x402-fetch:v2', 'https://provider.example/paid', providerAuthority, {
          method: 'POST', requestTimeoutMs: 5_000, scheme: 'exact', network: 'eip155:84532',
          currency: 'USD', routeAmountExponent: 2, assetAmountExponent: 6,
          asset: '0x0000000000000000000000000000000000000001',
          payTo: '0x0000000000000000000000000000000000000002',
        },
      ),
    }), {
      send: fetch,
      resolveCredential: resolveProviderCredential('0xprivate-key'),
      ...preparedX402Custody(createPayment),
      markX402PaymentPossiblySubmitted: (event) => { submissionEvents.push(event) },
      observeX402PaymentAttempt: (event) => { observationEvents.push(event) },
    })

    expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({
      challenge: requirement,
      selectedRequirement: requirement.accepts[0],
      challengeDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      credential: '0xprivate-key',
      paymentIdentifier: authority.operationKeyDigest,
      attemptRef: authority.attemptRef,
      effectGeneration: 0,
      paymentAmount: { currency: 'USD', units: '1250000', exponent: 6 },
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
    expect(submissionEvents).toEqual([
      expect.objectContaining({
        amount: { currency: 'USD', units: '1250000', exponent: 6 },
      }),
    ])
    expect(observationEvents).toEqual([
      expect.objectContaining({
        state: 'observed',
        amount: { currency: 'USD', units: '1250000', exponent: 6 },
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
        'x402-fetch:v2', requirement.resource.url, providerAuthority, {
          method: 'POST', requestTimeoutMs: 5_000, scheme: 'exact', network: 'eip155:84532',
          currency: 'USD', routeAmountExponent: 2, assetAmountExponent: 6,
          asset: requirement.accepts[0]!.asset, payTo: requirement.accepts[0]!.payTo,
        },
      ),
      authority: {
        ...authority,
        maximumSpend: { currency: 'USD', units: '1', exponent: 2 },
      },
    }), {
      send: vi.fn<RouteTransportFetch>()
        .mockResolvedValueOnce(new Response(null, {
          status: 402, headers: { 'Payment-Required': challenge },
        }))
        .mockRejectedValueOnce(new Error('lost_after_send')),
      resolveCredential: resolveProviderCredential('private-material'),
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
        'x402-fetch:v2', 'https://provider.example/paid', providerAuthority, {
          method: 'POST', requestTimeoutMs: 5_000, scheme: 'exact', network: 'eip155:84532',
          currency: 'USD', routeAmountExponent: 2, assetAmountExponent: 6,
          asset: '0x0000000000000000000000000000000000000001',
          payTo: '0x0000000000000000000000000000000000000002',
        },
      ),
    }), {
      send: fetch,
      resolveCredential: resolveProviderCredential('0xprivate-key'),
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

  it('accepts exactly USD 0.007 as 7000 asset units and refuses the first unit above it before signing', async () => {
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
      'x402-fetch:v2', 'https://provider.example/paid', providerAuthority, {
        method: 'POST', requestTimeoutMs: 5_000, scheme: 'exact', network: 'eip155:84532',
        currency: 'USD', routeAmountExponent: 3, assetAmountExponent: 6,
        asset: '0x0000000000000000000000000000000000000001',
        payTo: '0x0000000000000000000000000000000000000002',
      },
    )
    const exactFetch = vi.fn<RouteTransportFetch>()
      .mockResolvedValueOnce(new Response(null, {
        status: 402, headers: { 'Payment-Required': challengeFor('7000') },
      }))
      .mockResolvedValueOnce(Response.json({ price: 100_000 }))
    const exactSigner = vi.fn(async () => 'sub-cent-signature')
    const exact = await invokeRouteTransport(invocation({
      binding,
      authority: {
        ...authority,
        maximumSpend: { currency: 'USD', units: '7', exponent: 3 },
      },
    }), {
      send: exactFetch,
      resolveCredential: resolveProviderCredential('credential'),
      ...preparedX402Custody(exactSigner),
    })
    expect(exact).toMatchObject({ disposition: 'succeeded' })
    expect(exactSigner).toHaveBeenCalledTimes(1)
    expect(exactFetch).toHaveBeenCalledTimes(2)

    const belowFetch = vi.fn<RouteTransportFetch>()
      .mockResolvedValueOnce(new Response(null, {
        status: 402, headers: { 'Payment-Required': challengeFor('6999') },
      }))
      .mockResolvedValueOnce(Response.json({ price: 99_999 }))
    const belowSigner = vi.fn(async () => 'below-ceiling-signature')
    const markBelowPossiblySubmitted = vi.fn()
    const below = await invokeRouteTransport(invocation({
      binding,
      authority: {
        ...authority,
        maximumSpend: { currency: 'USD', units: '70', exponent: 4 },
      },
    }), {
      send: belowFetch,
      resolveCredential: resolveProviderCredential('credential'),
      ...preparedX402Custody(belowSigner),
      markX402PaymentPossiblySubmitted: markBelowPossiblySubmitted,
    })
    expect(below).toMatchObject({ disposition: 'succeeded' })
    expect(belowSigner).toHaveBeenCalledTimes(1)
    expect(belowFetch).toHaveBeenCalledTimes(2)
    expect(markBelowPossiblySubmitted).toHaveBeenCalledWith(expect.objectContaining({
      amount: { currency: 'USD', units: '6999', exponent: 6 },
    }))

    const aboveFetch = vi.fn<RouteTransportFetch>().mockResolvedValueOnce(new Response(null, {
      status: 402, headers: { 'Payment-Required': challengeFor('7001') },
    }))
    const aboveSigner = vi.fn(async () => 'must-not-sign')
    const above = await invokeRouteTransport(invocation({
      binding,
      authority: {
        ...authority,
        maximumSpend: { currency: 'USD', units: '7', exponent: 3 },
      },
    }), {
      send: aboveFetch,
      resolveCredential: resolveProviderCredential('credential'),
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
