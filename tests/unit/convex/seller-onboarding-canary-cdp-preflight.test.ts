import { describe, expect, it, vi } from 'vitest'

import {
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
  cdpX402PolicyRulesDigest,
} from '@/modules/capability-supply/server'
import {
  inspectSellerOnboardingCanaryCdpReadiness,
  readSellerOnboardingCanaryCdpReadinessHandler,
} from '../../../convex/capabilitySupplyCanaryFundingPreflight'

const NOW = Date.parse('2026-08-31T00:00:00.000Z')
const ACCOUNT_NAME = 'ae-x402-base-sepolia-v1'
const ACCOUNT_ADDRESS = '0x8F012237dbcDf4038ea3E9EAbcEc6cA933a5f4B9'
const ACCOUNT_POLICY_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_POLICY_ID = '22222222-2222-4222-8222-222222222222'
const ACCOUNT_POLICY_RULES = [{
  action: 'accept',
  operation: 'signEvmTypedData',
  criteria: [{
    type: 'evmTypedDataVerifyingContract',
    addresses: [BASE_SEPOLIA_USDC_ADDRESS],
    operator: 'in',
  }, {
    type: 'evmTypedDataField',
    conditions: [
      { path: 'from', operator: 'in', addresses: [ACCOUNT_ADDRESS] },
      { path: 'value', operator: '<=', value: '10000' },
    ],
    types: {
      primaryType: 'TransferWithAuthorization',
      types: {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
    },
  }],
}] as const
const PROJECT_POLICY_RULES = [{
  action: 'reject',
  operation: 'signEvmTypedData',
  criteria: [{
    type: 'evmTypedDataVerifyingContract',
    operator: 'not in',
    addresses: [BASE_SEPOLIA_USDC_ADDRESS],
  }],
}, {
  action: 'reject',
  operation: 'signEvmTypedData',
  criteria: [{
    type: 'evmTypedDataField',
    conditions: [{ path: 'value', operator: '>', value: '10000' }],
    types: {
      primaryType: 'TransferWithAuthorization',
      types: {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
    },
  }],
}] as const
const POLICY_RULES_DIGEST = cdpX402PolicyRulesDigest(
  { id: ACCOUNT_POLICY_ID, scope: 'account', rules: ACCOUNT_POLICY_RULES },
  { id: PROJECT_POLICY_ID, scope: 'project', rules: PROJECT_POLICY_RULES },
)

if (POLICY_RULES_DIGEST === undefined) throw new Error('test policy digest invalid')

type PolicyDocument = Readonly<{
  id: string
  scope: 'account' | 'project'
  rules: readonly unknown[]
}>

type BalancePage = Readonly<{
  balances: readonly Readonly<{
    token: Readonly<{ contractAddress: string; network: string }>
    amount: Readonly<{ amount: bigint; decimals: number }>
  }>[]
  nextPageToken?: string
}>

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    CDP_API_KEY_ID: 'test-key-id',
    CDP_API_KEY_SECRET: 'test-key-secret',
    CDP_WALLET_SECRET: 'test-wallet-secret',
    AE_X402_CDP_ACCOUNT_NAME: ACCOUNT_NAME,
    AE_X402_CDP_EXPECTED_EVM_ADDRESS: ACCOUNT_ADDRESS,
    AE_X402_CDP_ACCOUNT_POLICY_ID: ACCOUNT_POLICY_ID,
    AE_X402_CDP_PROJECT_POLICY_ID: PROJECT_POLICY_ID,
    AE_X402_CDP_POLICY_RULES_DIGEST: POLICY_RULES_DIGEST,
    AE_X402_CDP_CREDENTIAL_GENERATION: '1',
    AE_X402_CUSTODY_ENABLED: 'true',
    AE_X402_CUSTODY_MAX_ATOMIC: '10000',
    AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '50000',
    AE_ROUTE_CALL_SIGNING_KEY_ID: 'route-calls:seller-canary',
    AE_ROUTE_CALL_SIGNING_SECRET: 'seller-canary-route-signing-secret-material',
    ...overrides,
  }
}

function usdcBalance(amount: bigint): BalancePage['balances'][number] {
  return {
    token: {
      contractAddress: BASE_SEPOLIA_USDC_ADDRESS,
      network: 'base-sepolia',
    },
    amount: { amount, decimals: 6 },
  }
}

