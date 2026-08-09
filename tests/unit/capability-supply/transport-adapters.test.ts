import { describe, expect, it } from 'vitest'

import {
  admitRegisteredTransport,
  parseAdmittedX402CatalogPayment,
} from '@/modules/capability-supply/public'
const providerAuthority = {
  kind: 'provider_connection',
  connectionRef: 'connection:payment',
  providerRef: 'provider:payment',
} as const


describe('admitted x402 catalog payment metadata', () => {
  it('accepts a CAIP-2 x402 v2 config and returns only the fixed payment metadata', () => {
    const admitted = admitRegisteredTransport({
      adapterId: 'x402-fetch:v2',
      endpointUrl: 'https://example.test/paid-capability',
      authority: providerAuthority,
      continuation: { kind: 'single_response', evidenceRefs: ['evidence:response'] },
      cancellation: { kind: 'unsupported', evidenceRefs: ['evidence:cancellation'] },
      config: {
        method: 'POST',
        requestTimeoutMs: 5_000,
        scheme: 'exact',
        network: 'eip155:84532',
        currency: 'USDC',
        routeAmountExponent: 2,
        assetAmountExponent: 6,
        asset: '0x0000000000000000000000000000000000000001',
        payTo: '0x0000000000000000000000000000000000000002',
      },
    })
    expect(admitted.kind).toBe('admitted')
    if (admitted.kind !== 'admitted') throw new Error('x402_transport_not_admitted')

    const payment = parseAdmittedX402CatalogPayment(
      admitted.transport.adapterId,
      admitted.transport.configJson,
    )

    expect(payment).toEqual({
      network: 'eip155:84532',
      asset: '0x0000000000000000000000000000000000000001',
      currency: 'USDC',
      routeAmountExponent: 2,
      assetAmountExponent: 6,
    })
    expect(Object.keys(payment ?? {}).sort()).toEqual([
      'asset',
      'assetAmountExponent',
      'currency',
      'network',
      'routeAmountExponent',
    ])
    expect(payment).not.toHaveProperty('payTo')
  })

  it('rejects legacy and malformed x402 metadata without fabricating payment data', () => {
    const validConfig = {
      method: 'POST' as const,
      requestTimeoutMs: 5_000,
      scheme: 'exact' as const,
      network: 'eip155:84532',
      currency: 'USDC',
      routeAmountExponent: 2,
      assetAmountExponent: 6,
      asset: '0x0000000000000000000000000000000000000001',
      payTo: '0x0000000000000000000000000000000000000002',
    }
    for (const network of ['Base', 'eip155:', ':8453']) {
      expect(parseAdmittedX402CatalogPayment(
        'x402-fetch:v2',
        JSON.stringify({ ...validConfig, network }),
      )).toBeUndefined()
    }
    for (const currency of ['usd', '']) {
      expect(parseAdmittedX402CatalogPayment(
        'x402-fetch:v2',
        JSON.stringify({ ...validConfig, currency }),
      )).toBeUndefined()
    }
  })

  it('rejects malformed JSON and non-x402 adapters without fabricating payment metadata', () => {
    expect(parseAdmittedX402CatalogPayment('x402-fetch:v2', '{')).toBeUndefined()
    expect(parseAdmittedX402CatalogPayment(
      'http-json:v1',
      JSON.stringify({
        method: 'POST',
        requestTimeoutMs: 5_000,
        scheme: 'exact',
        network: 'eip155:84532',
        currency: 'USDC',
        routeAmountExponent: 2,
        assetAmountExponent: 6,
        asset: '0x0000000000000000000000000000000000000001',
        payTo: '0x0000000000000000000000000000000000000002',
      }),
    )).toBeUndefined()
  })
})
