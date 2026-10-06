import { internal } from '../../../_generated/api'
import type { ActionCtx } from '../../../_generated/server'
import type { PreparedFinancialSubjects } from './contracts'
import { financialEnvironmentMatches } from '../../money/formance/contracts'
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
  if (!financialEnvironmentMatches(authority.principal.environment)) return { kind: 'refused', reason: 'environment_mismatch' }
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


/** Shared acknowledgement loop for the existing Quote path and aggregate Plan Holds. */
export async function synchronizeSpendingPeriods(
  ctx: ActionCtx, subjects: PreparedFinancialSubjects, principal: Infer<typeof principalValue>, toolRef: string,
): Promise<Infer<typeof spendingPeriodPreparationResult>> {
  let spendingPeriods = subjects.spendingPeriods
  let commands = [...subjects.spendingPeriodCommands]
  if (spendingPeriods === undefined) return { kind: 'refused', reason: 'spending_period_missing' }
  for (let round = 0; round < 2 && commands.length > 0; round += 1) {
    for (const command of commands) {
      const adjusted = await ctx.runAction(internal.moneyFormance.adjustSpendingPeriod, { ...command, expectedEnvironment: subjects.expectedEnvironment })
      const count = command.previousLimitUnits === command.targetLimitUnits ? 0 : 1
      if (adjusted.kind !== 'completed' || adjusted.transactionRefs.length !== count) return { kind: 'refused', reason: 'spending_period_command_pending' }
      const acknowledged = await ctx.runMutation(internal.agentSpendingPeriods.acknowledge, {
        expectedEnvironment: subjects.expectedEnvironment, command, transactionRefs: [...adjusted.transactionRefs],
      })
      if (acknowledged.kind === 'conflict') return { kind: 'refused', reason: 'spending_period_command_pending' }
    }
    const refreshed = await ctx.runMutation(internal.capabilityQuotes.prepareSpendingPeriods, { principal, toolRef })
    if (refreshed.kind === 'refused') return refreshed
    spendingPeriods = refreshed.spendingPeriods
    commands = [...refreshed.commands]
  }
  return commands.length > 0 ? { kind: 'refused', reason: 'spending_period_command_pending' }
    : { kind: 'prepared', spendingPeriods, commands: [] }
}
