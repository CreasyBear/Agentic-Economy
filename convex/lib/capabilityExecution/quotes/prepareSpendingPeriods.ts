import { v } from 'convex/values'

import {
  normalizeStoredAgentAccessGrant,
  projectAgentAccessGrant,
} from '@/modules/agent-access/policy'

import { principalValue } from '../callLifecycle/contracts'
import { resolveCurrentAgentAuthority } from '../callLifecycle/agentCallAuthority'
import { prepareAgentSpendingPeriods } from '../../money/spendingPeriods/periods'
import { spendingPeriodPreparationResult } from './contracts'
import type { Infer } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'

export const prepareSpendingPeriodsArgs = {
  principal: principalValue,
  toolRef: v.string(),
}

export const prepareSpendingPeriodsResult = spendingPeriodPreparationResult

type PrepareSpendingPeriodsArgs = {
  principal: Infer<typeof principalValue>
  toolRef: string
}

export async function prepareSpendingPeriodsHandler(
  ctx: MutationCtx,
  args: PrepareSpendingPeriodsArgs,
): Promise<Infer<typeof spendingPeriodPreparationResult>> {
  const now = Date.now()
  const authority = await resolveCurrentAgentAuthority(
    ctx,
    args.principal,
    now,
    { kind: 'new_operation', toolRef: args.toolRef },
  )
  if (authority === null) return { kind: 'refused' as const, reason: 'spending_period_authority_stale' }
  const grantRow = await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', authority.grantRef))
    .unique()
  if (grantRow === null) return { kind: 'refused' as const, reason: 'spending_period_authority_stale' }
  let grant
  try {
    grant = normalizeStoredAgentAccessGrant(grantRow as never)
  } catch (cause) {
    void cause
    return { kind: 'refused' as const, reason: 'spending_period_authority_stale' }
  }
  if (grant === undefined || grant.generation !== authority.grantGeneration) {
    return { kind: 'refused' as const, reason: 'spending_period_authority_stale' }
  }
  const projected = projectAgentAccessGrant(grant)
  const daily = projected.budget.maximumDailySpend
  const monthly = projected.budget.maximumMonthlySpend
  if (daily.currency !== 'AUD' || daily.exponent !== 6
    || monthly.currency !== 'AUD' || monthly.exponent !== 6) {
    return { kind: 'refused' as const, reason: 'spending_period_input_invalid' }
  }
  return await prepareAgentSpendingPeriods(ctx, {
    principalRef: authority.principal.principalId,
    dailyLimitUnits: daily.units,
    monthlyLimitUnits: monthly.units,
    authorityDigest: authority.policyDigest,
    now,
  })
}
