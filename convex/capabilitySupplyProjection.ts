import { internalMutation, query } from './_generated/server'
import {
  rebuildAllBusinessSupplyProjectionsArgs,
  rebuildAllBusinessSupplyProjectionsResult,
  rebuildAllBusinessSupplyProjectionsHandler,
} from './lib/capabilitySupply/projection/maintenance'
import {
  latestReconcileBusinessSupplyProjectionsCompletionArgs,
  latestReconcileBusinessSupplyProjectionsCompletionResult,
  latestReconcileBusinessSupplyProjectionsCompletionHandler,
} from './lib/capabilitySupply/projection/freshness'

export const rebuildAllBusinessSupplyProjections = internalMutation({
  args: rebuildAllBusinessSupplyProjectionsArgs,
  returns: rebuildAllBusinessSupplyProjectionsResult,
  handler: rebuildAllBusinessSupplyProjectionsHandler,
})

export const latestReconcileBusinessSupplyProjectionsCompletion = query({
  args: latestReconcileBusinessSupplyProjectionsCompletionArgs,
  returns: latestReconcileBusinessSupplyProjectionsCompletionResult,
  handler: latestReconcileBusinessSupplyProjectionsCompletionHandler,
})
