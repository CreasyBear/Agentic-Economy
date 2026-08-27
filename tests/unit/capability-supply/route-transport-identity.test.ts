import { encodePaymentResponseHeader } from '@x402/core/http'
import { validatePaymentRequired } from '@x402/core/schemas'
import type { PaymentRequired } from '@x402/core/types'
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
  const paymentRequired: PaymentRequired = {
    x402Version: 2,
    resource: { url: endpoint },
    accepts: [{
      scheme: 'exact',
      network: 'eip155:8453',
      amount: '10000',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      payTo: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
      maxTimeoutSeconds: 60,
      extra: { name: 'USDC', version: '2' },
    }],
  }
  validatePaymentRequired(paymentRequired)
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
        asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        payTo: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
        paymentRequiredJson: JSON.stringify(paymentRequired),
      }
  return {
    binding: {
      adapterId,
      endpointUrl: endpoint,
      authority: { kind: 'public_upstream' },
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
    const signedSendCounts: number[] = []
    const run = async (operationKeyDigest: string) => {
      const challenge: PaymentRequired = {
        x402Version: 2,
        resource: { url: endpoint },
        accepts: [{
          scheme: 'exact',
          network: 'eip155:8453',
          amount: '10000',
          asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          payTo: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
          maxTimeoutSeconds: 60,
          extra: { name: 'USDC', version: '2' },
        }],
      }
      validatePaymentRequired(challenge)
      const send = vi.fn<RouteTransportFetch>()
        .mockImplementationOnce(async (_target, init) => {
          expect(init?.headers?.['Payment-Signature']).toBe('signed-payment')
          return Response.json({ ok: true }, {
          headers: {
            'Payment-Response': encodePaymentResponseHeader({
              success: true,
              transaction: 'test:identity-binding',
              network: challenge.accepts[0]!.network,
              amount: challenge.accepts[0]!.amount,
              payer: 'test:identity-binding',
            }),
          },
          })
        })
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
        markX402PaymentPossiblySubmitted: () => undefined,
        verifyX402Settlement: async () => true,
      }
      const observed = await invokePreparedRouteTransport(await prepare(invocation(operationKeyDigest, 'x402-fetch:v2')), runtime)
      signedSendCounts.push(send.mock.calls.length)
      return observed
    }

    await expect(run(operationDigestOne)).resolves.toMatchObject({ disposition: 'succeeded', releaseStarted: true })
    await expect(run(operationDigestTwo)).resolves.toMatchObject({ disposition: 'succeeded', releaseStarted: true })
    expect(paymentIdentifiers).toEqual([operationDigestOne, operationDigestTwo])
    expect(signedSendCounts).toEqual([1, 1])
  })
})
