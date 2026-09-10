/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it, vi } from 'vitest'

import {
  cdpX402CustodyBudgetRef,
  cdpX402CustodyConfigurationFromEnvironment,
  x402PaymentProfileForEnvironment,
} from '@/modules/capability-supply/convex'
import { isCanonicalDigest } from '@/modules/common/canonical-digest'

import { observeTreasuryHandler } from '../../../convex/moneyTreasuryObservation'
import type { CdpUsdcBalanceReader } from '../../../convex/capabilitySupplyCanaryFundingPreflight'
import schema from '../../../convex/schema'
import type { Doc } from '../../../convex/_generated/dataModel'

const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../../convex/', './'), load]),
)

// Mirrors the custody environment the Quote handler tests admit, so a row this
// action records is the row `prepareFinancialSubjects` looks up.
const custodyEnvironment = Object.freeze({
  AE_X402_CUSTODY_ENABLED: 'true',
  AE_X402_CUSTODY_MAX_ATOMIC: '10000',
  AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '100000',
  CDP_API_KEY_ID: 'key-id',
  CDP_API_KEY_SECRET: 'key-secret',
  CDP_WALLET_SECRET: 'wallet-secret',
  AE_X402_CDP_ACCOUNT_NAME: 'ae-x402-base-sepolia-v1',
  AE_X402_CDP_EXPECTED_EVM_ADDRESS: '0x8f012237dbcdf4038ea3e9eabcec6ca933a5f4b9',
  AE_X402_CDP_ACCOUNT_POLICY_ID: '11111111-1111-4111-8111-111111111111',
  AE_X402_CDP_PROJECT_POLICY_ID: '22222222-2222-4222-8222-222222222222',
  AE_X402_CDP_POLICY_RULES_DIGEST: `sha256:${'a'.repeat(64)}`,
  AE_X402_CDP_CREDENTIAL_GENERATION: '7',
})

const parsedConfiguration = cdpX402CustodyConfigurationFromEnvironment(custodyEnvironment)
if (parsedConfiguration === undefined) throw new Error('treasury_observation_test_custody_invalid')
const configuration = parsedConfiguration

const OBSERVED_AT = 1_800_000_000_000
const BALANCE_BY_NETWORK = Object.freeze({ 'base-sepolia': 12_000_000n, base: 5_000_000n })

function lane(environment: 'sandbox' | 'production') {
  const profile = x402PaymentProfileForEnvironment(environment)
  if (profile === undefined) throw new Error('treasury_observation_test_profile_invalid')
  return { profile, custodyRef: cdpX402CustodyBudgetRef(configuration, environment) }
}

/** Stubs the only CDP surface the observation reads: paginated token balances. */
function stubBalanceReader(
  pages: Readonly<Record<string, readonly unknown[]>> = {},
): CdpUsdcBalanceReader {
  return {
    listTokenBalances: async ({ network }) => {
      const override = pages[network]
      if (override !== undefined) return { balances: override as never }
      const { profile } = lane(network === 'base-sepolia' ? 'sandbox' : 'production')
      return {
        balances: [{
          token: { contractAddress: profile.asset, network },
          amount: { amount: BALANCE_BY_NETWORK[network], decimals: 6 },
        }],
      }
    },
  }
}

function backendWithObserver(reader: CdpUsdcBalanceReader = stubBalanceReader()) {
  const backend = convexTest(schema, convexModules)
  const ctx = {
    runMutation: async (reference: never, args: never) =>
      await (backend.mutation as (target: never, payload: never) => Promise<unknown>)(reference, args),
  } as unknown as Parameters<typeof observeTreasuryHandler>[0]
  return {
    backend,
    observe: async (overrides: Readonly<{ now?: number; enabled?: boolean }> = {}) =>
      await observeTreasuryHandler(ctx, {
        environment: overrides.enabled === false ? {} : custodyEnvironment,
        now: overrides.now ?? OBSERVED_AT,
        createBalanceReader: () => reader,
      }),
    rows: async (): Promise<Doc<'moneyTreasuryObservations'>[]> =>
      await backend.run(async (db) => await db.db.query('moneyTreasuryObservations').collect()),
  }
}

