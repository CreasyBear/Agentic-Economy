import { describe, expect, it } from 'vitest'

import {
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC,
  LOCAL_X402_EVIDENCE_CEILING,
  runDevelopmentX402Canary,
  runDevelopmentX402LocalCanary,
} from '../../../tools/dev/x402-local-canary'

describe('development x402 local canary', () => {
  it('proves the dynamic provider path through the official x402 wire flow without AE money effects', async () => {
    const result = await runDevelopmentX402LocalCanary({ symbol: 'BTC', quote: 'USD' })

    expect(result.mode).toBe('development-local-protocol-wire-emulator')
    expect(result.request.path).toBe('/dev/x402/quote/BTC?quote=USD')
    expect(result.challenge.accepts[0]).toMatchObject({
      scheme: 'exact',
      network: BASE_SEPOLIA_NETWORK,
      asset: BASE_SEPOLIA_USDC,
      amount: '10000',
      extra: { name: 'USDC', version: '2' },
    })
    expect(result.challenge.extensions?.['payment-identifier']).toMatchObject({ info: { required: true } })
    expect(result.payment.payload.extensions?.['payment-identifier']).toMatchObject({
      info: { required: true, id: result.payment.identifier },
    })
    expect(result.providerOutput).toEqual({
      schemaVersion: 'development-x402-quote.v1',
      operation: 'spot_quote',
      symbol: 'BTC',
      quote: 'USD',
      price: '60000.00',
      providerRef: 'development-local-x402-provider',
    })
    expect(result.settlement).toMatchObject({
      source: 'development-fake-facilitator',
      blockchainSettlement: false,
      response: {
        success: true,
        transaction: `local-facilitator:${result.payment.identifier}`,
        network: BASE_SEPOLIA_NETWORK,
      },
    })
    expect(result.routeObservation).toMatchObject({
      transport: 'x402',
      disposition: 'succeeded',
      paymentAuthorizationStatus: 'created',
      paymentSubmissionStatus: 'observed',
      settlementEvidence: expect.objectContaining({ kind: 'settled' }),
    })
    expect(JSON.parse(result.routeObservation.outputJson ?? 'null')).toEqual(result.providerOutput)
    expect(result.routeObservation.requestDigest).toMatch(/^sha256:/)
    expect(result.routeObservation.responseDigest).toMatch(/^sha256:/)
    expect(result.economicEffects).toEqual({
      aeCreditDebit: false,
      providerEarningsAccrual: false,
      aeRake: false,
    })
    expect(result.evidenceCeiling).toBe(LOCAL_X402_EVIDENCE_CEILING)
  })

  it('changes the schema-valid output when the dynamic operation path changes', async () => {
    const btc = await runDevelopmentX402LocalCanary({ symbol: 'BTC', quote: 'USD' })
    const eth = await runDevelopmentX402LocalCanary({ symbol: 'ETH', quote: 'USD' })

    expect(eth.request.path).toBe('/dev/x402/quote/ETH?quote=USD')
    expect(eth.providerOutput.symbol).toBe('ETH')
    expect(eth.providerOutput.price).not.toBe(btc.providerOutput.price)
  })

  it('keeps the opt-in testnet path closed until server-only credentials are configured', async () => {
    const result = await runDevelopmentX402Canary({
      mode: 'testnet',
      environment: {},
    })

    expect(result).toMatchObject({
      kind: 'refused',
      mode: 'testnet',
      code: 'x402_testnet_prerequisite_missing',
      requiredEnvironment: [
        'AE_X402_CANARY_PROVIDER_URL',
        'AE_X402_PAYMENT_PRIVATE_KEY',
      ],
    })
    if (result.kind !== 'refused') throw new Error('expected testnet refusal')
    expect(result.prerequisite).toContain('Set these server-only environment variables')
  })
})
