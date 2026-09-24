import { v } from 'convex/values'
import { internalAction, internalMutation, internalQuery } from './_generated/server'
import { admitWorkloadCronHandler, reconcileWorkloadCronSnapshotHandler } from './lib/workloadCron/admission'
import { ensurePlatformWorkloadIdentitiesHandler } from './lib/workloadCron/identities'
import { dispatchWorkloadCronConsequenceHandler } from './lib/workloadCron/consequence'
import { consequenceJsonValue, consequenceOperationValue, consequencePayloadValue } from './lib/workloadCron/consequenceContracts'
import { workloadCronNameValue, workloadCronSnapshotValue } from './lib/workloadCron/context'
import {
  cleanupExpiredAgentAccessOAuthGrantsHandler, cleanupExpiredSourceWriteNoncesHandler,
  observeX402TreasuryHandler, reconcileBusinessSupplyProjectionsHandler,
  reconcileDueFacilitatorInvocationsHandler, refreshAgenticEconomyApiRegistryHandler,
  refreshCapabilitySupplyReadinessHandler, refreshCurrentMarketPresenceHandler,
  refreshFacilitatorDiscoveryHandler, refreshMarketFlowHandler,
  snapshotMarketplaceMetricsDayHandler,
} from './lib/workloadCron/scheduled'

export const admit = internalQuery({
  args: { name: workloadCronNameValue },
  returns: workloadCronSnapshotValue,
  handler: admitWorkloadCronHandler,
})

export const ensurePlatformWorkloadIdentities = internalMutation({
  args: {},
  returns: v.object({
    kind: v.literal('ensured'),
    created: v.array(v.string()),
  }),
  handler: ensurePlatformWorkloadIdentitiesHandler,
})

export const reconcile = internalQuery({
  args: {
    name: workloadCronNameValue,
    snapshot: workloadCronSnapshotValue,
  },
  returns: workloadCronSnapshotValue,
  handler: reconcileWorkloadCronSnapshotHandler,
})

export const dispatchConsequence = internalMutation({
  args: {
    name: workloadCronNameValue,
    snapshot: workloadCronSnapshotValue,
    resourceInvocationRef: v.optional(v.string()),
    operation: consequenceOperationValue,
    payload: consequencePayloadValue,
  },
  returns: consequenceJsonValue,
  handler: dispatchWorkloadCronConsequenceHandler,
})

export const reconcileDueFacilitatorInvocations = internalAction({
  args: {},
  returns: v.null(),
  handler: reconcileDueFacilitatorInvocationsHandler,
})

export const refreshFacilitatorDiscovery = internalAction({
  args: {},
  returns: v.null(),
  handler: refreshFacilitatorDiscoveryHandler,
})

export const refreshAgenticEconomyApiRegistry = internalAction({
  args: {},
  returns: v.null(),
  handler: refreshAgenticEconomyApiRegistryHandler,
})

export const refreshCurrentMarketPresence = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: refreshCurrentMarketPresenceHandler,
})

export const refreshCapabilitySupplyReadiness = internalMutation({
  args: {},
  returns: v.null(),
  handler: refreshCapabilitySupplyReadinessHandler,
})

export const reconcileBusinessSupplyProjections = internalMutation({
  args: {},
  returns: v.null(),
  handler: reconcileBusinessSupplyProjectionsHandler,
})

export const cleanupExpiredSourceWriteNonces = internalMutation({
  args: { now: v.optional(v.number()), batchSize: v.optional(v.number()) },
  returns: v.null(),
  handler: cleanupExpiredSourceWriteNoncesHandler,
})

export const cleanupExpiredAgentAccessOAuthGrants = internalMutation({
  args: { now: v.optional(v.number()), batchSize: v.optional(v.number()) },
  returns: v.null(),
  handler: cleanupExpiredAgentAccessOAuthGrantsHandler,
})

export const observeX402Treasury = internalAction({
  args: {},
  returns: v.null(),
  handler: observeX402TreasuryHandler,
})

export const refreshMarketFlow = internalAction({
  args: {},
  returns: v.null(),
  handler: refreshMarketFlowHandler,
})

export const snapshotMarketplaceMetricsDay = internalAction({
  args: {},
  returns: v.null(),
  handler: snapshotMarketplaceMetricsDayHandler,
})
