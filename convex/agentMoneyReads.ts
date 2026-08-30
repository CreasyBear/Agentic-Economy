import { mutationGeneric } from 'convex/server'

import {
  agentActivityArgs,
  agentActivityResult,
  agentBalanceArgs,
  agentBalanceResult,
  listAgentActivityHandler,
  readAgentBalanceHandler,
} from './lib/agentMoneyReads'

export const balance = mutationGeneric({
  args: agentBalanceArgs,
  returns: agentBalanceResult,
  handler: readAgentBalanceHandler,
})

export const activity = mutationGeneric({
  args: agentActivityArgs,
  returns: agentActivityResult,
  handler: listAgentActivityHandler,
})
