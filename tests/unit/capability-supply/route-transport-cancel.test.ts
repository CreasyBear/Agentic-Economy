import { describe, expect, it, vi } from 'vitest'

import {
  invokeRegisteredRouteCancellation,
  type RouteTransportCancellationInvocation,
  type RouteTransportFetch,
} from '@/modules/capability-supply/route-transport-runtime'

import {
  authority,
  invocation,
  neverEndingResponse,
  providerAuthority,
  providerCredentialReader,
  registeredBinding,
  resolveProviderCredential,
} from './route-transport-test-harness'

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
})
