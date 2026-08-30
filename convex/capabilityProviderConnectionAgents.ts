import { mutationGeneric } from 'convex/server'

import {
  agentConnectionCommandResult,
  agentConnectionListResult,
  agentConnectionReadResult,
  connectX402AgentArgs,
  connectX402AgentHandler,
  listAgentArgs,
  listAgentHandler,
  readAgentArgs,
  readAgentHandler,
  reconnectAgentArgs,
  reconnectAgentHandler,
  retryCleanupAgentArgs,
  retryCleanupAgentHandler,
  revokeAgentArgs,
  revokeAgentHandler,
} from './lib/providerConnections/agent'

export const list = mutationGeneric({
  args: listAgentArgs,
  returns: agentConnectionListResult,
  handler: listAgentHandler,
})

export const read = mutationGeneric({
  args: readAgentArgs,
  returns: agentConnectionReadResult,
  handler: readAgentHandler,
})

export const connectX402 = mutationGeneric({
  args: connectX402AgentArgs,
  returns: agentConnectionCommandResult,
  handler: connectX402AgentHandler,
})

export const reconnect = mutationGeneric({
  args: reconnectAgentArgs,
  returns: agentConnectionCommandResult,
  handler: reconnectAgentHandler,
})

export const revoke = mutationGeneric({
  args: revokeAgentArgs,
  returns: agentConnectionCommandResult,
  handler: revokeAgentHandler,
})

export const retryCleanup = mutationGeneric({
  args: retryCleanupAgentArgs,
  returns: agentConnectionCommandResult,
  handler: retryCleanupAgentHandler,
})
