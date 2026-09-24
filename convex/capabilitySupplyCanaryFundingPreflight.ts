"use node"

import { CdpClient } from '@coinbase/cdp-sdk'
import { v } from 'convex/values'

import type { CdpX402CustodyConfiguration } from '@/modules/capability-supply/convex'

import { internal } from './_generated/api'
import { internalAction, type ActionCtx } from './_generated/server'
import {
  readCdpUsdcBalance,
  type CdpUsdcBalanceReader,
  type CdpUsdcNetwork,
} from './lib/capabilitySupply/canaryFunding/preflightBalance'
import {
  inspectSellerOnboardingCanaryCdpReadinessCore,
  notReady,
  resultValue,
  type CdpPreflightClient,
  type SellerOnboardingCanaryCdpPreflightCode,
  type SellerOnboardingCanaryCdpPreflightDependencies,
  type SellerOnboardingCanaryCdpPreflightResult,
} from './lib/capabilitySupply/canaryFunding/preflightInspect'

export type { CdpUsdcNetwork, CdpUsdcBalanceReader }
export type {
  SellerOnboardingCanaryCdpPreflightCode,
  SellerOnboardingCanaryCdpPreflightDependencies,
  SellerOnboardingCanaryCdpPreflightResult,
}
export { readCdpUsdcBalance }

function createOfficialCdpPreflightClient(
  configuration: CdpX402CustodyConfiguration,
): CdpPreflightClient {
  const client = new CdpClient({
    apiKeyId: configuration.apiKeyId,
    apiKeySecret: configuration.apiKeySecret,
    walletSecret: configuration.walletSecret,
  })
  return {
    evm: {
      getAccount: async (options) => {
        const account = await client.evm.getAccount(options)
        return {
          address: account.address,
          ...(account.name === undefined ? {} : { name: account.name }),
          ...(account.policies === undefined ? {} : { policies: account.policies }),
        }
      },
      listTokenBalances: async (options) => client.evm.listTokenBalances(options),
    },
    policies: {
      getPolicyById: async (options) => {
        const policy = await client.policies.getPolicyById(options)
        return {
          id: policy.id,
          scope: policy.scope,
          rules: policy.rules,
        }
      },
    },
  }
}

export async function inspectSellerOnboardingCanaryCdpReadiness(
  checkedAt: number,
  dependencies: SellerOnboardingCanaryCdpPreflightDependencies = {},
): Promise<SellerOnboardingCanaryCdpPreflightResult> {
  const createClient = dependencies.createClient ?? createOfficialCdpPreflightClient
  return await inspectSellerOnboardingCanaryCdpReadinessCore(checkedAt, {
    ...dependencies,
    createClient,
  })
}

export async function readSellerOnboardingCanaryCdpReadinessHandler(
  ctx: ActionCtx,
  args: Readonly<{ now: number; environment?: 'sandbox' | 'production' }>,
): Promise<SellerOnboardingCanaryCdpPreflightResult> {
  const aeEnvironment = args.environment ?? 'sandbox'
  const configured = aeEnvironment === 'production'
    ? await ctx.runQuery(
        internal.capabilitySupplyCanaryFunding.readProductionSellerOnboardingCanaryFundingReadiness,
        { now: args.now },
      )
    : await ctx.runQuery(
        internal.capabilitySupplyCanaryFunding.readSellerOnboardingCanaryFundingReadiness,
        { now: args.now },
      )
  if (configured.kind !== 'ready') {
    return notReady(args.now, 'ae_canary_funding_not_ready')
  }
  return await inspectSellerOnboardingCanaryCdpReadiness(args.now, {
    environment: process.env,
    aeEnvironment,
  })
}

export const readSellerOnboardingCanaryCdpReadiness = internalAction({
  args: {
    now: v.number(),
    environment: v.optional(v.union(v.literal('sandbox'), v.literal('production'))),
  },
  returns: resultValue,
  handler: readSellerOnboardingCanaryCdpReadinessHandler,
})
