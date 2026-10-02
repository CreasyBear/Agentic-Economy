import { mutation, query } from './_generated/server'
import { agentSpendingLimitsResultValue } from '@/modules/agent-access/policy'
import { updateForServerArgs, updateForServerHandler } from './lib/agentAccess/spendingPolicy/update'
import { readCurrentArgs, readCurrentResult, readCurrentHandler } from './lib/agentAccess/spendingPolicy/reads'

export const updateForServer = mutation({
  args: updateForServerArgs,
  returns: agentSpendingLimitsResultValue,
  handler: updateForServerHandler,
})

export const readCurrent = query({
  args: readCurrentArgs,
  returns: readCurrentResult,
  handler: readCurrentHandler,
})
