import { v } from 'convex/values'
import { internalMutation } from './_generated/server'
import { spendingPeriodAdjustmentValue } from '../src/modules/money/public'
import { acknowledgeAgentSpendingPeriod } from './lib/money/spendingPeriods/periods'

export const acknowledge = internalMutation({
  args: { command: spendingPeriodAdjustmentValue, transactionRefs: v.array(v.string()) },
  returns: v.object({ kind: v.union(v.literal('applied'), v.literal('replayed'), v.literal('conflict')) }),
  handler: acknowledgeAgentSpendingPeriod,
})
