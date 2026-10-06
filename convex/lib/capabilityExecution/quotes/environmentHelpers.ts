import { type Infer } from 'convex/values'

import { internal } from '../../../_generated/api'
import type { ActionCtx } from '../../../_generated/server'
import { env } from '../../../_generated/server'
import type { StringEnvironment } from '@/lib/server/read-trimmed-env'
import { formanceFinancialSnapshot, type PreparedFinancialSubjects } from './contracts'

export function currentUtcMonthWindow(): { periodStartAt: number; periodEndAt: number } {
  const now = new Date()
  return {
    periodStartAt: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    periodEndAt: Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  }
}

export function cdpX402CustodyEnvironment(): StringEnvironment {
  return {
    CDP_API_KEY_ID: env.CDP_API_KEY_ID,
    CDP_API_KEY_SECRET: env.CDP_API_KEY_SECRET,
    CDP_WALLET_SECRET: env.CDP_WALLET_SECRET,
    AE_X402_CDP_ACCOUNT_NAME: env.AE_X402_CDP_ACCOUNT_NAME,
    AE_X402_CDP_EXPECTED_EVM_ADDRESS: env.AE_X402_CDP_EXPECTED_EVM_ADDRESS,
    AE_X402_CDP_ACCOUNT_POLICY_ID: env.AE_X402_CDP_ACCOUNT_POLICY_ID,
    AE_X402_CDP_PROJECT_POLICY_ID: env.AE_X402_CDP_PROJECT_POLICY_ID,
    AE_X402_CDP_POLICY_RULES_DIGEST: env.AE_X402_CDP_POLICY_RULES_DIGEST,
    AE_X402_CDP_CREDENTIAL_GENERATION: env.AE_X402_CDP_CREDENTIAL_GENERATION,
    AE_X402_CUSTODY_ENABLED: env.AE_X402_CUSTODY_ENABLED,
    AE_X402_CUSTODY_MAX_ATOMIC: env.AE_X402_CUSTODY_MAX_ATOMIC,
    AE_X402_CUSTODY_DAILY_MAX_ATOMIC: env.AE_X402_CUSTODY_DAILY_MAX_ATOMIC,
  }
}

export async function readOrganizationMonthlySpendSnapshotForQuote(
  ctx: Pick<ActionCtx, 'runAction' | 'runQuery'>,
  subjects: PreparedFinancialSubjects,
): Promise<Infer<typeof formanceFinancialSnapshot>['organizationMonthlySpend']> {
  if (subjects.organizationMonthlySpendBudget === undefined) return undefined
  const { periodStartAt, periodEndAt } = currentUtcMonthWindow()
  const accountSpend = await ctx.runAction(internal.moneyFormance.readPeriodSpend, {
    accountRef: subjects.accountRef,
    periodStartAt,
    periodEndAt,
  })
  const held = await ctx.runQuery(internal.capabilityPlans.readOutstandingPlanExposure, {
    accountRef: subjects.accountRef, organizationMonth: new Date(periodStartAt).toISOString().slice(0, 7),
  })
  return {
    enabled: true,
    ceilingUnits: subjects.organizationMonthlySpendBudget.ceilingUnits,
    heldPlanExposure: held.kind === 'available' ? { kind: 'known', units: held.units } : { kind: 'unavailable' },
    ...(accountSpend.kind === 'available'
      ? { monthSpendUnits: accountSpend.spendUnits }
      : accountSpend.kind === 'empty'
        ? { monthSpendUnits: '0' }
        : {}),
  }
}
