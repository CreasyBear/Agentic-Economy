import { describe, expect, it } from 'vitest'

import {
  cdpX402CustodyBudgetRef,
  cdpX402CustodyConfigurationFromEnvironment,
} from '@/modules/capability-supply/internal/server-credential'

const validEnvironment = {
  AE_X402_CUSTODY_ENABLED: 'true',
  AE_X402_CUSTODY_MAX_ATOMIC: '10000',
  AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '100000',
  CDP_API_KEY_ID: 'key-id',
  CDP_API_KEY_SECRET: 'key-secret',
  CDP_WALLET_SECRET: 'wallet-secret',
  AE_X402_CDP_ACCOUNT_NAME: 'agentic-economy-x402',
  AE_X402_CDP_EXPECTED_EVM_ADDRESS: '0x0000000000000000000000000000000000000001',
  AE_X402_CDP_ACCOUNT_POLICY_ID: '11111111-1111-4111-8111-111111111111',
  AE_X402_CDP_PROJECT_POLICY_ID: '22222222-2222-4222-8222-222222222222',
  AE_X402_CDP_CREDENTIAL_GENERATION: '7',
}

describe('CDP x402 custody configuration', () => {
  it('accepts only an enabled, complete configuration with a positive atomic cap', () => {
    expect(cdpX402CustodyConfigurationFromEnvironment(validEnvironment)).toMatchObject({
      apiKeyId: 'key-id',
      apiKeySecret: 'key-secret',
      walletSecret: 'wallet-secret',
      accountName: 'agentic-economy-x402',
      expectedEvmAddress: '0x0000000000000000000000000000000000000001',
      accountPolicyId: '11111111-1111-4111-8111-111111111111',
      projectPolicyId: '22222222-2222-4222-8222-222222222222',
      credentialGeneration: 7,
      maxAtomic: 10000n,
      dailyMaxAtomic: 100000n,
    })
  })

  it('derives an opaque stable wallet budget identity', () => {
    const base = cdpX402CustodyConfigurationFromEnvironment(validEnvironment)
    const rotated = cdpX402CustodyConfigurationFromEnvironment({
      ...validEnvironment,
      CDP_API_KEY_ID: 'rotated-key-id',
      CDP_API_KEY_SECRET: 'rotated-key-secret',
      CDP_WALLET_SECRET: 'rotated-wallet-secret',
      AE_X402_CDP_ACCOUNT_NAME: 'rotated-account',
      AE_X402_CDP_ACCOUNT_POLICY_ID: '33333333-3333-4333-8333-333333333333',
      AE_X402_CDP_PROJECT_POLICY_ID: '44444444-4444-4444-8444-444444444444',
      AE_X402_CDP_CREDENTIAL_GENERATION: '8',
      AE_X402_CUSTODY_MAX_ATOMIC: '20000',
      AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '200000',
    })
    const differentWallet = cdpX402CustodyConfigurationFromEnvironment({
      ...validEnvironment,
      AE_X402_CDP_EXPECTED_EVM_ADDRESS: '0x0000000000000000000000000000000000000002',
    })
    if (base === undefined || rotated === undefined || differentWallet === undefined) {
      throw new Error('valid custody fixture unexpectedly rejected')
    }

    const baseRef = cdpX402CustodyBudgetRef(base)
    expect(cdpX402CustodyBudgetRef(rotated)).toBe(baseRef)
    expect(cdpX402CustodyBudgetRef(differentWallet)).not.toBe(baseRef)
    expect(baseRef).not.toContain(base.expectedEvmAddress)
    expect(baseRef).not.toContain(base.apiKeySecret)
    expect(baseRef).not.toContain(base.walletSecret)
  })

  it.each([
    ['switch off', { AE_X402_CUSTODY_ENABLED: 'false' }],
    ['missing API key ID', { CDP_API_KEY_ID: undefined }],
    ['missing API key secret', { CDP_API_KEY_SECRET: undefined }],
    ['missing wallet secret', { CDP_WALLET_SECRET: undefined }],
    ['missing account name', { AE_X402_CDP_ACCOUNT_NAME: undefined }],
    ['missing expected EVM address', { AE_X402_CDP_EXPECTED_EVM_ADDRESS: undefined }],
    ['malformed expected EVM address', { AE_X402_CDP_EXPECTED_EVM_ADDRESS: 'not-an-address' }],
    ['missing account policy', { AE_X402_CDP_ACCOUNT_POLICY_ID: undefined }],
    ['malformed account policy', { AE_X402_CDP_ACCOUNT_POLICY_ID: 'not-a-uuid' }],
    ['missing project policy', { AE_X402_CDP_PROJECT_POLICY_ID: undefined }],
    ['malformed project policy', { AE_X402_CDP_PROJECT_POLICY_ID: 'not-a-uuid' }],
    ['missing credential generation', { AE_X402_CDP_CREDENTIAL_GENERATION: undefined }],
    ['zero credential generation', { AE_X402_CDP_CREDENTIAL_GENERATION: '0' }],
    ['unsafe credential generation', { AE_X402_CDP_CREDENTIAL_GENERATION: '9007199254740992' }],
    ['zero cap', { AE_X402_CUSTODY_MAX_ATOMIC: '0' }],
    ['non-integer cap', { AE_X402_CUSTODY_MAX_ATOMIC: '1.5' }],
    ['missing daily cap', { AE_X402_CUSTODY_DAILY_MAX_ATOMIC: undefined }],
    ['zero daily cap', { AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '0' }],
    ['daily cap below per-payment cap', { AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '9999' }],
  ] as const)('refuses %s', (_label, override) => {
    expect(cdpX402CustodyConfigurationFromEnvironment({
      ...validEnvironment,
      ...override,
    })).toBeUndefined()
  })
})
