import {
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
} from 'convex/server'
import { v } from 'convex/values'
import { workloadCronSnapshotValue } from './workloadCron'

import {
  publishPreparedCapabilityArgs,
  publishPreparedCapabilityHandler,
  preparedPublicationResultValue,
  readCapabilityPublicationArgs,
  readCapabilityPublicationHandler,
  capabilityPublicationValue,
  verifyCapabilitySourceAuthorityArgs,
  verifyCapabilitySourceAuthorityHandler,
  verifyCapabilitySourceAuthorityResultValue,
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
  queryCapabilityGraphHandler,
  capabilityGraphResultValue,
  inspectBindingControlStateArgs,
  inspectBindingControlStateHandler,
  bindingControlStateValue,
} from './capabilitySupplyGraph'
import {
  listIntegratedArgs,
  listIntegratedHandler,
  listRouteableArgs,
  listRouteableHandler,
  listMappingsArgs,
  listMappingsHandler,
  listMappingsReturns,
  eligibleSupplyResultValue,
  authorizeOwnerSupplyActionArgs,
  authorizeOwnerSupplyActionHandler,
  recordCapabilityCallEventArgs,
  recordCapabilityCallEventHandler,
  recordCapabilityCallEventReturns,
} from './capabilitySupplyLists'
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
export {
  ownsPublishedBusiness,
  ownsPublishedBusinessForOwnerId,
  rebuildCapabilityOriginSupplyProjection,
} from './capabilitySupplyShared'
export {
  registerCuratedMapping,
  registerCapabilityOffering,
  registerCapabilityTransportBinding,
  setCapabilitySupplyEligibility,
  registerCapabilityOfferingCommand,
  registerCapabilityBindingCommand,
  setCapabilitySupplyEligibilityCommand,
  quarantineCapabilityBindingCommand,
} from './capabilitySupplyCommands'
export {
  listIntegratedCapabilitySupply,
  listRouteableCapabilitySupply,
  getEligibleExactCapabilitySupply,
} from './capabilitySupplyLists'

export const publishPreparedCapability = mutationGeneric({
  args: publishPreparedCapabilityArgs,
  returns: preparedPublicationResultValue,
  handler: publishPreparedCapabilityHandler,
})

export const verifyCapabilitySourceAuthority = mutationGeneric({
  args: verifyCapabilitySourceAuthorityArgs,
  returns: verifyCapabilitySourceAuthorityResultValue,
  handler: verifyCapabilitySourceAuthorityHandler,
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
