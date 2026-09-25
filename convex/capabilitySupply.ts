import { runAdminCommand } from './lib/adminConsole/commands/commandEnvelope'
import {
  sourceAuthorityArgs,
  sourceAuthorityReceiptValue,
  sourceAuthoritySpec,
} from './lib/adminConsole/actions/sourceAuthority'
import {
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
} from 'convex/server'
import { v } from 'convex/values'
import { workloadCronSnapshotValue } from './lib/platform/workloadCron/context'

import {
  publishPreparedCapabilityArgs,
  publishPreparedCapabilityHandler,
  preparedPublicationResultValue,
  readCapabilityPublicationArgs,
  readCapabilityPublicationHandler,
  capabilityPublicationValue,
} from './capabilitySupplyPublish'
import {
  observeCapabilityReadinessArgs,
  observeCapabilityReadinessHandler,
  observeCapabilityReadinessReturns,
  readCapabilityProbeTargetArgs,
  readCapabilityProbeTargetHandler,
  readCapabilityProbeTargetReturns,
  readOwnerStagedCapabilityProbeTargetArgs,
  readOwnerStagedCapabilityProbeTargetHandler,
  recordCapabilityProbeResultArgs,
  recordCapabilityProbeResultHandler,
  recordCapabilityProbeResultReturns,
  recordOwnerStagedCapabilityProbeResultArgs,
  recordOwnerStagedCapabilityProbeResultHandler,
  scheduleDueCapabilityProbesHandler,
} from './capabilitySupplyProbes'
import {
  queryCapabilityGraphArgs,
  capabilityGraphResultValue,
  inspectBindingControlStateArgs,
  bindingControlStateValue,
} from './lib/capabilitySupply/graphPorts/contracts'
import {
  queryCapabilityGraphHandler,
  inspectBindingControlStateHandler,
} from './lib/capabilitySupply/graphPorts/reads'
import {
  listIntegratedArgs,
  listRouteableArgs,
  listMappingsArgs,
  listMappingsReturns,
  eligibleSupplyResultValue,
  authorizeOwnerSupplyActionArgs,
  recordCapabilityCallEventArgs,
  recordCapabilityCallEventReturns,
} from './lib/capabilitySupply/lists/contracts'
import {
  listIntegratedHandler,
  listRouteableHandler,
  listMappingsHandler,
  authorizeOwnerSupplyActionHandler,
} from './lib/capabilitySupply/lists/reads'
import { recordCapabilityCallEventHandler } from './lib/capabilitySupply/lists/callEvent'
import {
  stageOwnerX402CapabilityArgs,
  stageOwnerX402CapabilityHandler,
  stageOwnerX402CapabilityReturns,
} from './capabilitySupplyOwnerStaging'

export {
  publicationPorts,
  publishCapabilityForSeed,
  publishCuratedCapability,
  withdrawCuratedCapability,
} from './capabilitySupplyPublish'
export { ownsPublishedBusiness, ownsPublishedBusinessForOwnerId } from './lib/capabilitySupply/publish/ownership'
export { rebuildCapabilityOriginSupplyProjection } from './lib/capabilitySupply/projection/rebuild'
export {
  registerCapabilityOffering,
  registerCapabilityTransportBinding,
  setCapabilitySupplyEligibility,
  registerCapabilityOfferingCommand,
  registerCapabilityBindingCommand,
  setCapabilitySupplyEligibilityCommand,
  quarantineCapabilityBindingCommand,
} from './lib/capabilitySupply/commands/writes'
export {
  listIntegratedCapabilitySupply,
  listRouteableCapabilitySupply,
  getEligibleExactCapabilitySupply,
} from './lib/capabilitySupply/lists/reads'

export const publishPreparedCapability = mutationGeneric({
  args: publishPreparedCapabilityArgs,
  returns: preparedPublicationResultValue,
  handler: publishPreparedCapabilityHandler,
})

export const verifyCapabilitySourceAuthority = mutationGeneric({
  args: sourceAuthorityArgs,
  returns: sourceAuthorityReceiptValue,
  handler: (ctx, args) => runAdminCommand(ctx, args, sourceAuthoritySpec(ctx, args)),
})

export const stageOwnerX402Capability = mutationGeneric({
  args: stageOwnerX402CapabilityArgs,
  returns: stageOwnerX402CapabilityReturns,
  handler: stageOwnerX402CapabilityHandler,
})

export const readCapabilityPublication = queryGeneric({
  args: readCapabilityPublicationArgs,
  returns: v.union(capabilityPublicationValue, v.null()),
  handler: readCapabilityPublicationHandler,
})

/** Fixture/curated-seed helper. Production owner readiness uses probe → record. */
export const observeCapabilityReadiness = internalMutationGeneric({
  args: observeCapabilityReadinessArgs,
  returns: observeCapabilityReadinessReturns,
  handler: observeCapabilityReadinessHandler,
})

export const readCapabilityProbeTarget = internalQueryGeneric({
  args: readCapabilityProbeTargetArgs,
  returns: readCapabilityProbeTargetReturns,
  handler: readCapabilityProbeTargetHandler,
})

export const readOwnerStagedCapabilityProbeTarget = internalQueryGeneric({
  args: readOwnerStagedCapabilityProbeTargetArgs,
  returns: readCapabilityProbeTargetReturns,
  handler: readOwnerStagedCapabilityProbeTargetHandler,
})

export const recordCapabilityProbeResult = internalMutationGeneric({
  args: recordCapabilityProbeResultArgs,
  returns: recordCapabilityProbeResultReturns,
  handler: recordCapabilityProbeResultHandler,
})

export const recordOwnerStagedCapabilityProbeResult = internalMutationGeneric({
  args: recordOwnerStagedCapabilityProbeResultArgs,
  returns: recordCapabilityProbeResultReturns,
  handler: recordOwnerStagedCapabilityProbeResultHandler,
})

export const scheduleDueCapabilityProbes = internalMutationGeneric({
  args: { workload: workloadCronSnapshotValue },
  returns: v.number(),
  handler: scheduleDueCapabilityProbesHandler,
})

export const queryCapabilityGraph = queryGeneric({
  args: queryCapabilityGraphArgs,
  returns: capabilityGraphResultValue,
  handler: queryCapabilityGraphHandler,
})

export const inspectBindingControlState = queryGeneric({
  args: inspectBindingControlStateArgs,
  returns: bindingControlStateValue,
  handler: inspectBindingControlStateHandler,
})

export const listIntegrated = internalQueryGeneric({
  args: listIntegratedArgs,
  returns: eligibleSupplyResultValue,
  handler: listIntegratedHandler,
})

export const listRouteable = internalQueryGeneric({
  args: listRouteableArgs,
  returns: eligibleSupplyResultValue,
  handler: listRouteableHandler,
})

export const listMappings = internalQueryGeneric({
  args: listMappingsArgs,
  returns: listMappingsReturns,
  handler: listMappingsHandler,
})

export const authorizeOwnerSupplyAction = internalQueryGeneric({
  args: authorizeOwnerSupplyActionArgs,
  returns: v.boolean(),
  handler: authorizeOwnerSupplyActionHandler,
})

export const recordCapabilityCallEvent = internalMutationGeneric({
  args: recordCapabilityCallEventArgs,
  returns: recordCapabilityCallEventReturns,
  handler: recordCapabilityCallEventHandler,
})