function fixture(options: Readonly<{
  accountName?: string
  accountAddress?: string
  accountPolicies?: readonly string[] | null
  getPolicy?: (id: string) => PolicyDocument | Promise<PolicyDocument>
  balancePages?: readonly BalancePage[]
  balanceError?: boolean
}> = {}) {
  const getPolicy = options.getPolicy ?? ((id: string): PolicyDocument => id === ACCOUNT_POLICY_ID
    ? { id, scope: 'account', rules: ACCOUNT_POLICY_RULES }
    : { id, scope: 'project', rules: PROJECT_POLICY_RULES })
  const getAccount = vi.fn(async () => ({
    name: options.accountName ?? ACCOUNT_NAME,
    address: options.accountAddress ?? ACCOUNT_ADDRESS,
    ...(options.accountPolicies === null
      ? {}
      : { policies: options.accountPolicies ?? [ACCOUNT_POLICY_ID, PROJECT_POLICY_ID] }),
  }))
  const getPolicyById = vi.fn(async ({ id }: { id: string }) => await getPolicy(id))
  const pages = options.balancePages ?? [{ balances: [usdcBalance(50_000n)] }]
  let pageIndex = 0
  const listTokenBalances = vi.fn(async () => {
    if (options.balanceError === true) throw new Error('read failed')
    const page = pages[pageIndex]
    pageIndex += 1
    if (page === undefined) throw new Error('unexpected page')
    return page
  })
  const createClient = vi.fn(() => ({
    evm: { getAccount, listTokenBalances },
    policies: { getPolicyById },
  }))
  return {
    dependencies: { environment: environment(), createClient },
    createClient,
    getAccount,
    getPolicyById,
    listTokenBalances,
  }
}

