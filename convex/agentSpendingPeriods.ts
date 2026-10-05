import { financialEnvironmentValue } from './lib/money/formance/contracts'
import { v } from 'convex/values'
import { internalMutation } from './usageTrackedMutation'
import { spendingPeriodAdjustmentValue } from '../src/modules/money/public'
import { acknowledgeAgentSpendingPeriod } from './lib/money/spendingPeriods/periods'

export const acknowledge = internalMutation({
  args: { expectedEnvironment: financialEnvironmentValue, command: spendingPeriodAdjustmentValue, transactionRefs: v.array(v.string()) },
  returns: v.object({ kind: v.union(v.literal('applied'), v.literal('replayed'), v.literal('conflict')) }),
  handler: acknowledgeAgentSpendingPeriod,
})
