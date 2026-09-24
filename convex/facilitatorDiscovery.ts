import { internalMutation } from './_generated/server'
import { reconcileArgs, reconcileResult } from './lib/facilitatorDiscovery/contracts'
import { reconcileHandler } from './lib/facilitatorDiscovery/reconcile'

export const reconcile = internalMutation({
  args: reconcileArgs.fields,
  returns: reconcileResult,
  handler: reconcileHandler,
})
