import { v } from 'convex/values'
import { action, internalQuery, query } from './_generated/server'
import { internalMutation, mutation } from './usageTrackedMutation'
import {
  cancelBeforeClaimArgs, dispatchArgs, dispatchResult, finalizeDispatchArgs,
  callDispatchMutationArgs, callDispatchMutationResult, ownerCallStatusResultValue,
  callSummaryPageValue, currentProviderConnectionAuthorityValue, projectRecoveryArgs,
  reconciledCallAuthorityResult, recordArgs, recordResult, workCompletionArgs,
} from './lib/capabilityExecution/callLifecycle/contracts'
import { approvalDecisionResult } from './lib/capabilityExecution/callLifecycle/admissionApproval'
import {
  continueApprovalExpiryArgs, continueApprovalExpiryHandler, expireStaleApprovalHandler, expireStalePendingApprovalsHandler,
} from './lib/capabilityExecution/callLifecycle/admissionApprovals'
import { workloadCronSnapshotValue } from './lib/platform/workloadCron/context'
import { abandonArgs, abandonResult, reserveArgs, reserveResult } from './lib/capabilityExecution/callLifecycle/admissionReservation'
import { callArgs, admitArgs, admitResult, admitHandler } from './lib/capabilityExecution/callLifecycle/admission'
import { reserveHandler } from './lib/capabilityExecution/callLifecycle/admissionReserve'
import { abandonHandler } from './lib/capabilityExecution/callLifecycle/admissionHold'
import {
  readPurchaseResolutionArgs, readPurchaseResolutionResult, readPurchaseResolutionHandler,
} from './lib/capabilityExecution/callLifecycle/purchaseResolutionMaterialize'
import {
  reconciliationClaimResult, reconciliationFinishResult,
  listDueAutomaticReconciliationCandidatesArgs, listDueAutomaticReconciliationCandidatesResult,
  claimAutomaticReconciliationCandidateArgs, finishAutomaticReconciliationArgs,
  claimAutomaticReconciliationCandidateHandler, claimDispatchWithReconciliationInitialization,
  completeWorkWithReconciliationInitialization, finishAutomaticReconciliationHandler,
  finalizeDispatchWithReconciliationInitialization, cancelBeforeClaimWithReconciliationInitialization,
  listDueAutomaticReconciliationCandidatesHandler, projectRecoveryWithReconciliationInitialization,
  recordWithReconciliationInitialization, reconcileFinishedDispatchesArgs,
  reconcileFinishedDispatchesResult, reconcileFinishedDispatchesHandler,
} from './lib/capabilityExecution/callLifecycle/reconciliation'
import {
  quarantineRestoredDispatchesArgs, quarantineRestoredDispatchesResult, quarantineRestoredDispatchesHandler,
} from './lib/capabilityExecution/callLifecycle/restoredDispatches'
import {
  resolveCallAgentAuthorityArgs, resolveCallAgentAuthorityResult, resolveCallAgentAuthorityHandler,
  reconcileCallWorkloadAuthorityArgs, readAcceptedCallGrantAfterLimitUpdateArgs,
  readAcceptedCallGrantAfterLimitUpdateResult,
} from './lib/capabilityExecution/callLifecycle/agentCallAuthority'
import {
  canonicalAgentCancelHandler, canonicalAgentCallHandler,
  canonicalAgentListHandler, canonicalAgentReconcileHandler,
} from './lib/capabilityExecution/callLifecycle/agentCallExecution'
import {
  canonicalOwnerApprovalDecisionHandler, canonicalOwnerApprovalListHandler,
  canonicalOwnerCancelHandler, canonicalOwnerReconcileHandler, canonicalOwnerStatusHandler,
  listPendingCallApprovalsArgs, listPendingCallApprovalsResult, decideCallApprovalArgs,
} from './lib/capabilityExecution/callLifecycle/ownerCallAuthority'
import {
  reconcileCallWorkloadAuthorityHandler,
  readAcceptedCallGrantAfterLimitUpdateHandler,
} from './lib/capabilityExecution/callLifecycle/persistedCallAuthority'
import {
  beginX402UnpaidProbeArgs, beginX402UnpaidProbeHandler, beginX402UnpaidProbeResult,
  finishX402UnpaidProbeArgs, finishX402UnpaidProbeHandler, finishX402UnpaidProbeResult,
  readX402UnpaidProbeAdmissionArgs, readX402UnpaidProbeAdmissionHandler, readX402UnpaidProbeAdmissionResult,
} from './lib/capabilityExecution/callLifecycle/x402PreSignProbe'
import { dispatchHandler } from './lib/capabilityExecution/callLifecycle/dispatchEnqueue'
import { openDispatchHandler, openDispatchArgs, openDispatchResult } from './lib/capabilityExecution/callLifecycle/dispatchOpen'
import {
  readPreClaimRefundHandler, readPreClaimRefundArgs, readPreClaimRefundResult,
  refuseUnclaimedArgs, refuseUnclaimedHandler, refuseUnclaimedResult,
} from './lib/capabilityExecution/callLifecycle/dispatchRefusal'
import {
  readOwnerRecoveryHandler, readOwnerReceiptContextHandler, listAgentCallSummariesHandler,
  readRecoveryHandler, readRecoveryArgs, readOwnerRecoveryArgs, readOwnerReceiptContextArgs,
  listAgentCallSummariesArgs, readRecoveryResult, readOwnerReceiptContextResult,
  watchOwnerCallStateHandler, watchOwnerCallStateArgs, watchOwnerCallStateResult,
} from './lib/capabilityExecution/callLifecycle/callRecoveryReads'
import {
  listCallsArgs, cancelCallArgs, reconcileCallArgs, readOwnerCallStatusArgs,
  cancelOwnerCallArgs, reconcileOwnerCallArgs,
} from './lib/capabilityExecution/callLifecycle/callRecoveryActions'
import {
  readCurrentProviderConnectionAuthorityHandler, readProviderLeaseAuthorityHandler,
  readProviderLeaseAuthorityArgs, readProviderLeaseAuthorityResult,
  readCurrentProviderConnectionAuthorityArgs,
} from './lib/capabilityExecution/callLifecycle/callProviderAuthority'
import { readReplayHandler, readReplayArgs, readReplayResult } from './lib/capabilityExecution/callLifecycle/callReservationActions'
import { completeWorkResult } from './lib/capabilityExecution/callLifecycle/workComplete'
import { callResultValue, recoveryResultValue } from '@/modules/capability-execution/convex'

