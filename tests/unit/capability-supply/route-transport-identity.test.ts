import { describe, expect, it, vi } from 'vitest'

import {
  invokePreparedRouteTransport,
  prepareRegisteredRouteTransportInvocation,
  type RouteTransportFetch,
  type RouteTransportInvocation,
  type RouteTransportRuntime,
  type X402PaymentAuthorizationIdentity,
  type X402PaymentSignatureRequest,
} from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'

const operationDigestOne = 'sha256:' + '1'.repeat(64)
const operationDigestTwo = 'sha256:' + '2'.repeat(64)
const endpoint = 'https://provider.example/operation'
const authorityCommon = {
  attemptRef: 'operation-attempt:one:1',
  mandateDigest: 'sha256:' + '3'.repeat(64),
  grantDigest: 'sha256:' + '4'.repeat(64),
  capabilityContractDigest: 'sha256:' + '5'.repeat(64),
  maximumSpend: { currency: 'USD', units: '1', exponent: 2 },
  expiresAt: Date.now() + 120_000,
  callIdentity: { keyId: 'route-calls:test', signature: 'hmac-sha256:signed' },
} as const

function invocation(operationKeyDigest: string, adapterId: 'http-json:v1' | 'x402-fetch:v2'): RouteTransportInvocation {
  const config = adapterId === 'http-json:v1'
    ? { method: 'POST' as const, requestTimeoutMs: 5_000 }
    : {
        method: 'POST' as const,
        requestTimeoutMs: 5_000,
        scheme: 'exact',
        network: 'eip155:8453',
        currency: 'USD',
        routeAmountExponent: 2,
        assetAmountExponent: 6,
        asset: '0xasset',
        payTo: '0xrecipient',
      }
  return {
    binding: {
      adapterId,
      endpointUrl: endpoint,
      authority: { kind: 'keyless' },
      configJson: JSON.stringify(config),
      configDigest: canonicalDigest(config),
    },
    authority: {
      ...authorityCommon,
      operationKeyDigest,
      effectGeneration: 1,
      callIdentity: { ...authorityCommon.callIdentity, signature: `hmac-sha256:${operationKeyDigest}` },
    },
    inputJson: JSON.stringify({ value: 'same-operation-input' }),
  }

}
async function prepare(invocationValue: RouteTransportInvocation) {
  const result = prepareRegisteredRouteTransportInvocation(invocationValue)
  if (result.kind === 'refused') throw new Error(result.observation.failureCode)
  return result.prepared
}

describe('route transport durable identity binding', () => {
  it('forwards only the canonical operation identity digest as provider Idempotency-Key', async () => {
    const headers: Record<string, string>[] = []
    const send = vi.fn<RouteTransportFetch>(async (_target, init) => {
      headers.push({ ...(init?.headers ?? {}) })
      return Response.json({ ok: true })
    })

    const first = await invokePreparedRouteTransport(await prepare(invocation(operationDigestOne, 'http-json:v1')), {
      send,
      resolveCredential: () => undefined,
    })
    const second = await invokePreparedRouteTransport(await prepare(invocation(operationDigestTwo, 'http-json:v1')), {
      send,
      resolveCredential: () => undefined,
    })

    expect(first).toMatchObject({ disposition: 'succeeded', releaseStarted: true })
    expect(second).toMatchObject({ disposition: 'succeeded', releaseStarted: true })
    expect(headers.map((value) => value['AE-Call-Signature'])).toEqual([
      `hmac-sha256:${operationDigestOne}`,
      `hmac-sha256:${operationDigestTwo}`,
    ])
    expect(headers.map((value) => value['Idempotency-Key'])).toEqual([operationDigestOne, operationDigestTwo])
    expect(headers.every((value) => !value['Idempotency-Key']?.includes('same-operation-input'))).toBe(true)
  })

  it('binds x402 payment identifiers to the same per-attempt identity digest', async () => {
    const paymentIdentifiers: string[] = []
    const run = async (operationKeyDigest: string) => {
      const challenge = {
        x402Version: 2 as const,
        resource: { url: endpoint },
        accepts: [{
          scheme: 'exact',
          network: 'eip155:8453' as const,
          amount: '10000',
          asset: '0xasset',
          payTo: '0xrecipient',
          maxTimeoutSeconds: 60,
          extra: {},
        }],
      }
      const paymentRequired = Buffer.from(JSON.stringify(challenge)).toString('base64')
      const send = vi.fn<RouteTransportFetch>()
        .mockResolvedValueOnce(new Response(null, { status: 402, headers: { 'Payment-Required': paymentRequired } }))
        .mockResolvedValueOnce(Response.json({ ok: true }, { headers: { 'Payment-Response': 'settled' } }))
      const runtime: RouteTransportRuntime = {
        send,
        resolveCredential: () => undefined,
        readX402PaymentCredentialRef: () => 'env:AE_X402_PAYMENT_PRIVATE_KEY',
        validateProviderConnectionAuthority: () => ({ kind: 'valid' as const }),
        prepareX402PaymentAuthorization: async (
          request: X402PaymentSignatureRequest & X402PaymentAuthorizationIdentity,
        ) => {
          paymentIdentifiers.push(request.paymentIdentifier)
          return { custodyRef: `custody:${operationKeyDigest}`, authorizationDigest: `sha256:${'6'.repeat(64)}` }
        },
        readX402PaymentAuthorization: async () => 'signed-payment',
        readX402PaymentAuthorizationByDigest: async () => 'signed-payment',
      }
      return await invokePreparedRouteTransport(await prepare(invocation(operationKeyDigest, 'x402-fetch:v2')), runtime)
    }

    await expect(run(operationDigestOne)).resolves.toMatchObject({ disposition: 'succeeded', releaseStarted: true })
    await expect(run(operationDigestTwo)).resolves.toMatchObject({ disposition: 'succeeded', releaseStarted: true })
    expect(paymentIdentifiers).toEqual([operationDigestOne, operationDigestTwo])
  })
})
