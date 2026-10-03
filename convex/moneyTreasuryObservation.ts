"use node"

import { CdpClient } from '@coinbase/cdp-sdk'
import { v } from 'convex/values'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import type { StringEnvironment } from '@/lib/server/read-trimmed-env'
import {
  cdpX402CustodyBudgetRef,
  cdpX402TreasuryConfigurationFromEnvironment,
  x402PaymentProfileForEnvironment,
  type CdpX402CustodyConfiguration,
} from '@/modules/capability-supply/convex'

import { internal } from './_generated/api'
import { internalAction, type ActionCtx } from './_generated/server'
import {
  readCdpUsdcBalance,
  type CdpUsdcBalanceReader,
  type CdpUsdcNetwork,
} from './lib/money/cdpUsdcBalance'
import { bindWorkloadCronActionContext } from './lib/platform/workloadCron/consequence'
import { reconcileTreasuryDeposits } from './lib/money/treasury/deposits'
import {
  parseWorkloadCronSnapshot,
  workloadCronSnapshotValue,
  type WorkloadCronSnapshot,
} from './lib/platform/workloadCron/context'

const WORKLOAD_NAME = 'observe x402 treasury' as const

/** Same lane mapping the CDP x402 payment signer uses (base-sepolia = sandbox). */
const CDP_NETWORK_BY_ENVIRONMENT = {
  sandbox: 'base-sepolia',
  production: 'base',
} as const satisfies Readonly<Record<TreasuryEnvironment, CdpUsdcNetwork>>

// moneyTreasury.recordObservation's own admission bounds.
const UNITS_PATTERN = /^(?:0|[1-9]\d{0,15})$/u

type TreasuryEnvironment = 'sandbox' | 'production'

export type TreasuryObservationSummary = {
  environment: TreasuryEnvironment
  network: string
  totalUnits: string
}

export type TreasuryObservationResult = Readonly<{
  kind: 'recorded' | 'skipped'
  reason?: string
  observations: TreasuryObservationSummary[]
}>

export type TreasuryObservationDependencies = Readonly<{
  environment?: StringEnvironment
  now?: number
  createBalanceReader?: (configuration: CdpX402CustodyConfiguration) => CdpUsdcBalanceReader
}>

const observationSummaryValue = v.object({
  environment: v.union(v.literal('sandbox'), v.literal('production')),
  network: v.string(),
  totalUnits: v.string(),
})

const resultValue = v.object({
  kind: v.union(v.literal('recorded'), v.literal('skipped')),
  reason: v.optional(v.string()),
  observations: v.array(observationSummaryValue),
})

function officialCdpBalanceReader(configuration: CdpX402CustodyConfiguration): CdpUsdcBalanceReader {
  const client = new CdpClient({
    apiKeyId: configuration.apiKeyId,
    apiKeySecret: configuration.apiKeySecret,
    walletSecret: configuration.walletSecret,
  })
  return { listTokenBalances: async (options) => await client.evm.listTokenBalances(options) }
}

/**
 * Requires the deployment's explicit payment environment and custody config.
 * Records only that environment's USDC balance as external treasury evidence.
 * Invalid deployment configuration cannot create a client, read or write.
 * Reads only the official CDP token-balance API and writes only through
 * moneyTreasury.recordObservation, which owns replay and conflict admission.
 */
export async function observeTreasuryHandler(
  ctx: Pick<ActionCtx, 'runMutation'>,
  dependencies: TreasuryObservationDependencies = {},
): Promise<TreasuryObservationResult> {
  const configuredEnvironment = dependencies.environment ?? process.env
  const activeEnvironment = deploymentPaymentEnvironment(configuredEnvironment)
  if (activeEnvironment === undefined) return skipped('deployment_environment_invalid')
  const configuration = cdpX402TreasuryConfigurationFromEnvironment(configuredEnvironment)
  if (configuration === undefined) {
    return skipped('custody_configuration_invalid')
  }
  const observedAt = dependencies.now ?? Date.now()
  const bufferUnits = configuration.maxAtomic.toString()
  if (!UNITS_PATTERN.test(bufferUnits)) return skipped('custody_buffer_out_of_range')
  const evm = (dependencies.createBalanceReader ?? officialCdpBalanceReader)(configuration)
  const address = configuration.expectedEvmAddress as `0x${string}`
  const observations: TreasuryObservationSummary[] = []
  let reason: string | undefined
  for (const environment of [activeEnvironment]) {
    const profile = x402PaymentProfileForEnvironment(environment)
    if (profile === undefined) {
      reason ??= 'payment_profile_unavailable'
      continue
    }
    const network = CDP_NETWORK_BY_ENVIRONMENT[environment]
    const balance = await readCdpUsdcBalance(evm, address, {
      network,
      assetAddress: profile.asset,
    })
    if (balance.kind !== 'read') {
      reason ??= `balance_${balance.kind}`
      continue
    }
    const totalUnits = balance.amount.toString()
    if (!UNITS_PATTERN.test(totalUnits)) {
      reason ??= 'balance_out_of_range'
      continue
    }
    const custodyRef = cdpX402CustodyBudgetRef(configuration, environment)
    const recorded = await ctx.runMutation(internal.moneyTreasury.recordObservation, {
      environment,
      custodyRef,
      custodyGeneration: configuration.credentialGeneration,
      network: profile.network,
      asset: 'USDC',
      exponent: 6,
      observationRef: `treasury-observation:${custodyRef}:${observedAt}`,
      totalUnits,
      bufferUnits,
      evidenceRef: `cdp-balance:${address}:${network}:${observedAt}`,
      evidenceDigest: canonicalDigest({
        format: 'ae.treasury-balance-read:v1',
        address,
        network,
        asset: profile.asset,
        totalUnits,
        pagesRead: balance.pagesRead,
      }),
      observedAt,
    }) as Readonly<{ kind: 'accepted' } | { kind: 'refused'; code: string }>
    if (recorded.kind === 'refused') {
      reason ??= recorded.code
      continue
    }
    observations.push({ environment, network: profile.network, totalUnits })
  }
  if (observations.length === 0) return skipped(reason ?? 'treasury_observation_unavailable')
  return reason === undefined
    ? { kind: 'recorded', observations }
    : { kind: 'recorded', reason, observations }
}

function skipped(reason: string): TreasuryObservationResult {
  console.warn('money_treasury_observation_skipped', { workload: WORKLOAD_NAME, reason })
  return { kind: 'skipped', reason, observations: [] }
}

export const observe = internalAction({
  args: { workload: workloadCronSnapshotValue },
  returns: resultValue,
  handler: async (ctx, args) => {
    const workload: WorkloadCronSnapshot = await ctx.runQuery(internal.workloadCron.reconcile, {
      name: WORKLOAD_NAME,
      snapshot: parseWorkloadCronSnapshot(args.workload),
    })
    const bound = bindWorkloadCronActionContext(ctx, { name: WORKLOAD_NAME, snapshot: workload })
    const observation = await observeTreasuryHandler(bound)
    // Pending native posting recovery does not depend on the CDP balance API.
    // Quote freshness still comes from the separately recorded observation.
    const deposits = await reconcileTreasuryDeposits(bound, {
      admit: async () => {
        await ctx.runQuery(internal.workloadCron.reconcile, { name: WORKLOAD_NAME, snapshot: workload })
        return true
      },
    })
    if (deposits.kind === 'unavailable') console.warn('treasury_reconciliation_unavailable', { code: deposits.code })
    return observation
  },
})
