import { describe, expect, it } from 'vitest'
import { validatePaymentRequired } from '@x402/core/schemas'

import {
  admitRegisteredTransport,
  parseAdmittedX402CatalogPayment,
} from '@/modules/capability-supply/public'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
const providerAuthority = {
  kind: 'provider_connection',
  connectionRef: 'connection:payment',
  providerRef: 'provider:payment',
} as const
const paymentRequiredJson = stableStringify(validatePaymentRequired({
  x402Version: 2,
  resource: { url: 'https://example.test/paid-capability' },
  accepts: [{
    scheme: 'exact', network: 'eip155:84532', amount: '10000',
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    payTo: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
    maxTimeoutSeconds: 60, extra: { name: 'USDC', version: '2' },
  }],
}) as StableHashValue)


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
        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        payTo: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
        paymentRequiredJson,
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
      asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
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
      asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      payTo: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
      paymentRequiredJson,
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