describe('x402 treasury observation workload', () => {
  it('skips without recording anything when custody is not configured', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const observer = backendWithObserver()

    try {
      await expect(observer.observe({ enabled: false })).resolves.toEqual({
        kind: 'skipped',
        reason: 'custody_disabled',
        observations: [],
      })
      expect(log).toHaveBeenCalledWith('money_treasury_observation_skipped', {
        workload: 'observe x402 treasury',
        reason: 'custody_disabled',
      })
    } finally {
      log.mockRestore()
    }
    await expect(observer.rows()).resolves.toEqual([])
  })

  it('records one external evidence row per configured x402 lane', async () => {
    const observer = backendWithObserver()

    await expect(observer.observe()).resolves.toEqual({
      kind: 'recorded',
      observations: [
        { environment: 'sandbox', network: lane('sandbox').profile.network, totalUnits: '12000000' },
        { environment: 'production', network: lane('production').profile.network, totalUnits: '5000000' },
      ],
    })

    const rows = await observer.rows()
    expect(rows).toHaveLength(2)
    const production = rows.find((row) => row.environment === 'production')
    expect(production).toMatchObject({
      custodyRef: lane('production').custodyRef,
      custodyGeneration: configuration.credentialGeneration,
      network: lane('production').profile.network,
      asset: 'USDC',
      exponent: 6,
      totalUnits: '5000000',
      bufferUnits: configuration.maxAtomic.toString(),
      evidenceRef: `cdp-balance:${configuration.expectedEvmAddress}:base:${OBSERVED_AT}`,
      observationRef: `treasury-observation:${lane('production').custodyRef}:${OBSERVED_AT}`,
      observedAt: OBSERVED_AT,
    })
    expect(isCanonicalDigest(production?.evidenceDigest ?? '')).toBe(true)
    // Distinct external evidence per lane, never one balance copied across both.
    expect(new Set(rows.map((row) => row.evidenceDigest)).size).toBe(2)
  })

  it('appends a second observation per lane and leaves the newest one winning by observedAt', async () => {
    const observer = backendWithObserver()

    await observer.observe()
    await expect(observer.observe({ now: OBSERVED_AT + 1 })).resolves.toMatchObject({ kind: 'recorded' })

    await expect(observer.rows()).resolves.toHaveLength(4)
    const { profile, custodyRef } = lane('production')
    const newest = await observer.backend.run(async (ctx) => await ctx.db
      .query('moneyTreasuryObservations')
      .withIndex('by_custody_and_observedAt', (query) => query
        .eq('environment', 'production')
        .eq('custodyRef', custodyRef)
        .eq('custodyGeneration', configuration.credentialGeneration))
      .order('desc')
      .take(1))
    // Exactly the lookup convex/capabilityQuotes.ts runs before it can refuse
    // `treasury_capacity_unavailable`: an active-custody row with spendable
    // units now exists, so the managed_x402 Quote no longer fails closed.
    expect(newest[0]).toMatchObject({
      observedAt: OBSERVED_AT + 1,
      network: profile.network,
      totalUnits: '5000000',
    })
    const spendable = BigInt(newest[0]?.totalUnits ?? '0') - BigInt(newest[0]?.bufferUnits ?? '0')
    expect(spendable > 0n).toBe(true)
  })

  it('records the lanes it can read and reports the first unreadable one', async () => {
    const observer = backendWithObserver({
      listTokenBalances: async ({ network }) => {
        if (network === 'base-sepolia') throw new Error('cdp_unavailable')
        return {
          balances: [{
            token: { contractAddress: lane('production').profile.asset, network },
            amount: { amount: 5_000_000n, decimals: 6 },
          }],
        }
      },
    })

    await expect(observer.observe()).resolves.toMatchObject({
      kind: 'recorded',
      reason: 'balance_failed',
      observations: [{ environment: 'production' }],
    })
    await expect(observer.rows()).resolves.toHaveLength(1)
  })
})
