import { v } from 'convex/values'
import { contentRetentionArgs, expireAlphaContentHandler } from './lib/capabilityExecution/contentRetention/cleanup'
import { internalAction, internalQuery } from './_generated/server'
import { internalMutation } from './usageTrackedMutation'
import { admitWorkloadCronHandler, reconcileWorkloadCronSnapshotHandler } from './lib/platform/workloadCron/admission'
import { ensurePlatformWorkloadIdentitiesHandler } from './lib/platform/workloadCron/identities'
import { dispatchWorkloadCronConsequenceHandler } from './lib/platform/workloadCron/consequence'
import { consequenceJsonValue, consequenceOperationValue, consequencePayloadValue } from './lib/platform/workloadCron/contracts'
import { workloadCronNameValue, workloadCronSnapshotValue } from './lib/platform/workloadCron/context'
import {
  cleanupExpiredAgentAccessOAuthGrantsHandler, cleanupExpiredSourceWriteNoncesHandler,
  expireStalePendingApprovalsHandler, observeX402TreasuryHandler,
  reconcileBusinessSupplyProjectionsHandler, reconcilePromotionalCreditHandler, reconcilePaidCallReportsHandler,
  reconcileDueFacilitatorInvocationsHandler, refreshAgenticEconomyApiRegistryHandler,
  refreshCapabilitySupplyReadinessHandler, refreshCurrentMarketPresenceHandler,
  refreshFacilitatorDiscoveryHandler, refreshMarketFlowHandler,
  refreshReferenceRateHandler, refreshPaymentReadinessHandler,
  retryJourneyEventForwardsHandler, sendOperatorDigestHandler, sendStalledStepEmailsHandler, snapshotMarketplaceMetricsDayHandler, reconcileTreasuryBalancesHandler,
} from './lib/platform/workloadCron/scheduled'

export const admit = internalQuery({
  args: { name: workloadCronNameValue },
  returns: workloadCronSnapshotValue,
  handler: admitWorkloadCronHandler,
})

export const expireAlphaContent = internalMutation({
  args: contentRetentionArgs, returns: v.null(), handler: expireAlphaContentHandler,
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
export const expireStalePendingApprovals = internalMutation({
  args: {},
  returns: v.null(),
  handler: expireStalePendingApprovalsHandler,
})


export const refreshFacilitatorDiscovery = internalAction({
  args: {},
  returns: v.null(),
  handler: refreshFacilitatorDiscoveryHandler,
})
export const refreshReferenceRate = internalAction({
  args: {},
  returns: v.null(),
  handler: refreshReferenceRateHandler,
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

export const sendOperatorDigest = internalAction({
  args: {},
  returns: v.null(),
  handler: sendOperatorDigestHandler,
})

export const sendStalledStepEmails = internalAction({
  args: {},
  returns: v.null(),
  handler: sendStalledStepEmailsHandler,
})

export const retryJourneyEventForwards = internalAction({
  args: {},
  returns: v.null(),
  handler: retryJourneyEventForwardsHandler,
})

export const snapshotMarketplaceMetricsDay = internalAction({
  args: {},
  returns: v.null(),
  handler: snapshotMarketplaceMetricsDayHandler,
})

export const reconcilePromotionalCredit = internalAction({
  args: {}, returns: v.null(), handler: reconcilePromotionalCreditHandler,
})

export const reconcilePaidCallReports = internalAction({
  args: {}, returns: v.null(), handler: reconcilePaidCallReportsHandler,
})

export const reconcileTreasuryBalances = internalAction({ args: {}, returns: v.null(), handler: reconcileTreasuryBalancesHandler })

export const refreshPaymentReadiness = internalAction({ args: {}, returns: v.null(), handler: refreshPaymentReadinessHandler })
