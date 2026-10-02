import { describe, expect, it } from 'vitest'

import {
  economicRailForCall,
  paymentLaneAdmission,
} from '@/modules/capability-supply/server'

const environments = ['sandbox', 'development', 'production'] as const
const sandboxMarketContext = {
  kind: 'market',
  paymentProfile: 'base-sepolia-usdc-exact',
} as const

describe('payment lane admission', () => {
  it('selects one brokered market rail in sandbox and production', () => {
    expect(economicRailForCall({ isX402: true })).toBe('brokered_x402')
    expect(economicRailForCall({ isX402: false })).toBe('ae_internal')
  })

  it('admits the AE-brokered rail in every environment', () => {
    for (const environment of environments) {
      expect(paymentLaneAdmission({ rail: 'ae_internal', environment })).toEqual({
        kind: 'admitted',
        lane: 'brokered',
      })
    }
  })

  it('admits the provider-direct x402 rail outside production', () => {
    for (const environment of ['sandbox', 'development'] as const) {
      expect(paymentLaneAdmission({ rail: 'provider_direct_x402', environment })).toEqual({
        kind: 'admitted',
        lane: 'provider_direct_x402',
      })
    }
  })

  it('refuses the provider-direct x402 rail in production', () => {
    expect(paymentLaneAdmission({ rail: 'provider_direct_x402', environment: 'production' })).toEqual({
      kind: 'refused',
      lane: 'provider_direct_x402',
      code: 'payment_lane_not_brokered',
    })
  })

  it('keeps provider-direct sandbox market calls admitted without managed context', () => {
    expect(paymentLaneAdmission({
      rail: 'provider_direct_x402',
      environment: 'sandbox',
      executionContext: sandboxMarketContext,
    })).toEqual({
      kind: 'admitted',
      lane: 'provider_direct_x402',
    })
  })
})
