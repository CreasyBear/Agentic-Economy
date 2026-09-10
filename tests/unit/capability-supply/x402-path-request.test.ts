import { describe, expect, it, vi } from 'vitest'
import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { validateJsonSchema } from '@/modules/capability-contract/public'
import { admitFacilitatorDiscoveryItems, admitOfficialBazaarFromPaymentRequired, prepareX402Request } from '@/modules/capability-supply/server'
import { inspectLiveX402Requirement } from '@/modules/capability-execution/live-x402-requirement'
import {
  onesourcePathRequest20260908Fixture as pathFixture,
  onesourceUnionRequest20260908Fixture as unionFixture,
} from '@/modules/capability-supply/public'
import { authority, invokeRouteTransport, preparedX402Custody } from './route-transport-test-harness'

describe('managed x402 path requests', () => {
  it('admits the captured ERC20 transfer union and retains block-value validation', async () => {
    const admitted = await admitFacilitatorDiscoveryItems([unionFixture])
    expect(admitted.skipped).toEqual([])
    expect(admitted.admitted).toHaveLength(1)
    const declaration = admitOfficialBazaarFromPaymentRequired(unionFixture)
    if (declaration.kind !== 'admitted') throw new Error('union_fixture_not_admitted')
    for (const from_block of [0, 'latest', '0xabc']) {
      expect(validateJsonSchema(declaration.inputSchema, { from_block })).toBe(true)
    }
    for (const from_block of [-1, 'invalid', {}]) {
      expect(validateJsonSchema(declaration.inputSchema, { from_block })).toBe(false)
    }
  })

  it('admits the captured OneSource transaction declaration and preserves its path schema', async () => {
    const admitted = await admitFacilitatorDiscoveryItems([pathFixture])
    expect(admitted.skipped).toEqual([])
    expect(admitted.admitted).toHaveLength(1)
    const draft = admitted.admitted[0]!
    expect(draft.binding.adapter.config).toMatchObject({ pathTemplate: '/api/chain/tx/{hash}',
      path: [{ inputPointer: '/pathParams/hash', parameter: 'hash' }], query: [{ inputPointer: '/network', parameter: 'network' }] })
    const declaration = admitOfficialBazaarFromPaymentRequired(pathFixture)
    if (declaration.kind !== 'admitted') throw new Error('path_fixture_not_admitted')
    expect(validateJsonSchema(declaration.inputSchema, { pathParams: { hash: `0x${'a'.repeat(64)}` }, network: 'ethereum' })).toBe(true)
    expect(validateJsonSchema(declaration.inputSchema, { pathParams: { hash: 'invalid' } })).toBe(false)
    expect(validateJsonSchema(declaration.inputSchema, { network: 'ethereum' })).toBe(false)
  })

  it.each(['hello world', 'a/b?x=1#fragment', '100%', 'éthereum'])('encodes %s as one segment using the existing HTTP serializer', value => {
    const result = prepareX402Request(new URL('https://provider.example/tx/:hash?fixed=yes'), {
      method: 'GET', query: [], pathTemplate: '/tx/{hash}', path: [{ inputPointer: '/pathParams/hash', parameter: 'hash' }],
    }, JSON.stringify({ pathParams: { hash: value } }))
    expect(result.kind).toBe('prepared')
    if (result.kind !== 'prepared') return
    expect(result.target.href).toBe(`https://provider.example/tx/${encodeURIComponent(value)}?fixed=yes`)
  })

  it.each([{}, { hash: '..' }, { hash: '.' }])('refuses missing or traversing segments %j before any request', pathParams => {
    expect(prepareX402Request(new URL('https://provider.example/tx/:hash'), {
      method: 'GET', query: [], pathTemplate: '/tx/{hash}', path: [{ inputPointer: '/pathParams/hash', parameter: 'hash' }],
    }, JSON.stringify({ pathParams })).kind).toBe('refused')
  })

  it('uses the identical concrete path and query for Quote inspection and paid execution', async () => {
    const admitted = await admitFacilitatorDiscoveryItems([pathFixture])
    expect(admitted.skipped).toEqual([])
    const draft = admitted.admitted[0]!
    const config = draft.binding.adapter.config
    if (draft.binding.authority.kind !== 'provider_connection') throw new Error('path_fixture_authority_missing')
    const input = { pathParams: { hash: `0x${'b'.repeat(64)}` }, network: 'sepolia' }
    const expectedUrl = `https://api.onesource.io/api/chain/tx/${input.pathParams.hash}?network=sepolia`
    const paymentRequired = { ...pathFixture, resource: { url: expectedUrl },
      accepts: pathFixture.accepts.map(requirement => ({ ...requirement, network: 'eip155:8453' as const, maxTimeoutSeconds: 60 })) }
    const unpaid = () => new Response(null, { status: 402, headers: { 'payment-required': encodePaymentRequiredHeader(paymentRequired) } })
    const quoteSend = vi.fn(async (request: Request) => { expect(request.url).toBe(expectedUrl); return unpaid() })
    const observed = await inspectLiveX402Requirement({
      runtimeEnvironment: 'production',
      pricingConfig: { version: 'pricing:v3', kind: 'managed_x402', effectTiming: 'payment_required_before_effect',
        sourceRequirement: { network: config.network, asset: config.asset, atomicUnits: '8000' },
        pricingPolicyRef: 'pricing-policy:managed-x402:v1', publicDisplay: 'on_request' },
      identity: { endpoint: { url: draft.execution.endpoint.url, method: 'GET' },
        payment: { kind: 'x402', network: config.network, asset: config.asset, payTo: config.payTo,
          currency: 'USDC', routeAmountExponent: 6, assetAmountExponent: 6 } },
      transport: { configJson: JSON.stringify(config) },
    }, input, { validatePublicTarget: async () => true, send: quoteSend })
    expect(observed.kind).toBe('observed')
    if (observed.kind !== 'observed') throw new Error('path_quote_not_observed')
    const send = vi.fn(async (url: URL, init?: { headers?: Readonly<Record<string, string>> }) => {
      expect(url.href).toBe(expectedUrl)
      return init?.headers?.['Payment-Signature'] === undefined ? unpaid() : Response.json({ result: true }, {
        headers: { 'payment-response': encodePaymentResponseHeader({ success: true, transaction: '0xpath', network: 'eip155:8453', amount: '8000', payer: 'test:payer' }) },
      })
    })
    const sign = vi.fn(async () => 'signature')
    const result = await invokeRouteTransport({
      binding: { adapterId: 'x402-fetch:v2', endpointUrl: draft.execution.endpoint.url, authority: draft.binding.authority,
        configJson: JSON.stringify(config), configDigest: canonicalDigest(config) },
      authority: { ...authority, maximumSpend: { currency: 'USDC', units: '8000', exponent: 6 } },
      inputJson: JSON.stringify(input), committedPaymentRequiredJson: observed.requirement.paymentRequiredJson,
    }, { send, resolveCredential: () => undefined, validateProviderConnectionAuthority: () => ({ kind: 'valid' }),
      ...preparedX402Custody(sign), markX402PaymentPossiblySubmitted: () => undefined })
    expect(result.disposition).toBe('succeeded')
    expect(quoteSend).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledTimes(2)
    expect(sign).toHaveBeenCalledOnce()
  })
})
