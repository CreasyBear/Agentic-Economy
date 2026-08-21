import { describe, expect, it, vi } from 'vitest'

import {
  invokePreparedRouteTransport,
  prepareRegisteredRouteTransportInvocation,
  type ProviderConnectionAuthorityLookup,
  type RouteTransportFetch,
} from '@/modules/capability-supply/route-transport-runtime'
import { credentialFromEnvironment } from '@/modules/capability-supply/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  PROVIDER_CREDENTIAL_REF,
  authority,
  authorityCommon,
  invocation,
  invokeRouteTransport,
  keylessAuthority,
  keylessInvocation,
  providerAuthority,
  providerCredentialReader,
  registeredBinding,
} from './route-transport-test-harness'

describe('registered route transport runtime', () => {
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
})
