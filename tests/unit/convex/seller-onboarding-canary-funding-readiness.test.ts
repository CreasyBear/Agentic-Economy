import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { convexTest } from 'convex-test'

import { internal } from '../../../convex/_generated/api'
import schema from '../../../convex/schema'
import {
  SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF,
  SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC,
  SELLER_ONBOARDING_CANARY_MAXIMUM_MONTHLY_ATOMIC,
  SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC,
  SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF,
  SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID,
  SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF,
  SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID,
  SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
  SELLER_ONBOARDING_CANARY_RATE_POLICY_REF,
} from '../../../convex/capabilitySupplyCanaryFunding'
import { BASE_SEPOLIA_NETWORK } from '../../../src/modules/capability-supply/public'
import { convexModules as modules } from '../../helpers/convex-fixtures'

const NOW = Date.parse('2026-08-31T00:00:00.000Z')

function configureManagedSandboxCustody(overrides: Record<string, string> = {}): void {
  const values = {
    CDP_API_KEY_ID: 'sandbox-key-id',
    CDP_API_KEY_SECRET: 'sandbox-key-secret',
    CDP_WALLET_SECRET: 'sandbox-wallet-secret',
    AE_X402_CDP_ACCOUNT_NAME: 'ae-x402-base-sepolia-v1',
    AE_X402_CDP_EXPECTED_EVM_ADDRESS: '0x8F012237dbcDf4038ea3E9EAbcEc6cA933a5f4B9',
    AE_X402_CDP_ACCOUNT_POLICY_ID: '11111111-1111-1111-1111-111111111111',
    AE_X402_CDP_PROJECT_POLICY_ID: '22222222-2222-2222-2222-222222222222',
    AE_X402_CDP_POLICY_RULES_DIGEST: `sha256:${'a'.repeat(64)}`,
    AE_X402_CDP_CREDENTIAL_GENERATION: '1',
    AE_X402_CUSTODY_ENABLED: 'true',
    AE_X402_CUSTODY_MAX_ATOMIC: SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC,
    AE_X402_CUSTODY_DAILY_MAX_ATOMIC: SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC,
    AE_X402_RPC_URLS_JSON: JSON.stringify({
      [BASE_SEPOLIA_NETWORK]: ['https://base-sepolia-rpc.example'],
    }),
    ...overrides,
  }
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value)
}

