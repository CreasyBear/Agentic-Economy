"use node"

import { internal } from './_generated/api'
import { action, type ActionCtx } from './_generated/server'
import {
  runOwnerSupplyReadinessHandler,
  runOwnerSupplyTestHandler,
  type OwnerSupplyProbePorts,
} from './lib/capabilitySupply/ownerSupplyActions'
import {
  ownerSupplyActionResultValue,
  ownerSupplyInput,
  type OwnerSupplyActionResult,
} from './lib/capabilitySupply/ownerSupplyValues'

function ownerSupplyProbePorts(ctx: ActionCtx): OwnerSupplyProbePorts {
  return {
    probe: (probeArgs) => ctx.runAction(internal.capabilitySupplyReadiness.probe, probeArgs),
    probeOwnerStaged: (probeArgs) => ctx.runAction(internal.capabilitySupplyReadiness.probeOwnerStaged, probeArgs),
  }
}

export const runOwnerSupplyReadiness = action({
  args: ownerSupplyInput,
  returns: ownerSupplyActionResultValue,
  handler: async (ctx, args): Promise<OwnerSupplyActionResult> =>
    runOwnerSupplyReadinessHandler(ctx, args, ownerSupplyProbePorts(ctx)),
})

export const runOwnerSupplyTest = action({
  args: ownerSupplyInput,
  returns: ownerSupplyActionResultValue,
  handler: async (ctx, args): Promise<OwnerSupplyActionResult> =>
    runOwnerSupplyTestHandler(ctx, args, ownerSupplyProbePorts(ctx)),
})
