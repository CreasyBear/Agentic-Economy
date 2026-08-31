import { describe, expect, it, vi } from 'vitest'

import {
  BASE_MAINNET_NETWORK,
  BASE_MAINNET_USDC_ADDRESS,
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
  type X402AeEnvironment,
} from '@/modules/capability-supply/server'
import {
  inspectX402SellerEndpoint,
  type X402SellerEndpointMethod,
} from '@/modules/capability-supply/server'
import {
  encodeX402PaymentRequiredHeader,
  type X402PaymentRequired,
} from '@/modules/capability-supply/server'
import syntheticPost from '@/modules/capability-supply/internal/x402-bazaar-fixtures/synthetic-post-payment-required.json'

const endpointUrl = 'https://seller.example.test/v1/enrich'

function supportedAccept(overrides: Record<string, unknown> = {}) {
  return {
    scheme: 'exact',
    network: BASE_MAINNET_NETWORK,
    amount: '1000',
    asset: BASE_MAINNET_USDC_ADDRESS,
    payTo: '0x0000000000000000000000000000000000000002',
    maxTimeoutSeconds: 60,
    extra: {
      assetTransferMethod: 'eip3009',
      name: 'USDC',
      version: '2',
    },
    ...overrides,
  }
}

function challenge(accepts: ReturnType<typeof supportedAccept>[] = [supportedAccept()]): X402PaymentRequired {
  return {
    x402Version: 2,
    resource: { url: endpointUrl },
    accepts: accepts as X402PaymentRequired['accepts'],
  }
}

function paymentRequiredResponse(
  document: X402PaymentRequired = challenge(),
  body?: unknown,
): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status: 402,
    headers: {
      'content-type': 'application/json',
      'payment-required': encodeX402PaymentRequiredHeader(document),
    },
  })
}

async function inspect(
  send: (request: Request) => Promise<Response>,
  method: X402SellerEndpointMethod = 'POST',
  now = 1_000,
  aeEnvironment: X402AeEnvironment = 'production',
) {
  return inspectX402SellerEndpoint(
    { endpointUrl, method, postBody: { query: 'Ada' }, aeEnvironment },
    {
      now: () => now,
      validatePublicTarget: async () => true,
      send,
    },
  )
}

