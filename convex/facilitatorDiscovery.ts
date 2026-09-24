import { internalMutation } from './_generated/server'
import { reconcileArgs, reconcileResult } from './lib/capabilitySupply/facilitatorDiscovery/contracts'
import { reconcileHandler } from './lib/capabilitySupply/facilitatorDiscovery/reconcile'

export const reconcile = internalMutation({
  args: reconcileArgs.fields,
  returns: reconcileResult,
  handler: reconcileHandler,
})