describe('seller-onboarding CDP live preflight', () => {
  it('proves the exact named payer, applied policy documents, and funded Base Sepolia USDC', async () => {
    const test = fixture({
      balancePages: [
        {
          balances: [],
          nextPageToken: 'page-2',
        },
        { balances: [usdcBalance(50_000n)] },
      ],
    })

    const result = await inspectSellerOnboardingCanaryCdpReadiness(NOW, test.dependencies)

    expect(result).toEqual({
      kind: 'ready',
      accountName: ACCOUNT_NAME,
      payerAddress: ACCOUNT_ADDRESS.toLowerCase(),
      accountPolicyId: ACCOUNT_POLICY_ID,
      projectPolicyId: PROJECT_POLICY_ID,
      policyRulesDigest: POLICY_RULES_DIGEST,
      network: BASE_SEPOLIA_NETWORK,
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      usdcBalanceAtomic: '50000',
      minimumRequiredAtomic: '10000',
      balancePagesRead: 2,
      checkedAt: NOW,
    })
    expect(test.getAccount).toHaveBeenCalledWith({ name: ACCOUNT_NAME })
    expect(test.getPolicyById).toHaveBeenCalledTimes(2)
    expect(test.listTokenBalances).toHaveBeenNthCalledWith(1, {
      address: ACCOUNT_ADDRESS,
      network: 'base-sepolia',
      pageSize: 100,
    })
    expect(test.listTokenBalances).toHaveBeenNthCalledWith(2, {
      address: ACCOUNT_ADDRESS,
      network: 'base-sepolia',
      pageSize: 100,
      pageToken: 'page-2',
    })
    expect(JSON.stringify(result)).not.toContain('test-key-secret')
    expect(JSON.stringify(result)).not.toContain('test-wallet-secret')
  })

  it.each([
    ['name mismatch', fixture({ accountName: 'different-account' }), 'cdp_account_name_mismatch'],
    ['payer mismatch', fixture({ accountAddress: `0x${'11'.repeat(20)}` }), 'cdp_account_address_mismatch'],
    ['policy IDs unavailable', fixture({ accountPolicies: null }), 'cdp_account_policy_ids_not_verifiable'],
    ['policy IDs mismatch', fixture({ accountPolicies: [ACCOUNT_POLICY_ID, '33333333-3333-4333-8333-333333333333'] }), 'cdp_account_policy_ids_mismatch'],
  ] as const)('fails closed for %s', async (_label, test, code) => {
    await expect(inspectSellerOnboardingCanaryCdpReadiness(NOW, test.dependencies))
      .resolves.toEqual({ kind: 'not_ready', codes: [code], checkedAt: NOW })
    expect(test.listTokenBalances).not.toHaveBeenCalled()
  })

  it('distinguishes unreadable, invalid, and changed policy documents', async () => {
    const unreadable = fixture({
      getPolicy: async (id) => {
        if (id === ACCOUNT_POLICY_ID) throw new Error('forbidden')
        return { id, scope: 'project', rules: PROJECT_POLICY_RULES }
      },
    })
    await expect(inspectSellerOnboardingCanaryCdpReadiness(NOW, unreadable.dependencies))
      .resolves.toEqual({
        kind: 'not_ready',
        codes: ['cdp_account_policy_read_failed'],
        checkedAt: NOW,
      })

    const invalid = fixture({
      getPolicy: (id) => id === ACCOUNT_POLICY_ID
        ? { id, scope: 'project', rules: ACCOUNT_POLICY_RULES }
        : { id, scope: 'project', rules: PROJECT_POLICY_RULES },
    })
    await expect(inspectSellerOnboardingCanaryCdpReadiness(NOW, invalid.dependencies))
      .resolves.toEqual({
        kind: 'not_ready',
        codes: ['cdp_account_policy_document_invalid'],
        checkedAt: NOW,
      })

    const changed = fixture({
      getPolicy: (id) => id === ACCOUNT_POLICY_ID
        ? { id, scope: 'account', rules: [{ changed: true }] }
        : { id, scope: 'project', rules: PROJECT_POLICY_RULES },
    })
    await expect(inspectSellerOnboardingCanaryCdpReadiness(NOW, changed.dependencies))
      .resolves.toEqual({
        kind: 'not_ready',
        codes: ['cdp_policy_rules_digest_mismatch'],
        checkedAt: NOW,
      })
  })

  it('fails precisely for unreadable, ambiguous, and insufficient USDC balance', async () => {
    const unreadable = fixture({ balanceError: true })
    await expect(inspectSellerOnboardingCanaryCdpReadiness(NOW, unreadable.dependencies))
      .resolves.toEqual({
        kind: 'not_ready',
        codes: ['cdp_balance_read_failed'],
        checkedAt: NOW,
      })

    const ambiguous = fixture({
      balancePages: [{ balances: [usdcBalance(10_000n), usdcBalance(20_000n)] }],
    })
    await expect(inspectSellerOnboardingCanaryCdpReadiness(NOW, ambiguous.dependencies))
      .resolves.toEqual({
        kind: 'not_ready',
        codes: ['cdp_usdc_balance_not_verifiable'],
        checkedAt: NOW,
      })

    const insufficient = fixture({ balancePages: [{ balances: [usdcBalance(9_999n)] }] })
    await expect(inspectSellerOnboardingCanaryCdpReadiness(NOW, insufficient.dependencies))
      .resolves.toEqual({
        kind: 'not_ready',
        codes: ['cdp_usdc_balance_insufficient'],
        checkedAt: NOW,
      })
  })

  it('refuses before CDP when the AE funding authority/config query is not ready', async () => {
    const runQuery = vi.fn(async () => ({ kind: 'not_ready' as const }))

    await expect(readSellerOnboardingCanaryCdpReadinessHandler(
      { runQuery } as never,
      { now: NOW },
    )).resolves.toEqual({
      kind: 'not_ready',
      codes: ['ae_canary_funding_not_ready'],
      checkedAt: NOW,
    })
    expect(runQuery).toHaveBeenCalledTimes(1)
  })

  it('refuses malformed custody configuration before constructing the SDK client', async () => {
    const createClient = vi.fn()

    await expect(inspectSellerOnboardingCanaryCdpReadiness(NOW, {
      environment: environment({ CDP_API_KEY_SECRET: undefined }),
      createClient,
    })).resolves.toEqual({
      kind: 'not_ready',
      codes: ['cdp_custody_configuration_missing'],
      checkedAt: NOW,
    })
    expect(createClient).not.toHaveBeenCalled()
  })

  it.each([
    ['missing pair', {
      AE_ROUTE_CALL_SIGNING_KEY_ID: undefined,
      AE_ROUTE_CALL_SIGNING_SECRET: undefined,
    }, 'route_call_signing_configuration_missing'],
    ['missing key ID', {
      AE_ROUTE_CALL_SIGNING_KEY_ID: undefined,
    }, 'route_call_signing_configuration_invalid'],
    ['missing secret', {
      AE_ROUTE_CALL_SIGNING_SECRET: undefined,
    }, 'route_call_signing_configuration_invalid'],
    ['short secret', {
      AE_ROUTE_CALL_SIGNING_SECRET: 'too-short',
    }, 'route_call_signing_configuration_invalid'],
    ['oversized key ID', {
      AE_ROUTE_CALL_SIGNING_KEY_ID: 'x'.repeat(201),
    }, 'route_call_signing_configuration_invalid'],
  ] as const)('blocks before CDP for a %s', async (_label, overrides, code) => {
    const createClient = vi.fn()

    await expect(inspectSellerOnboardingCanaryCdpReadiness(NOW, {
      environment: environment(overrides),
      createClient,
    })).resolves.toEqual({ kind: 'not_ready', codes: [code], checkedAt: NOW })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('returns a code when the pinned SDK client cannot initialize', async () => {
    const createClient = vi.fn(() => {
      throw new Error('unsupported runtime')
    })

    await expect(inspectSellerOnboardingCanaryCdpReadiness(NOW, {
      environment: environment(),
      createClient,
    })).resolves.toEqual({
      kind: 'not_ready',
      codes: ['cdp_client_initialization_failed'],
      checkedAt: NOW,
    })
  })
})