describe('seller onboarding canary funding readiness', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('provisions one exact fixed principal and grant idempotently', async () => {
    const backend = convexTest(schema, modules)

    const first = await backend.mutation(
      internal.capabilitySupplyCanaryFunding.provisionSellerOnboardingCanaryFunding,
      { now: NOW },
    )
    const replay = await backend.mutation(
      internal.capabilitySupplyCanaryFunding.provisionSellerOnboardingCanaryFunding,
      { now: NOW + 1 },
    )

    expect(first).toMatchObject({
      kind: 'ensured',
      created: ['grant', 'principal'],
      grantRef: SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF,
      principalId: SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
      generation: 1,
      budgetPolicyRef: SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF,
    })
    expect(replay).toMatchObject({
      kind: 'ensured',
      created: [],
      spendingPolicyDigest: first.kind === 'ensured' ? first.spendingPolicyDigest : undefined,
    })

    const rows = await backend.run(async (ctx) => ({
      principals: await ctx.db.query('agentAccessPrincipals').collect(),
      grants: await ctx.db.query('agentAccessGrants').collect(),
    }))
    expect(rows.principals).toHaveLength(1)
    expect(rows.grants).toHaveLength(1)
    expect(rows.grants[0]).toMatchObject({
      grantRef: SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF,
      environment: 'sandbox',
      authorityMode: 'unrestricted_test_only',
      spendingPolicy: {
        budget: {
          maximumSpendPerCall: { currency: 'USD', units: SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC, exponent: 6 },
          maximumDailySpend: { currency: 'USD', units: SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC, exponent: 6 },
          maximumMonthlySpend: { currency: 'USD', units: SELLER_ONBOARDING_CANARY_MAXIMUM_MONTHLY_ATOMIC, exponent: 6 },
          maximumConcurrentCalls: 1,
        },
      },
    })
  })

  it('reads the exact platform grant by its sealed identity and rejects every dispatch mismatch', async () => {
    const backend = convexTest(schema, modules)
    const provisioned = await backend.mutation(
      internal.capabilitySupplyCanaryFunding.provisionSellerOnboardingCanaryFunding,
      { now: NOW },
    )
    if (provisioned.kind !== 'ensured') throw new Error('canary platform grant fixture missing')
    const persisted = await backend.run(async (ctx) => await ctx.db.query('agentAccessGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF))
      .unique())
    if (persisted === null) throw new Error('canary platform grant row missing')

    const exact = {
      sellerOwnerId: 'acc_seller_owner_distinct_from_platform',
      expected: {
        kind: 'persisted_dispatch' as const,
        grantRef: SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF,
        principalId: SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
        ownerId: SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID,
        credentialId: SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID,
        applicationRef: SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF,
        environment: 'sandbox' as const,
        generation: provisioned.generation,
        spendingPolicyDigest: provisioned.spendingPolicyDigest,
        expiresAt: persisted.expiresAt,
      },
      now: NOW,
    }
    await expect(backend.query(
      internal.capabilitySupplyCanaryFunding.readExactSellerOnboardingCanaryPlatformGrant,
      exact,
    )).resolves.toMatchObject({
      grantRef: exact.expected.grantRef,
      principalId: exact.expected.principalId,
      ownerId: exact.expected.ownerId,
      credentialId: exact.expected.credentialId,
      applicationRef: exact.expected.applicationRef,
      generation: exact.expected.generation,
      spendingPolicyDigest: exact.expected.spendingPolicyDigest,
      expiresAt: exact.expected.expiresAt,
    })

    const mismatches = [
      { grantRef: 'agent-access-grant:wrong' },
      { principalId: 'prn_wrong' },
      { ownerId: 'acc_wrong' },
      { credentialId: 'credential_wrong' },
      { applicationRef: 'application_wrong' },
      { generation: exact.expected.generation + 1 },
      { spendingPolicyDigest: `sha256:${'f'.repeat(64)}` },
      { expiresAt: exact.expected.expiresAt - 1 },
    ]
    for (const mismatch of mismatches) {
      await expect(backend.query(
        internal.capabilitySupplyCanaryFunding.readExactSellerOnboardingCanaryPlatformGrant,
        { ...exact, expected: { ...exact.expected, ...mismatch } },
      )).resolves.toBeNull()
    }
    await expect(backend.query(
      internal.capabilitySupplyCanaryFunding.readExactSellerOnboardingCanaryPlatformGrant,
      { ...exact, sellerOwnerId: SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID },
    )).resolves.toBeNull()
  })

  it('fails closed before provisioning and when custody or Base Sepolia RPC is missing', async () => {
    const backend = convexTest(schema, modules)
    await expect(backend.query(
      internal.capabilitySupplyCanaryFunding.readSellerOnboardingCanaryFundingReadiness,
      { now: NOW },
    )).resolves.toEqual({
      kind: 'not_ready',
      codes: [
        'canary_grant_missing',
        'canary_principal_missing',
        'cdp_custody_configuration_missing',
        'x402_sandbox_rpc_configuration_missing',
      ],
      checkedAt: NOW,
    })

    await backend.mutation(
      internal.capabilitySupplyCanaryFunding.provisionSellerOnboardingCanaryFunding,
      { now: NOW },
    )
    await expect(backend.query(
      internal.capabilitySupplyCanaryFunding.readSellerOnboardingCanaryFundingReadiness,
      { now: NOW },
    )).resolves.toMatchObject({
      kind: 'not_ready',
      codes: ['cdp_custody_configuration_missing', 'x402_sandbox_rpc_configuration_missing'],
    })
  })

  it('returns only non-secret readiness identity for the exact managed sandbox profile', async () => {
    configureManagedSandboxCustody()
    const backend = convexTest(schema, modules)
    await backend.mutation(
      internal.capabilitySupplyCanaryFunding.provisionSellerOnboardingCanaryFunding,
      { now: NOW },
    )

    const result = await backend.query(
      internal.capabilitySupplyCanaryFunding.readSellerOnboardingCanaryFundingReadiness,
      { now: NOW },
    )

    expect(result).toMatchObject({
      kind: 'ready',
      grantRef: SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF,
      paymentProfile: 'base-sepolia-usdc-exact',
      network: BASE_SEPOLIA_NETWORK,
      rpcEndpointCount: 1,
      custodyCredentialGeneration: 1,
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('sandbox-key-secret')
    expect(serialized).not.toContain('sandbox-wallet-secret')
  })

  it('returns the preserved digest when a historical v2 grant normalizes to current readiness', async () => {
    configureManagedSandboxCustody()
    const backend = convexTest(schema, modules)
    const provisioned = await backend.mutation(
      internal.capabilitySupplyCanaryFunding.provisionSellerOnboardingCanaryFunding,
      { now: NOW },
    )
    if (provisioned.kind !== 'ensured') throw new Error('canary platform grant fixture missing')

    await backend.run(async (ctx) => {
      const grant = await ctx.db.query('agentAccessGrants')
        .withIndex('by_grantRef', (query) => query.eq('grantRef', SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF))
        .unique()
      if (grant === null) throw new Error('canary platform grant row missing')
      await ctx.db.replace('agentAccessGrants', grant._id, {
        format: 'ae.agent-access-grant:v2',
        grantRef: SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF,
        principalId: SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
        ownerId: SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID,
        applicationRef: SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF,
        credentialId: SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID,
        environment: 'sandbox',
        authorityMode: 'full_yolo',
        budgetPolicyRef: SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF,
        ratePolicyRef: SELLER_ONBOARDING_CANARY_RATE_POLICY_REF,
        lifecycle: 'active',
        generation: 1,
        policyDigest: provisioned.spendingPolicyDigest,
        createdAt: grant.createdAt,
        updatedAt: grant.updatedAt,
        expiresAt: grant.expiresAt,
        operationAccess: 'all_admitted',
        operationRefs: [],
        policy: {
          format: 'ae.agent-access-policy:v2',
          operationAccess: 'all_admitted',
          operationRefs: [],
          environment: 'sandbox',
          budget: {
            budgetPolicyRef: SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF,
            generation: 1,
            currency: 'USD',
            exponent: 6,
            maximumSpendPerInvocation: {
              currency: 'USD',
              units: SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC,
              exponent: 6,
            },
            maximumDailySpend: {
              currency: 'USD',
              units: SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC,
              exponent: 6,
            },
            maximumMonthlySpend: {
              currency: 'USD',
              units: SELLER_ONBOARDING_CANARY_MAXIMUM_MONTHLY_ATOMIC,
              exponent: 6,
            },
            maximumConcurrentInvocations: 1,
          },
          rate: {
            ratePolicyRef: SELLER_ONBOARDING_CANARY_RATE_POLICY_REF,
            generation: 1,
            maximumCallsPerMinute: 1,
            maximumCallsPerHour: 5,
          },
        },
      })
    })

    await expect(backend.query(
      internal.capabilitySupplyCanaryFunding.readSellerOnboardingCanaryFundingReadiness,
      { now: NOW },
    )).resolves.toMatchObject({
      kind: 'ready',
      spendingPolicyDigest: provisioned.spendingPolicyDigest,
    })
  })

  it('rejects broader custody caps, wrong-network RPC, and duplicate RPC endpoints', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(
      internal.capabilitySupplyCanaryFunding.provisionSellerOnboardingCanaryFunding,
      { now: NOW },
    )

    configureManagedSandboxCustody({
      AE_X402_CUSTODY_MAX_ATOMIC: '10001',
      AE_X402_RPC_URLS_JSON: JSON.stringify({ 'eip155:8453': ['https://base-mainnet.example'] }),
    })
    await expect(backend.query(
      internal.capabilitySupplyCanaryFunding.readSellerOnboardingCanaryFundingReadiness,
      { now: NOW },
    )).resolves.toMatchObject({
      kind: 'not_ready',
      codes: ['cdp_custody_cap_mismatch', 'x402_sandbox_rpc_configuration_missing'],
    })

    configureManagedSandboxCustody({
      AE_X402_RPC_URLS_JSON: JSON.stringify({
        [BASE_SEPOLIA_NETWORK]: ['https://duplicate.example', 'https://duplicate.example/'],
      }),
    })
    await expect(backend.query(
      internal.capabilitySupplyCanaryFunding.readSellerOnboardingCanaryFundingReadiness,
      { now: NOW },
    )).resolves.toMatchObject({
      kind: 'not_ready',
      codes: ['x402_sandbox_rpc_configuration_missing'],
    })
  })

  it('detects policy and principal drift and provisioning refuses to overwrite it', async () => {
    configureManagedSandboxCustody()
    const backend = convexTest(schema, modules)
    await backend.mutation(
      internal.capabilitySupplyCanaryFunding.provisionSellerOnboardingCanaryFunding,
      { now: NOW },
    )
    await backend.run(async (ctx) => {
      const grant = await ctx.db.query('agentAccessGrants')
        .withIndex('by_grantRef', (query) => query.eq('grantRef', SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF))
        .unique()
      const principal = await ctx.db.query('agentAccessPrincipals')
        .withIndex('by_principalId', (query) => query.eq('principalId', SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID))
        .unique()
      if (grant === null || principal === null) throw new Error('canary funding fixture missing')
      const spendingPolicy = grant.spendingPolicy
      if (spendingPolicy === undefined || spendingPolicy.format !== 'ae.agent-access-policy:v2') {
        throw new Error('canary funding fixture policy missing')
      }
      await ctx.db.patch(grant._id, {
        spendingPolicy: {
          ...spendingPolicy,
          budget: {
            ...spendingPolicy.budget,
            maximumMonthlySpend: { currency: 'USD', units: '50001', exponent: 6 },
          },
        },
      })
      await ctx.db.patch(principal._id, { scopes: ['market_tools:call', 'market_supply:manage'] })
    })

    await expect(backend.query(
      internal.capabilitySupplyCanaryFunding.readSellerOnboardingCanaryFundingReadiness,
      { now: NOW },
    )).resolves.toMatchObject({
      kind: 'not_ready',
      codes: ['canary_grant_material_invalid', 'canary_principal_stale'],
    })
    await expect(backend.mutation(
      internal.capabilitySupplyCanaryFunding.provisionSellerOnboardingCanaryFunding,
      { now: NOW + 1 },
    )).resolves.toMatchObject({
      kind: 'conflict',
      codes: ['canary_grant_material_invalid', 'canary_principal_stale'],
    })

    const stillDrifted = await backend.run(async (ctx) => await ctx.db.query('agentAccessGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF))
      .unique())
    if (stillDrifted?.spendingPolicy?.format !== 'ae.agent-access-policy:v2') {
      throw new Error('canary funding fixture policy missing')
    }
    expect(stillDrifted.spendingPolicy.budget.maximumMonthlySpend.units).toBe('50001')
  })
})
