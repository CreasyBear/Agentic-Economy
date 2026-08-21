import { describe, expect, it, vi } from 'vitest'

import type { RouteTransportFetch } from '@/modules/capability-supply/route-transport-runtime'

import {
  authority,
  invocation,
  invokeRouteTransport,
  keylessInvocation,
  providerAuthority,
  registeredBinding,
  resolveProviderCredential,
} from './route-transport-test-harness'

describe('registered route transport runtime', () => {
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
})
