import { describe, expect, it, vi } from 'vitest'
import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { admitFacilitatorDiscoveryItems } from '@/modules/capability-supply/server'
import { timezonePaymentRequired20260819Fixture as timezoneFixture } from '@/modules/capability-supply/public'
import type { RouteTransportFetch } from '@/modules/capability-supply/route-transport-runtime'
import { authority, invocation, invokeRouteTransport, preparedX402Custody, providerAuthority, registeredBinding } from './route-transport-test-harness'

const target = 'https://provider.example/request'
const challenge = (amount: string) => ({ x402Version: 2 as const, resource: { url: target }, accepts: [{
  scheme: 'exact', network: 'eip155:84532' as const, amount,
  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  payTo: '0x0000000000000000000000000000000000000002', maxTimeoutSeconds: 60,
  extra: { name: 'USDC', version: '2' },
}] })

describe('Quote-committed x402 request', () => {
  it.each(['250', '300', 'timeout', 'signer_unavailable'])('uses committed amount 250 rather than listing 100 and checks fresh outcome %s', async (freshAmount) => {
    const listed = challenge('100')
    const accepted = challenge('250')
    const send = vi.fn<RouteTransportFetch>(async (_url, init) => {
      expect(init?.body).toBe('{"query":"actual"}')
      if (freshAmount === 'timeout') throw new DOMException('Request timed out', 'TimeoutError')
      if (init?.headers?.['Payment-Signature'] === undefined) return new Response(null, { status: 402,
        headers: { 'Payment-Required': encodePaymentRequiredHeader(challenge(freshAmount === 'signer_unavailable' ? '250' : freshAmount)) } })
      return Response.json({ answer: true }, { headers: { 'Payment-Response': encodePaymentResponseHeader({
        success: true, transaction: '0xsettled', network: 'eip155:84532', amount: '250', payer: 'test:payer',
      }) } })
    })
    const sign = vi.fn(async () => freshAmount === 'signer_unavailable' ? undefined : 'signature')
    const result = await invokeRouteTransport({
      ...invocation({ binding: registeredBinding('x402-fetch:v2', target, providerAuthority, {
        method: 'POST', bodyPointer: '/body', requestTimeoutMs: 5000, scheme: 'exact', network: 'eip155:84532', currency: 'USD',
        routeAmountExponent: 6, assetAmountExponent: 6, asset: listed.accepts[0]!.asset, payTo: listed.accepts[0]!.payTo,
        paymentRequiredJson: JSON.stringify(listed),
      }), authority: { ...authority, maximumSpend: { currency: 'USD', units: '250', exponent: 6 } }, inputJson: '{"body":{"query":"actual"}}' }),
      committedPaymentRequiredJson: JSON.stringify(accepted),
    }, { send, resolveCredential: () => undefined, ...preparedX402Custody(sign), markX402PaymentPossiblySubmitted: () => undefined })
    if (freshAmount === '250') {
      expect(result.disposition).toBe('succeeded')
      expect(sign).toHaveBeenCalledWith(expect.objectContaining({ selectedRequirement: expect.objectContaining({ amount: '250' }) }))
      expect(send).toHaveBeenCalledTimes(2)
    } else {
      expect(result).toMatchObject({ disposition: 'refused',
        failureCode: freshAmount === 'timeout' ? 'network_timeouterror'
          : freshAmount === 'signer_unavailable' ? 'payment_signature_unavailable' : 'payment_provider_requirement_stale',
        queryReleaseStatus: freshAmount === 'timeout' ? 'unknown' : 'released', paymentSubmissionStatus: 'not_submitted' })
      expect(sign).toHaveBeenCalledTimes(freshAmount === 'signer_unavailable' ? 1 : 0)
      expect(send).toHaveBeenCalledTimes(1)
    }
  })
})

it('executes a real admitted Bazaar binding with USDC authority and the selected request amount', async () => {
  const admitted = await admitFacilitatorDiscoveryItems([structuredClone(timezoneFixture.paymentRequired)])
  expect(admitted.skipped).toEqual([])
  const draft = admitted.admitted[0]!
  expect(draft.binding.adapter.config.currency).toBe('USDC')
  if (draft.binding.authority.kind !== 'provider_connection') throw new Error('fixture_authority_missing')
  const committed = { ...timezoneFixture.paymentRequired,
    accepts: timezoneFixture.paymentRequired.accepts.map(requirement => ({ ...requirement, amount: '250' })),
  } as Parameters<typeof encodePaymentRequiredHeader>[0]
  const send = vi.fn<RouteTransportFetch>(async (url, init) => {
    expect(url.searchParams.getAll('from')).toEqual(['America/New_York'])
    expect(url.searchParams.getAll('to')).toEqual(['Asia/Tokyo'])
    if (init?.headers?.['Payment-Signature'] === undefined) return new Response(null, { status: 402,
      headers: { 'Payment-Required': encodePaymentRequiredHeader(committed) } })
    return Response.json({ converted: '2026-07-05T04:30' }, { headers: { 'Payment-Response': encodePaymentResponseHeader({
      success: true, transaction: '0xreal-binding-fixture', network: 'eip155:8453', amount: '250', payer: 'test:payer',
    }) } })
  })
  const sign = vi.fn(async () => 'signature')
  const result = await invokeRouteTransport({
    binding: {
      adapterId: draft.binding.adapter.adapterId, endpointUrl: draft.execution.endpoint.url,
      authority: draft.binding.authority, configJson: JSON.stringify(draft.binding.adapter.config),
      configDigest: canonicalDigest(draft.binding.adapter.config),
    },
    authority: { ...authority, maximumSpend: { currency: 'USDC', units: '250', exponent: 6 } },
    inputJson: JSON.stringify({ from: 'America/New_York', to: 'Asia/Tokyo', time: '2026-07-04T15:30' }),
    committedPaymentRequiredJson: JSON.stringify(committed),
  }, { send, resolveCredential: () => undefined, validateProviderConnectionAuthority: () => ({ kind: 'valid' }),
    ...preparedX402Custody(sign), markX402PaymentPossiblySubmitted: () => undefined })
  expect(result.disposition).toBe('succeeded')
  expect(sign).toHaveBeenCalledWith(expect.objectContaining({ selectedRequirement: expect.objectContaining({ amount: '250' }) }))
  expect(send).toHaveBeenCalledTimes(2)
})