export const resolveCallAgentAuthority = internalMutation({
  args: resolveCallAgentAuthorityArgs, returns: resolveCallAgentAuthorityResult, handler: resolveCallAgentAuthorityHandler,
})
export const reconcileCallWorkloadAuthority = internalMutation({
  args: reconcileCallWorkloadAuthorityArgs, returns: reconciledCallAuthorityResult, handler: reconcileCallWorkloadAuthorityHandler,
})
export const readAcceptedCallGrantAfterLimitUpdate = internalMutation({
  args: readAcceptedCallGrantAfterLimitUpdateArgs, returns: readAcceptedCallGrantAfterLimitUpdateResult, handler: readAcceptedCallGrantAfterLimitUpdateHandler,
})
export const admit = internalMutation({ args: admitArgs, returns: admitResult, handler: admitHandler })
export const reserve = internalMutation({ args: reserveArgs, returns: reserveResult, handler: reserveHandler })
export const abandon = internalMutation({ args: abandonArgs, returns: abandonResult, handler: abandonHandler })
export const dispatch = internalMutation({ args: dispatchArgs, returns: dispatchResult, handler: dispatchHandler })
export const claimDispatch = internalMutation({
  args: callDispatchMutationArgs, returns: callDispatchMutationResult, handler: claimDispatchWithReconciliationInitialization,
})
export const finalizeDispatch = internalMutation({
  args: finalizeDispatchArgs, returns: callDispatchMutationResult, handler: finalizeDispatchWithReconciliationInitialization,
})
export const cancelBeforeClaim = internalMutation({
  args: cancelBeforeClaimArgs, returns: callDispatchMutationResult, handler: cancelBeforeClaimWithReconciliationInitialization,
})
export const refuseUnclaimed = internalMutation({
  args: refuseUnclaimedArgs, returns: refuseUnclaimedResult, handler: refuseUnclaimedHandler,
})
export const listPendingCallApprovals = query({
  args: listPendingCallApprovalsArgs, returns: listPendingCallApprovalsResult, handler: canonicalOwnerApprovalListHandler,
})
export const decideCallApproval = mutation({
  args: decideCallApprovalArgs, returns: approvalDecisionResult, handler: canonicalOwnerApprovalDecisionHandler,
})
const approvalExpiryPageValue = v.object({ scanned: v.number(), scheduled: v.number(), blocked: v.number() })
export const expireStalePendingApprovals = internalMutation({
  args: { workload: workloadCronSnapshotValue },
  returns: approvalExpiryPageValue,
  handler: expireStalePendingApprovalsHandler,
})
export const continueApprovalExpiry = internalMutation({
  args: continueApprovalExpiryArgs,
  returns: approvalExpiryPageValue,
  handler: continueApprovalExpiryHandler,
})
export const expireStaleApproval = internalMutation({
  args: { callRef: v.string() },
  returns: v.null(),
  handler: expireStaleApprovalHandler,
})
export const openDispatch = internalQuery({ args: openDispatchArgs, returns: openDispatchResult, handler: openDispatchHandler })
export const readPreClaimRefund = internalQuery({
  args: readPreClaimRefundArgs, returns: readPreClaimRefundResult, handler: readPreClaimRefundHandler,
})
export const readReplay = internalQuery({ args: readReplayArgs, returns: readReplayResult, handler: readReplayHandler })
export const readRecovery = internalQuery({ args: readRecoveryArgs, returns: readRecoveryResult, handler: readRecoveryHandler })
export const readOwnerRecovery = internalQuery({
  args: readOwnerRecoveryArgs, returns: readRecoveryResult, handler: readOwnerRecoveryHandler,
})
export const watchOwnerCallState = query({
  args: watchOwnerCallStateArgs, returns: watchOwnerCallStateResult, handler: watchOwnerCallStateHandler,
})
export const readOwnerReceiptContext = internalQuery({
  args: readOwnerReceiptContextArgs, returns: readOwnerReceiptContextResult, handler: readOwnerReceiptContextHandler,
})
export const readPurchaseResolution = internalQuery({
  args: readPurchaseResolutionArgs, returns: readPurchaseResolutionResult, handler: readPurchaseResolutionHandler,
})
export const record = internalMutation({ args: recordArgs, returns: recordResult, handler: recordWithReconciliationInitialization })
export const projectRecovery = internalMutation({
  args: projectRecoveryArgs, returns: recordResult, handler: projectRecoveryWithReconciliationInitialization,
})
export const listDueAutomaticReconciliationCandidates = internalQuery({
  args: listDueAutomaticReconciliationCandidatesArgs,
  returns: listDueAutomaticReconciliationCandidatesResult,
  handler: listDueAutomaticReconciliationCandidatesHandler,
})
export const reconcileFinishedDispatches = internalMutation({
  args: reconcileFinishedDispatchesArgs, returns: reconcileFinishedDispatchesResult,
  handler: reconcileFinishedDispatchesHandler,
})
export const quarantineRestoredDispatches = internalMutation({
  args: quarantineRestoredDispatchesArgs, returns: quarantineRestoredDispatchesResult,
  handler: quarantineRestoredDispatchesHandler,
})
export const claimAutomaticReconciliationCandidate = internalMutation({
  args: claimAutomaticReconciliationCandidateArgs, returns: reconciliationClaimResult,
  handler: claimAutomaticReconciliationCandidateHandler,
})
export const finishAutomaticReconciliation = internalMutation({
  args: finishAutomaticReconciliationArgs, returns: reconciliationFinishResult, handler: finishAutomaticReconciliationHandler,
})
export const readProviderLeaseAuthority = internalQuery({
  args: readProviderLeaseAuthorityArgs, returns: readProviderLeaseAuthorityResult, handler: readProviderLeaseAuthorityHandler,
})
export const readCurrentProviderConnectionAuthority = internalQuery({
  args: readCurrentProviderConnectionAuthorityArgs, returns: currentProviderConnectionAuthorityValue,
  handler: readCurrentProviderConnectionAuthorityHandler,
})
export const completeWork = internalMutation({
  args: workCompletionArgs, returns: completeWorkResult, handler: completeWorkWithReconciliationInitialization,
})
export const call = action({ args: callArgs, returns: callResultValue, handler: canonicalAgentCallHandler })
export const listAgentCallSummaries = internalQuery({
  args: listAgentCallSummariesArgs, returns: callSummaryPageValue, handler: listAgentCallSummariesHandler,
})
export const listCalls = action({ args: listCallsArgs, returns: callSummaryPageValue, handler: canonicalAgentListHandler })
export const cancelCall = action({ args: cancelCallArgs, returns: recoveryResultValue, handler: canonicalAgentCancelHandler })
export const reconcileCall = action({
  args: reconcileCallArgs, returns: recoveryResultValue, handler: canonicalAgentReconcileHandler,
})
export const readOwnerCallStatus = action({
  args: readOwnerCallStatusArgs, returns: ownerCallStatusResultValue, handler: canonicalOwnerStatusHandler,
})
export const cancelOwnerCall = action({
  args: cancelOwnerCallArgs, returns: recoveryResultValue, handler: canonicalOwnerCancelHandler,
})
export const reconcileOwnerCall = action({
  args: reconcileOwnerCallArgs, returns: recoveryResultValue, handler: canonicalOwnerReconcileHandler,
})

export const beginX402UnpaidProbe = internalMutation({
  args: beginX402UnpaidProbeArgs, returns: beginX402UnpaidProbeResult, handler: beginX402UnpaidProbeHandler,
})
export const finishX402UnpaidProbe = internalMutation({
  args: finishX402UnpaidProbeArgs, returns: finishX402UnpaidProbeResult, handler: finishX402UnpaidProbeHandler,
})
export const readX402UnpaidProbeAdmission = internalQuery({
  args: readX402UnpaidProbeAdmissionArgs, returns: readX402UnpaidProbeAdmissionResult, handler: readX402UnpaidProbeAdmissionHandler,
})