describe('x402 seller endpoint inspector', () => {
  it.each(['GET', 'POST'] as const)(
    'makes an unpaid %s request, refuses redirects, and records no usage verification',
    async (method) => {
      const send = vi.fn(async (request: Request) => {
        expect(request.method).toBe(method)
        expect(request.redirect).toBe('manual')
        expect(request.headers.get('payment')).toBeNull()
        expect(request.headers.get('payment-signature')).toBeNull()
        expect(request.headers.get('x-payment')).toBeNull()
        expect(request.headers.get('x-payment-signature')).toBeNull()
        if (method === 'GET') await expect(request.text()).resolves.toBe('')
        else await expect(request.json()).resolves.toEqual({ query: 'Ada' })
        return paymentRequiredResponse()
      })

      const result = await inspect(send, method)

      expect(result).toMatchObject({
        kind: 'observed',
        authority: 'observed_external',
        canonical: false,
        usageVerified: false,
        backend: { method, resource: endpointUrl },
        payment: { selection: { kind: 'selected' } },
        probe: { status: 'payment_required', httpStatus: 402, observedAt: 1_000 },
      })
      expect(send).toHaveBeenCalledOnce()
    },
  )

  it('refuses a redirect instead of following it', async () => {
    const result = await inspect(async () => new Response(null, {
      status: 307,
      headers: { location: 'https://other.example.test/pay' },
    }))

    expect(result).toMatchObject({
      kind: 'refused',
      reason: 'redirect_refused',
      probe: { httpStatus: 307 },
    })
  })

  it('refuses a malformed challenge', async () => {
    const result = await inspect(async () => new Response(null, {
      status: 402,
      headers: { 'payment-required': 'not-a-valid-x402-header' },
    }))

    expect(result).toMatchObject({
      kind: 'refused',
      reason: 'challenge_malformed',
    })
  })

  it('decodes a valid PaymentRequired JSON body when the header is absent', async () => {
    const result = await inspect(async () => new Response(JSON.stringify(challenge()), {
      status: 402,
      headers: { 'content-type': 'application/json' },
    }))

    expect(result).toMatchObject({
      kind: 'observed',
      payment: { selection: { kind: 'selected' } },
    })
  })

  it('refuses a malformed PaymentRequired JSON body when the header is absent', async () => {
    const result = await inspect(async () => new Response(JSON.stringify({
      x402Version: 2,
      resource: { url: endpointUrl },
      accepts: [{ scheme: 'exact' }],
    }), {
      status: 402,
      headers: { 'content-type': 'application/json' },
    }))

    expect(result).toMatchObject({
      kind: 'refused',
      reason: 'challenge_malformed',
    })
  })

  it('returns an actionable unsupported result while preserving every advertised alternative', async () => {
    const alternatives = [
      supportedAccept({ network: 'eip155:137' }),
      supportedAccept({ scheme: 'upto' }),
    ]
    const result = await inspect(async () => paymentRequiredResponse(challenge(alternatives)))

    expect(result).toMatchObject({
      kind: 'observed',
      payment: {
        selection: {
          kind: 'unsupported',
          reason: 'no_base_mainnet_usdc_exact_eip3009_lane',
        },
      },
    })
    if (result.kind !== 'observed') throw new Error('expected observation')
    expect(result.payment.accepts).toHaveLength(2)
    expect(result.payment.accepts.every(({ supportedByAe }) => !supportedByAe)).toBe(true)
  })

  it('selects Base Sepolia USDC only for sandbox inspection', async () => {
    const sandboxAccept = supportedAccept({
      network: BASE_SEPOLIA_NETWORK,
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      extra: { name: 'USDC', version: '2' },
    })
    const sandbox = await inspect(
      async () => paymentRequiredResponse(challenge([sandboxAccept])),
      'POST',
      1_000,
      'sandbox',
    )
    const production = await inspect(
      async () => paymentRequiredResponse(challenge([sandboxAccept])),
      'POST',
      1_000,
      'production',
    )

    expect(sandbox).toMatchObject({
      kind: 'observed',
      payment: {
        profile: 'base-sepolia-usdc-exact',
        selection: { kind: 'selected' },
      },
    })
    expect(production).toMatchObject({
      kind: 'observed',
      payment: { selection: { kind: 'unsupported' } },
    })
    if (sandbox.kind !== 'observed') throw new Error('expected sandbox observation')
    expect(sandbox.payment.accepts[0]?.extra.assetTransferMethod).toBe('eip3009')
  })

  it('canonically observes an admitted POST Bazaar contract without an undefined query field', async () => {
    const document = {
      ...structuredClone(syntheticPost),
      resource: { ...syntheticPost.resource, url: endpointUrl },
      accepts: [supportedAccept({
        network: BASE_SEPOLIA_NETWORK,
        asset: BASE_SEPOLIA_USDC_ADDRESS,
      })],
    } as unknown as X402PaymentRequired

    const result = await inspect(
      async () => paymentRequiredResponse(document),
      'POST',
      1_000,
      'sandbox',
    )

    expect(result).toMatchObject({
      kind: 'observed',
      discovery: { kind: 'admitted', method: 'POST' },
    })
    if (result.kind !== 'observed' || result.discovery.kind !== 'admitted') {
      throw new Error('expected admitted Bazaar observation')
    }
    expect(Object.hasOwn(result.discovery, 'query')).toBe(false)
    expect(result.digest).toMatch(/^sha256:[0-9a-f]{64}$/u)
  })

  it('collapses omitted and explicit EIP-3009 declarations into one lane identity', async () => {
    const omitted = supportedAccept({
      extra: { name: 'USD Coin', version: '2' },
    })
    const explicit = supportedAccept({
      extra: { assetTransferMethod: 'eip3009', name: 'USD Coin', version: '2' },
    })
    const result = await inspect(
      async () => paymentRequiredResponse(challenge([omitted, explicit])),
    )

    expect(result).toMatchObject({
      kind: 'observed',
      payment: { selection: { kind: 'selected' } },
    })
    if (result.kind !== 'observed') throw new Error('expected observation')
    expect(result.payment.accepts).toHaveLength(1)
  })

  it.each([
    ['Base mainnet lane', { network: BASE_MAINNET_NETWORK, asset: BASE_MAINNET_USDC_ADDRESS }],
    ['mainnet asset on Sepolia', { network: BASE_SEPOLIA_NETWORK, asset: BASE_MAINNET_USDC_ADDRESS }],
    ['Sepolia asset on mainnet', { network: BASE_MAINNET_NETWORK, asset: BASE_SEPOLIA_USDC_ADDRESS }],
    ['zero amount', { network: BASE_SEPOLIA_NETWORK, asset: BASE_SEPOLIA_USDC_ADDRESS, amount: '0' }],
    ['overlong amount', { network: BASE_SEPOLIA_NETWORK, asset: BASE_SEPOLIA_USDC_ADDRESS, amount: '1'.repeat(79) }],
  ] as const)('does not select %s for a sandbox profile', async (_label, overrides) => {
    const alternative = supportedAccept(overrides)
    const result = await inspect(
      async () => paymentRequiredResponse(challenge([alternative])),
      'POST',
      1_000,
      'sandbox',
    )

    expect(result).toMatchObject({
      kind: 'observed',
      payment: {
        profile: 'base-sepolia-usdc-exact',
        selection: {
          kind: 'unsupported',
          reason: 'no_base_sepolia_usdc_exact_eip3009_lane',
        },
      },
    })
  })

  it('does not silently choose when multiple AE-supported lanes are advertised', async () => {
    const alternatives = [
      supportedAccept({ amount: '1000' }),
      supportedAccept({ amount: '2000' }),
    ]
    const result = await inspect(async () => paymentRequiredResponse(challenge(alternatives)))

    expect(result).toMatchObject({
      kind: 'observed',
      payment: { selection: { kind: 'ambiguous' } },
    })
    if (result.kind !== 'observed' || result.payment.selection.kind !== 'ambiguous') {
      throw new Error('expected ambiguous observation')
    }
    expect(result.payment.selection.alternativeIds).toHaveLength(2)
  })

  it('refuses HTTP 402 with neither a PaymentRequired header nor body', async () => {
    const result = await inspect(async () => new Response(null, { status: 402 }))

    expect(result).toMatchObject({
      kind: 'refused',
      reason: 'challenge_missing',
    })
  })

  it('produces stable identities and digest independent of observation time and accepts order', async () => {
    const first = supportedAccept({ amount: '1000' })
    const second = supportedAccept({ amount: '2000' })
    const left = await inspect(
      async () => paymentRequiredResponse(challenge([first, second])),
      'POST',
      1_000,
    )
    const right = await inspect(
      async () => paymentRequiredResponse(challenge([second, first])),
      'POST',
      9_000,
    )

    if (left.kind !== 'observed' || right.kind !== 'observed') {
      throw new Error('expected observations')
    }
    expect(right.endpoint.endpointId).toBe(left.endpoint.endpointId)
    expect(right.backend.backendId).toBe(left.backend.backendId)
    expect(right.payment.accepts).toEqual(left.payment.accepts)
    expect(right.digest).toBe(left.digest)
    expect(right.probe.observedAt).not.toBe(left.probe.observedAt)
  })

  it('validates HTTPS syntax and public reachability before sending', async () => {
    const send = vi.fn(async () => paymentRequiredResponse())
    const malformed = await inspectX402SellerEndpoint(
      { endpointUrl: 'http://127.0.0.1/pay', method: 'GET' },
      { validatePublicTarget: async () => true, send },
    )
    const privateTarget = await inspectX402SellerEndpoint(
      { endpointUrl, method: 'GET' },
      { validatePublicTarget: async () => false, send },
    )

    expect(malformed).toMatchObject({ kind: 'refused', reason: 'target_invalid' })
    expect(privateTarget).toMatchObject({ kind: 'refused', reason: 'target_not_public' })
    expect(send).not.toHaveBeenCalled()
  })
})
