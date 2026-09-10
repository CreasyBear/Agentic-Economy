import { describe, expect, it } from 'vitest'

import {
  BASE_MAINNET_NETWORK,
  BASE_MAINNET_USDC_ADDRESS,
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
  isX402PaymentRequirementForProfile,
  normalizeX402PaymentRequirement,
  x402PaymentProfileForEnvironment,
} from '@/modules/capability-supply/public'

describe('x402 payment profile', () => {
  it('binds sandbox to Base Sepolia USDC and production to Base mainnet USDC', () => {
    expect(x402PaymentProfileForEnvironment('sandbox')).toEqual({
      profile: 'base-sepolia-usdc-exact',
      aeEnvironment: 'sandbox',
      network: BASE_SEPOLIA_NETWORK,
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      scheme: 'exact',
      transferMethod: 'eip3009',
    })
    expect(x402PaymentProfileForEnvironment('production')).toEqual({
      profile: 'base-usdc-exact',
      aeEnvironment: 'production',
      network: BASE_MAINNET_NETWORK,
      asset: BASE_MAINNET_USDC_ADDRESS,
      scheme: 'exact',
      transferMethod: 'eip3009',
    })
    expect(x402PaymentProfileForEnvironment('development')).toBeUndefined()
  })

  it('normalizes an omitted EVM transfer method to the protocol-default EIP-3009', () => {
    const omitted = {
      scheme: 'exact',
      network: BASE_SEPOLIA_NETWORK,
      amount: '1000',
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      payTo: '0x0000000000000000000000000000000000000002',
      maxTimeoutSeconds: 60,
      extra: { name: 'USDC', version: '2' },
    }
    const explicit = {
      ...omitted,
      extra: { ...omitted.extra, assetTransferMethod: 'eip3009' },
    }

    expect(normalizeX402PaymentRequirement(omitted)).toEqual(explicit)
    expect(normalizeX402PaymentRequirement(explicit)).toEqual(explicit)
    expect(normalizeX402PaymentRequirement({
      ...omitted,
      extra: { ...omitted.extra, assetTransferMethod: 'permit2' },
    }).extra.assetTransferMethod).toBe('permit2')
  })

  it('accepts only the inseparable network/asset pair and a bounded positive amount', () => {
    const sandbox = x402PaymentProfileForEnvironment('sandbox')
    if (sandbox === undefined) throw new Error('sandbox profile missing')
    const requirement = {
      scheme: 'exact',
      network: sandbox.network,
      amount: '1000',
      asset: sandbox.asset,
      payTo: '0x0000000000000000000000000000000000000002',
      maxTimeoutSeconds: 60,
      extra: { name: 'USDC', version: '2' },
    }

    expect(isX402PaymentRequirementForProfile(requirement, sandbox, 10_000n)).toBe(true)
    expect(isX402PaymentRequirementForProfile({
      ...requirement,
      network: BASE_MAINNET_NETWORK,
    }, sandbox, 10_000n)).toBe(false)
    expect(isX402PaymentRequirementForProfile({
      ...requirement,
      asset: BASE_MAINNET_USDC_ADDRESS,
    }, sandbox, 10_000n)).toBe(false)
    expect(isX402PaymentRequirementForProfile({
      ...requirement,
      amount: '10001',
    }, sandbox, 10_000n)).toBe(false)
    expect(isX402PaymentRequirementForProfile({
      ...requirement,
      amount: '0',
    }, sandbox, 10_000n)).toBe(false)
    expect(isX402PaymentRequirementForProfile({
      ...requirement,
      extra: { ...requirement.extra, assetTransferMethod: 'permit2' },
    }, sandbox, 10_000n)).toBe(false)
  })
})
