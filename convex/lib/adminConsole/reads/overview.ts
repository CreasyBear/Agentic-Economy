import type { UserIdentity } from 'convex/server'
import { v, type Infer } from 'convex/values'

import { cdpX402CustodyConfigurationFromEnvironment } from '@/modules/capability-supply/convex'
import { env, type QueryCtx } from '../../../_generated/server'


export const configuredValue = v.union(
  v.literal('configured'),
  v.literal('not_configured'),
)

export const adminOverviewValue = v.object({
  x402Custody: configuredValue,
  clerkFva: v.union(v.literal('present'), v.literal('absent')),
  convex: v.literal('ok'),
})

export type AdminOverviewView = Infer<typeof adminOverviewValue>

export function readAdminOverviewView(
  ctx: QueryCtx,
  identity: UserIdentity | null,
): AdminOverviewView {
  void ctx
  const custody = cdpX402CustodyConfigurationFromEnvironment({
    AE_X402_CUSTODY_ENABLED: env.AE_X402_CUSTODY_ENABLED,
    CDP_API_KEY_ID: env.CDP_API_KEY_ID,
    CDP_API_KEY_SECRET: env.CDP_API_KEY_SECRET,
    CDP_WALLET_SECRET: env.CDP_WALLET_SECRET,
    AE_X402_CDP_ACCOUNT_NAME: env.AE_X402_CDP_ACCOUNT_NAME,
    AE_X402_CDP_EXPECTED_EVM_ADDRESS: env.AE_X402_CDP_EXPECTED_EVM_ADDRESS,
    AE_X402_CDP_ACCOUNT_POLICY_ID: env.AE_X402_CDP_ACCOUNT_POLICY_ID,
    AE_X402_CDP_PROJECT_POLICY_ID: env.AE_X402_CDP_PROJECT_POLICY_ID,
    AE_X402_CDP_POLICY_RULES_DIGEST: env.AE_X402_CDP_POLICY_RULES_DIGEST,
    AE_X402_CDP_CREDENTIAL_GENERATION: env.AE_X402_CDP_CREDENTIAL_GENERATION,
    AE_X402_CUSTODY_MAX_ATOMIC: env.AE_X402_CUSTODY_MAX_ATOMIC,
    AE_X402_CUSTODY_DAILY_MAX_ATOMIC: env.AE_X402_CUSTODY_DAILY_MAX_ATOMIC,
  })
  return {
    x402Custody: custody === undefined ? 'not_configured' : 'configured',
    clerkFva: identity?.fva === undefined ? 'absent' : 'present',
    convex: 'ok',
  }
}
