"use node"

import type { RegisteredAction } from 'convex/server'
import { internalAction } from './_generated/server'
import {
  probeResultValue,
  probeArgs,
  probeOwnerStagedArgs,
  probeFromCronArgs,
  type ProbeArgs,
  type OwnerStagedProbeArgs,
  type ProbeResult,
} from './lib/capabilitySupply/readiness/contracts'
import { probeHandler, probeOwnerStagedHandler } from './lib/capabilitySupply/readiness/probe'
import { probeFromCronHandler } from './lib/capabilitySupply/readiness/cron'

export const probe: RegisteredAction<'internal', ProbeArgs, ProbeResult> = internalAction({
  args: probeArgs,
  returns: probeResultValue,
  handler: probeHandler,
})

export const probeOwnerStaged: RegisteredAction<'internal', OwnerStagedProbeArgs, ProbeResult> = internalAction({
  args: probeOwnerStagedArgs,
  returns: probeResultValue,
  handler: probeOwnerStagedHandler,
})

export const probeFromCron = internalAction({
  args: probeFromCronArgs,
  returns: probeResultValue,
  handler: probeFromCronHandler,
})
