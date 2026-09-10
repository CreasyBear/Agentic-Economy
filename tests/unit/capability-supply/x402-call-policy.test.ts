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
const canaryContext = {
  kind: 'seller_onboarding_canary',
  paymentProfile: 'base-sepolia-usdc-exact',
  canaryRef: 'seller-canary:test',
  canaryCommitmentDigest: `sha256:${'a'.repeat(64)}`,
  fundingBudgetRef: 'budget:canary:test',
} as const

describe('payment lane admission', () => {
  it('selects one brokered market rail in sandbox and production', () => {
    expect(economicRailForCall({
      isX402: true,
      sellerOnboardingCanary: false,
    })).toBe('brokered_x402')
    expect(economicRailForCall({
      isX402: false,
      sellerOnboardingCanary: false,
    })).toBe('ae_internal')
    expect(economicRailForCall({
      isX402: true,
      sellerOnboardingCanary: true,
    })).toBe('managed_testnet_canary')
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

  it('admits only the complete sandbox canary context onto the managed testnet rail', () => {
    expect(paymentLaneAdmission({
      rail: 'managed_testnet_canary',
      environment: 'sandbox',
      executionContext: canaryContext,
    })).toEqual({
      kind: 'admitted',
      lane: 'managed_testnet_canary',
    })
  })

  it.each([
    ['production canary', 'managed_testnet_canary', 'production', canaryContext],
    ['market on managed rail', 'managed_testnet_canary', 'sandbox', sandboxMarketContext],
    ['canary on brokered rail', 'brokered_x402', 'sandbox', canaryContext],
    ['canary on provider-direct rail', 'provider_direct_x402', 'sandbox', canaryContext],
    ['canary on internal rail', 'ae_internal', 'sandbox', canaryContext],
    ['managed rail without context', 'managed_testnet_canary', 'sandbox', undefined],
    ['partial canary context', 'managed_testnet_canary', 'sandbox', {
      kind: 'seller_onboarding_canary',
      paymentProfile: 'base-sepolia-usdc-exact',
      canaryRef: 'seller-canary:test',
      canaryCommitmentDigest: `sha256:${'a'.repeat(64)}`,
    }],
  ] as const)('refuses %s', (_label, rail, environment, executionContext) => {
    expect(paymentLaneAdmission({
      rail,
      environment,
      ...(executionContext === undefined
        ? {}
        : { executionContext: executionContext as never }),
    })).toEqual({
      kind: 'refused',
      lane: rail,
      code: 'payment_lane_execution_context_invalid',
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
