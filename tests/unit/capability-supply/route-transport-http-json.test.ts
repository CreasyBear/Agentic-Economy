import { describe, expect, it, vi } from 'vitest'

import type { RouteTransportFetch } from '@/modules/capability-supply/route-transport-runtime'

import {
  PROVIDER_CREDENTIAL_REF,
  authority,
  authorityCommon,
  invocation,
  invokeRouteTransport,
  keylessAuthority,
  keylessInvocation,
  providerAuthority,
  registeredBinding,
  resolveProviderCredential,
} from './route-transport-test-harness'

describe('registered route transport runtime', () => {
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
})
