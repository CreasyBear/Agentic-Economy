import { describe, expect, it, vi } from 'vitest'

import {
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from '@x402/core/http'

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
import { credentialFromEnvironment } from '@/modules/capability-supply/server'
import { x402PaymentCredentialRefFromEnvironment } from '@/modules/capability-supply/internal/server-credential'
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
  {
    readonly binding: {
      readonly authority: { readonly kind: 'provider_connection' }
    }
  }
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

function invocation(
  overrides: ProviderInvocationOverrides = {},
): ProviderInvocation {
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

function keylessInvocation(
  overrides: KeylessInvocationOverrides = {},
): KeylessInvocation {
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
const X402_PAYMENT_CREDENTIAL_REF = 'env:AE_X402_PAYMENT_PRIVATE_KEY'

function providerCredentialReader(
  input: ProviderConnectionAuthorityLookup,
  expectedAdapterId = 'http-json:v1',
) {
  return input.connectionRef === providerAuthority.connectionRef &&
    input.providerRef === providerAuthority.providerRef &&
    input.adapterId === expectedAdapterId &&
    input.authorityGeneration === authority.authorityGeneration &&
    input.authorityDigest === authority.authorityDigest
    ? { kind: 'resolved' as const, credentialRef: PROVIDER_CREDENTIAL_REF }
    : { kind: 'unavailable' as const, reason: 'stale_generation' as const }
}
function providerAuthorityValidator(
  input: ProviderConnectionAuthorityLookup,
  expectedAdapterId = 'http-json:v1',
) {
  return input.connectionRef === providerAuthority.connectionRef &&
    input.providerRef === providerAuthority.providerRef &&
    input.adapterId === expectedAdapterId &&
    input.authorityGeneration === authority.authorityGeneration &&
    input.authorityDigest === authority.authorityDigest
    ? { kind: 'valid' as const }
    : { kind: 'unavailable' as const, reason: 'digest_mismatch' as const }
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
  const effectiveRuntime =
    routeInvocation.binding.adapterId === 'x402-fetch:v2'
      ? {
          ...runtime,
          readX402PaymentCredentialRef:
            runtime.readX402PaymentCredentialRef ??
            (() => X402_PAYMENT_CREDENTIAL_REF),
        }
      : runtime
  if (routeInvocation.binding.authority.kind === 'keyless') {
    return invokePreparedRouteTransport(preparation.prepared, effectiveRuntime)
  }
  return invokePreparedRouteTransport(preparation.prepared, {
    ...effectiveRuntime,
    readProviderConnectionCredentialRef:
      runtime.readProviderConnectionCredentialRef ??
      ((input) =>
        providerCredentialReader(input, routeInvocation.binding.adapterId)),
    validateProviderConnectionAuthority:
      runtime.validateProviderConnectionAuthority ??
      ((input) =>
        providerAuthorityValidator(input, routeInvocation.binding.adapterId)),
  })
}

type RegisteredBinding =
  ProviderInvocation['binding'] | KeylessInvocation['binding']

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
      adapterId,
      endpointUrl,
      authority: bindingAuthority,
      configJson: JSON.stringify(config),
      configDigest: canonicalDigest(config),
    }
  }
  return {
    adapterId,
    endpointUrl,
    authority: bindingAuthority,
    configJson: JSON.stringify(config),
    configDigest: canonicalDigest(config),
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
  | 'prepareX402PaymentAuthorization'
  | 'readX402PaymentAuthorization'
  | 'readX402PaymentAuthorizationByDigest'
  | 'verifyX402Settlement'
> {
  const custody = new Map<
    string,
    Readonly<{
      authorizationDigest: string
      paymentSignature: string
    }>
  >()
  return {
    prepareX402PaymentAuthorization: async (request) => {
      const paymentSignature = await create(request)
      if (paymentSignature === undefined || paymentSignature.length === 0)
        return undefined
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
    readX402PaymentAuthorization: async ({
      custodyRef,
      authorizationDigest,
    }) => {
      const prepared = custody.get(custodyRef)
      return prepared?.authorizationDigest === authorizationDigest
        ? prepared.paymentSignature
        : undefined
    },
    readX402PaymentAuthorizationByDigest: async ({
      custodyRef,
      authorizationDigest,
    }) => {
      const prepared = custody.get(custodyRef)
      return prepared?.authorizationDigest === authorizationDigest
        ? prepared.paymentSignature
        : undefined
    },
    verifyX402Settlement: async () => true,
  }
}

function neverEndingResponse(
  status: number,
  headers: Readonly<Record<string, string>> = {},
): Readonly<{ response: Response; wasCanceled: () => boolean }> {
  let canceled = false
  return {
    response: new Response(
      new ReadableStream<Uint8Array>({
        cancel() {
          canceled = true
        },
      }),
      { status, headers },
    ),
    wasCanceled: () => canceled,
  }
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
        'http-json:v1',
        'https://provider.example/run',
        providerAuthority,
        config,
      ),
      authority,
      cancellationRequestRef: 'route-cancellation:v1:attempt',
    }

    await expect(
      invokeRegisteredRouteCancellation(cancellation, {
        send: fetch,
        resolveCredential: resolveProviderCredential('provider-secret'),
        readProviderConnectionCredentialRef: providerCredentialReader,
      }),
    ).resolves.toEqual({
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
    await expect(
      invokeRegisteredRouteCancellation(
        {
          binding: unsupported.binding,
          authority,
          cancellationRequestRef: 'route-cancellation:v1:attempt',
        },
        {
          send: fetch,
          resolveCredential: resolveProviderCredential('provider-secret'),
          readProviderConnectionCredentialRef: providerCredentialReader,
        },
      ),
    ).resolves.toMatchObject({
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
    await expect(
      invokeRegisteredRouteCancellation(
        {
          binding: registeredBinding(
            'http-json:v1',
            'https://provider.example/run',
            providerAuthority,
            config,
          ),
          authority,
          cancellationRequestRef: 'route-cancellation:v1:attempt',
        },
        {
          send: fetch,
          resolveCredential: resolveProviderCredential('provider-secret'),
          readProviderConnectionCredentialRef: providerCredentialReader,
        },
      ),
    ).resolves.toMatchObject({
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
    const fetch = vi.fn<RouteTransportFetch>().mockResolvedValueOnce(
      Response.json({
        kind: 'cancellation_rejected',
        reason: 'work_already_completed',
        providerReference: 'provider-cancel:rejected',
      }),
    )

    await expect(
      invokeRegisteredRouteCancellation(
        {
          binding: registeredBinding(
            'http-json:v1',
            'https://provider.example/run',
            providerAuthority,
            config,
          ),
          authority,
          cancellationRequestRef: 'route-cancellation:v1:attempt',
        },
        {
          send: fetch,
          resolveCredential: resolveProviderCredential('provider-secret'),
          readProviderConnectionCredentialRef: providerCredentialReader,
        },
      ),
    ).resolves.toMatchObject({
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
    const pending = neverEndingResponse(503)
    const fetch = vi
      .fn<RouteTransportFetch>()
      .mockResolvedValueOnce(pending.response)
    await expect(
      invokeRegisteredRouteCancellation(
        {
          binding: registeredBinding(
            'http-json:v1',
            'https://provider.example/run',
            providerAuthority,
            config,
          ),
          authority,
          cancellationRequestRef: 'route-cancellation:v1:attempt',
        },
        {
          send: fetch,
          resolveCredential: resolveProviderCredential('provider-secret'),
          readProviderConnectionCredentialRef: providerCredentialReader,
        },
      ),
    ).resolves.toMatchObject({
      disposition: 'unknown',
      failureCode: 'provider_http_503',
    })
    expect(pending.wasCanceled()).toBe(true)
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
      expect(JSON.stringify(init?.headers)).not.toContain(
        PROVIDER_CREDENTIAL_REF,
      )
      return Response.json(
        { serviceReference: 'service:123' },
        {
          headers: { 'Provider-Receipt': 'receipt:http:123' },
        },
      )
    })

    const observed = await invokeRouteTransport(invocation(), {
      send: fetch,
      resolveCredential: resolveProviderCredential('provider-secret'),
    })

    expect(observed).toMatchObject({
      transport: 'http',
      disposition: 'succeeded',
      releaseStarted: true,
      outputJson: JSON.stringify({ serviceReference: 'service:123' }),
      providerReceipt: 'receipt:http:123',
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it.each([
    ['raw provider credential', { value: 'provider-secret' }],
    ['full bearer echo', { nested: { echo: 'Bearer provider-secret' } }],
    [
      'AE call signature echo',
      {
        nested: {
          echo: `AE-Call-Signature: ${authority.callIdentity.signature}`,
        },
      },
    ],
  ] as const)(
    'fails closed when HTTP output echoes %s',
    async (_label, output) => {
      const observed = await invokeRouteTransport(invocation(), {
        send: vi
          .fn<RouteTransportFetch>()
          .mockResolvedValueOnce(Response.json(output)),
        resolveCredential: resolveProviderCredential('provider-secret'),
      })

      expect(observed).toMatchObject({
        transport: 'http',
        disposition: 'unknown',
        releaseStarted: true,
        failureCode: 'response_output_invalid',
      })
      expect(JSON.stringify(observed)).not.toContain('provider-secret')
      expect(JSON.stringify(observed)).not.toContain(
        authority.callIdentity.signature,
      )
    },
  )

  it('keeps unrelated provider strings and keyless output successful', async () => {
    const output = { value: 'provider credential service is healthy' }
    const observed = await invokeRouteTransport(keylessInvocation(), {
      send: vi
        .fn<RouteTransportFetch>()
        .mockResolvedValueOnce(Response.json(output)),
      resolveCredential: vi.fn(() => 'must-not-be-used'),
    })

    expect(observed).toMatchObject({
      transport: 'http',
      disposition: 'succeeded',
      releaseStarted: true,
      outputJson: JSON.stringify(output),
    })
  })

  it.each([
    [
      'header',
      {
        method: 'POST' as const,
        requestTimeoutMs: 5_000,
        credential: {
          kind: 'api_key' as const,
          location: 'header' as const,
          name: 'X-Provider-Key',
        },
      },
    ],
    [
      'query',
      {
        method: 'GET' as const,
        query: [
          {
            inputPointer: '/lookup',
            parameter: 'lookup',
            required: true,
            style: 'form' as const,
            explode: true,
          },
        ],
        requestTimeoutMs: 5_000,
        credential: {
          kind: 'api_key' as const,
          location: 'query' as const,
          name: 'api_key',
        },
      },
    ],
  ] as const)(
    'fails closed when an HTTP API-key %s value is echoed',
    async (location, config) => {
      const credential = `api-key-${location}-secret`
      const observed = await invokeRouteTransport(
        invocation({
          binding: registeredBinding(
            'http-json:v1',
            'https://provider.example/run',
            providerAuthority,
            config,
          ),
          inputJson:
            config.method === 'GET'
              ? JSON.stringify({ lookup: 'service' })
              : '{}',
        }),
        {
          send: vi
            .fn<RouteTransportFetch>()
            .mockImplementationOnce(async (url, init) => {
              if (location === 'header') {
                expect(init?.headers).toMatchObject({
                  'X-Provider-Key': credential,
                })
              } else {
                expect(url.searchParams.get('api_key')).toBe(credential)
              }
              return Response.json({
                nested: { echo: `prefix:${credential}` },
              })
            }),
          resolveCredential: resolveProviderCredential(credential),
        },
      )

      expect(observed).toMatchObject({
        transport: 'http',
        disposition: 'unknown',
        releaseStarted: true,
        failureCode: 'response_output_invalid',
      })
      expect(JSON.stringify(observed)).not.toContain(credential)
    },
  )

  it('enforces the registered HTTP response status and exact base media type', async () => {
    const config = {
      method: 'POST' as const,
      requestTimeoutMs: 5_000,
      responseStatus: 201,
      responseContentType: 'application/json',
      credential: { kind: 'bearer' as const },
    }
    const routeInvocation = invocation({
      binding: registeredBinding(
        'http-json:v1',
        'https://provider.example/run',
        providerAuthority,
        config,
      ),
    })
    const wrongStatus = await invokeRouteTransport(routeInvocation, {
      send: vi.fn<RouteTransportFetch>().mockResolvedValueOnce(
        new Response('not-json', {
          status: 200,
          headers: { 'Content-Type': 'application/json-invalid' },
        }),
      ),
      resolveCredential: resolveProviderCredential('provider-secret'),
    })
    expect(wrongStatus).toMatchObject({
      disposition: 'unknown',
      failureCode: 'response_status_invalid',
    })

    const accepted = await invokeRouteTransport(routeInvocation, {
      send: vi.fn<RouteTransportFetch>().mockResolvedValueOnce(
        new Response(JSON.stringify({ serviceReference: 'service:201' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        }),
      ),
      resolveCredential: resolveProviderCredential('provider-secret'),
    })
    expect(accepted).toMatchObject({
      disposition: 'succeeded',
      outputJson: JSON.stringify({ serviceReference: 'service:201' }),
    })

    const wrongMedia = await invokeRouteTransport(routeInvocation, {
      send: vi.fn<RouteTransportFetch>().mockResolvedValueOnce(
        new Response(
          JSON.stringify({ serviceReference: 'service:bad-media' }),
          {
            status: 201,
            headers: { 'Content-Type': 'application/json-invalid' },
          },
        ),
      ),
      resolveCredential: resolveProviderCredential('provider-secret'),
    })
    expect(wrongMedia).toMatchObject({
      disposition: 'unknown',
      failureCode: 'response_content_type_invalid',
    })
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

    const observed = await invokeRouteTransport(
      keylessInvocation({
        binding: registeredBinding(
          'http-json:v1',
          'https://provider.example/run',
          keylessAuthority,
          { method: 'POST', requestTimeoutMs: 5_000 },
        ),
        authority: authorityCommon,
      }),
      {
        send: fetch,
        resolveCredential,
      },
    )

    expect(observed).toMatchObject({
      transport: 'http',
      disposition: 'succeeded',
      releaseStarted: true,
      outputJson: JSON.stringify({ serviceReference: 'service:public-123' }),
    })
    expect(resolveCredential).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledOnce()
  })
  it('sends no JSON body for a POST that only maps query parameters', async () => {
    const fetch: RouteTransportFetch = vi.fn(async (url, init) => {
      expect(url.href).toBe('https://provider.example/run?query=hello')
      expect(init?.method).toBe('POST')
      expect(init?.body).toBeUndefined()
      return Response.json({ serviceReference: 'service:query-only-post' })
    })
    const observed = await invokeRouteTransport(
      keylessInvocation({
        binding: registeredBinding(
          'http-json:v1',
          'https://provider.example/run',
          keylessAuthority,
          {
            method: 'POST',
            query: [
              {
                inputPointer: '/query',
                parameter: 'query',
                required: true,
                style: 'form',
                explode: true,
              },
            ],
            requestTimeoutMs: 5_000,
          },
        ),
        inputJson: JSON.stringify({ query: 'hello' }),
      }),
      {
        send: fetch,
        resolveCredential: vi.fn(() => 'must-not-be-used'),
      },
    )

    expect(observed).toMatchObject({
      transport: 'http',
      disposition: 'succeeded',
      outputJson: JSON.stringify({
        serviceReference: 'service:query-only-post',
      }),
    })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('refuses missing or mismatched credential placement before provider I/O', async () => {
    const missingPlacementSend = vi.fn<RouteTransportFetch>()
    const missingPlacementResolve = vi.fn(() => 'must-not-be-used')
    const missingPlacement = await invokeRouteTransport(
      keylessInvocation({
        binding: registeredBinding(
          'http-json:v1',
          'https://provider.example/run',
          keylessAuthority,
          {
            method: 'POST',
            requestTimeoutMs: 5_000,
            credential: { kind: 'bearer' },
          },
        ),
        authority: authorityCommon,
      }),
      {
        send: missingPlacementSend,
        resolveCredential: missingPlacementResolve,
      },
    )
    expect(missingPlacement).toMatchObject({
      disposition: 'refused',
      failureCode: 'credential_unavailable',
    })
    expect(missingPlacementResolve).not.toHaveBeenCalled()
    expect(missingPlacementSend).not.toHaveBeenCalled()

    const mismatchedPlacementSend = vi.fn<RouteTransportFetch>()
    const mismatchedPlacementResolve = vi.fn(() => 'provider-secret')
    const mismatchedPlacement = await invokeRouteTransport(
      invocation({
        binding: registeredBinding(
          'http-json:v1',
          'https://provider.example/run',
          providerAuthority,
          {
            method: 'POST',
            requestTimeoutMs: 5_000,
            credential: { kind: 'none' },
          },
        ),
      }),
      {
        send: mismatchedPlacementSend,
        resolveCredential: mismatchedPlacementResolve,
      },
    )
    expect(mismatchedPlacement).toMatchObject({
      disposition: 'refused',
      failureCode: 'credential_unavailable',
    })
    expect(mismatchedPlacementResolve).toHaveBeenCalledOnce()
    expect(mismatchedPlacementSend).not.toHaveBeenCalled()
  })

  it('refuses a provider invocation missing its authority generation/digest', async () => {
    const malformed = invocation({ authority: { ...authority } })
    Reflect.deleteProperty(malformed.authority, 'authorityGeneration')
    Reflect.deleteProperty(malformed.authority, 'authorityDigest')
    const prepared = prepareRegisteredRouteTransportInvocation(
      malformed,
      undefined,
    )
    if (prepared.kind !== 'prepared')
      throw new Error('route_preparation_refused')
    const readAuthority = vi.fn(providerCredentialReader)
    const resolveCredential = vi.fn(() => 'must-not-be-used')
    const send = vi.fn<RouteTransportFetch>()
    const observed = await invokePreparedRouteTransport(prepared.prepared, {
      send,
      resolveCredential,
      readProviderConnectionCredentialRef: readAuthority,
    })
    expect(observed).toMatchObject({
      disposition: 'refused',
      failureCode: 'connection_authority_snapshot_invalid',
    })
    expect(readAuthority).not.toHaveBeenCalled()
    expect(resolveCredential).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('rejects a non-positive provider authority generation before reader or provider I/O', async () => {
    const prepared = prepareRegisteredRouteTransportInvocation(
      invocation({
        authority: { ...authority, authorityGeneration: 0 },
      }),
      undefined,
    )
    if (prepared.kind !== 'prepared')
      throw new Error('route_preparation_refused')
    const readAuthority = vi.fn(providerCredentialReader)
    const resolveCredential = vi.fn(() => 'must-not-be-used')
    const send = vi.fn<RouteTransportFetch>()
    const observed = await invokePreparedRouteTransport(prepared.prepared, {
      send,
      resolveCredential,
      readProviderConnectionCredentialRef: readAuthority,
    })
    expect(observed).toMatchObject({
      disposition: 'refused',
      failureCode: 'connection_authority_snapshot_invalid',
    })
    expect(readAuthority).not.toHaveBeenCalled()
    expect(resolveCredential).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('resolves an environment credential when qualification and connection digests differ', async () => {
    const previousCredential = process.env.PROVIDER_SECRET
    process.env.PROVIDER_SECRET = ' provider-secret '
    try {
      const readinessDigest = canonicalDigest({
        kind: 'operation-readiness:v1',
        operationRef: 'operation:test',
      } as StableHashValue)
      expect(readinessDigest).not.toBe(authority.authorityDigest)
      const prepared = prepareRegisteredRouteTransportInvocation(
        invocation({
          authority: {
            ...authority,
            leaseRef: 'lease:test',
            invocationRef: 'invocation:test',
            operationRef: 'operation:test',
            grantedScopes: [],
            grantedResources: [],
            readinessValidUntil: Date.now() + 60_000,
            readinessDigest,
          },
        }),
        undefined,
      )
      if (prepared.kind !== 'prepared')
        throw new Error('route_preparation_refused')
      const readAuthority = vi.fn(
        (input: ProviderConnectionAuthorityLookup) => {
          expect(input.readinessDigest).toBe(readinessDigest)
          return {
            kind: 'resolved' as const,
            credentialRef: PROVIDER_CREDENTIAL_REF,
          }
        },
      )
      const send = vi.fn<RouteTransportFetch>(async (_url, init) => {
        expect(init?.headers).toMatchObject({
          Authorization: 'Bearer provider-secret',
        })
        return Response.json({ serviceReference: 'service:env' })
      })
      const observed = await invokePreparedRouteTransport(prepared.prepared, {
        send,
        resolveCredential: credentialFromEnvironment,
        readProviderConnectionCredentialRef: readAuthority,
      })
      expect(observed).toMatchObject({
        transport: 'http',
        disposition: 'succeeded',
        releaseStarted: true,
        outputJson: JSON.stringify({ serviceReference: 'service:env' }),
      })
      expect(readAuthority).toHaveBeenCalledOnce()
      expect(send).toHaveBeenCalledOnce()
    } finally {
      if (previousCredential === undefined) delete process.env.PROVIDER_SECRET
      else process.env.PROVIDER_SECRET = previousCredential
    }
  })

  it('does not resolve or send after a prepared authority is stale or revoked', async () => {
    for (const reason of ['stale_generation', 'inactive'] as const) {
      const prepared = prepareRegisteredRouteTransportInvocation(
        invocation(),
        undefined,
      )
      if (prepared.kind !== 'prepared')
        throw new Error('route_preparation_refused')
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
      expect(observed).toMatchObject({
        disposition: 'refused',
        failureCode: `connection_authority_${reason}`,
      })
      expect(resolveCredential).not.toHaveBeenCalled()
      expect(send).not.toHaveBeenCalled()
    }
  })

  it('refuses resolver output that is still an opaque locator', async () => {
    const prepared = prepareRegisteredRouteTransportInvocation(
      invocation(),
      undefined,
    )
    if (prepared.kind !== 'prepared')
      throw new Error('route_preparation_refused')
    const resolveCredential = vi.fn(() => PROVIDER_CREDENTIAL_REF)
    const send = vi.fn<RouteTransportFetch>()
    const observed = await invokePreparedRouteTransport(prepared.prepared, {
      send,
      resolveCredential,
      readProviderConnectionCredentialRef: providerCredentialReader,
    })
    expect(observed).toMatchObject({
      disposition: 'refused',
      failureCode: 'credential_unavailable',
    })
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
    const observed = await invokeRouteTransport(
      invocation({
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
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential('provider-secret'),
      },
    )

    expect(observed).toMatchObject({
      transport: 'http',
      disposition: 'succeeded',
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('omits an absent optional query parameter before provider I/O', async () => {
    const config = {
      method: 'GET' as const,
      query: [
        {
          inputPointer: '/required',
          parameter: 'required',
          required: true,
          style: 'form' as const,
          explode: false,
        },
        {
          inputPointer: '/optional',
          parameter: 'optional',
          required: false,
          style: 'form' as const,
          explode: true,
        },
      ],
      requestTimeoutMs: 5_000,
      credential: { kind: 'bearer' as const },
    }
    const fetch: RouteTransportFetch = vi.fn(async (url) => {
      expect(url.searchParams.getAll('required')).toEqual(['value'])
      expect(url.searchParams.getAll('optional')).toEqual([])
      return Response.json({ result: 'ok' })
    })

    const observed = await invokeRouteTransport(
      invocation({
        binding: registeredBinding(
          'http-json:v1',
          'https://provider.example/lookup',
          providerAuthority,
          config,
        ),
        inputJson: JSON.stringify({ required: 'value' }),
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential('provider-secret'),
      },
    )

    expect(observed).toMatchObject({
      transport: 'http',
      disposition: 'succeeded',
    })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('refuses an absent required query parameter before fetch', async () => {
    const config = {
      method: 'GET' as const,
      query: [
        {
          inputPointer: '/required',
          parameter: 'required',
          required: true,
          style: 'form' as const,
          explode: false,
        },
        {
          inputPointer: '/optional',
          parameter: 'optional',
          required: false,
          style: 'form' as const,
          explode: true,
        },
      ],
      requestTimeoutMs: 5_000,
      credential: { kind: 'bearer' as const },
    }
    const fetch = vi.fn<RouteTransportFetch>()
    const observed = await invokeRouteTransport(
      invocation({
        binding: registeredBinding(
          'http-json:v1',
          'https://provider.example/lookup',
          providerAuthority,
          config,
        ),
        inputJson: JSON.stringify({ optional: 'value' }),
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential('provider-secret'),
      },
    )

    expect(observed).toMatchObject({
      transport: 'http',
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'input_required',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('serializes each present supported scalar query value once', async () => {
    const config = {
      method: 'GET' as const,
      query: [
        {
          inputPointer: '/value',
          parameter: 'value',
          required: true,
          style: 'form' as const,
          explode: false,
        },
      ],
      requestTimeoutMs: 5_000,
      credential: { kind: 'bearer' as const },
    }
    const fetch: RouteTransportFetch = vi.fn(async (url) => {
      expect(url.searchParams.getAll('value')).toEqual(['scalar'])
      return Response.json({ result: 'ok' })
    })
    const observed = await invokeRouteTransport(
      invocation({
        binding: registeredBinding(
          'http-json:v1',
          'https://provider.example/lookup',
          providerAuthority,
          config,
        ),
        inputJson: JSON.stringify({ value: 'scalar' }),
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential('provider-secret'),
      },
    )

    expect(observed).toMatchObject({
      transport: 'http',
      disposition: 'succeeded',
    })
    expect(fetch).toHaveBeenCalledOnce()
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
    const challenge = encodePaymentRequiredHeader({
      x402Version: 2,
      resource: { url: target },
      accepts: [{
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '10000',
        asset: '0xasset',
        payTo: '0xrecipient',
        maxTimeoutSeconds: 60,
        extra: {},
      }],
    })
    const fetch = vi
      .fn<RouteTransportFetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 402,
          headers: { 'Payment-Required': challenge },
        }),
      )
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
      },
    )

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
    const fetch = vi
      .fn<RouteTransportFetch>()
      .mockResolvedValueOnce(
        Response.json(
          {
            jsonrpc: '2.0',
            id: 0,
            result: {
              protocolVersion: '2025-11-25',
              capabilities: { tools: {} },
              serverInfo: { name: 'provider', version: '1' },
            },
          },
          { headers: { 'Mcp-Session-Id': 'session:123' } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: '2.0',
          id: 1,
          result: {
            tools: [
              { name: 'resolve_service', inputSchema: { type: 'object' } },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: '2.0',
          id: 2,
          result: { structuredContent: { serviceReference: 'service:mcp' } },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    const observed = await invokeRouteTransport(
      invocation({
        binding: registeredBinding(
          'mcp-jsonrpc:v1',
          'https://provider.example/mcp',
          providerAuthority,
          {
            protocolVersion: '2025-11-25',
            toolName: 'resolve_service',
            requestTimeoutMs: 5_000,
            credential: { kind: 'bearer' },
          },
        ),
        authority: {
          ...authority,
          maximumSpend: { currency: 'USD', units: '1', exponent: 2 },
        },
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential('mcp-secret'),
      },
    )

    expect(observed).toMatchObject({
      transport: 'mcp',
      disposition: 'succeeded',
      releaseStarted: true,
      outputJson: JSON.stringify({ serviceReference: 'service:mcp' }),
    })
    expect(fetch).toHaveBeenCalledTimes(5)
    expect(fetch.mock.calls[3]?.[1]?.headers).toMatchObject({
      'mcp-session-id': 'session:123',
      'mcp-protocol-version': '2025-11-25',
      'idempotency-key': authority.operationKeyDigest,
    })
    expect(fetch.mock.calls[3]?.[1]?.headers).toMatchObject({
      authorization: 'Bearer mcp-secret',
    })
    expect(fetch.mock.calls[4]?.[1]?.method).toBe('DELETE')
    expect(fetch.mock.calls[4]?.[1]?.headers).toMatchObject({
      'mcp-session-id': 'session:123',
    })
  })
  it('refuses an older configured MCP protocol before execution', async () => {
    const fetch = vi.fn<RouteTransportFetch>()
    const observed = await invokeRouteTransport(
      invocation({
        binding: registeredBinding(
          'mcp-jsonrpc:v1',
          'https://provider.example/mcp',
          providerAuthority,
          {
            protocolVersion: '2025-06-18',
            toolName: 'resolve_service',
            requestTimeoutMs: 5_000,
            credential: { kind: 'bearer' },
          },
        ),
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential('mcp-secret'),
      },
    )
    expect(observed).toMatchObject({
      transport: 'mcp',
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'mcp_protocol_unsupported',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails closed when an MCP result echoes its credential or call signature', async () => {
    const credential = 'mcp-secret'
    const fetch = vi
      .fn<RouteTransportFetch>()
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: '2.0',
          id: 0,
          result: {
            protocolVersion: '2025-11-25',
            capabilities: { tools: {} },
            serverInfo: { name: 'provider', version: '1' },
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: '2.0',
          id: 1,
          result: {
            tools: [
              { name: 'resolve_service', inputSchema: { type: 'object' } },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: '2.0',
          id: 2,
          result: {
            structuredContent: {
              nested: {
                echo: `Bearer ${credential}; AE-Call-Signature: ${authority.callIdentity.signature}`,
              },
            },
          },
        }),
      )

    const observed = await invokeRouteTransport(
      invocation({
        binding: registeredBinding(
          'mcp-jsonrpc:v1',
          'https://provider.example/mcp',
          providerAuthority,
          {
            protocolVersion: '2025-11-25',
            toolName: 'resolve_service',
            requestTimeoutMs: 5_000,
            credential: { kind: 'bearer' },
          },
        ),
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential(credential),
      },
    )

    expect(observed).toMatchObject({
      transport: 'mcp',
      disposition: 'unknown',
      releaseStarted: true,
      failureCode: 'mcp_output_invalid',
    })
    expect(JSON.stringify(observed)).not.toContain(credential)
    expect(JSON.stringify(observed)).not.toContain(
      authority.callIdentity.signature,
    )
  })

  it('follows a second MCP tools/list page before tools/call', async () => {
    const fetch = vi
      .fn<RouteTransportFetch>()
      .mockImplementation(async (_url, init) => {
        const body = JSON.parse(init?.body ?? '{}') as {
          id?: string
          method?: string
          params?: Record<string, unknown>
        }
        if (body.method === 'initialize') {
          return Response.json({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              protocolVersion: '2025-11-25',
              capabilities: { tools: {} },
              serverInfo: { name: 'provider', version: '1' },
            },
          })
        }
        if (body.method === 'notifications/initialized')
          return new Response(null, { status: 200 })
        if (body.method === 'tools/list') {
          return Response.json({
            jsonrpc: '2.0',
            id: body.id,
            result:
              body.params?.cursor === 'page-2'
                ? {
                    tools: [
                      {
                        name: 'resolve_service',
                        inputSchema: { type: 'object' },
                      },
                    ],
                  }
                : {
                    tools: [{ name: 'other', inputSchema: { type: 'object' } }],
                    nextCursor: 'page-2',
                  },
          })
        }
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            structuredContent: { serviceReference: 'service:mcp-page-2' },
          },
        })
      })
    const observed = await invokeRouteTransport(
      invocation({
        binding: registeredBinding(
          'mcp-jsonrpc:v1',
          'https://provider.example/mcp',
          providerAuthority,
          {
            protocolVersion: '2025-11-25',
            toolName: 'resolve_service',
            requestTimeoutMs: 5_000,
            credential: { kind: 'bearer' },
          },
        ),
        authority: {
          ...authority,
          maximumSpend: { currency: 'USD', units: '1', exponent: 2 },
        },
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential('mcp-secret'),
      },
    )

    expect(observed).toMatchObject({
      transport: 'mcp',
      disposition: 'succeeded',
      outputJson: JSON.stringify({ serviceReference: 'service:mcp-page-2' }),
    })
    expect(fetch).toHaveBeenCalledTimes(5)
    expect(JSON.parse(fetch.mock.calls[2]?.[1]?.body ?? '{}').params).toEqual(
      {},
    )
    expect(JSON.parse(fetch.mock.calls[3]?.[1]?.body ?? '{}').params).toEqual({
      cursor: 'page-2',
    })
  })

  it('refuses a repeated MCP tools/list cursor before release', async () => {
    const fetch = vi
      .fn<RouteTransportFetch>()
      .mockImplementation(async (_url, init) => {
        const body = JSON.parse(init?.body ?? '{}') as {
          id?: string
          method?: string
        }
        if (body.method === 'initialize') {
          return Response.json({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              protocolVersion: '2025-11-25',
              capabilities: { tools: {} },
              serverInfo: { name: 'provider', version: '1' },
            },
          })
        }
        if (body.method === 'notifications/initialized')
          return new Response(null, { status: 200 })
        if (body.method === 'tools/list') {
          return Response.json({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              tools: [{ name: 'other', inputSchema: { type: 'object' } }],
              nextCursor: 'loop',
            },
          })
        }
        throw new Error('tools_call_must_not_run')
      })
    const observed = await invokeRouteTransport(
      invocation({
        binding: registeredBinding(
          'mcp-jsonrpc:v1',
          'https://provider.example/mcp',
          providerAuthority,
          {
            protocolVersion: '2025-11-25',
            toolName: 'resolve_service',
            requestTimeoutMs: 5_000,
            credential: { kind: 'bearer' },
          },
        ),
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential('mcp-secret'),
      },
    )

    expect(observed).toMatchObject({
      transport: 'mcp',
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'mcp_tools_list_cursor_cycle',
    })
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('uses the first matching MCP JSON-RPC SSE error and never scans to a later result', async () => {
    const fetch = vi
      .fn<RouteTransportFetch>()
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: '2.0',
          id: 0,
          result: {
            protocolVersion: '2025-11-25',
            capabilities: { tools: {} },
            serverInfo: { name: 'provider', version: '1' },
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          [
            'event: message',
            'data: {"jsonrpc":"2.0","id":1,"error":{"code":-32600,"message":"invalid request"}}',
            '',
            'event: message',
            'data: {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"resolve_service","inputSchema":{"type":"object"}}]}}',
            '',
          ].join('\n'),
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
      )
    const observed = await invokeRouteTransport(
      invocation({
        binding: registeredBinding(
          'mcp-jsonrpc:v1',
          'https://provider.example/mcp',
          providerAuthority,
          {
            protocolVersion: '2025-11-25',
            toolName: 'resolve_service',
            requestTimeoutMs: 5_000,
            credential: { kind: 'bearer' },
          },
        ),
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential('mcp-secret'),
      },
    )

    expect(observed).toMatchObject({
      transport: 'mcp',
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'mcp_tools_list_invalid',
    })
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('refuses an MCP server that does not advertise tool capability before release', async () => {
    const fetch = vi
      .fn<RouteTransportFetch>()
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: '2.0',
          id: 0,
          result: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            serverInfo: { name: 'provider', version: '1' },
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    const observed = await invokeRouteTransport(
      invocation({
        binding: registeredBinding(
          'mcp-jsonrpc:v1',
          'https://provider.example/mcp',
          providerAuthority,
          {
            protocolVersion: '2025-11-25',
            toolName: 'resolve_service',
            requestTimeoutMs: 5_000,
            credential: { kind: 'bearer' },
          },
        ),
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential('mcp-secret'),
      },
    )

    expect(observed).toMatchObject({
      transport: 'mcp',
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'mcp_initialize_invalid',
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('places a configured MCP API key without leaking it into bearer authorization', async () => {
    const fetch = vi
      .fn<RouteTransportFetch>()
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: '2.0',
          id: 0,
          result: {
            protocolVersion: '2025-11-25',
            capabilities: { tools: {} },
            serverInfo: { name: 'provider', version: '1' },
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: '2.0',
          id: 1,
          result: {
            tools: [
              { name: 'resolve_service', inputSchema: { type: 'object' } },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: '2.0',
          id: 2,
          result: {
            structuredContent: { serviceReference: 'service:mcp-api-key' },
          },
        }),
      )
    const observed = await invokeRouteTransport(
      invocation({
        binding: registeredBinding(
          'mcp-jsonrpc:v1',
          'https://provider.example/mcp',
          providerAuthority,
          {
            protocolVersion: '2025-11-25',
            toolName: 'resolve_service',
            requestTimeoutMs: 5_000,
            credential: {
              kind: 'api_key',
              location: 'header',
              name: 'X-MCP-Key',
            },
          },
        ),
        authority: {
          ...authority,
          maximumSpend: { currency: 'USD', units: '1', exponent: 2 },
        },
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential('mcp-api-secret'),
      },
    )

    expect(observed).toMatchObject({
      transport: 'mcp',
      disposition: 'succeeded',
      outputJson: JSON.stringify({ serviceReference: 'service:mcp-api-key' }),
    })
    for (const call of fetch.mock.calls) {
      expect(call[1]?.headers).toMatchObject({ 'x-mcp-key': 'mcp-api-secret' })
      expect(call[1]?.headers).not.toHaveProperty('authorization')
    }
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
    const challenge = encodePaymentRequiredHeader(requirement)
    const settlementProof = encodePaymentResponseHeader({
      success: true,
      transaction: '0xsettled',
      network: 'eip155:84532',
      amount: '1250000',
      payer: 'test:settled-payer',
    })
    const fetch = vi
      .fn<RouteTransportFetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 402,
          headers: { 'Payment-Required': challenge },
        }),
      )
      .mockImplementationOnce(async (_url, init) => {
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
          submissionEvents.push(event)
        },
        observeX402PaymentAttempt: (event) => {
          observationEvents.push(event)
        },
      },
    )

    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        challenge: requirement,
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
    expect(fetch).toHaveBeenCalledTimes(2)
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
      .mockResolvedValueOnce(new Response(null, {
        status: 402,
        headers: { 'Payment-Required': encodePaymentRequiredHeader(requirement) },
      }))
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
    expect(fetch).toHaveBeenCalledTimes(2)
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
      .mockResolvedValueOnce(
        new Response(null, {
          status: 402,
          headers: { 'Payment-Required': challenge },
        }),
      )
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
      },
    )

    expect(observed).toMatchObject({
      transport: 'x402',
      disposition: 'unknown',
      releaseStarted: true,
      failureCode: 'response_output_invalid',
    })
    expect(JSON.stringify(observed)).not.toContain(paymentSignature)
    expect(fetch).toHaveBeenCalledTimes(2)
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
    const challenge = encodePaymentRequiredHeader(requirement)
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
          .mockResolvedValueOnce(
            new Response(null, {
              status: 402,
              headers: { 'Payment-Required': challenge },
            }),
          )
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
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('accepts exactly USD 0.007 as 7000 asset units and refuses the first unit above it before signing', async () => {
    const challengeFor = (amount: string) =>
      encodePaymentRequiredHeader({
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
    const binding = registeredBinding(
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
      },
    )
    const exactFetch = vi
      .fn<RouteTransportFetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 402,
          headers: { 'Payment-Required': challengeFor('7000') },
        }),
      )
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
        binding,
        authority: {
          ...authority,
          maximumSpend: { currency: 'USD', units: '7', exponent: 3 },
        },
      }),
      {
        send: exactFetch,
        resolveCredential: resolveProviderCredential('credential'),
        ...preparedX402Custody(exactSigner),
      },
    )
    expect(exact).toMatchObject({ disposition: 'succeeded' })
    expect(exactSigner).toHaveBeenCalledTimes(1)
    expect(exactFetch).toHaveBeenCalledTimes(2)

    const belowFetch = vi.fn<RouteTransportFetch>().mockResolvedValueOnce(
      new Response(null, {
        status: 402,
        headers: { 'Payment-Required': challengeFor('6999') },
      }),
    )
    const belowSigner = vi.fn(async () => 'below-ceiling-signature')
    const below = await invokeRouteTransport(
      invocation({
        binding,
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
    expect(belowFetch).toHaveBeenCalledTimes(1)

    const aboveFetch = vi.fn<RouteTransportFetch>().mockResolvedValueOnce(
      new Response(null, {
        status: 402,
        headers: { 'Payment-Required': challengeFor('7001') },
      }),
    )
    const aboveSigner = vi.fn(async () => 'must-not-sign')
    const above = await invokeRouteTransport(
      invocation({
        binding,
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
    expect(aboveFetch).toHaveBeenCalledTimes(1)
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
          new Response(null, {
            status: 402,
            headers: {
              'Payment-Required': encodePaymentRequiredHeader(requirement),
            },
          }),
        )
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
        },
      )
      expect(observed).toMatchObject(expected)
      expect(fetch).toHaveBeenCalledTimes(2)
    },
  )
})
