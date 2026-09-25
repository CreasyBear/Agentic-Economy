import { v } from 'convex/values'
import { internalAction, internalMutation } from './_generated/server'
import {
  cleanupArgs,
  completeWorkArgs,
  workerResult,
  runCleanupHandler,
} from './lib/capabilitySupply/providerConnections/cleanupWork'
import { completeWorkHandler } from './lib/capabilitySupply/providerConnections/cleanup'

export const run = internalAction({
  args: cleanupArgs,
  returns: workerResult,
  handler: runCleanupHandler,
})

export const completeWork = internalMutation({
  args: completeWorkArgs,
  returns: v.null(),
  handler: completeWorkHandler,
})
